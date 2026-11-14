package com.octoflow.api.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record InventoryAdjustRequest(
        @NotBlank(message = "SKU không được để trống")
        @Size(max = 64, message = "SKU không được vượt quá 64 ký tự")
        String sku,

        @NotNull(message = "Số lượng thay đổi (delta) không được để trống")
        Integer delta,

        @NotBlank(message = "Lý do điều chỉnh bắt buộc phải có")
        @Size(max = 255, message = "Lý do điều chỉnh không được vượt quá 255 ký tự")
        String reason,

        Long expectedVersion,

        @Min(value = 0, message = "Tồn đệm không được âm")
        Integer safetyBuffer
) {
    public InventoryAdjustRequest(String sku, Integer delta, String reason, Long expectedVersion) {
        this(sku, delta, reason, expectedVersion, null);
    }
}
