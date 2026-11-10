package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public record ChannelSyncEvidenceResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("listing_id") Long listingId,
        @JsonProperty("job_id") Long jobId,
        @JsonProperty("plan_id") Long planId,
        @JsonProperty("plan_item_id") Long planItemId,
        @JsonProperty("kind") String kind,
        @JsonProperty("adapter") String adapter,
        @JsonProperty("status") String status,
        @JsonProperty("target_quantity") Integer targetQuantity,
        @JsonProperty("sent_quantity") Integer sentQuantity,
        @JsonProperty("acknowledged_quantity") Integer acknowledgedQuantity,
        @JsonProperty("verified_quantity") Integer verifiedQuantity,
        @JsonProperty("remote_before") Integer remoteBefore,
        @JsonProperty("remote_after") Integer remoteAfter,
        @JsonProperty("error_code") String errorCode,
        @JsonProperty("error_message") String errorMessage,
        @JsonProperty("idempotency_reference") String idempotencyReference,
        @JsonProperty("observed_at") Instant observedAt
) {}
