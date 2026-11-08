package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Read-only projection of a proposed receive batch. It never mutates stock and can return
 * per-line validation errors so an operator can correct counting before confirming.
 */
public record ReceiptPreviewResponse(
        @JsonProperty("receipt_id") Long receiptId,
        @JsonProperty("status") String status,
        @JsonProperty("valid") boolean valid,
        @JsonProperty("items") List<LinePreview> items,
        @JsonProperty("accepted_total") int acceptedTotal,
        @JsonProperty("rejected_total") int rejectedTotal,
        @JsonProperty("remaining_total") int remainingTotal,
        @JsonProperty("errors") List<String> errors
) {
    public record LinePreview(
            @JsonProperty("item_id") Long itemId,
            @JsonProperty("variant_id") Long variantId,
            @JsonProperty("sku") String sku,
            @JsonProperty("variant_title") String variantTitle,
            @JsonProperty("expected_qty") int expectedQty,
            @JsonProperty("already_accepted_qty") int alreadyAcceptedQty,
            @JsonProperty("already_rejected_qty") int alreadyRejectedQty,
            @JsonProperty("accepted_qty") int acceptedQty,
            @JsonProperty("rejected_qty") int rejectedQty,
            @JsonProperty("remaining_before_qty") int remainingBeforeQty,
            @JsonProperty("remaining_after_qty") int remainingAfterQty,
            @JsonProperty("on_hand") int onHand,
            @JsonProperty("projected_on_hand") int projectedOnHand,
            @JsonProperty("balance_version") Long balanceVersion,
            @JsonProperty("rejection_reason") String rejectionReason,
            @JsonProperty("valid") boolean valid,
            @JsonProperty("errors") List<String> errors
    ) {}
}
