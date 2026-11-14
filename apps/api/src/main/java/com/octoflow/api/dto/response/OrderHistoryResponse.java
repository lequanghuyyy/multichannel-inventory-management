package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public record OrderHistoryResponse(
        @JsonProperty("id") Long id,
        @JsonProperty("order_id") Long orderId,
        @JsonProperty("action") String action,
        @JsonProperty("from_status") String fromStatus,
        @JsonProperty("to_status") String toStatus,
        @JsonProperty("from_payment_status") String fromPaymentStatus,
        @JsonProperty("to_payment_status") String toPaymentStatus,
        @JsonProperty("reason") String reason,
        @JsonProperty("actor") String actor,
        @JsonProperty("changed_at") Instant changedAt
) {}
