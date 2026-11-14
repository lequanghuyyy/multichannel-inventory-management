package com.octoflow.api.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.PositiveOrZero;
import jakarta.validation.constraints.Size;

/**
 * POS payment recording. The server already knows the amount due from the order, so the client
 * never sends it. CASH requires {@code cashReceived}; BANK_TRANSFER may carry a reference and a
 * note. Amounts are integer minor units in the order currency.
 */
public record RecordPaymentRequest(
        @Schema(description = "CASH or BANK_TRANSFER", example = "CASH")
        @NotBlank(message = "Phương thức thanh toán không được để trống")
        @Size(max = 24, message = "Phương thức thanh toán không được vượt quá 24 ký tự")
        String method,

        @Schema(description = "Only for CASH: the amount of cash the customer handed over.",
                example = "500000")
        @PositiveOrZero(message = "Tiền khách đưa không được âm")
        Long cashReceived,

        @Schema(description = "Optional bank transfer reference.", example = "FT-20261109-001")
        @Size(max = 128, message = "Mã tham chiếu không được vượt quá 128 ký tự")
        String reference,

        @Schema(description = "Optional staff note.", example = "Khách thanh toán tại quầy")
        @Size(max = 500, message = "Ghi chú không được vượt quá 500 ký tự")
        String note
) {}
