package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

public record ReceiveItemsRequest(
        @NotEmpty(message = "Danh sách kiểm đếm không được để trống")
        @Size(max = 200, message = "Một lần nhận không được vượt quá 200 dòng")
        List<@Valid ItemInspection> inspections
) {
    public record ItemInspection(
            @NotNull(message = "ID dòng phiếu nhập không được để trống")
            @Positive(message = "ID dòng phiếu nhập phải lớn hơn 0")
            Long itemId,

            @NotNull(message = "Số lượng đạt chuẩn không được để trống")
            @Min(value = 0, message = "Số lượng đạt chuẩn không được âm")
            @Max(value = 1_000_000, message = "Số lượng đạt chuẩn không được vượt quá 1.000.000")
            Integer acceptedQty,

            @Min(value = 0, message = "Số lượng lỗi không được âm")
            @Max(value = 1_000_000, message = "Số lượng lỗi không được vượt quá 1.000.000")
            Integer rejectedQty
    ) {}
}
