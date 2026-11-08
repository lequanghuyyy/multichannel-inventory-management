package com.octoflow.api.service;

import com.octoflow.api.dto.command.ChannelOrderCommand;
import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.response.OrderResponse;

import java.util.List;

public interface OrderService {

    List<OrderResponse> listOrders();

    OrderResponse getOrderById(Long id);

    OrderResponse createOrder(CreateOrderRequest request, String idempotencyKey);

    /**
     * Internal marketplace/connector entry point. Repeated delivery of the same external order
     * returns the existing order without reserving stock again; a different payload for the same
     * external identity is rejected as a conflict.
     */
    OrderResponse createChannelOrder(ChannelOrderCommand command, String idempotencyKey);

    OrderResponse confirmPayment(Long orderId, String idempotencyKey);

    OrderResponse shipOrder(Long orderId);
}
