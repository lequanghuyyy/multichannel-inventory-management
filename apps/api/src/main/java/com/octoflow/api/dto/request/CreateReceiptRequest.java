package com.octoflow.api.dto.request;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
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
        List<@Valid ReceiptItemRequest> items
) {
    public CreateReceiptRequest(String supplierName, List<ReceiptItemRequest> items) {
        this(supplierName, null, items);
    }

    /**
     * A line identifies its variant either by internal id or by canonical SKU. The POS/receiving
     * screens know the SKU from the inventory list, while back-office imports may know the id.
     */
    public record ReceiptItemRequest(
            @JsonProperty("variant_id")
            @JsonAlias({"variantId", "variant_id"})
            @Positive(message = "ID biến thể phải lớn hơn 0")
            Long variantId,

            @JsonProperty("sku")
            @Size(max = 64, message = "SKU không được vượt quá 64 ký tự")
            String sku,

            @JsonProperty("expected_quantity")
            @JsonAlias({"expectedQty", "expected_quantity", "expectedQuantity"})
            @NotNull(message = "Số lượng dự kiến không được để trống")
            @Min(value = 1, message = "Số lượng dự kiến phải lớn hơn 0")
            @Max(value = 1_000_000, message = "Số lượng dự kiến không được vượt quá 1.000.000")
            Integer expectedQty,

            @JsonProperty("unit_cost_minor")
            @JsonAlias({"unitCost", "unit_cost_minor", "unitCostMinor"})
            @PositiveOrZero(message = "Đơn giá nhập không được âm")
            Long unitCost
    ) {
        public ReceiptItemRequest(Long variantId, Integer expectedQty, Long unitCost) {
            this(variantId, null, expectedQty, unitCost);
        }
    }
}
