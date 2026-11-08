package com.octoflow.api.mapper;

import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderItem;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class OrderMapper {

    public OrderResponse.OrderItemResponse toItemResponse(OrderItem item) {
        if (item == null) {
            return null;
        }
        return new OrderResponse.OrderItemResponse(
                item.getId(),
                item.getVariantId(),
                item.getSku(),
                item.getQuantity(),
                item.getUnitPrice()
        );
    }

    public List<OrderResponse.OrderItemResponse> toItemResponses(List<OrderItem> items) {
        if (items == null || items.isEmpty()) {
            return Collections.emptyList();
        }
        return items.stream()
                .map(this::toItemResponse)
                .collect(Collectors.toList());
    }

    public OrderResponse toResponse(Order order) {
        if (order == null) {
            return null;
        }
        return new OrderResponse(
                order.getId(),
                order.getOrderNumber(),
                order.getSource() != null ? order.getSource().name() : Order.Source.POS.name(),
                order.getStatus() != null ? order.getStatus().name() : Order.Status.PLACED.name(),
                order.getPaymentStatus() != null ? order.getPaymentStatus().name() : Order.PaymentStatus.PENDING.name(),
                order.getTotalAmount() != null ? order.getTotalAmount() : 0L,
                order.getCurrency() != null ? order.getCurrency() : "VND",
                order.getExternalOrderId(),
                toItemResponses(order.getItems()),
                order.getCreatedAt(),
                order.getUpdatedAt()
        );
    }

    public List<OrderResponse> toResponseList(List<Order> orders) {
        if (orders == null || orders.isEmpty()) {
            return Collections.emptyList();
        }
        return orders.stream()
                .map(this::toResponse)
                .collect(Collectors.toList());
    }
}
