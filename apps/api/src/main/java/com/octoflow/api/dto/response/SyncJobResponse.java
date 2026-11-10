package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;

public record SyncJobResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("kind") String kind,
        @JsonProperty("listing_id") Long listingId,
        @JsonProperty("channel_id") Long channelId,
        @JsonProperty("channel_code") String channelCode,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("sku") String sku,
        @JsonProperty("target_quantity") int targetQuantity,
        @JsonProperty("core_version") Long coreVersion,
        @JsonProperty("allocation_revision") long allocationRevision,
        @JsonProperty("status") String status,
        @JsonProperty("attempts") int attempts,
        @JsonProperty("max_attempts") int maxAttempts,
        @JsonProperty("next_attempt_at") Instant nextAttemptAt,
        @JsonProperty("sent_quantity") Integer sentQuantity,
        @JsonProperty("acknowledged_quantity") Integer acknowledgedQuantity,
        @JsonProperty("verified_quantity") Integer verifiedQuantity,
        @JsonProperty("remote_before") Integer remoteBefore,
        @JsonProperty("remote_after") Integer remoteAfter,
        @JsonProperty("adapter") String adapter,
        @JsonProperty("idempotency_reference") String idempotencyReference,
        @JsonProperty("last_error") String lastError,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("last_attempt_at") Instant lastAttemptAt,
        @JsonProperty("verified_at") Instant verifiedAt,
        @JsonProperty("evidence") List<ChannelSyncEvidenceResponse> evidence
) {}
