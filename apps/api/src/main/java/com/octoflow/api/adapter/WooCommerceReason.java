package com.octoflow.api.adapter;

/**
 * Stable reason codes for WooCommerce connector failures. They are safe to persist in evidence
 * and return to the seller UI; they never contain credentials or the request URL.
 */
public final class WooCommerceReason {

    public static final String DISABLED = "WOO_DISABLED";
    public static final String NOT_CONFIGURED = "WOO_NOT_CONFIGURED";
    public static final String BASE_URL_INVALID = "WOO_BASE_URL_INVALID";
    public static final String HTTP_TRUSTED_HOST_REQUIRED = "WOO_HTTP_TRUSTED_HOST_REQUIRED";
    public static final String ENVIRONMENT_BLOCKED = "WOO_ENVIRONMENT_BLOCKED";
    public static final String WRITE_DISABLED = "WOO_WRITE_DISABLED";
    public static final String CONNECTION_NOT_VERIFIED = "WOO_CONNECTION_NOT_VERIFIED";
    public static final String AUTH_FAILED = "WOO_AUTH_FAILED";
    public static final String PERMISSION_DENIED = "WOO_PERMISSION_DENIED";
    public static final String NOT_FOUND = "WOO_NOT_FOUND";
    public static final String RATE_LIMITED = "WOO_RATE_LIMITED";
    public static final String HTTP_ERROR = "WOO_HTTP_ERROR";
    public static final String TIMEOUT = "WOO_TIMEOUT";
    public static final String CONNECTION_FAILED = "WOO_CONNECTION_FAILED";
    public static final String INVALID_RESPONSE = "WOO_INVALID_RESPONSE";
    public static final String PRODUCT_ID_INVALID = "WOO_PRODUCT_ID_INVALID";
    public static final String VARIATION_ID_INVALID = "WOO_VARIATION_ID_INVALID";
    public static final String PRODUCT_TYPE_UNSUPPORTED = "WOO_PRODUCT_TYPE_UNSUPPORTED";
    public static final String PRODUCT_UNAVAILABLE = "WOO_PRODUCT_UNAVAILABLE";
    public static final String STOCK_MANAGEMENT_DISABLED = "WOO_STOCK_MANAGEMENT_DISABLED";
    public static final String SKU_MISMATCH = "WOO_SKU_MISMATCH";
    public static final String MAPPING_MISMATCH = "WOO_MAPPING_MISMATCH";
    public static final String STOCK_QUANTITY_MISSING = "WOO_STOCK_QUANTITY_MISSING";

    private WooCommerceReason() {
    }
}
