package com.octoflow.api.dto.response;

import com.fasterxml.jackson.annotation.JsonProperty;

import java.time.Instant;

/**
 * Channel-scoped WooCommerce connection and write status. It intentionally separates what was
 * verified (read access) from what is merely configured (inventory write flag).
 */
public record WooCommerceChannelStatusResponse(
        @JsonProperty("channel_id") Long channelId,
        @JsonProperty("channel_code") String channelCode,
        @JsonProperty("channel_name") String channelName,
        @JsonProperty("environment") String environment,
        @JsonProperty("connector") String connector,
        @JsonProperty("api_version") String apiVersion,
        @JsonProperty("connector_enabled") boolean connectorEnabled,
        @JsonProperty("connector_configured") boolean connectorConfigured,
        @JsonProperty("environment_allowed") boolean environmentAllowed,
        @JsonProperty("connection_status") String connectionStatus,
        @JsonProperty("connection_verified") boolean connectionVerified,
        @JsonProperty("connection_verified_at") Instant connectionVerifiedAt,
        @JsonProperty("products_read") boolean productsRead,
        @JsonProperty("auth_mode") String authMode,
        @JsonProperty("store_name") String storeName,
        @JsonProperty("store_url") String storeUrl,
        @JsonProperty("wc_version") String wcVersion,
        @JsonProperty("wp_version") String wpVersion,
        @JsonProperty("currency") String currency,
        @JsonProperty("inventory_write_enabled") boolean inventoryWriteEnabled,
        @JsonProperty("inventory_write_available") boolean inventoryWriteAvailable,
        @JsonProperty("read_available") boolean readAvailable,
        @JsonProperty("mapping_count") long mappingCount,
        @JsonProperty("verified_mapping_count") long verifiedMappingCount,
        @JsonProperty("drift_count") long driftCount,
        @JsonProperty("mapping_error_count") long mappingErrorCount,
        @JsonProperty("last_error_code") String lastErrorCode,
        @JsonProperty("last_error_message") String lastErrorMessage,
        @JsonProperty("checked_at") Instant checkedAt
) {
}
