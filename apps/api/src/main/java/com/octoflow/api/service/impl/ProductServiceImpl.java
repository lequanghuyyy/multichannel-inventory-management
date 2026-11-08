package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.UpdateProductRequest;
import com.octoflow.api.dto.response.ProductResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ProductMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.ProductService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ProductServiceImpl implements ProductService {

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ProductMapper productMapper;

    public ProductServiceImpl(ProductRepository productRepository,
                              ProductVariantRepository variantRepository,
                              InventoryBalanceRepository balanceRepository,
                              ProductMapper productMapper) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.balanceRepository = balanceRepository;
        this.productMapper = productMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ProductResponse> listProducts() {
        return productRepository.findAll().stream()
                .map(this::mapToResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public ProductResponse getProductById(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm #" + id));
        return mapToResponse(product);
    }

    @Override
    @Transactional
    public ProductResponse createProduct(CreateProductRequest request) {
        for (CreateProductRequest.CreateVariantRequest vReq : request.variants()) {
            if (variantRepository.existsBySku(vReq.sku())) {
                throw new BusinessRuleException(ErrorCode.DUPLICATE_SKU, "SKU '" + vReq.sku() + "' đã tồn tại");
            }
        }

        Product product = productMapper.toEntity(request);
        Product savedProduct = productRepository.save(product);

        for (CreateProductRequest.CreateVariantRequest vReq : request.variants()) {
            ProductVariant variant = productMapper.toVariantEntity(vReq, savedProduct);
            ProductVariant savedVariant = variantRepository.save(variant);

            InventoryBalance balance = new InventoryBalance();
            balance.setVariantId(savedVariant.getId());
            int stock = vReq.initialStock() != null ? Math.max(0, vReq.initialStock()) : 0;
            balance.setOnHand(stock);
            balance.setReserved(0);
            balance.setSafetyBuffer(0);
            balance.setVersion(0L);
            balanceRepository.save(balance);

            savedProduct.getVariants().add(savedVariant);
        }

        return mapToResponse(savedProduct);
    }

    @Override
    @Transactional
    public ProductResponse updateProduct(Long id, UpdateProductRequest request) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm #" + id));

        if (request.name() != null && !request.name().isBlank()) {
            product.setName(request.name());
        }
        if (request.description() != null) {
            product.setDescription(request.description());
        }
        if (request.category() != null) {
            product.setCategory(request.category());
        }
        if (request.status() != null) {
            try {
                product.setStatus(Product.Status.valueOf(request.status().toUpperCase()));
            } catch (IllegalArgumentException ignored) {}
        }

        Product updated = productRepository.save(product);
        return mapToResponse(updated);
    }

    @Override
    @Transactional
    public void deleteProduct(Long id) {
        if (!productRepository.existsById(id)) {
            throw new ResourceNotFoundException(ErrorCode.PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm #" + id);
        }
        productRepository.deleteById(id);
    }

    private ProductResponse mapToResponse(Product product) {
        return productMapper.toResponse(product, variantId ->
                balanceRepository.findByVariantId(variantId).orElse(null)
        );
    }
}
