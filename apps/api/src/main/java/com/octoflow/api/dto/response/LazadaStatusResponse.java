package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

public record LazadaStatusResponse(
        @JsonProperty("enabled") boolean enabled,
        @JsonProperty("configured") boolean configured,
        @JsonProperty("country") String country,
        @JsonProperty("write_enabled") boolean writeEnabled,
        @JsonProperty("product_write_enabled") boolean productWriteEnabled,
        @JsonProperty("inventory_write_enabled") boolean inventoryWriteEnabled,
        @JsonProperty("order_write_enabled") boolean orderWriteEnabled,
        @JsonProperty("connection") Connection connection
) {
    public record Connection(
            @JsonProperty("channel_id") String channelId,
            @JsonProperty("seller_id") String sellerId,
            @JsonProperty("country") String country,
            @JsonProperty("status") String status,
            @JsonProperty("access_token_expires_at") Instant accessTokenExpiresAt,
            @JsonProperty("refresh_token_expires_at") Instant refreshTokenExpiresAt,
            @JsonProperty("last_verified_at") Instant lastVerifiedAt,
            @JsonProperty("last_error_code") String lastErrorCode,
            @JsonProperty("last_order_poll_at") Instant lastOrderPollAt,
            @JsonProperty("order_poll_error") String orderPollError,
            @JsonProperty("capabilities") Capabilities capabilities
    ) {}

    public record Capabilities(
            @JsonProperty("products_read") boolean productsRead,
            @JsonProperty("orders_read") boolean ordersRead,
            @JsonProperty("products_write") boolean productsWrite,
            @JsonProperty("inventory_write") boolean inventoryWrite
    ) {}
}
