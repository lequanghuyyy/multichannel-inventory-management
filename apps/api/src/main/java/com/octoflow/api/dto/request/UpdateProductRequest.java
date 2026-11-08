package com.octoflow.api.dto.request;

import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public record UpdateProductRequest(
        @Size(max = 255, message = "Tên sản phẩm không được vượt quá 255 ký tự")
        String name,

        @Size(max = 10_000, message = "Mô tả sản phẩm không được vượt quá 10.000 ký tự")
        String description,

        @Size(max = 64, message = "Danh mục không được vượt quá 64 ký tự")
        String category,

        @Pattern(regexp = "(?i)DRAFT|PUBLISHED|ARCHIVED", message = "Trạng thái sản phẩm không hợp lệ")
        String status
) {}
