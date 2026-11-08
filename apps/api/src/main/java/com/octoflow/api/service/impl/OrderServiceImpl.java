package com.octoflow.api.service.impl;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.entity.InventoryBalance;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderItem;
import com.octoflow.api.entity.OutboxEvent;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.OrderMapper;
import com.octoflow.api.repository.InventoryBalanceRepository;
import com.octoflow.api.repository.OrderRepository;
import com.octoflow.api.repository.OutboxEventRepository;
import com.octoflow.api.repository.ProductVariantRepository;
import com.octoflow.api.service.OrderService;
import com.octoflow.api.service.IdempotencyService;
import com.octoflow.api.service.InventoryMovementRecorder;
import com.octoflow.api.middleware.RequestIdFilter;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.Locale;

@Service
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final OrderMapper orderMapper;
    private final IdempotencyService idempotencyService;
    private final InventoryMovementRecorder movementRecorder;
    private final ObjectMapper objectMapper;

    public OrderServiceImpl(OrderRepository orderRepository,
                            ProductVariantRepository variantRepository,
                            InventoryBalanceRepository balanceRepository,
                            OutboxEventRepository outboxEventRepository,
                            OrderMapper orderMapper,
                            IdempotencyService idempotencyService,
                            InventoryMovementRecorder movementRecorder,
                            ObjectMapper objectMapper) {
        this.orderRepository = orderRepository;
        this.variantRepository = variantRepository;
        this.balanceRepository = balanceRepository;
        this.outboxEventRepository = outboxEventRepository;
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
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/orders", request,
                OrderResponse.class, () -> createOrderInternal(request, idempotencyKey));
    }

    private OrderResponse createOrderInternal(CreateOrderRequest request, String idempotencyKey) {
        Order.Source source;
        try {
            source = Order.Source.valueOf(request.source().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            throw new com.octoflow.api.exception.ApiException(org.springframework.http.HttpStatus.BAD_REQUEST,
                    ErrorCode.BAD_REQUEST, "Nguồn đơn hàng không hợp lệ.");
        }

        Order order = new Order();
        String orderNumber = "ORD-" + System.currentTimeMillis() + "-" + UUID.randomUUID().toString().substring(0, 4).toUpperCase();
        order.setOrderNumber(orderNumber);
        order.setSource(source);
        order.setStatus(Order.Status.PLACED);
        order.setPaymentStatus(Order.PaymentStatus.PENDING);
        order.setExternalOrderId(request.externalOrderId());
        order.setCurrency("VND");

        long totalAmount = 0L;
        List<OrderItem> items = new ArrayList<>();

        List<CreateOrderRequest.OrderItemRequest> orderedItems = request.items().stream()
                .sorted(Comparator.comparing(CreateOrderRequest.OrderItemRequest::sku))
                .toList();
        for (CreateOrderRequest.OrderItemRequest itemReq : orderedItems) {
            ProductVariant variant = variantRepository.findBySku(itemReq.sku())
                    .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + itemReq.sku()));

            // Lock inventory row to verify available to sell
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variant.getId())
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Chưa thiết lập tồn kho cho SKU " + itemReq.sku()));

            if (balance.getAvailableToSell() < itemReq.quantity()) {
                throw new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "SKU " + itemReq.sku() + " không đủ hàng để bán (ATS: " + balance.getAvailableToSell() + ")");
            }

            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            // Immediately reserve stock for order
            balance.setReserved(balance.getReserved() + itemReq.quantity());
            balanceRepository.save(balance);

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setVariantId(variant.getId());
            item.setSku(variant.getSku());
            item.setQuantity(itemReq.quantity());
            long price = itemReq.unitPrice() != null ? itemReq.unitPrice() : variant.getPrice();
            if (price < 0 || itemReq.quantity() <= 0) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Số lượng phải dương và đơn giá không được âm.");
            }
            item.setUnitPrice(price);
            items.add(item);

            try {
                totalAmount = Math.addExact(totalAmount, Math.multiplyExact(price, itemReq.quantity()));
            } catch (ArithmeticException ex) {
                throw new BusinessRuleException(ErrorCode.BAD_REQUEST, "Tổng tiền đơn hàng vượt giới hạn hỗ trợ.");
            }
            movementRecorder.record(variant.getId(), before, balance, "ORDER_RESERVED",
                    "Reserve stock for order " + orderNumber, orderNumber);
        }

        order.setTotalAmount(totalAmount);
        order.setItems(items);

        Order saved = orderRepository.save(order);

        // Record outbox event for sync engine
        OutboxEvent event = new OutboxEvent();
        event.setAggregateType("ORDER");
        event.setAggregateId(saved.getId().toString());
        event.setEventType("ORDER_CREATED");
        event.setCorrelationId(MDC.get(RequestIdFilter.MDC_KEY));
        event.setPayload(serializeOrderCreated(saved));
        outboxEventRepository.save(event);

        return orderMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public OrderResponse confirmPayment(Long orderId, String idempotencyKey) {
        return idempotencyService.execute(idempotencyKey, "POST:/api/v1/orders/" + orderId + "/payment/confirm",
                Map.of("orderId", orderId), OrderResponse.class, () -> confirmPaymentInternal(orderId));
    }

    private OrderResponse confirmPaymentInternal(Long orderId) {
        Order order = orderRepository.findByIdForUpdate(orderId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng #" + orderId));

        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            return orderMapper.toResponse(order);
        }

        order.setPaymentStatus(Order.PaymentStatus.PAID);
        order.setStatus(Order.Status.CONFIRMED);

        // Convert reserved stock to permanently deducted on-hand
        for (OrderItem item : order.getItems().stream().sorted(Comparator.comparing(OrderItem::getVariantId)).toList()) {
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(item.getVariantId())
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                            "Không tìm thấy số dư cho SKU " + item.getSku()));
            if (balance.getOnHand() < item.getQuantity() || balance.getReserved() < item.getQuantity()) {
                throw new BusinessRuleException(ErrorCode.INVALID_STOCK_BALANCE,
                        "Số dư không đủ để xác nhận thanh toán cho SKU " + item.getSku());
            }
            InventoryMovementRecorder.Snapshot before = InventoryMovementRecorder.Snapshot.from(balance);
            balance.setOnHand(balance.getOnHand() - item.getQuantity());
            balance.setReserved(balance.getReserved() - item.getQuantity());
            balanceRepository.save(balance);
            movementRecorder.record(item.getVariantId(), before, balance, "ORDER_SALE_CONFIRMED",
                    "Confirm payment for order " + order.getOrderNumber(), order.getOrderNumber());
        }

        Order saved = orderRepository.save(order);
        return orderMapper.toResponse(saved);
    }

    private String serializeOrderCreated(Order order) {
        try {
            return objectMapper.writeValueAsString(Map.of(
                    "order_id", order.getId(),
                    "order_number", order.getOrderNumber(),
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
}
