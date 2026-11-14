package com.octoflow.api.dto.request;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.util.List;

/**
 * Full replacement of an editable draft receipt. Received quantities are intentionally absent:
 * once any stock has been processed the receipt is no longer a draft and must be closed short or
 * received in further batches instead of rewriting history.
 */
public record UpdateReceiptRequest(
        @NotBlank(message = "Tên nhà cung cấp không được để trống")
        @Size(max = 255, message = "Tên nhà cung cấp không được vượt quá 255 ký tự")
        String supplierName,

        @Size(max = 2000, message = "Ghi chú phiếu nhập không được vượt quá 2.000 ký tự")
        String note,

        @NotEmpty(message = "Phiếu nhập phải có ít nhất một sản phẩm")
        @Size(max = 200, message = "Một phiếu nhập không được vượt quá 200 dòng")
        @Valid
        List<CreateReceiptRequest.ReceiptItemRequest> items,

        @NotNull(message = "Phiên bản phiếu nhập không được để trống")
        Long expectedVersion
) {}
