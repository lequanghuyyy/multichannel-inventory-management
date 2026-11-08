package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.PositiveOrZero;
import java.util.List;

public record CreateReceiptRequest(
        @NotBlank(message = "Tên nhà cung cấp không được để trống")
        String supplierName,

        @NotEmpty(message = "Phiếu nhập phải có ít nhất một sản phẩm")
        List<@Valid ReceiptItemRequest> items
) {
    public record ReceiptItemRequest(
            @NotNull(message = "ID biến thể không được để trống")
            Long variantId,

            @NotNull(message = "Số lượng dự kiến không được để trống")
            @Min(value = 1, message = "Số lượng dự kiến phải lớn hơn 0")
            Integer expectedQty,

            @PositiveOrZero(message = "Đơn giá nhập không được âm")
            Long unitCost
    ) {}
}
