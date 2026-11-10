package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;

public record RegisterChannelMappingRequest(
        @JsonProperty("sku") String sku,
        @JsonProperty("external_listing_id") String externalListingId,
        @JsonProperty("external_sku") String externalSku,
        @JsonProperty("external_variant_id") String externalVariantId
) {}
