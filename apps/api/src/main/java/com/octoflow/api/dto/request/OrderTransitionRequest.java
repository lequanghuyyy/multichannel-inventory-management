package com.octoflow.api.dto.request;

import io.swagger.v3.oas.annotations.media.Schema;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

/**
 * Explicit lifecycle move for a paid POS order. The target must be the next status in the base
 * chain; POS counter handover uses its own endpoint because it skips PACKED/SHIPPED.
 */
public record OrderTransitionRequest(
        @Schema(description = "CONFIRMED, PACKED, SHIPPED, or DELIVERED", example = "PACKED")
        @NotBlank(message = "Trạng thái đích không được để trống")
        @Size(max = 32, message = "Trạng thái đích không được vượt quá 32 ký tự")
        String status,

        @Schema(description = "Optional reason stored in the order history.", example = "Đã đóng gói")
        @Size(max = 500, message = "Lý do không được vượt quá 500 ký tự")
        String reason
) {}
