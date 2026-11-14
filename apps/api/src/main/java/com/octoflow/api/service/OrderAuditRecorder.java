package com.octoflow.api.service;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderStatusHistory;
import com.octoflow.api.entity.OutboxEvent;
import com.octoflow.api.entity.PosPaymentDetail;
import com.octoflow.api.middleware.RequestIdFilter;
import com.octoflow.api.repository.OrderStatusHistoryRepository;
import com.octoflow.api.repository.OutboxEventRepository;
import org.slf4j.MDC;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Writes the append-only order history and order outbox rows inside the caller's transaction.
 * Keeping this in one bean avoids drifting audit payloads between the interactive service and
 * the background expiry processor.
 */
@Service
public class OrderAuditRecorder {

    private final OrderStatusHistoryRepository historyRepository;
    private final OutboxEventRepository outboxRepository;
    private final ObjectMapper objectMapper;

    public OrderAuditRecorder(OrderStatusHistoryRepository historyRepository,
                              OutboxEventRepository outboxRepository,
                              ObjectMapper objectMapper) {
        this.historyRepository = historyRepository;
        this.outboxRepository = outboxRepository;
        this.objectMapper = objectMapper;
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordHistory(Order order,
                              OrderStatusHistory.Action action,
                              Order.Status fromStatus,
                              Order.Status toStatus,
                              Order.PaymentStatus fromPaymentStatus,
                              Order.PaymentStatus toPaymentStatus,
                              String reason) {
        OrderStatusHistory history = new OrderStatusHistory();
        history.setOrderId(order.getId());
        history.setAction(action);
        history.setFromStatus(fromStatus);
        history.setToStatus(toStatus);
        history.setFromPaymentStatus(fromPaymentStatus);
        history.setToPaymentStatus(toPaymentStatus);
        history.setReason(normalizeReason(reason));
        history.setActor(currentActor());
        history.setChangedAt(Instant.now());
        historyRepository.save(history);
    }

    @Transactional(propagation = Propagation.MANDATORY)
    public void recordOutbox(Order order, String eventType, String reason, PosPaymentDetail payment) {
        OutboxEvent event = new OutboxEvent();
        event.setAggregateType("ORDER");
        event.setAggregateId(order.getId().toString());
        event.setEventType(eventType);
        event.setCorrelationId(MDC.get(RequestIdFilter.MDC_KEY));
        event.setPayload(serialize(new OrderEventPayload(
                order.getId(),
                order.getOrderNumber(),
                order.getSource() != null ? order.getSource().name() : null,
                order.getStatus() != null ? order.getStatus().name() : null,
                order.getPaymentStatus() != null ? order.getPaymentStatus().name() : null,
                order.getTotalAmount(),
                order.getCurrency(),
                normalizeReason(reason),
                payment != null && payment.getMethod() != null ? payment.getMethod().name() : null,
                payment != null ? payment.getCashReceived() : null,
                payment != null ? payment.getChangeAmount() : null,
                payment != null ? payment.getReference() : null,
                Instant.now())));
        outboxRepository.save(event);
    }

    public String currentActor() {
        Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication == null || !authentication.isAuthenticated()
                || "anonymousUser".equals(authentication.getPrincipal())) {
            return "system";
        }
        String name = authentication.getName();
        return name.length() <= 64 ? name : name.substring(0, 64);
    }

    private String normalizeReason(String reason) {
        if (reason == null) {
            return null;
        }
        String normalized = reason.trim();
        return normalized.isEmpty() ? null : normalized;
    }

    private String serialize(OrderEventPayload payload) {
        try {
            return objectMapper.writeValueAsString(payload);
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to serialize order outbox payload", ex);
        }
    }

    private record OrderEventPayload(
            @JsonProperty("order_id") Long orderId,
            @JsonProperty("order_number") String orderNumber,
            @JsonProperty("source") String source,
            @JsonProperty("status") String status,
            @JsonProperty("payment_status") String paymentStatus,
            @JsonProperty("total_amount") Long totalAmount,
            @JsonProperty("currency") String currency,
            @JsonProperty("reason") String reason,
            @JsonProperty("payment_method") String paymentMethod,
            @JsonProperty("cash_received") Long cashReceived,
            @JsonProperty("change") Long change,
            @JsonProperty("reference") String reference,
            @JsonProperty("occurred_at") Instant occurredAt) {}
}
