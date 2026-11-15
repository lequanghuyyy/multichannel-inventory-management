package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record SessionResponse(
        @JsonProperty("authenticated") boolean authenticated,
        @JsonProperty("csrf_token") String csrfToken,
        @JsonProperty("user") AuthUserResponse user
) {}
