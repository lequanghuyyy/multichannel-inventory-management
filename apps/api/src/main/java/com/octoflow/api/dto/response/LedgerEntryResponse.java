package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

public record LedgerEntryResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("delta") int delta,
        @JsonProperty("reason") String reason,
        @JsonProperty("on_hand_after") int onHandAfter,
        @JsonProperty("reserved_after") int reservedAfter,
        @JsonProperty("reference_id") String referenceId,
        @JsonProperty("created_at") Instant createdAt
) {}
