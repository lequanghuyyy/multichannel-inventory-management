package com.octoflow.api.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * POS order contract. The HTTP endpoint is intentionally POS-only: {@code source} is accepted
 * only for backwards compatibility and any value other than POS is rejected. Marketplace orders
 * enter through the internal ChannelOrderCommand boundary, never through this DTO.
 */
public record CreateOrderRequest(
        @Schema(description = "Deprecated compatibility field. Only POS (or empty) is accepted.",
                example = "POS")
        String source,

        @Schema(description = "Must be empty. Marketplace identity is assigned by the internal connector boundary.",
                example = "null")
        @Size(max = 128, message = "Mã đơn hàng bên ngoài không được vượt quá 128 ký tự")
        String externalOrderId,

        @NotEmpty(message = "Đơn hàng phải có ít nhất một sản phẩm")
        @Size(max = 200, message = "Một đơn hàng không được vượt quá 200 dòng")
        List<@Valid OrderItemRequest> items
) {
    public record OrderItemRequest(
            @NotBlank(message = "SKU không được để trống")
            @Size(max = 64, message = "SKU không được vượt quá 64 ký tự")
            String sku,

            @NotNull(message = "Số lượng không được để trống")
            @Positive(message = "Số lượng phải lớn hơn 0")
            @Max(value = 1_000_000, message = "Số lượng mỗi dòng không được vượt quá 1.000.000")
            Integer quantity,

            @Schema(description = "Optional expected price. The server price is authoritative; a mismatch is rejected with PRICE_OR_STOCK_CHANGED.",
                    example = "1250000")
            @PositiveOrZero(message = "Đơn giá không được âm")
            Long unitPrice
    ) {}
}
