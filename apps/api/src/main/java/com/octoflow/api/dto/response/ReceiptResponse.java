package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

public record ReceiptResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("receipt_number") String receiptNumber,
        @JsonProperty("supplier_name") String supplierName,
        @JsonProperty("status") String status,
        @JsonProperty("items") List<ReceiptItemResponse> items,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt
) {
    public record ReceiptItemResponse(
            @JsonProperty("id") Long id,
            @JsonProperty("variant_id") Long variantId,
            @JsonProperty("expected_qty") int expectedQty,
            @JsonProperty("accepted_qty") int acceptedQty,
            @JsonProperty("rejected_qty") int rejectedQty,
            @JsonProperty("unit_cost") Long unitCost
    ) {}
}
