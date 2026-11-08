package com.octoflow.api.dto.request;

import jakarta.validation.constraints.NotBlank;

public record LoginRequest(
        String username,
        String email,
        @NotBlank(message = "Mật khẩu không được để trống")
        String password
) {
    public String getPrincipal() {
        if (email != null && !email.isBlank()) {
            return email.trim();
        }
        if (username != null && !username.isBlank()) {
            return username.trim();
        }
        return "";
    }
}
