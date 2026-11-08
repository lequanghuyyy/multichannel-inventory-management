package com.octoflow.api.dto.request;

public record UpdateProductRequest(
        String name,
        String description,
        String category,
        String status
) {}
