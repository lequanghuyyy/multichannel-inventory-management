package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

public record ReservationResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("sku") String sku,
        @JsonProperty("quantity") int quantity,
        @JsonProperty("status") String status,
        @JsonProperty("order_id") Long orderId,
        @JsonProperty("expires_at") Instant expiresAt,
        @JsonProperty("created_at") Instant createdAt
) {}
