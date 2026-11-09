package com.octoflow.api.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.Size;

/**
 * POS counter handover. This moves a paid CONFIRMED order straight to DELIVERED without
 * requiring PACKED or SHIPPED because the customer takes the goods at the counter.
 */
public record HandoverOrderRequest(
        @Schema(description = "Optional handover note.", example = "Khách đã nhận hàng tại quầy")
        @Size(max = 500, message = "Ghi chú bàn giao không được vượt quá 500 ký tự")
        String note
) {}
