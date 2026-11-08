package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record InventoryAdjustRequest(
        @NotBlank(message = "SKU không được để trống")
        String sku,

        @NotNull(message = "Số lượng thay đổi (delta) không được để trống")
        Integer delta,

        @NotBlank(message = "Lý do điều chỉnh bắt buộc phải có")
        String reason,

        Long expectedVersion
) {}
