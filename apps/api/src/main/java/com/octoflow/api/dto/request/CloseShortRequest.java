package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

public record CloseShortRequest(
        @NotBlank(message = "Lý do đóng phiếu thiếu không được để trống")
        @Size(max = 500, message = "Lý do đóng phiếu thiếu không được vượt quá 500 ký tự")
        String reason,

        @NotNull(message = "Phiên bản phiếu nhập không được để trống")
        Long expectedVersion
) {}
