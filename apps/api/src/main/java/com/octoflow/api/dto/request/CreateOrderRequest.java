package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateOrderRequest(
        @NotBlank(message = "Nguồn đơn hàng không được để trống")
        String source,

        String externalOrderId,

        @NotEmpty(message = "Đơn hàng phải có ít nhất một sản phẩm")
        List<OrderItemRequest> items
) {
    public record OrderItemRequest(
            @NotBlank(message = "SKU không được để trống")
            String sku,

            @NotNull(message = "Số lượng không được để trống")
            Integer quantity,

            Long unitPrice
    ) {}
}
