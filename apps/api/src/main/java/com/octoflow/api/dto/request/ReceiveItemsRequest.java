package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Min;
import java.util.List;

public record ReceiveItemsRequest(
        @NotEmpty(message = "Danh sách kiểm đếm không được để trống")
        List<@Valid ItemInspection> inspections
) {
    public record ItemInspection(
            @NotNull(message = "ID dòng phiếu nhập không được để trống")
            Long itemId,

            @NotNull(message = "Số lượng đạt chuẩn không được để trống")
            @Min(value = 0, message = "Số lượng đạt chuẩn không được âm")
            Integer acceptedQty,

            @Min(value = 0, message = "Số lượng lỗi không được âm")
            Integer rejectedQty
    ) {}
}
