package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

public record ChannelListingResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("channel_id") Long channelId,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("sku") String sku,
        @JsonProperty("external_listing_id") String externalListingId,
        @JsonProperty("external_sku") String externalSku,
        @JsonProperty("allocated_quota") int allocatedQuota,
        @JsonProperty("reported_stock") int reportedStock,
        @JsonProperty("sync_status") String syncStatus,
        @JsonProperty("updated_at") Instant updatedAt
) {}
