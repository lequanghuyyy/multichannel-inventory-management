package com.octoflow.api.service;

import com.octoflow.api.dto.command.ChannelOrderCommand;
import com.octoflow.api.dto.request.CancelOrderRequest;
import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.request.HandoverOrderRequest;
import com.octoflow.api.dto.request.OrderTransitionRequest;
import com.octoflow.api.dto.request.RecordPaymentRequest;
import com.octoflow.api.dto.response.OrderHistoryResponse;
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

    /**
     * Compatibility overload for the original no-body payment endpoint. The payment is recorded
     * as MANUAL; new clients should use the request-body overload to record CASH/BANK_TRANSFER.
     */
    OrderResponse confirmPayment(Long orderId, String idempotencyKey);

    OrderResponse confirmPayment(Long orderId, RecordPaymentRequest request, String idempotencyKey);

    OrderResponse cancelOrder(Long orderId, CancelOrderRequest request, String idempotencyKey);

    OrderResponse transitionOrderStatus(Long orderId, OrderTransitionRequest request, String idempotencyKey);

    /**
     * Legacy endpoint kept for compatibility. It now enforces the same state machine as the
     * explicit transition endpoint (PACKED -> SHIPPED, paid order only).
     */
    OrderResponse shipOrder(Long orderId);

    /**
     * POS counter handover: CONFIRMED -> DELIVERED without requiring PACKED or SHIPPED.
     */
    OrderResponse handoverOrder(Long orderId, HandoverOrderRequest request, String idempotencyKey);

    List<OrderHistoryResponse> getOrderHistory(Long orderId);

    /**
     * Sweeps abandoned unpaid POS orders one at a time in their own transaction. Marketplace
     * orders and paid/confirmed orders are excluded by the query and re-checked under lock.
     */
    OrderExpirySweepResult expireAbandonedOrders();

    record OrderExpirySweepResult(int expired, int skipped, int failed) {}
}
