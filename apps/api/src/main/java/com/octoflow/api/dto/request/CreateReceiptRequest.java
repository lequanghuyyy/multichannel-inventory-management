package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record CreateReceiptRequest(
        @NotBlank(message = "Tên nhà cung cấp không được để trống")
        String supplierName,

        @NotEmpty(message = "Phiếu nhập phải có ít nhất một sản phẩm")
        List<ReceiptItemRequest> items
) {
    public record ReceiptItemRequest(
            @NotNull(message = "ID biến thể không được để trống")
            Long variantId,

            @NotNull(message = "Số lượng dự kiến không được để trống")
            Integer expectedQty,

            Long unitCost
    ) {}
}
