package com.octoflow.api.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.dto.command.ChannelOrderCommand;
import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderItem;
import com.octoflow.api.entity.OutboxEvent;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.OrderMapper;
import com.octoflow.api.middleware.RequestIdFilter;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.OutboxEventRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import com.octoflow.api.service.OrderService;
import org.slf4j.MDC;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.ArrayList;
import java.util.Comparator;
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

    private static final int MAX_ORDER_LINES = 200;
    private static final int MAX_QUANTITY_PER_SKU = 1_000_000;
    private static final String BASE_CURRENCY = "VND";
    private static final Pattern CURRENCY_PATTERN = Pattern.compile("^[A-Z]{3}$");
    private static final Pattern EXTERNAL_ORDER_ID_PATTERN = Pattern.compile("^[A-Za-z0-9._:/-]{1,128}$");

    private final OrderRepository orderRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final ChannelRepository channelRepository;
    private final OrderMapper orderMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;
    private final ObjectMapper objectMapper;

    public OrderServiceImpl(OrderRepository orderRepository,
                            ProductVariantRepository variantRepository,
                            InventoryBalanceRepository balanceRepository,
                            OutboxEventRepository outboxEventRepository,
                            ChannelRepository channelRepository,
                            OrderMapper orderMapper,
                            IdempotencyService idempotencyService,
                            InventoryMovementRecorder movementRecorder,
                            ObjectMapper objectMapper) {
        this.orderRepository = orderRepository;
        this.variantRepository = variantRepository;
        this.balanceRepository = balanceRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.channelRepository = channelRepository;
        this.orderMapper = orderMapper;
        this.idempotencyService = idempotencyService;
        this.movementRecorder = movementRecorder;
        this.objectMapper = objectMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<OrderResponse> listOrders() {
        return orderMapper.toResponseList(orderRepository.findAll());
    }

    @Override
    @Transactional(readOnly = true)
    public OrderResponse getOrderById(Long id) {
        Order order = orderRepository.findById(id)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng #" + id));
        return orderMapper.toResponse(order);
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
        ResolvedOrder resolved = resolveOrder(merged, BASE_CURRENCY);

        Order order = newOrder(Order.Source.POS, null, null, BASE_CURRENCY);
        reserveAndSave(order, resolved);
        return orderMapper.toResponse(order);
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
            return orderMapper.toResponse(order);
        }

        ResolvedOrder resolved = resolveOrder(mergeRequestedLines(
                command.lines().stream()
                        .map(line -> new RequestedLine(line.sku(), line.quantity(), null))
                        .toList()), currency);
        Order order = newOrder(command.source(), channel.getId(), externalOrderId, currency);
        reserveAndSave(order, resolved);
        return orderMapper.toResponse(order);
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

    private ResolvedOrder resolveOrder(MergedRequest merged, String currency) {
        List<ResolvedLine> lines = new ArrayList<>(merged.lines().size());
        for (MergedLine requested : merged.lines().values()) {
            ProductVariant variant = variantRepository.findBySku(requested.sku)
                    .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND,
                            "Không tìm thấy SKU " + requested.sku));

            long price = requireVariantPrice(variant);
            String variantCurrency = normalizeCurrency(variant.getCurrency(), BASE_CURRENCY);
            if (!currency.equals(variantCurrency)) {
                throw new BusinessRuleException(ErrorCode.INVALID_CURRENCY,
                        "SKU " + requested.sku + " dùng tiền tệ " + variantCurrency
                                + ", không khớp tiền tệ đơn hàng " + currency + ".");
            }
            if (requested.expectedUnitPrice != null && requested.expectedUnitPrice != price) {
                throw new BusinessRuleException(ErrorCode.PRICE_OR_STOCK_CHANGED,
                        "Giá bán của SKU " + requested.sku + " đã thay đổi; hãy tải lại trước khi đặt hàng.");
            }
            lines.add(new ResolvedLine(variant, requested.quantity, price));
        }

        // All balance locks are taken in ascending variant_id order, independent of the order in
        // which the client listed SKUs.
        lines.sort(Comparator.comparing(line -> line.variant().getId()));

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

        OutboxEvent event = new OutboxEvent();
        event.setAggregateType("ORDER");
        event.setAggregateId(saved.getId().toString());
        event.setEventType("ORDER_CREATED");
        event.setCorrelationId(MDC.get(RequestIdFilter.MDC_KEY));
        event.setPayload(serializeOrderCreated(saved));
        outboxEventRepository.save(event);
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
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/orders/" + orderId + "/payment/confirm",
                Map.of("orderId", orderId), OrderResponse.class, () -> confirmPaymentInternal(orderId));
    }

    private OrderResponse confirmPaymentInternal(Long orderId) {
        // Resolve variant quantities without loading the managed Order first. Balances must be
        // locked in ascending variant_id order; loading the Order entity before the lock would
        // leave a stale PENDING copy in the persistence context while this transaction waits for
        // a concurrent confirmation, producing a double deduction attempt instead of an
        // idempotent PAID return.
        Map<Long, Long> quantities = new TreeMap<>();
        for (OrderRepository.VariantQuantity row : orderRepository.findVariantQuantitiesByOrderId(orderId)) {
            if (row.getVariantId() == null || row.getQuantity() == null || row.getQuantity() <= 0) {
                throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                        "Đơn hàng có số lượng dòng không hợp lệ.");
            }
            quantities.put(row.getVariantId(), row.getQuantity());
        }

        Map<Long, InventoryBalance> balances = new LinkedHashMap<>();
        for (Long variantId : quantities.keySet()) {
            balances.put(variantId, balanceRepository.findByVariantIdWithLock(variantId)
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                            "Không tìm thấy số dư tồn kho cho variant #" + variantId)));
        }

        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND,
                        "Không tìm thấy đơn hàng #" + orderId));

        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            return orderMapper.toResponse(order);
        }
        if (order.getStatus() == Order.Status.CANCELLED) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Không thể xác nhận thanh toán cho đơn đã hủy.");
        }

        Map<Long, Long> lockedQuantities = aggregateOrderQuantities(order.getItems());
        if (!lockedQuantities.equals(quantities)) {
            throw new BusinessRuleException(ErrorCode.INVALID_ORDER_STATE,
                    "Dòng đơn hàng đã thay đổi trong lúc xác nhận thanh toán; hãy thử lại.");
        }

        for (Map.Entry<Long, Long> entry : lockedQuantities.entrySet()) {
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
        Order saved = orderRepository.save(order);
        return orderMapper.toResponse(saved);
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

    private String serializeOrderCreated(Order order) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "order_id", order.getId(),
                    "order_number", order.getOrderNumber(),
                    "source", order.getSource().name(),
                    "total_minor", order.getTotalAmount(),
                    "currency", order.getCurrency()));
        } catch (JsonProcessingException ex) {
            throw new IllegalStateException("Unable to serialize order outbox payload", ex);
        }
    }

    @Override
    @Transactional
    public OrderResponse shipOrder(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng #" + orderId));

        order.setStatus(Order.Status.SHIPPED);
        Order saved = orderRepository.save(order);
        return orderMapper.toResponse(saved);
    }

    private record RequestedLine(String sku, Integer quantity, Long expectedUnitPrice) {}

    private record ResolvedLine(ProductVariant variant, int quantity, long unitPrice) {}

    private record ResolvedOrder(List<ResolvedLine> lines, long totalAmount) {}

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
