package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

public record LazadaAuthorizationResponse(
        @JsonProperty("authorization_url") String authorizationUrl
) {}
