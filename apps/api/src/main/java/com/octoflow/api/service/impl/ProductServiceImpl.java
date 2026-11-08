package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.UpdateProductRequest;
import com.octoflow.api.dto.response.ProductResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ProductMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.ReservationRepository;
import com.octoflow.api.service.ProductService;
import com.octoflow.api.service.IdempotencyService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Service
public class ProductServiceImpl implements ProductService {

    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final InventoryLedgerRepository ledgerRepository;
    private final ReservationRepository reservationRepository;
    private final ProductMapper productMapper;
    private final IdempotencyService idempotencyService;

    public ProductServiceImpl(ProductRepository productRepository,
                              ProductVariantRepository variantRepository,
                              InventoryBalanceRepository balanceRepository,
                              InventoryLedgerRepository ledgerRepository,
                              ReservationRepository reservationRepository,
                              ProductMapper productMapper,
                              IdempotencyService idempotencyService) {
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.balanceRepository = balanceRepository;
        this.ledgerRepository = ledgerRepository;
        this.reservationRepository = reservationRepository;
        this.productMapper = productMapper;
        this.idempotencyService = idempotencyService;
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
    public ProductResponse createProduct(CreateProductRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/products", request,
                ProductResponse.class, () -> createProductInternal(request));
    }

    private ProductResponse createProductInternal(CreateProductRequest request) {
        for (CreateProductRequest.CreateVariantRequest vReq : request.variants()) {
            if (variantRepository.existsBySku(vReq.sku())) {
                throw new BusinessRuleException(ErrorCode.DUPLICATE_SKU, "SKU '" + vReq.sku() + "' đã tồn tại");
            }
            if (vReq.initialStock() != null && vReq.initialStock() != 0) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Sản phẩm mới phải bắt đầu với tồn bằng 0; hãy tạo phiếu nhập sau đó.");
            }
        }

        Product product = productMapper.toEntity(request);
        Product savedProduct = productRepository.save(product);

        for (CreateProductRequest.CreateVariantRequest vReq : request.variants()) {
            ProductVariant variant = productMapper.toVariantEntity(vReq, savedProduct);
            ProductVariant savedVariant = variantRepository.save(variant);

            InventoryBalance balance = new InventoryBalance();
            balance.setVariantId(savedVariant.getId());
            balance.setOnHand(0);
            balance.setReserved(0);
            balance.setSafetyBuffer(0);
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
                product.setStatus(Product.Status.valueOf(request.status().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException ex) {
                throw new ApiException(org.springframework.http.HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST,
                        "Trạng thái sản phẩm không hợp lệ.");
            }
        }

        Product updated = productRepository.save(product);
        return mapToResponse(updated);
    }

    @Override
    @Transactional
    public void deleteProduct(Long id) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm #" + id));
        List<Long> variantIds = variantRepository.findAllByProduct_Id(id).stream().map(ProductVariant::getId).toList();
        if (!variantIds.isEmpty() && (ledgerRepository.existsByVariantIdIn(variantIds)
                || reservationRepository.existsByVariantIdIn(variantIds))) {
            throw new com.octoflow.api.exception.ApiException(org.springframework.http.HttpStatus.CONFLICT,
                    ErrorCode.PRODUCT_HAS_INVENTORY_HISTORY,
                    "Không thể xóa sản phẩm đã có biến động tồn hoặc reservation; hãy chuyển trạng thái sang ARCHIVED.");
        }
        productRepository.delete(product);
    }

    private ProductResponse mapToResponse(Product product) {
        return productMapper.toResponse(product, variantId ->
                balanceRepository.findByVariantId(variantId).orElse(null)
        );
    }
}
