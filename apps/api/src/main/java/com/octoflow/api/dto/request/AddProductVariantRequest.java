package com.octoflow.api.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * Adding a variant never accepts opening stock. Stock can only enter through receiving or a
 * reasoned inventory adjustment.
 */
public record AddProductVariantRequest(
        @NotBlank(message = "SKU không được để trống")
        @Size(max = 64, message = "SKU không được vượt quá 64 ký tự")
        String sku,

        @NotBlank(message = "Tên biến thể không được để trống")
        @Size(max = 128, message = "Tên biến thể không được vượt quá 128 ký tự")
        String title,

        @PositiveOrZero(message = "Giá không được âm")
        Long price,

        @Pattern(regexp = "[A-Za-z]{3}", message = "Tiền tệ phải là mã ISO gồm 3 chữ cái")
        String currency,

        @PositiveOrZero(message = "Tồn ban đầu không được âm")
        @Max(value = 0, message = "Biến thể mới phải bắt đầu với tồn bằng 0; hãy tạo phiếu nhập sau đó")
        Integer initialStock
) {}
