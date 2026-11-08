package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;
import java.util.List;

public record ProductResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("name") String name,
        @JsonProperty("description") String description,
        @JsonProperty("category") String category,
        @JsonProperty("status") String status,
        @JsonProperty("variants") List<VariantResponse> variants,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt
) {
    public record VariantResponse(
            @JsonProperty("id") Long id,
            @JsonProperty("sku") String sku,
            @JsonProperty("title") String title,
            @JsonProperty("price") Long price,
            @JsonProperty("currency") String currency,
            @JsonProperty("on_hand") int onHand,
            @JsonProperty("reserved") int reserved,
            @JsonProperty("safety_buffer") int safetyBuffer,
            @JsonProperty("available_to_sell") int availableToSell
    ) {}
}
