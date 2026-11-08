package com.octoflow.api.exception;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.util.Map;

/**
 * Standard Error Envelope matching the contract required by openapi-fetch frontend client:
 * { "error": { "code": "...", "message": "...", "request_id": "..." } }
 */
public record ErrorResponse(
        @JsonProperty("error") ErrorDetail error
) {
    public record ErrorDetail(
            @JsonProperty("code") String code,
            @JsonProperty("message") String message,
            @JsonProperty("request_id") String requestId
    ) {}

    public static ErrorResponse of(String code, String message, String requestId) {
        return new ErrorResponse(new ErrorDetail(code, message, requestId));
    }
}
