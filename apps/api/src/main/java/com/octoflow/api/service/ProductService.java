package com.octoflow.api.service;

import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.UpdateProductRequest;
import com.octoflow.api.dto.response.ProductResponse;

import java.util.List;

public interface ProductService {

    List<ProductResponse> listProducts();

    ProductResponse getProductById(Long id);

    ProductResponse createProduct(CreateProductRequest request, String idempotencyKey);

    ProductResponse updateProduct(Long id, UpdateProductRequest request);

    void deleteProduct(Long id);
}
