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
        @JsonProperty("external_variant_id") String externalVariantId,
        @JsonProperty("mapping_status") String mappingStatus,
        @JsonProperty("mapping_verified_at") Instant mappingVerifiedAt,
        @JsonProperty("active") boolean active,
        @JsonProperty("allocated_quota") int allocatedQuota,
        @JsonProperty("reported_stock") int reportedStock,
        @JsonProperty("sync_status") String syncStatus,
        @JsonProperty("sent_quantity") Integer sentQuantity,
        @JsonProperty("acknowledged_quantity") Integer acknowledgedQuantity,
        @JsonProperty("verified_quantity") Integer verifiedQuantity,
        @JsonProperty("last_sync_error") String lastSyncError,
        @JsonProperty("last_verified_at") Instant lastVerifiedAt,
        @JsonProperty("target_allocation_revision") long targetAllocationRevision,
        @JsonProperty("updated_at") Instant updatedAt
) {}
