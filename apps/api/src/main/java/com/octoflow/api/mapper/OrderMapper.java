package com.octoflow.api.mapper;

import com.octoflow.api.dto.response.OrderHistoryResponse;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.entity.Order;
import com.octoflow.api.entity.OrderItem;
import com.octoflow.api.entity.OrderStatusHistory;
import com.octoflow.api.entity.PosPaymentDetail;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.Map;
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

    public OrderResponse.PaymentDetailResponse toPaymentResponse(PosPaymentDetail payment) {
        if (payment == null) {
            return null;
        }
        return new OrderResponse.PaymentDetailResponse(
                payment.getMethod() != null ? payment.getMethod().name() : null,
                payment.getCurrency(),
                payment.getAmountDue(),
                payment.getCashReceived(),
                payment.getChangeAmount(),
                payment.getReference(),
                payment.getNote(),
                payment.getActor(),
                payment.getPaidAt()
        );
    }

    public OrderHistoryResponse toHistoryResponse(OrderStatusHistory history) {
        if (history == null) {
            return null;
        }
        return new OrderHistoryResponse(
                history.getId(),
                history.getOrderId(),
                history.getAction() != null ? history.getAction().name() : null,
                history.getFromStatus() != null ? history.getFromStatus().name() : null,
                history.getToStatus() != null ? history.getToStatus().name() : null,
                history.getFromPaymentStatus() != null ? history.getFromPaymentStatus().name() : null,
                history.getToPaymentStatus() != null ? history.getToPaymentStatus().name() : null,
                history.getReason(),
                history.getActor(),
                history.getChangedAt()
        );
    }

    public List<OrderHistoryResponse> toHistoryResponseList(List<OrderStatusHistory> history) {
        if (history == null || history.isEmpty()) {
            return Collections.emptyList();
        }
        return history.stream()
                .map(this::toHistoryResponse)
                .collect(Collectors.toList());
    }

    public OrderResponse toResponse(Order order) {
        return toResponse(order, null);
    }

    public OrderResponse toResponse(Order order, PosPaymentDetail payment) {
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
                order.getChannelId(),
                toItemResponses(order.getItems()),
                order.getCreatedAt(),
                order.getUpdatedAt(),
                order.getHoldExpiresAt(),
                toPaymentResponse(payment)
        );
    }

    public List<OrderResponse> toResponseList(List<Order> orders) {
        return toResponseList(orders, Map.of());
    }

    public List<OrderResponse> toResponseList(List<Order> orders, Map<Long, PosPaymentDetail> paymentsByOrderId) {
        if (orders == null || orders.isEmpty()) {
            return Collections.emptyList();
        }
        return orders.stream()
                .map(order -> toResponse(order, paymentsByOrderId.get(order.getId())))
                .collect(Collectors.toList());
    }
}
