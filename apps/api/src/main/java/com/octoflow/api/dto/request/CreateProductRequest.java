package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateProductRequest(
        @NotBlank(message = "Tên sản phẩm không được để trống")
        @Size(max = 255, message = "Tên sản phẩm không được vượt quá 255 ký tự")
        String name,

        @Size(max = 10_000, message = "Mô tả sản phẩm không được vượt quá 10.000 ký tự")
        String description,

        @Size(max = 64, message = "Danh mục không được vượt quá 64 ký tự")
        String category,

        @NotEmpty(message = "Sản phẩm phải có ít nhất một biến thể")
        @Size(max = 200, message = "Một sản phẩm không được vượt quá 200 biến thể")
        List<@Valid CreateVariantRequest> variants
) {
    public record CreateVariantRequest(
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
            @Max(value = 0, message = "Sản phẩm mới phải bắt đầu với tồn bằng 0; hãy tạo phiếu nhập sau đó")
            Integer initialStock
    ) {}
}
