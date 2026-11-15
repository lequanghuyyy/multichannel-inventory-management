package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record AuthUserResponse(
        @JsonProperty("id") String id,
        @JsonProperty("username") String username,
        @JsonProperty("email") String email,
        @JsonProperty("role") String role
) {}
