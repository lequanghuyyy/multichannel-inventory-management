package com.octoflow.api.controller;

import com.octoflow.api.dto.request.AddProductVariantRequest;
import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.UpdateProductRequest;
import com.octoflow.api.dto.request.UpdateProductVariantRequest;
import com.octoflow.api.dto.response.ApiResponse;
import com.octoflow.api.dto.response.ProductResponse;
import com.octoflow.api.service.ProductService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;

@RestController
@RequestMapping("/api/v1/products")
@Tag(name = "Products", description = "Catalog items and variants management")
public class ProductController {

    private final ProductService productService;

    public ProductController(ProductService productService) {
        this.productService = productService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List all products with variants and stock levels")
    public ResponseEntity<List<ProductResponse>> listProducts() {
        return ResponseEntity.ok(productService.listProducts());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get product details by ID")
    public ResponseEntity<ProductResponse> getProductById(@PathVariable Long id) {
        return ResponseEntity.ok(productService.getProductById(id));
    }

    @PostMapping
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Create a draft product with zero-stock variants")
    public ResponseEntity<ProductResponse> createProduct(
            @Valid @RequestBody CreateProductRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact product creation request")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(productService.createProduct(request, idempotencyKey));
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update product details and validate lifecycle transitions")
    public ResponseEntity<ProductResponse> updateProduct(
            @PathVariable Long id,
            @Valid @RequestBody UpdateProductRequest request) {
        return ResponseEntity.ok(productService.updateProduct(id, request));
    }

    @PostMapping("/{id}/variants")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Add a zero-stock variant to an existing non-archived product")
    public ResponseEntity<ProductResponse.VariantResponse> addVariant(
            @PathVariable Long id,
            @Valid @RequestBody AddProductVariantRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact variant creation")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(productService.addVariant(id, request, idempotencyKey));
    }

    @PatchMapping("/{id}/variants/{variantId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Update variant title, price, currency or (with a reason) SKU")
    public ResponseEntity<ProductResponse.VariantResponse> updateVariant(
            @PathVariable Long id,
            @PathVariable Long variantId,
            @Valid @RequestBody UpdateProductVariantRequest request) {
        return ResponseEntity.ok(productService.updateVariant(id, variantId, request));
    }

    @DeleteMapping("/{id}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Delete a product only when it has no inventory, order, receipt or mapping history")
    public ResponseEntity<ApiResponse<Void>> deleteProduct(@PathVariable Long id) {
        productService.deleteProduct(id);
        return ResponseEntity.ok(ApiResponse.ok("Xóa sản phẩm thành công", null));
    }
}
