package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SimulatorStockRequest(
        @JsonProperty("quantity") Integer quantity
) {}
