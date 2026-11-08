package com.octoflow.api.dto.request;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record ReserveStockRequest(
        @NotBlank(message = "SKU không được để trống")
        String sku,

        @NotNull(message = "Số lượng giữ không được để trống")
        @Min(value = 1, message = "Số lượng giữ phải lớn hơn 0")
        Integer quantity,

        Long orderId,

        Integer ttlMinutes
) {}
