package com.octoflow.api.service.impl;

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
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class OrderServiceImpl implements OrderService {

    private final OrderRepository orderRepository;
    private final ProductVariantRepository variantRepository;
    private final InventoryBalanceRepository balanceRepository;
    private final OutboxEventRepository outboxEventRepository;
    private final OrderMapper orderMapper;

    public OrderServiceImpl(OrderRepository orderRepository,
                            ProductVariantRepository variantRepository,
                            InventoryBalanceRepository balanceRepository,
                            OutboxEventRepository outboxEventRepository,
                            OrderMapper orderMapper) {
        this.orderRepository = orderRepository;
        this.variantRepository = variantRepository;
        this.balanceRepository = balanceRepository;
        this.outboxEventRepository = outboxEventRepository;
        this.orderMapper = orderMapper;
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
        Order.Source source;
        try {
            source = Order.Source.valueOf(request.source().toUpperCase());
        } catch (IllegalArgumentException ex) {
            source = Order.Source.POS;
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

        for (CreateOrderRequest.OrderItemRequest itemReq : request.items()) {
            ProductVariant variant = variantRepository.findBySku(itemReq.sku())
                    .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SKU_NOT_FOUND, "Không tìm thấy SKU " + itemReq.sku()));

            // Lock inventory row to verify available to sell
            InventoryBalance balance = balanceRepository.findByVariantIdWithLock(variant.getId())
                    .orElseThrow(() -> new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "Chưa thiết lập tồn kho cho SKU " + itemReq.sku()));

            if (balance.getAvailableToSell() < itemReq.quantity()) {
                throw new BusinessRuleException(ErrorCode.INSUFFICIENT_STOCK, "SKU " + itemReq.sku() + " không đủ hàng để bán (ATS: " + balance.getAvailableToSell() + ")");
            }

            // Immediately reserve stock for order
            balance.setReserved(balance.getReserved() + itemReq.quantity());
            balanceRepository.save(balance);

            OrderItem item = new OrderItem();
            item.setOrder(order);
            item.setVariantId(variant.getId());
            item.setSku(variant.getSku());
            item.setQuantity(itemReq.quantity());
            long price = itemReq.unitPrice() != null ? itemReq.unitPrice() : variant.getPrice();
            item.setUnitPrice(price);
            items.add(item);

            totalAmount += price * itemReq.quantity();
        }

        order.setTotalAmount(totalAmount);
        order.setItems(items);

        Order saved = orderRepository.save(order);

        // Record outbox event for sync engine
        OutboxEvent event = new OutboxEvent();
        event.setAggregateType("ORDER");
        event.setAggregateId(saved.getId().toString());
        event.setEventType("ORDER_CREATED");
        event.setPayload(String.format("{\"order_id\":%d,\"order_number\":\"%s\",\"total\":%d}", saved.getId(), saved.getOrderNumber(), saved.getTotalAmount()));
        outboxEventRepository.save(event);

        return orderMapper.toResponse(saved);
    }

    @Override
    @Transactional
    public OrderResponse confirmPayment(Long orderId) {
        Order order = orderRepository.findById(orderId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.ORDER_NOT_FOUND, "Không tìm thấy đơn hàng #" + orderId));

        if (order.getPaymentStatus() == Order.PaymentStatus.PAID) {
            return orderMapper.toResponse(order);
        }

        order.setPaymentStatus(Order.PaymentStatus.PAID);
        order.setStatus(Order.Status.CONFIRMED);

        // Convert reserved stock to permanently deducted on-hand
        for (OrderItem item : order.getItems()) {
            balanceRepository.findByVariantIdWithLock(item.getVariantId()).ifPresent(balance -> {
                balance.setOnHand(Math.max(0, balance.getOnHand() - item.getQuantity()));
                balance.setReserved(Math.max(0, balance.getReserved() - item.getQuantity()));
                balanceRepository.save(balance);
            });
        }

        Order saved = orderRepository.save(order);
        return orderMapper.toResponse(saved);
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
