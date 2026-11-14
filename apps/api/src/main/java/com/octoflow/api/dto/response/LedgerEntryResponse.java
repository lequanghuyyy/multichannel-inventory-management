package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

/**
 * Complete, explainable stock movement record: every before/after balance component is exposed so
 * an operator can reconstruct why available-to-sell changed.
 */
public record LedgerEntryResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("operation") String operation,
        @JsonProperty("delta") int delta,
        @JsonProperty("reason") String reason,
        @JsonProperty("on_hand_before") int onHandBefore,
        @JsonProperty("on_hand_after") int onHandAfter,
        @JsonProperty("reserved_before") int reservedBefore,
        @JsonProperty("reserved_after") int reservedAfter,
        @JsonProperty("safety_buffer_before") Integer safetyBufferBefore,
        @JsonProperty("safety_buffer_after") Integer safetyBufferAfter,
        @JsonProperty("actor_name") String actorName,
        @JsonProperty("reference_id") String referenceId,
        @JsonProperty("created_at") Instant createdAt
) {}
