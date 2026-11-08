package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

import java.util.List;

public record CreateReceiptRequest(
        @NotBlank(message = "Tên nhà cung cấp không được để trống")
        @Size(max = 255, message = "Tên nhà cung cấp không được vượt quá 255 ký tự")
        String supplierName,

        @NotEmpty(message = "Phiếu nhập phải có ít nhất một sản phẩm")
        @Size(max = 200, message = "Một phiếu nhập không được vượt quá 200 dòng")
        List<@Valid ReceiptItemRequest> items
) {
    public record ReceiptItemRequest(
            @NotNull(message = "ID biến thể không được để trống")
            @Positive(message = "ID biến thể phải lớn hơn 0")
            Long variantId,

            @NotNull(message = "Số lượng dự kiến không được để trống")
            @Min(value = 1, message = "Số lượng dự kiến phải lớn hơn 0")
            @Max(value = 1_000_000, message = "Số lượng dự kiến không được vượt quá 1.000.000")
            Integer expectedQty,

            @PositiveOrZero(message = "Đơn giá nhập không được âm")
            Long unitCost
    ) {}
}
