package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonInclude(JsonInclude.Include.NON_NULL)
public record LazadaVerifyResponse(
        @JsonProperty("status") String status,
        @JsonProperty("warning_code") String warningCode
) {}
