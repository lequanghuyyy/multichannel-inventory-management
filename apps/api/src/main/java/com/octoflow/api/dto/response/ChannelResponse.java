package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;
import java.time.Instant;

public record ChannelResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("code") String code,
        @JsonProperty("name") String name,
        @JsonProperty("environment") String environment,
        @JsonProperty("status") String status,
        @JsonProperty("created_at") Instant createdAt,
        @JsonProperty("updated_at") Instant updatedAt
) {}
