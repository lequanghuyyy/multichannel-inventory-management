package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;
import java.util.List;

public record AllocationPlanResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("variant_id") Long variantId,
        @JsonProperty("sku") String sku,
        @JsonProperty("status") String status,
        @JsonProperty("core_version") long coreVersion,
        @JsonProperty("base_allocation_revision") long baseAllocationRevision,
        @JsonProperty("allocation_revision") long allocationRevision,
        @JsonProperty("on_hand") int onHand,
        @JsonProperty("reserved") int reserved,
        @JsonProperty("safety_buffer") int safetyBuffer,
        @JsonProperty("available_to_sell") int availableToSell,
        @JsonProperty("total_target") int totalTarget,
        @JsonProperty("policy") String policy,
        @JsonProperty("can_execute") boolean canExecute,
        @JsonProperty("issues") List<String> issues,
        @JsonProperty("current_ats") Integer currentAts,
        @JsonProperty("current_allocated_total") Integer currentAllocatedTotal,
        @JsonProperty("risk_warnings") List<String> riskWarnings,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("confirmed_at") Instant confirmedAt,
        @JsonProperty("completed_at") Instant completedAt,
        @JsonProperty("last_error") String lastError,
        @JsonProperty("items") List<Item> items
) {
    public record Item(
            @JsonProperty("item_id") Long itemId,
            @JsonProperty("listing_id") Long listingId,
            @JsonProperty("channel_id") Long channelId,
            @JsonProperty("channel_code") String channelCode,
            @JsonProperty("external_sku") String externalSku,
            @JsonProperty("current_quota") int currentQuota,
            @JsonProperty("proposed_quota") int proposedQuota,
            @JsonProperty("direction") String direction,
            @JsonProperty("status") String status,
            @JsonProperty("mapping_status") String mappingStatus,
            @JsonProperty("can_execute") boolean canExecute,
            @JsonProperty("issues") List<String> issues,
            @JsonProperty("attempts") int attempts,
            @JsonProperty("next_attempt_at") Instant nextAttemptAt,
            @JsonProperty("sent_quantity") Integer sentQuantity,
            @JsonProperty("acknowledged_quantity") Integer acknowledgedQuantity,
            @JsonProperty("verified_quantity") Integer verifiedQuantity,
            @JsonProperty("remote_before") Integer remoteBefore,
            @JsonProperty("remote_after") Integer remoteAfter,
            @JsonProperty("verified_at") Instant verifiedAt,
            @JsonProperty("last_error") String lastError
    ) {}
}
