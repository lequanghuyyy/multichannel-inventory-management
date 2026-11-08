package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record ReceiveItemsRequest(
        @NotEmpty(message = "Danh sách kiểm đếm không được để trống")
        List<ItemInspection> inspections
) {
    public record ItemInspection(
            @NotNull(message = "ID dòng phiếu nhập không được để trống")
            Long itemId,

            @NotNull(message = "Số lượng đạt chuẩn không được để trống")
            Integer acceptedQty,

            Integer rejectedQty
    ) {}
}
