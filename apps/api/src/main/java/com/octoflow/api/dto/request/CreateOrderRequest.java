package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

public record CreateOrderRequest(
        @NotBlank(message = "Nguồn đơn hàng không được để trống")
        String source,

        String externalOrderId,

        @NotEmpty(message = "Đơn hàng phải có ít nhất một sản phẩm")
        List<@Valid OrderItemRequest> items
) {
    public record OrderItemRequest(
            @NotBlank(message = "SKU không được để trống")
            String sku,

            @NotNull(message = "Số lượng không được để trống")
            @Positive(message = "Số lượng phải lớn hơn 0")
            Integer quantity,

            @PositiveOrZero(message = "Đơn giá không được âm")
            Long unitPrice
    ) {}
}
