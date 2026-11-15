package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

public record InventorySnapshotResponse(
        @JsonProperty("sku") String sku,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("product_id") Long productId,
        @JsonProperty("product_name") String productName,
        @JsonProperty("variant_title") String variantTitle,
        @JsonProperty("price") Long price,
        @JsonProperty("currency") String currency,
        @JsonProperty("on_hand") int onHand,
        @JsonProperty("reserved") int reserved,
        @JsonProperty("safety_buffer") int safetyBuffer,
        @JsonProperty("available_to_sell") int availableToSell,
        @JsonProperty("version") Long version,
        @JsonProperty("updated_at") Instant updatedAt
) {}
