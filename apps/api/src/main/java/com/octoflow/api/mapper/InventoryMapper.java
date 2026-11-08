package com.octoflow.api.mapper;

import com.octoflow.api.dto.response.InventorySnapshotResponse;
import com.octoflow.api.dto.response.LedgerEntryResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.InventoryLedger;
import com.octoflow.api.entity.ProductVariant;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class InventoryMapper {

    public InventorySnapshotResponse toSnapshotResponse(ProductVariant variant, InventoryBalance balance) {
        if (variant == null) {
            return null;
        }

        int onHand = balance != null ? balance.getOnHand() : 0;
        int reserved = balance != null ? balance.getReserved() : 0;
        int safetyBuffer = balance != null ? balance.getSafetyBuffer() : 0;
        int ats = balance != null ? balance.getAvailableToSell() : 0;
        Long version = balance != null ? balance.getVersion() : 0L;
        java.time.Instant updatedAt = balance != null ? balance.getUpdatedAt() : variant.getUpdatedAt();

        return new InventorySnapshotResponse(
                variant.getSku(),
                variant.getId(),
                variant.getProduct() != null ? variant.getProduct().getId() : null,
                onHand,
                reserved,
                safetyBuffer,
                ats,
                version,
                updatedAt
        );
    }

    public LedgerEntryResponse toLedgerEntryResponse(InventoryLedger ledger) {
        if (ledger == null) {
            return null;
        }
        return new LedgerEntryResponse(
                ledger.getId(),
                ledger.getVariantId(),
                ledger.getOperation(),
                ledger.getDelta(),
                ledger.getReason(),
                ledger.getOnHandBefore(),
                ledger.getOnHandAfter(),
                ledger.getReservedBefore(),
                ledger.getReservedAfter(),
                ledger.getSafetyBufferBefore(),
                ledger.getSafetyBufferAfter(),
                ledger.getActorName(),
                ledger.getReferenceId(),
                ledger.getCreatedAt()
        );
    }

    public List<LedgerEntryResponse> toLedgerEntryResponses(List<InventoryLedger> ledgers) {
        if (ledgers == null || ledgers.isEmpty()) {
            return Collections.emptyList();
        }
        return ledgers.stream()
                .map(this::toLedgerEntryResponse)
                .collect(Collectors.toList());
    }
}
