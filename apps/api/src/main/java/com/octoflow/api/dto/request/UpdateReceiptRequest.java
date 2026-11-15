package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
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
        @JsonProperty("supplier_name")
        @JsonAlias({"supplierName", "supplier_name"})
        @NotBlank(message = "Tên nhà cung cấp không được để trống")
        @Size(max = 255, message = "Tên nhà cung cấp không được vượt quá 255 ký tự")
        String supplierName,

        @JsonProperty("note")
        @Size(max = 2000, message = "Ghi chú phiếu nhập không được vượt quá 2.000 ký tự")
        String note,

        @JsonProperty("items")
        @NotEmpty(message = "Phiếu nhập phải có ít nhất một sản phẩm")
        @Size(max = 200, message = "Một phiếu nhập không được vượt quá 200 dòng")
        @Valid
        List<CreateReceiptRequest.ReceiptItemRequest> items,

        @JsonProperty("expected_version")
        @JsonAlias({"expectedVersion", "expected_version"})
        @NotNull(message = "Phiên bản phiếu nhập không được để trống")
        Long expectedVersion
) {}
