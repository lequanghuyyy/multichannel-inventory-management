package com.octoflow.api.mapper;

import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.response.ProductResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.function.Function;
import java.util.stream.Collectors;

@Component
public class ProductMapper {

    public Product toEntity(CreateProductRequest request) {
        if (request == null) {
            return null;
        }
        Product product = new Product();
        product.setName(request.name());
        product.setDescription(request.description());
        product.setCategory(request.category());
        product.setStatus(Product.Status.DRAFT);
        return product;
    }

    public ProductVariant toVariantEntity(CreateProductRequest.CreateVariantRequest request, Product product) {
        if (request == null) {
            return null;
        }
        ProductVariant variant = new ProductVariant();
        variant.setProduct(product);
        variant.setSku(request.sku());
        variant.setTitle(request.title());
        variant.setPrice(request.price() != null ? request.price() : 0L);
        variant.setCurrency(request.currency() != null && !request.currency().isBlank() ? request.currency() : "VND");
        return variant;
    }

    public ProductResponse.VariantResponse toVariantResponse(ProductVariant variant, InventoryBalance balance) {
        if (variant == null) {
            return null;
        }
        int onHand = balance != null ? balance.getOnHand() : 0;
        int reserved = balance != null ? balance.getReserved() : 0;
        int safetyBuffer = balance != null ? balance.getSafetyBuffer() : 0;
        int ats = balance != null ? balance.getAvailableToSell() : 0;

        return new ProductResponse.VariantResponse(
                variant.getId(),
                variant.getSku(),
                variant.getTitle(),
                variant.getPrice(),
                variant.getCurrency(),
                onHand,
                reserved,
                safetyBuffer,
                ats
        );
    }

    public ProductResponse toResponse(Product product, Function<Long, InventoryBalance> balanceLookup) {
        if (product == null) {
            return null;
        }

        List<ProductResponse.VariantResponse> variantResponses = Collections.emptyList();
        if (product.getVariants() != null && !product.getVariants().isEmpty()) {
            variantResponses = product.getVariants().stream()
                    .map(v -> {
                        InventoryBalance balance = balanceLookup != null ? balanceLookup.apply(v.getId()) : null;
                        return toVariantResponse(v, balance);
                    })
                    .collect(Collectors.toList());
        }

        return new ProductResponse(
                product.getId(),
                product.getName(),
                product.getDescription(),
                product.getCategory(),
                product.getStatus() != null ? product.getStatus().name() : Product.Status.DRAFT.name(),
                variantResponses,
                product.getCreatedAt(),
                product.getUpdatedAt()
        );
    }
}
