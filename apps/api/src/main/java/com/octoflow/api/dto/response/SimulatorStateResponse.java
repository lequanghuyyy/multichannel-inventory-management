package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record SimulatorStateResponse(
        @JsonProperty("listing_id") Long listingId,
        @JsonProperty("channel_id") Long channelId,
        @JsonProperty("quantity") int quantity,
        @JsonProperty("version") long version,
        @JsonProperty("fault_type") String faultType,
        @JsonProperty("fault_remaining") Integer faultRemaining,
        @JsonProperty("fault_delay_ms") Integer faultDelayMs,
        @JsonProperty("observed_at") Instant observedAt
) {}
