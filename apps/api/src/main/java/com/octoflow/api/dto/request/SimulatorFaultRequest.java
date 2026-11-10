package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SimulatorFaultRequest(
        @JsonProperty("type") String type,
        @JsonProperty("times") Integer times,
        @JsonProperty("delay_ms") Integer delayMs
) {}
