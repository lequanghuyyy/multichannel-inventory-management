package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonProperty;

public record VerifyChannelMappingRequest(
        @JsonProperty("external_sku") String externalSku,
        @JsonProperty("external_variant_id") String externalVariantId
) {}
