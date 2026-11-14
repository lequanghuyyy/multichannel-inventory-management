package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.List;

/**
 * Explicit manual allocation preview. Every currently allocated listing must be present; a
 * listing is removed by sending quantity 0, never by omitting it.
 */
public record AllocationPreviewRequest(
        @JsonProperty("sku") String sku,
        @JsonProperty("items") List<AllocationTargetRequest> items
) {
    public record AllocationTargetRequest(
            @JsonProperty("listing_id") Long listingId,
            @JsonProperty("quantity") Integer quantity
    ) {}
}
