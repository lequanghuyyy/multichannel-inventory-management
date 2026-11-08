package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

public record OrderResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("order_number") String orderNumber,
        @JsonProperty("source") String source,
        @JsonProperty("status") String status,
        @JsonProperty("payment_status") String paymentStatus,
        @JsonProperty("total_amount") Long totalAmount,
        @JsonProperty("currency") String currency,
        @JsonProperty("external_order_id") String externalOrderId,
        @JsonProperty("items") List<OrderItemResponse> items,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt
) {
    public record OrderItemResponse(
            @JsonProperty("id") Long id,
            @JsonProperty("variant_id") Long variantId,
            @JsonProperty("sku") String sku,
            @JsonProperty("quantity") int quantity,
            @JsonProperty("unit_price") Long unitPrice
    ) {}
}
