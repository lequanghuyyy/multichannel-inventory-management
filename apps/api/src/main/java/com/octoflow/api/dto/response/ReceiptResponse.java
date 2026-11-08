package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

public record ReceiptResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("receipt_number") String receiptNumber,
        @JsonProperty("supplier_name") String supplierName,
        @JsonProperty("note") String note,
        @JsonProperty("status") String status,
        @JsonProperty("version") Long version,
        @JsonProperty("items") List<ReceiptItemResponse> items,
        @JsonProperty("batches") List<ReceiptBatchResponse> batches,
        @JsonProperty("accepted_total") int acceptedTotal,
        @JsonProperty("rejected_total") int rejectedTotal,
        @JsonProperty("remaining_total") int remainingTotal,
        @JsonProperty("cancel_reason") String cancelReason,
        @JsonProperty("cancelled_at") Instant cancelledAt,
        @JsonProperty("close_short_reason") String closeShortReason,
        @JsonProperty("closed_short_at") Instant closedShortAt,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt
) {
    public record ReceiptItemResponse(
            @JsonProperty("id") Long id,
            @JsonProperty("variant_id") Long variantId,
            @JsonProperty("sku") String sku,
            @JsonProperty("variant_title") String variantTitle,
            @JsonProperty("expected_qty") int expectedQty,
            @JsonProperty("accepted_qty") int acceptedQty,
            @JsonProperty("rejected_qty") int rejectedQty,
            @JsonProperty("processed_qty") int processedQty,
            @JsonProperty("remaining_qty") int remainingQty,
            @JsonProperty("unit_cost") Long unitCost,
            @JsonProperty("rejection_reason") String rejectionReason
    ) {}

    public record ReceiptBatchResponse(
            @JsonProperty("event_id") Long eventId,
            @JsonProperty("event_type") String eventType,
            @JsonProperty("receipt_version") Long receiptVersion,
            @JsonProperty("actor") String actor,
            @JsonProperty("note") String note,
            @JsonProperty("received_at") Instant receivedAt,
            @JsonProperty("items") List<ReceiptBatchItemResponse> items
    ) {}

    public record ReceiptBatchItemResponse(
            @JsonProperty("receipt_item_id") Long receiptItemId,
            @JsonProperty("variant_id") Long variantId,
            @JsonProperty("sku") String sku,
            @JsonProperty("accepted_qty") int acceptedQty,
            @JsonProperty("rejected_qty") int rejectedQty,
            @JsonProperty("rejection_reason") String rejectionReason
    ) {}
}
