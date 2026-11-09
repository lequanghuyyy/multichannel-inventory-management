package com.octoflow.api.service.impl;

import com.octoflow.api.dto.command.ChannelOrderCommand;
import com.octoflow.api.dto.request.CancelOrderRequest;
import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.request.HandoverOrderRequest;
import com.octoflow.api.dto.request.OrderTransitionRequest;
import com.octoflow.api.dto.request.RecordPaymentRequest;
import com.octoflow.api.dto.response.OrderHistoryResponse;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderItem;
import com.octoflow.api.entity.OrderStatusHistory;
import com.octoflow.api.entity.PosPaymentDetail;
import com.octoflow.api.entity.Product;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.OrderMapper;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.OrderStatusHistoryRepository;
import com.octoflow.api.repository.PosPaymentDetailRepository;
import com.octoflow.api.repository.ProductRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import com.octoflow.api.service.OrderAuditRecorder;
import com.octoflow.api.service.OrderService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.TreeMap;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class OrderServiceImpl implements OrderService {

    private static final Logger log = LoggerFactory.getLogger(OrderServiceImpl.class);
    private static final int MAX_ORDER_LINES = 200;
    private static final int MAX_QUANTITY_PER_SKU = 1_000_000;
    private static final int MAX_REASON_LENGTH = 500;
    private static final int MAX_REFERENCE_LENGTH = 128;
    private static final String BASE_CURRENCY = "VND";
    private static final Pattern CURRENCY_PATTERN = Pattern.compile("^[A-Z]{3}$");
    private static final Pattern EXTERNAL_ORDER_ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:/-]{1,128}$");

    private final OrderRepository orderRepository;
    private final ProductRepository productRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final ChannelRepository channelRepository;
    private final OrderStatusHistoryRepository historyRepository;
    private final PosPaymentDetailRepository paymentRepository;
    private final OrderMapper orderMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;
    private final OrderAuditRecorder auditRecorder;
    private final OrderExpiryProcessor orderExpiryProcessor;
    private final Duration holdTtl;

    public OrderServiceImpl(OrderRepository orderRepository,
                            ProductRepository productRepository,
                            ProductVariantRepository variantRepository,
                            InventoryBalanceRepository balanceRepository,
                            ChannelRepository channelRepository,
                            OrderStatusHistoryRepository historyRepository,
                            PosPaymentDetailRepository paymentRepository,
                            OrderMapper orderMapper,
                            IdempotencyService idempotencyService,
                            InventoryMovementRecorder movementRecorder,
                            OrderAuditRecorder auditRecorder,
                            OrderExpiryProcessor orderExpiryProcessor,
                            @Value("${app.orders.hold-ttl:PT15M}") Duration holdTtl) {
        this.orderRepository = orderRepository;
        this.productRepository = productRepository;
        this.variantRepository = variantRepository;
        this.balanceRepository = balanceRepository;
        this.channelRepository = channelRepository;
        this.historyRepository = historyRepository;
        this.paymentRepository = paymentRepository;
        this.orderMapper = orderMapper;
        this.idempotencyService = idempotencyService;
        this.movementRecorder = movementRecorder;
        this.auditRecorder = auditRecorder;
        this.orderExpiryProcessor = orderExpiryProcessor;
        this.holdTtl = holdTtl;
        if (holdTtl == null || holdTtl.isZero() || holdTtl.isNegative()) {
            throw new IllegalArgumentException("app.orders.hold-ttl must be a positive duration");
        }
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderResponse> listOrders() {
        List<Order> orders = orderRepository.findAll();
        Map<Long, PosPaymentDetail> payments = new HashMap<>();
        if (!orders.isEmpty()) {
            paymentRepository.findAllById(orders.stream().map(Order::getId).toList())
                    .forEach(payment -> payments.put(payment.getOrderId(), payment));
        }
        return orderMapper.toResponseList(orders, payments);
    }

    @Override
    @Transactional(readOnly = true)
    public OrderResponse getOrderById(Long id) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng #" + id));
        return toResponse(order);
    }

    @Override
    @Transactional
    public OrderResponse createOrder(CreateOrderRequest request, String idempotencyKey) {
        validatePosRequest(request);
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/orders", request,
                OrderResponse.class, () -> createPosOrderInternal(request));
    }

    private OrderResponse createPosOrderInternal(CreateOrderRequest request) {
        List<RequestedLine> requested = request.items().stream()
                .map(item -> new RequestedLine(item.sku(), item.quantity(), item.unitPrice()))
                .toList();
        MergedRequest merged = mergeRequestedLines(requested);
        List<PendingLine> pending = resolveRequestedVariants(merged);
        ResolvedOrder resolved = lockAndVerifyOrderLines(pending, BASE_CURRENCY);

        Order order = newOrder(Order.Source.POS, null, null, BASE_CURRENCY);
        // POS holds use the order row itself because no per-line reservation row is created.
        order.setHoldExpiresAt(orderRepository.databaseNow().toInstant().plus(holdTtl));
        reserveAndSave(order, resolved);
        return toResponse(order);
    }

    @Override
    @Transactional
    public OrderResponse createChannelOrder(ChannelOrderCommand command, String idempotencyKey) {
        validateChannelCommand(command);
        return idempotencyService.execute(idempotencyKey, "CHANNEL_ORDER:" + command.channelId(),
                command, OrderResponse.class, () -> createChannelOrderInternal(command));
    }

    private OrderResponse createChannelOrderInternal(ChannelOrderCommand command) {
        String externalOrderId = command.externalOrderId().trim();
        String currency = requireSupportedOrderCurrency(command.currency());
        Map<String, Integer> requestedBySku = toSkuQuantities(mergeRequestedLines(
                command.lines().stream()
                        .map(line -> new RequestedLine(line.sku(), line.quantity(), null))
                        .toList()));

        Channel channel = channelRepository.findById(command.channelId())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + command.channelId()));

        // The advisory lock serializes the identity check and the first reservation. The unique
        // index remains the durable backstop, but this path lets a repeated delivery return the
        // existing order without ever touching stock.
        orderRepository.lockExternalOrderIdentity(advisoryLockKey(channel.getId(), externalOrderId));
        Optional<Order> existing = orderRepository.findByChannelIdAndExternalOrderId(channel.getId(), externalOrderId);
        if (existing.isPresent()) {
            Order order = existing.get();
            if (order.getSource() != command.source() || !itemsMatch(order, requestedBySku)) {
                throw new ApiException(HttpStatus.CONFLICT, ErrorCode.EXTERNAL_ORDER_CONFLICT,
                        "Đơn hàng bên ngoài đã tồn tại với nội dung khác; không ghi đè đơn đã lưu.");
            }
            return toResponse(order);
        }

        List<PendingLine> pending = resolveRequestedVariants(mergeRequestedLines(
                command.lines().stream()
                        .map(line -> new RequestedLine(line.sku(), line.quantity(), null))
                        .toList()));
        ResolvedOrder resolved = lockAndVerifyOrderLines(pending, currency);
        Order order = newOrder(command.source(), channel.getId(), externalOrderId, currency);
        // Marketplace orders are excluded from the POS hold-expiry sweep.
        reserveAndSave(order, resolved);
        return toResponse(order);
    }

    private void validatePosRequest(CreateOrderRequest request) {
        if (request == null || request.items() == null || request.items().isEmpty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Đơn hàng phải có ít nhất một sản phẩm.");
        }
        if (request.source() != null && !request.source().isBlank()
                && !"POS".equalsIgnoreCase(request.source().trim())) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ORDER_SOURCE_FORBIDDEN,
                    "API POS chỉ tạo đơn POS; đơn marketplace phải đi qua connector nội bộ.");
        }
        if (request.externalOrderId() != null && !request.externalOrderId().isBlank()) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ORDER_SOURCE_FORBIDDEN,
                    "Không được gửi externalOrderId qua API POS; định danh marketplace do connector nội bộ quyết định.");
        }
    }

    private void validateChannelCommand(ChannelOrderCommand command) {
        if (command == null || command.channelId() == null) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Lệnh đơn hàng kênh phải có channelId.");
        }
        if (command.source() == null || command.source() == Order.Source.POS) {
            throw new ApiException(HttpStatus.BAD_REQUEST, ErrorCode.ORDER_SOURCE_FORBIDDEN,
                    "Lệnh đơn hàng kênh phải có nguồn marketplace, không phải POS.");
        }
        if (command.externalOrderId() == null
                || !EXTERNAL_ORDER_ID_PATTERN.matcher(command.externalOrderId().trim()).matches()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "externalOrderId phải từ 1 đến 128 ký tự và chỉ chứa chữ, số hoặc . _ : / -");
        }
        if (command.lines() == null || command.lines().isEmpty() || command.lines().size() > MAX_ORDER_LINES) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Đơn hàng kênh phải có từ 1 đến " + MAX_ORDER_LINES + " dòng.");
        }
    }

    private String requireSupportedOrderCurrency(String requestedCurrency) {
        String currency = normalizeCurrency(requestedCurrency, BASE_CURRENCY);
        if (!BASE_CURRENCY.equals(currency)) {
            throw new BusinessRuleException(ErrorCode.INVALID_CURRENCY,
                    "Phase 01.1 chỉ hỗ trợ đơn hàng " + BASE_CURRENCY + ".");
        }
        return currency;
    }

    private MergedRequest mergeRequestedLines(List<RequestedLine> requestedLines) {
        if (requestedLines == null || requestedLines.isEmpty()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Đơn hàng phải có ít nhất một sản phẩm.");
        }
        if (requestedLines.size() > MAX_ORDER_LINES) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Một đơn hàng không được vượt quá " + MAX_ORDER_LINES + " dòng.");
        }

        Map<String, MergedLine> merged = new LinkedHashMap<>();
        for (RequestedLine requested : requestedLines) {
            if (requested == null) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Dòng đơn hàng không hợp lệ.");
            }
            String sku = normalizeSku(requested.sku());
            int quantity = requireQuantity(requested.quantity());

            MergedLine line = merged.computeIfAbsent(sku, MergedLine::new);
            try {
                line.quantity = Math.addExact(line.quantity, quantity);
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Tổng số lượng cho SKU " + sku + " vượt giới hạn hỗ trợ.");
            }
            if (line.quantity > MAX_QUANTITY_PER_SKU) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Tổng số lượng cho SKU " + sku + " không được vượt quá " + MAX_QUANTITY_PER_SKU + ".");
            }
            if (requested.expectedUnitPrice() != null) {
                if (line.expectedUnitPrice != null && !line.expectedUnitPrice.equals(requested.expectedUnitPrice())) {
                    throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                            "Các dòng trùng SKU " + sku + " phải có cùng đơn giá kỳ vọng.");
                }
                line.expectedUnitPrice = requested.expectedUnitPrice();
            }
        }
        return new MergedRequest(merged);
    }

    private Map<String, Integer> toSkuQuantities(MergedRequest merged) {
        Map<String, Integer> quantities = new LinkedHashMap<>();
        merged.lines().forEach((sku, line) -> quantities.put(sku, line.quantity));
        return quantities;
    }

    private List<PendingLine> resolveRequestedVariants(MergedRequest merged) {
        List<PendingLine> pending = new ArrayList<>(merged.lines().size());
        for (MergedLine requested : merged.lines().values()) {
            // Identity-only lookup: a managed ProductVariant here would remain in the
            // persistence context and could be returned stale by the later locked re-read.
            ProductVariantRepository.VariantIdentity identity = variantRepository
                    .findIdentityBySku(requested.sku)
                    .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND,
                            "Không tìm thấy SKU " + requested.sku));
            if (identity.getVariantId() == null || identity.getProductId() == null) {
                throw new BusinessRuleException(ErrorCode.PRICE_OR_STOCK_CHANGED,
                        "SKU " + requested.sku + " không còn gắn với sản phẩm hợp lệ; hãy tải lại.");
            }
            pending.add(new PendingLine(identity.getVariantId(), identity.getProductId(),
                    requested.sku, requested.quantity, requested.expectedUnitPrice));
        }
        return pending;
    }

    /**
     * Locks catalog rows in the canonical Product -> ProductVariant order, then re-reads every
     * requested line and verifies the SKU, product identity, price, currency, and product status.
     * The initial SKU lookup is only a candidate resolution; no price or SKU from that read is
     * allowed to reach the order. A concurrent catalog update either commits before these locks
     * (and is observed here) or waits until the checkout transaction completes.
     */
    private ResolvedOrder lockAndVerifyOrderLines(List<PendingLine> pending, String currency) {
        List<Long> productIds = pending.stream()
                .map(PendingLine::productId)
                .distinct()
                .sorted()
                .toList();

        Map<Long, Product> lockedProducts = new HashMap<>();
        for (Long productId : productIds) {
            Product product = productRepository.findByIdForUpdate(productId)
                    .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.PRODUCT_NOT_FOUND,
                            "Không tìm thấy sản phẩm #" + productId));
            if (product.getStatus() == Product.Status.ARCHIVED) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Không thể tạo đơn hàng cho sản phẩm đã ARCHIVED: " + product.getName());
            }
            lockedProducts.put(productId, product);
        }

        List<PendingLine> sortedByVariant = pending.stream()
                .sorted(Comparator.comparing(PendingLine::variantId))
                .toList();
        List<ResolvedLine> lines = new ArrayList<>(sortedByVariant.size());
        for (PendingLine requested : sortedByVariant) {
            ProductVariant variant = variantRepository.findByIdForUpdate(requested.variantId())
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.PRICE_OR_STOCK_CHANGED,
                            "SKU " + requested.sku() + " không còn tồn tại; hãy tải lại trước khi đặt hàng."));
            if (!requested.sku().equals(variant.getSku())) {
                throw new BusinessRuleException(ErrorCode.PRICE_OR_STOCK_CHANGED,
                        "SKU " + requested.sku() + " đã được đổi thành " + variant.getSku()
                                + "; hãy tải lại trước khi đặt hàng.");
            }
            Long currentProductId = variant.getProduct() == null ? null : variant.getProduct().getId();
            if (!requested.productId().equals(currentProductId)
                    || !lockedProducts.containsKey(currentProductId)) {
                throw new BusinessRuleException(ErrorCode.PRICE_OR_STOCK_CHANGED,
                        "SKU " + requested.sku() + " đã chuyển sang sản phẩm khác; hãy tải lại trước khi đặt hàng.");
            }
            Product product = lockedProducts.get(currentProductId);
            if (product.getStatus() == Product.Status.ARCHIVED) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Không thể tạo đơn hàng cho sản phẩm đã ARCHIVED: " + product.getName());
            }

            long price = requireVariantPrice(variant);
            String variantCurrency = normalizeCurrency(variant.getCurrency(), BASE_CURRENCY);
            if (!currency.equals(variantCurrency)) {
                throw new BusinessRuleException(ErrorCode.INVALID_CURRENCY,
                        "SKU " + requested.sku() + " dùng tiền tệ " + variantCurrency
                                + ", không khớp tiền tệ đơn hàng " + currency + ".");
            }
            if (requested.expectedUnitPrice() != null && requested.expectedUnitPrice() != price) {
                throw new BusinessRuleException(ErrorCode.PRICE_OR_STOCK_CHANGED,
                        "Giá bán của SKU " + requested.sku() + " đã thay đổi; hãy tải lại trước khi đặt hàng.");
            }
            lines.add(new ResolvedLine(variant, requested.quantity(), price));
        }

        long totalAmount = 0L;
        for (ResolvedLine line : lines) {
            try {
                totalAmount = Math.addExact(totalAmount,
                        Math.multiplyExact(line.unitPrice(), (long) line.quantity()));
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                        "Tổng tiền đơn hàng vượt giới hạn hỗ trợ.");
            }
        }
        return new ResolvedOrder(lines, totalAmount);
    }

    private void reserveAndSave(Order order, ResolvedOrder resolved) {
        // Products and variants were already locked and verified by lockAndVerifyOrderLines.
        // Balances are locked in ascending variant_id order, independent of the client line order.
        Map<Long, InventoryBalance> locked = new LinkedHashMap<>();
        for (ResolvedLine line : resolved.lines()) {
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(line.variant().getId())
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK,
                            "Chưa thiết lập tồn kho cho SKU " + line.variant().getSku()));
            locked.put(line.variant().getId(), balance);
        }

        // Validate the aggregate available-to-sell quantity for every line before mutating any
        // balance, so duplicate SKUs cannot each pass the check against the same stock.
        for (ResolvedLine line : resolved.lines()) {
            InventoryBalance balance = locked.get(line.variant().getId());
            if (availableToSell(balance, line.variant().getSku()) < line.quantity()) {
                throw new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK,
                        "SKU " + line.variant().getSku() + " không đủ hàng để bán (ATS: "
                                + availableToSell(balance, line.variant().getSku()) + ")");
            }
        }

        List<OrderItem> items = new ArrayList<>(resolved.lines().size());
        for (ResolvedLine line : resolved.lines()) {
            InventoryBalance balance = locked.get(line.variant().getId());
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            try {
                balance.setReserved(Math.addExact(balance.getReserved(), line.quantity()));
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số lượng giữ cho SKU " + line.variant().getSku() + " vượt giới hạn hỗ trợ.");
            }
            balanceRepository.save(balance);

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setVariantId(line.variant().getId());
            item.setSku(line.variant().getSku());
            item.setQuantity(line.quantity());
            item.setUnitPrice(line.unitPrice());
            items.add(item);

            movementRecorder.record(line.variant().getId(), before, balance, "ORDER_RESERVED",
                    "Reserve stock for order " + order.getOrderNumber(), order.getOrderNumber());
        }

        order.setTotalAmount(resolved.totalAmount());
        order.setItems(items);
        Order saved = orderRepository.save(order);

        auditRecorder.recordHistory(saved, OrderStatusHistory.Action.CREATED,
                null, Order.Status.PLACED, null, Order.PaymentStatus.PENDING, null);
        auditRecorder.recordOutbox(saved, "ORDER_CREATED", null, null);
    }

    private Order newOrder(Order.Source source, Long channelId, String externalOrderId, String currency) {
        Order order = new Order();
        order.setOrderNumber("ORD-" + System.currentTimeMillis() + "-"
                + UUID.randomUUID().toString().substring(0, 4).toUpperCase(Locale.ROOT));
        order.setSource(source);
        order.setStatus(Order.Status.PLACED);
        order.setPaymentStatus(Order.PaymentStatus.PENDING);
        order.setExternalOrderId(externalOrderId);
        order.setChannelId(channelId);
        order.setCurrency(currency);
        return order;
    }

    @Override
    @Transactional
    public OrderResponse confirmPayment(Long orderId, String idempotencyKey) {
        return confirmPayment(orderId, null, idempotencyKey);
    }

    @Override
    @Transactional
    public OrderResponse confirmPayment(Long orderId, RecordPaymentRequest request, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey,
                "POST:/api/v1/orders/" + orderId + "/payment/confirm",
                paymentFingerprint(orderId, request), OrderResponse.class,
                () -> confirmPaymentInternal(orderId, request));
    }

    private OrderResponse confirmPaymentInternal(Long orderId, RecordPaymentRequest request) {
        // Resolve variant quantities without loading the managed Order first. Balances must be
        // locked in ascending variant_id order; loading the Order entity before the lock would
        // leave a stale PENDING copy in the persistence context while this transaction waits for
        // a concurrent confirmation, producing a double deduction attempt instead of an
        // idempotent PAID return.
        Map<Long, Long> quantities = loadVariantQuantities(orderId);
        Map<Long, InventoryBalance> balances = lockBalances(quantities);
        Order order = lockOrder(orderId);
        requirePosOrder(order);

        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            return toResponse(order);
        }
        if (order.getStatus() == Order.Status.CANCELLED) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Không thể xác nhận thanh toán cho đơn đã hủy.");
        }
        if (order.getStatus() != Order.Status.PLACED) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Chỉ đơn đang PLACED mới có thể xác nhận thanh toán.");
        }
        if (order.getHoldExpiresAt() != null
                && !order.getHoldExpiresAt().isAfter(orderRepository.databaseNow().toInstant())) {
            throw new BusinessRuleException(ErrorCode.ORDER_HOLD_EXPIRED,
                    "Đơn đã hết hạn giữ hàng; không thể xác nhận thanh toán.");
        }
        requireBaseCurrency(order);
        PaymentCommand payment = resolvePayment(order, request);
        requireSameQuantities(order, quantities);

        for (Map.Entry<Long, Long> entry : quantities.entrySet()) {
            Long variantId = entry.getKey();
            long quantityLong = entry.getValue();
            if (quantityLong > Integer.MAX_VALUE) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số lượng bán cho variant #" + variantId + " vượt giới hạn hỗ trợ.");
            }
            int quantity = (int) quantityLong;
            InventoryBalance balance = balances.get(variantId);
            if (balance.getOnHand() < quantity || balance.getReserved() < quantity) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số dư không đủ để xác nhận thanh toán cho variant #" + variantId);
            }
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            balance.setOnHand(balance.getOnHand() - quantity);
            balance.setReserved(balance.getReserved() - quantity);
            balanceRepository.save(balance);
            movementRecorder.record(variantId, before, balance, "ORDER_SALE_CONFIRMED",
                    "Confirm payment for order " + order.getOrderNumber(), order.getOrderNumber());
        }

        order.setPaymentStatus(Order.PaymentStatus.PAID);
        order.setStatus(Order.Status.CONFIRMED);
        order.setHoldExpiresAt(null);
        Order saved = orderRepository.save(order);

        PosPaymentDetail detail = persistPayment(saved, payment);
        auditRecorder.recordHistory(saved, OrderStatusHistory.Action.PAYMENT_CONFIRMED,
                Order.Status.PLACED, Order.Status.CONFIRMED,
                Order.PaymentStatus.PENDING, Order.PaymentStatus.PAID, payment.note());
        auditRecorder.recordOutbox(saved, "ORDER_PAYMENT_RECORDED", payment.note(), detail);
        return orderMapper.toResponse(saved, detail);
    }

    private PaymentCommand resolvePayment(Order order, RecordPaymentRequest request) {
        long amountDue = order.getTotalAmount() == null ? 0L : order.getTotalAmount();
        if (amountDue < 0) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Tổng tiền đơn hàng không hợp lệ.");
        }
        if (request == null) {
            // Compatibility path for the legacy endpoint that had no request body.
            return new PaymentCommand(PosPaymentDetail.Method.MANUAL, amountDue, null, null, null, null);
        }

        String method = normalizePaymentMethod(request.method());
        String reference = normalizeOptionalText(request.reference(), MAX_REFERENCE_LENGTH, "Mã tham chiếu");
        String note = normalizeOptionalText(request.note(), MAX_REASON_LENGTH, "Ghi chú");

        return switch (method) {
            case "CASH" -> {
                if (request.cashReceived() == null) {
                    throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                            "Thanh toán CASH phải ghi nhận số tiền khách đưa.");
                }
                if (request.cashReceived() < amountDue) {
                    throw new BusinessRuleException(ErrorCode.PAYMENT_UNDERPAID,
                            "Tiền khách đưa (" + request.cashReceived() + ") nhỏ hơn số tiền phải trả ("
                                    + amountDue + ").");
                }
                long change = request.cashReceived() - amountDue;
                yield new PaymentCommand(PosPaymentDetail.Method.CASH, amountDue,
                        request.cashReceived(), change, reference, note);
            }
            case "BANK_TRANSFER" -> {
                if (request.cashReceived() != null) {
                    throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                            "Thanh toán BANK_TRANSFER không được gửi tiền mặt/tiền thừa.");
                }
                yield new PaymentCommand(PosPaymentDetail.Method.BANK_TRANSFER, amountDue,
                        null, null, reference, note);
            }
            default -> throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Chỉ hỗ trợ phương thức thanh toán CASH hoặc BANK_TRANSFER.");
        };
    }

    private PosPaymentDetail persistPayment(Order order, PaymentCommand payment) {
        PosPaymentDetail detail = new PosPaymentDetail();
        detail.setOrderId(order.getId());
        detail.setMethod(payment.method());
        detail.setCurrency(order.getCurrency());
        detail.setAmountDue(payment.amountDue());
        detail.setCashReceived(payment.cashReceived());
        detail.setChangeAmount(payment.changeAmount());
        detail.setReference(payment.reference());
        detail.setNote(payment.note());
        detail.setActor(auditRecorder.currentActor());
        detail.setPaidAt(orderRepository.databaseNow().toInstant());
        return paymentRepository.save(detail);
    }

    @Override
    @Transactional
    public OrderResponse cancelOrder(Long orderId, CancelOrderRequest request, String idempotencyKey) {
        String reason = requireReason(request == null ? null : request.reason());
        return idempotencyService.execute(idempotencyKey,
                "POST:/api/v1/orders/" + orderId + "/cancel",
                new CancelIdempotencyRequest(orderId, reason), OrderResponse.class,
                () -> cancelOrderInternal(orderId, reason));
    }

    private OrderResponse cancelOrderInternal(Long orderId, String reason) {
        Map<Long, Long> quantities = loadVariantQuantities(orderId);
        Map<Long, InventoryBalance> balances = lockBalances(quantities);
        Order order = lockOrder(orderId);
        requirePosOrder(order);

        if (order.getStatus() == Order.Status.CANCELLED) {
            // A retry (or an expiry that already won) must not release the hold a second time.
            return toResponse(order);
        }
        if (order.getPaymentStatus() != Order.PaymentStatus.PENDING) {
            throw new BusinessRuleException(ErrorCode.PAID_ORDER_CANCELLATION_BLOCKED,
                    "Không thể hủy đơn đã thanh toán. Hoàn tiền/void sẽ được triển khai ở giai đoạn sau.");
        }
        if (order.getStatus() != Order.Status.PLACED) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Chỉ đơn chưa thanh toán đang PLACED mới được hủy.");
        }
        requireSameQuantities(order, quantities);

        releaseReservedOnly(order, quantities, balances, "ORDER_CANCELLED",
                "Cancel order " + order.getOrderNumber() + ": " + reason);

        order.setStatus(Order.Status.CANCELLED);
        order.setHoldExpiresAt(null);
        Order saved = orderRepository.save(order);

        auditRecorder.recordHistory(saved, OrderStatusHistory.Action.CANCELLED,
                Order.Status.PLACED, Order.Status.CANCELLED,
                Order.PaymentStatus.PENDING, Order.PaymentStatus.PENDING, reason);
        auditRecorder.recordOutbox(saved, "ORDER_CANCELLED", reason, null);
        return toResponse(saved);
    }

    @Override
    @Transactional
    public OrderResponse transitionOrderStatus(Long orderId, OrderTransitionRequest request, String idempotencyKey) {
        Order.Status target = parseTargetStatus(request == null ? null : request.status());
        String reason = normalizeOptionalText(request == null ? null : request.reason(), MAX_REASON_LENGTH, "Lý do");
        return idempotencyService.execute(idempotencyKey,
                "POST:/api/v1/orders/" + orderId + "/transition",
                new TransitionIdempotencyRequest(orderId, target.name(), reason), OrderResponse.class,
                () -> transitionOrderStatusInternal(orderId, target, reason));
    }

    private OrderResponse transitionOrderStatusInternal(Long orderId, Order.Status target, String reason) {
        Order order = lockOrder(orderId);
        requirePosOrder(order);

        if (order.getStatus() == target) {
            return toResponse(order);
        }
        if (order.getStatus() == Order.Status.CANCELLED || order.getStatus() == Order.Status.DELIVERED) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Đơn đã ở trạng thái kết thúc, không thể chuyển tiếp.");
        }
        if (order.getPaymentStatus() != Order.PaymentStatus.PAID) {
            throw new BusinessRuleException(ErrorCode.ORDER_NOT_PAID,
                    "Đơn chưa thanh toán không thể chuyển sang bước giao hàng.");
        }

        Order.Status from = order.getStatus();
        if (!isAllowedTransition(from, target)) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Không thể chuyển đơn từ " + from + " sang " + target + ".");
        }

        order.setStatus(target);
        Order saved = orderRepository.save(order);

        auditRecorder.recordHistory(saved, OrderStatusHistory.Action.STATUS_CHANGED,
                from, target, Order.PaymentStatus.PAID, Order.PaymentStatus.PAID, reason);
        auditRecorder.recordOutbox(saved, "ORDER_STATUS_CHANGED", reason, null);
        return toResponse(saved);
    }

    @Override
    @Transactional
    public OrderResponse shipOrder(Long orderId) {
        return transitionOrderStatusInternal(orderId, Order.Status.SHIPPED, null);
    }

    @Override
    @Transactional
    public OrderResponse handoverOrder(Long orderId, HandoverOrderRequest request, String idempotencyKey) {
        String note = normalizeOptionalText(request == null ? null : request.note(), MAX_REASON_LENGTH, "Ghi chú");
        return idempotencyService.execute(idempotencyKey,
                "POST:/api/v1/orders/" + orderId + "/handover",
                new HandoverIdempotencyRequest(orderId, note), OrderResponse.class,
                () -> handoverOrderInternal(orderId, note));
    }

    private OrderResponse handoverOrderInternal(Long orderId, String note) {
        Order order = lockOrder(orderId);
        requirePosOrder(order);

        if (order.getStatus() == Order.Status.DELIVERED) {
            return toResponse(order);
        }
        if (order.getStatus() == Order.Status.CANCELLED) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Không thể bàn giao đơn đã hủy.");
        }
        if (order.getPaymentStatus() != Order.PaymentStatus.PAID) {
            throw new BusinessRuleException(ErrorCode.ORDER_NOT_PAID,
                    "Đơn chưa thanh toán không thể bàn giao.");
        }
        if (order.getStatus() != Order.Status.CONFIRMED) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Bàn giao tại quầy chỉ áp dụng cho đơn đã thanh toán đang CONFIRMED.");
        }

        order.setStatus(Order.Status.DELIVERED);
        Order saved = orderRepository.save(order);

        auditRecorder.recordHistory(saved, OrderStatusHistory.Action.HANDED_OVER,
                Order.Status.CONFIRMED, Order.Status.DELIVERED,
                Order.PaymentStatus.PAID, Order.PaymentStatus.PAID, note);
        auditRecorder.recordOutbox(saved, "ORDER_HANDED_OVER", note, null);
        return toResponse(saved);
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderHistoryResponse> getOrderHistory(Long orderId) {
        if (!orderRepository.existsById(orderId)) {
            throw new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND,
                    "Không tìm thấy đơn hàng #" + orderId);
        }
        return orderMapper.toHistoryResponseList(
                historyRepository.findByOrderIdOrderByChangedAtDescIdDesc(orderId));
    }

    @Override
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    public OrderExpirySweepResult expireAbandonedOrders() {
        Instant now = Instant.now();
        List<OrderRepository.ExpiredOrderCandidate> candidates = orderRepository.findExpiredOrderCandidates(
                Order.Source.POS, Order.Status.PLACED, Order.PaymentStatus.PENDING, now);
        int expired = 0;
        int skipped = 0;
        int failed = 0;

        for (OrderRepository.ExpiredOrderCandidate candidate : candidates) {
            try {
                if (orderExpiryProcessor.expireOne(candidate.getId())) {
                    expired++;
                } else {
                    skipped++;
                }
            } catch (Exception ex) {
                failed++;
                log.error("POS order expiry failed for orderId={}: {}", candidate.getId(), ex.getMessage(), ex);
            }
        }

        if (failed > 0) {
            log.warn("POS order expiry sweep completed with failures: expired={} skipped={} failed={}",
                    expired, skipped, failed);
        } else if (expired > 0) {
            log.info("POS order expiry sweep completed: expired={} skipped={}", expired, skipped);
        }
        return new OrderExpirySweepResult(expired, skipped, failed);
    }

    private Map<Long, Long> loadVariantQuantities(Long orderId) {
        Map<Long, Long> quantities = new TreeMap<>();
        for (OrderRepository.VariantQuantity row : orderRepository.findVariantQuantitiesByOrderId(orderId)) {
            if (row.getVariantId() == null || row.getQuantity() == null || row.getQuantity() <= 0) {
                throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                        "Đơn hàng có số lượng dòng không hợp lệ.");
            }
            quantities.put(row.getVariantId(), row.getQuantity());
        }
        return quantities;
    }

    private Map<Long, InventoryBalance> lockBalances(Map<Long, Long> quantities) {
        Map<Long, InventoryBalance> balances = new LinkedHashMap<>();
        for (Long variantId : quantities.keySet()) {
            balances.put(variantId, balanceRepository.findByVariantIdWithLock(variantId)
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                            "Không tìm thấy số dư tồn kho cho variant #" + variantId)));
        }
        return balances;
    }

    private Order lockOrder(Long orderId) {
        return orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND,
                        "Không tìm thấy đơn hàng #" + orderId));
    }

    private void requireSameQuantities(Order order, Map<Long, Long> quantities) {
        Map<Long, Long> lockedQuantities = aggregateOrderQuantities(order.getItems());
        if (!lockedQuantities.equals(quantities)) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Dòng đơn hàng đã thay đổi trong lúc xử lý; hãy thử lại.");
        }
    }

    private Map<Long, Long> aggregateOrderQuantities(List<OrderItem> items) {
        Map<Long, Long> quantities = new TreeMap<>();
        for (OrderItem item : items) {
            try {
                quantities.merge(item.getVariantId(), (long) item.getQuantity(), Math::addExact);
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Tổng số lượng cho variant #" + item.getVariantId() + " vượt giới hạn hỗ trợ.");
            }
        }
        return quantities;
    }

    private void releaseReservedOnly(Order order,
                                     Map<Long, Long> quantities,
                                     Map<Long, InventoryBalance> balances,
                                     String operation,
                                     String reason) {
        for (Map.Entry<Long, Long> entry : quantities.entrySet()) {
            Long variantId = entry.getKey();
            long quantityLong = entry.getValue();
            if (quantityLong > Integer.MAX_VALUE) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số lượng giữ cho variant #" + variantId + " vượt giới hạn hỗ trợ.");
            }
            int quantity = (int) quantityLong;
            InventoryBalance balance = balances.get(variantId);
            if (balance.getReserved() < quantity) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số dư không đủ để giải phóng hàng giữ của đơn " + order.getOrderNumber());
            }
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            // Unpaid cancellation/expiry releases the hold only; on_hand must not change.
            balance.setReserved(balance.getReserved() - quantity);
            balanceRepository.save(balance);
            movementRecorder.record(variantId, before, balance, operation, reason, order.getOrderNumber());
        }
    }

    private void requirePosOrder(Order order) {
        if (order.getSource() != Order.Source.POS) {
            throw new BusinessRuleException(ErrorCode.MARKETPLACE_ACTION_FORBIDDEN,
                    "API POS chỉ thao tác trên đơn POS; đơn marketplace do connector quản lý.");
        }
    }

    private void requireBaseCurrency(Order order) {
        if (!BASE_CURRENCY.equals(order.getCurrency())) {
            throw new BusinessRuleException(ErrorCode.INVALID_CURRENCY,
                    "Phase 03 chỉ hỗ trợ thanh toán đơn hàng " + BASE_CURRENCY + ".");
        }
    }

    private String normalizePaymentMethod(String method) {
        if (method == null || method.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Phương thức thanh toán không được để trống.");
        }
        String normalized = method.trim().toUpperCase(Locale.ROOT);
        if (!"CASH".equals(normalized) && !"BANK_TRANSFER".equals(normalized)) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Chỉ hỗ trợ phương thức thanh toán CASH hoặc BANK_TRANSFER.");
        }
        return normalized;
    }

    private String requireReason(String reason) {
        if (reason == null || reason.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Lý do hủy không được để trống.");
        }
        String normalized = reason.trim();
        if (normalized.length() > MAX_REASON_LENGTH) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Lý do hủy không được vượt quá " + MAX_REASON_LENGTH + " ký tự.");
        }
        return normalized;
    }

    private String normalizeOptionalText(String value, int maxLength, String fieldName) {
        if (value == null) {
            return null;
        }
        String normalized = value.trim();
        if (normalized.isEmpty()) {
            return null;
        }
        if (normalized.length() > maxLength) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    fieldName + " không được vượt quá " + maxLength + " ký tự.");
        }
        return normalized;
    }

    private Order.Status parseTargetStatus(String status) {
        if (status == null || status.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Trạng thái đích không được để trống.");
        }
        Order.Status target;
        try {
            target = Order.Status.valueOf(status.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Trạng thái đích không hợp lệ.");
        }
        if (target == Order.Status.PLACED || target == Order.Status.CANCELLED) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Không thể chuyển đơn sang " + target + " qua API chuyển trạng thái.");
        }
        return target;
    }

    private boolean isAllowedTransition(Order.Status from, Order.Status target) {
        return switch (from) {
            case PLACED -> target == Order.Status.CONFIRMED;
            case CONFIRMED -> target == Order.Status.PACKED;
            case PACKED -> target == Order.Status.SHIPPED;
            case SHIPPED -> target == Order.Status.DELIVERED;
            default -> false;
        };
    }

    private OrderResponse toResponse(Order order) {
        PosPaymentDetail payment = paymentRepository.findById(order.getId()).orElse(null);
        return orderMapper.toResponse(order, payment);
    }

    private PaymentIdempotencyRequest paymentFingerprint(Long orderId, RecordPaymentRequest request) {
        if (request == null) {
            return new PaymentIdempotencyRequest(orderId, null, null, null, null);
        }
        return new PaymentIdempotencyRequest(orderId, request.method(), request.cashReceived(),
                request.reference(), request.note());
    }

    private boolean itemsMatch(Order order, Map<String, Integer> requestedBySku) {
        Map<String, Integer> storedBySku = new LinkedHashMap<>();
        for (OrderItem item : order.getItems()) {
            try {
                storedBySku.merge(item.getSku(), item.getQuantity(), Math::addExact);
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Đơn hàng đã lưu có tổng số lượng vượt giới hạn hỗ trợ.");
            }
        }
        return storedBySku.equals(requestedBySku);
    }

    private String normalizeSku(String sku) {
        if (sku == null || sku.isBlank()) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "SKU không được để trống.");
        }
        String normalized = sku.trim();
        if (normalized.length() > 64) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "SKU không được vượt quá 64 ký tự.");
        }
        return normalized;
    }

    private int requireQuantity(Integer quantity) {
        if (quantity == null || quantity <= 0 || quantity > MAX_QUANTITY_PER_SKU) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Số lượng mỗi dòng phải từ 1 đến " + MAX_QUANTITY_PER_SKU + ".");
        }
        return quantity;
    }

    private long requireVariantPrice(ProductVariant variant) {
        if (variant.getPrice() == null || variant.getPrice() < 0) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Giá bán của SKU " + variant.getSku() + " không hợp lệ.");
        }
        return variant.getPrice();
    }

    private String normalizeCurrency(String currency, String fallback) {
        if (currency == null || currency.isBlank()) {
            return fallback;
        }
        String normalized = currency.trim().toUpperCase(Locale.ROOT);
        if (!CURRENCY_PATTERN.matcher(normalized).matches()) {
            throw new BusinessRuleException(ErrorCode.INVALID_CURRENCY,
                    "Tiền tệ phải là mã ISO gồm 3 chữ cái.");
        }
        return normalized;
    }

    private int availableToSell(InventoryBalance balance, String sku) {
        try {
            return balance.getAvailableToSell();
        } catch (IllegalStateException ex) {
            throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                    "Số dư tồn kho của SKU " + sku + " đang không nhất quán.");
        }
    }

    private long advisoryLockKey(Long channelId, String externalOrderId) {
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256")
                    .digest((channelId + ":" + externalOrderId).getBytes(StandardCharsets.UTF_8));
            return ByteBuffer.wrap(digest).getLong();
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("SHA-256 is required for order identity locking", ex);
        }
    }

    private record RequestedLine(String sku, Integer quantity, Long expectedUnitPrice) {}

    private record PendingLine(Long variantId, Long productId, String sku, int quantity,
                               Long expectedUnitPrice) {}

    private record ResolvedLine(ProductVariant variant, int quantity, long unitPrice) {}

    private record ResolvedOrder(List<ResolvedLine> lines, long totalAmount) {}

    private record PaymentCommand(PosPaymentDetail.Method method,
                                  long amountDue,
                                  Long cashReceived,
                                  Long changeAmount,
                                  String reference,
                                  String note) {}

    private record PaymentIdempotencyRequest(Long orderId,
                                             String method,
                                             Long cashReceived,
                                             String reference,
                                             String note) {}

    private record CancelIdempotencyRequest(Long orderId, String reason) {}

    private record TransitionIdempotencyRequest(Long orderId, String status, String reason) {}

    private record HandoverIdempotencyRequest(Long orderId, String note) {}

    private static final class MergedLine {
        private final String sku;
        private int quantity;
        private Long expectedUnitPrice;

        private MergedLine(String sku) {
            this.sku = sku;
        }
    }

    private record MergedRequest(Map<String, MergedLine> lines) {}
}
