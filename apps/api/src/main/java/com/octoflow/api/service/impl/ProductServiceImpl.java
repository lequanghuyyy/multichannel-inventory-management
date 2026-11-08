package com.octoflow.api.service.impl;

import com.octoflow.api.dto.request.CreateProductRequest;
import com.octoflow.api.dto.request.UpdateProductRequest;
import com.octoflow.api.dto.response.ProductResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ProductMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.InventoryLedgerRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.repository.ReservationRepository;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.ProductService;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

@Service
public class ProductServiceImpl implements ProductService {

    private static final String BASE_CURRENCY = "VND";
    private static final int MAX_VARIANTS = 200;
    private static final int MAX_DESCRIPTION_LENGTH = 10_000;
    private static final Pattern CURRENCY_PATTERN = Pattern.compile("^[A-Z]{3}$");

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
        CreateProductRequest normalized = validateAndNormalize(request);
        Product product = productMapper.toEntity(normalized);
        Product savedProduct = productRepository.save(product);

        for (CreateProductRequest.CreateVariantRequest vReq : normalized.variants()) {
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

    private CreateProductRequest validateAndNormalize(CreateProductRequest request) {
        if (request == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Yêu cầu tạo sản phẩm không hợp lệ.");
        }
        String name = requireText(request.name(), 255, "Tên sản phẩm");
        String description = optionalText(request.description(), MAX_DESCRIPTION_LENGTH, "Mô tả sản phẩm");
        String category = optionalText(request.category(), 64, "Danh mục");
        if (request.variants() == null || request.variants().isEmpty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Sản phẩm phải có ít nhất một biến thể.");
        }
        if (request.variants().size() > MAX_VARIANTS) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Một sản phẩm không được vượt quá " + MAX_VARIANTS + " biến thể.");
        }

        Set<String> seenSkus = new HashSet<>();
        List<CreateProductRequest.CreateVariantRequest> variants = new ArrayList<>(request.variants().size());
        for (CreateProductRequest.CreateVariantRequest variant : request.variants()) {
            if (variant == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Biến thể sản phẩm không hợp lệ.");
            }
            String sku = requireText(variant.sku(), 64, "SKU");
            String title = requireText(variant.title(), 128, "Tên biến thể");
            if (!seenSkus.add(sku)) {
                throw new BusinessRuleException(ErrorCode.DUPLICATE_SKU,
                        "SKU '" + sku + "' xuất hiện nhiều lần trong cùng yêu cầu.");
            }
            if (variantRepository.existsBySku(sku)) {
                throw new BusinessRuleException(ErrorCode.DUPLICATE_SKU, "SKU '" + sku + "' đã tồn tại");
            }
            if (variant.initialStock() != null && variant.initialStock() != 0) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Sản phẩm mới phải bắt đầu với tồn bằng 0; hãy tạo phiếu nhập sau đó.");
            }
            long price = requirePrice(variant.price());
            String currency = normalizeCurrency(variant.currency());

            variants.add(new CreateProductRequest.CreateVariantRequest(
                    sku, title, price, currency, variant.initialStock()));
        }

        return new CreateProductRequest(name, description, category, variants);
    }

    @Override
    @Transactional
    public ProductResponse updateProduct(Long id, UpdateProductRequest request) {
        Product product = productRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.PRODUCT_NOT_FOUND, "Không tìm thấy sản phẩm #" + id));
        if (request == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Yêu cầu cập nhật sản phẩm không hợp lệ.");
        }

        if (request.name() != null) {
            product.setName(requireText(request.name(), 255, "Tên sản phẩm"));
        }
        if (request.description() != null) {
            product.setDescription(optionalText(request.description(), MAX_DESCRIPTION_LENGTH, "Mô tả sản phẩm"));
        }
        if (request.category() != null) {
            product.setCategory(optionalText(request.category(), 64, "Danh mục"));
        }
        if (request.status() != null) {
            try {
                product.setStatus(Product.Status.valueOf(request.status().trim().toUpperCase(Locale.ROOT)));
            } catch (IllegalArgumentException ex) {
                throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.BAD_REQUEST,
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
            throw new ApiException(HttpStatus.CONFLICT,
                    ErrorCode.PRODUCT_HAS_INVENTORY_HISTORY,
                    "Không thể xóa sản phẩm đã có biến động tồn hoặc reservation; hãy chuyển trạng thái sang ARCHIVED.");
        }
        productRepository.delete(product);
    }

    private String requireText(String value, int maxLength, String field) {
        if (value == null || value.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, field + " không được để trống.");
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    field + " không được vượt quá " + maxLength + " ký tự.");
        }
        return normalized;
    }

    private String optionalText(String value, int maxLength, String field) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.length() > maxLength) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    field + " không được vượt quá " + maxLength + " ký tự.");
        }
        return normalized.isEmpty() ? null : normalized;
    }

    private long requirePrice(Long price) {
        long normalized = price == null ? 0L : price;
        if (normalized < 0) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Giá không được âm.");
        }
        return normalized;
    }

    private String normalizeCurrency(String currency) {
        if (currency == null || currency.isBlank()) {
            return BASE_CURRENCY;
        }
        String normalized = currency.trim().toUpperCase(Locale.ROOT);
        if (!CURRENCY_PATTERN.matcher(normalized).matches()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Tiền tệ phải là mã ISO gồm 3 chữ cái.");
        }
        return normalized;
    }

    private ProductResponse mapToResponse(Product product) {
        return productMapper.toResponse(product, variantId ->
                balanceRepository.findByVariantId(variantId).orElse(null)
        );
    }
}
