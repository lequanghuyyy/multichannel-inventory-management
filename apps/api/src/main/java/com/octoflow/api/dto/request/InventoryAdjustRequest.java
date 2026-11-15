package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record InventoryAdjustRequest(
        @JsonProperty("sku")
        @NotBlank(message = "SKU không được để trống")
        @Size(max = 64, message = "SKU không được vượt quá 64 ký tự")
        String sku,

        @JsonProperty("delta")
        @NotNull(message = "Số lượng thay đổi (delta) không được để trống")
        Integer delta,

        @JsonProperty("reason")
        @NotBlank(message = "Lý do điều chỉnh bắt buộc phải có")
        @Size(max = 255, message = "Lý do điều chỉnh không được vượt quá 255 ký tự")
        String reason,

        @JsonProperty("expected_version")
        @JsonAlias({"expectedVersion", "expected_version"})
        Long expectedVersion,

        @JsonProperty("safety_buffer")
        @JsonAlias({"safetyBuffer", "safety_buffer"})
        @Min(value = 0, message = "Tồn đệm không được âm")
        Integer safetyBuffer
) {
    public InventoryAdjustRequest(String sku, Integer delta, String reason, Long expectedVersion) {
        this(sku, delta, reason, expectedVersion, null);
    }
}
