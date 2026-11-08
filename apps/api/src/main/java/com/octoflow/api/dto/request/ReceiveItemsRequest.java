package com.octoflow.api.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Positive;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Quantities are batch deltas, not cumulative totals. A retry of the same physical delivery must
 * reuse its Idempotency-Key; a new key means a new independent receive batch.
 */
public record ReceiveItemsRequest(
        @NotEmpty(message = "Danh sách kiểm đếm không được để trống")
        @Size(max = 200, message = "Một lần nhận không được vượt quá 200 dòng")
        List<@Valid ItemInspection> inspections,

        Long expectedReceiptVersion
) {
    public ReceiveItemsRequest(List<ItemInspection> inspections) {
        this(inspections, null);
    }

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
            Integer rejectedQty,

            @Size(max = 500, message = "Lý do từ chối không được vượt quá 500 ký tự")
            String rejectionReason
    ) {
        public ItemInspection(Long itemId, Integer acceptedQty, Integer rejectedQty) {
            this(itemId, acceptedQty, rejectedQty, null);
        }
    }
}
