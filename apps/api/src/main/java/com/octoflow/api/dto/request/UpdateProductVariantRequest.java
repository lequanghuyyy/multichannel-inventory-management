package com.octoflow.api.dto.request;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Fields that are null are left unchanged. Changing SKU requires a reason because it is the
 * identifier humans read at receiving and stock-count time.
 */
public record UpdateProductVariantRequest(
        @Size(max = 64, message = "SKU không được vượt quá 64 ký tự")
        String sku,

        @Size(max = 128, message = "Tên biến thể không được vượt quá 128 ký tự")
        String title,

        @PositiveOrZero(message = "Giá không được âm")
        Long price,

        @Pattern(regexp = "[A-Za-z]{3}", message = "Tiền tệ phải là mã ISO gồm 3 chữ cái")
        String currency,

        @Size(max = 500, message = "Lý do thay đổi không được vượt quá 500 ký tự")
        String reason
) {}
