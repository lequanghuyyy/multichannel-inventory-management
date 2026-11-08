package com.octoflow.api.service;

import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.response.OrderResponse;

import java.util.List;

public interface OrderService {

    List<OrderResponse> listOrders();

    OrderResponse getOrderById(Long id);

    OrderResponse createOrder(CreateOrderRequest request, String idempotencyKey);

    OrderResponse confirmPayment(Long orderId, String idempotencyKey);

    OrderResponse shipOrder(Long orderId);
}
