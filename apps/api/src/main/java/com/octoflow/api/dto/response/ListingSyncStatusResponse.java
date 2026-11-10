package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;

public record ListingSyncStatusResponse(
        @JsonProperty("listing_id") Long listingId,
        @JsonProperty("channel_id") Long channelId,
        @JsonProperty("channel_code") String channelCode,
        @JsonProperty("channel_environment") String channelEnvironment,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("sku") String sku,
        @JsonProperty("external_listing_id") String externalListingId,
        @JsonProperty("external_variant_id") String externalVariantId,
        @JsonProperty("mapping_status") String mappingStatus,
        @JsonProperty("mapping_verified_at") Instant mappingVerifiedAt,
        @JsonProperty("active") boolean active,
        @JsonProperty("target_quantity") int targetQuantity,
        @JsonProperty("mapping_verified") boolean mappingVerified,
        @JsonProperty("sync_status") String syncStatus,
        @JsonProperty("reported_stock") int reportedStock,
        @JsonProperty("sent_quantity") Integer sentQuantity,
        @JsonProperty("acknowledged_quantity") Integer acknowledgedQuantity,
        @JsonProperty("verified_quantity") Integer verifiedQuantity,
        @JsonProperty("last_sync_error") String lastSyncError,
        @JsonProperty("last_verified_at") Instant lastVerifiedAt,
        @JsonProperty("target_allocation_revision") long targetAllocationRevision,
        @JsonProperty("evidence") List<ChannelSyncEvidenceResponse> evidence
) {}
