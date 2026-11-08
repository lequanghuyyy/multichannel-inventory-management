package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Max;
import java.util.List;

public record CreateProductRequest(
        @NotBlank(message = "Tên sản phẩm không được để trống")
        String name,

        String description,

        String category,

        @NotEmpty(message = "Sản phẩm phải có ít nhất một biến thể")
        List<@Valid CreateVariantRequest> variants
) {
    public record CreateVariantRequest(
            @NotBlank(message = "SKU không được để trống")
            String sku,

            @NotBlank(message = "Tên biến thể không được để trống")
            String title,

            Long price,

            String currency,

            @PositiveOrZero(message = "Tồn ban đầu không được âm")
            @Max(value = 0, message = "Sản phẩm mới phải bắt đầu với tồn bằng 0; hãy tạo phiếu nhập sau đó")
            Integer initialStock
    ) {}
}
