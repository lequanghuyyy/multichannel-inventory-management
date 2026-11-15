package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record LoginResponse(
        @JsonProperty("success") boolean success,
        @JsonProperty("csrf_token") String csrfToken,
        @JsonProperty("user") AuthUserResponse user
) {}
