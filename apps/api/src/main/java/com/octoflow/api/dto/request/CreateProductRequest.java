package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import java.util.List;

public record CreateProductRequest(
        @NotBlank(message = "Tên sản phẩm không được để trống")
        String name,

        String description,

        String category,

        @NotEmpty(message = "Sản phẩm phải có ít nhất một biến thể")
        List<CreateVariantRequest> variants
) {
    public record CreateVariantRequest(
            @NotBlank(message = "SKU không được để trống")
            String sku,

            @NotBlank(message = "Tên biến thể không được để trống")
            String title,

            Long price,

            String currency,

            Integer initialStock
    ) {}
}
