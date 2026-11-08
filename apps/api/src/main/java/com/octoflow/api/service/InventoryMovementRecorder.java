package com.octoflow.api.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.InventoryLedger;
import com.octoflow.api.entity.OutboxEvent;
import com.octoflow.api.middleware.RequestIdFilter;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.OutboxEventRepository;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.UUID;

@Service
public class InventoryMovementRecorder {

    private final InventoryBalanceRepository balanceRepository;
    private final InventoryLedgerRepository ledgerRepository;
    private final OutboxEventRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public InventoryMovementRecorder(InventoryBalanceRepository balanceRepository,
                                     InventoryLedgerRepository ledgerRepository,
                                     OutboxEventRepository outboxRepository,
                                     ObjectMapper objectMapper) {
        this.balanceRepository = balanceRepository;
        this.ledgerRepository = ledgerRepository;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void record(Long variantId, Snapshot before, InventoryBalance after, String operation, String reason, String referenceId) {
        balanceRepository.flush();
        Snapshot afterSnapshot = Snapshot.from(after);

        InventoryLedger ledger = new InventoryLedger();
        ledger.setVariantId(variantId);
        ledger.setOperation(operation);
        ledger.setDelta(afterSnapshot.onHand() - before.onHand());
        ledger.setReason(reason);
        ledger.setOnHandBefore(before.onHand());
        ledger.setOnHandAfter(afterSnapshot.onHand());
        ledger.setReservedBefore(before.reserved());
        ledger.setReservedAfter(afterSnapshot.reserved());
        ledger.setSafetyBufferBefore(before.safetyBuffer());
        ledger.setSafetyBufferAfter(afterSnapshot.safetyBuffer());
        ledger.setReferenceId(referenceId);
        ledger.setActorName(currentActor());
        ledgerRepository.save(ledger);

        UUID eventId = UUID.randomUUID();
        OutboxEvent event = new OutboxEvent();
        event.setEventId(eventId);
        event.setAggregateType("INVENTORY");
        event.setAggregateId(variantId.toString());
        event.setAggregateVersion(afterSnapshot.version());
        event.setCorrelationId(MDC.get(RequestIdFilter.MDC_KEY));
        event.setEventType("INVENTORY_CHANGED");
        event.setPayload(serialize(new InventoryChangedPayload(
                eventId, variantId, operation, referenceId, Instant.now(), before, afterSnapshot)));
        event.setStatus(OutboxEvent.Status.PENDING);
        event.setRetryCount(0);
        event.setNextAttemptAt(Instant.now());
        outboxRepository.save(event);
    }

    private String currentActor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) return "system";
        String name = authentication.getName();
        return name.length() <= 64 ? name : name.substring(0, 64);
    }

    private String serialize(Object payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to serialize inventory outbox payload", ex);
        }
    }

    public record Snapshot(
            @JsonProperty("on_hand") int onHand,
            @JsonProperty("reserved") int reserved,
            @JsonProperty("safety_buffer") int safetyBuffer,
            @JsonProperty("available_to_sell") int availableToSell,
            @JsonProperty("version") Long version) {
        public static Snapshot from(InventoryBalance balance) {
            return new Snapshot(balance.getOnHand(), balance.getReserved(), balance.getSafetyBuffer(),
                    balance.getAvailableToSell(), balance.getVersion());
        }
    }

    private record InventoryChangedPayload(
            @JsonProperty("event_id") UUID eventId,
            @JsonProperty("variant_id") Long variantId,
            @JsonProperty("operation") String operation,
            @JsonProperty("reference_id") String referenceId,
            @JsonProperty("occurred_at") Instant occurredAt,
            @JsonProperty("before") Snapshot before,
            @JsonProperty("after") Snapshot after) {}
}
