package com.octoflow.api.controller;

import com.octoflow.api.dto.request.CancelOrderRequest;
import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.request.HandoverOrderRequest;
import com.octoflow.api.dto.request.OrderTransitionRequest;
import com.octoflow.api.dto.request.RecordPaymentRequest;
import com.octoflow.api.dto.response.OrderHistoryResponse;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;

@RestController
@RequestMapping("/api/v1/orders")
@Tag(name = "Orders", description = "Multi-channel orders and POS checkout lifecycle")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List all orders")
    public ResponseEntity<List<OrderResponse>> listOrders() {
        return ResponseEntity.ok(orderService.listOrders());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get order details by ID")
    public ResponseEntity<OrderResponse> getOrderById(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.getOrderById(id));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Create a POS order",
            description = "POS-only contract. The server controls the source and unit prices; "
                    + "marketplace orders must arrive through the internal connector boundary. "
                    + "An optional unitPrice is an expected-price check, not an override.")
    public ResponseEntity<OrderResponse> createOrder(
            @Valid @RequestBody CreateOrderRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact order request")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(orderService.createOrder(request, idempotencyKey));
    }

    @PostMapping("/{id}/payment/confirm")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Record POS payment and finalize stock deduction",
            description = "CASH records the cash received and change; BANK_TRANSFER records staff "
                    + "confirmation with an optional reference. An absent body keeps the legacy "
                    + "manual-confirmation behavior. The server computes the amount due.")
    public ResponseEntity<OrderResponse> confirmPayment(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) RecordPaymentRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this payment confirmation")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(orderService.confirmPayment(id, request, idempotencyKey));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Cancel an unpaid POS order",
            description = "Releases only the reserved quantity. Paid-order cancellation/refund is "
                    + "deliberately blocked until a later phase.")
    public ResponseEntity<OrderResponse> cancelOrder(
            @PathVariable Long id,
            @Valid @RequestBody CancelOrderRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this cancellation")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(orderService.cancelOrder(id, request, idempotencyKey));
    }

    @PostMapping("/{id}/transition")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Move a paid POS order to the next lifecycle status",
            description = "Base chain only: CONFIRMED -> PACKED -> SHIPPED -> DELIVERED. Invalid "
                    + "jumps and unpaid orders are rejected. Use /handover for counter handover.")
    public ResponseEntity<OrderResponse> transitionOrderStatus(
            @PathVariable Long id,
            @Valid @RequestBody OrderTransitionRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this transition")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(orderService.transitionOrderStatus(id, request, idempotencyKey));
    }

    @PostMapping("/{id}/ship")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Mark a packed, paid order as shipped")
    public ResponseEntity<OrderResponse> shipOrder(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.shipOrder(id));
    }

    @PostMapping("/{id}/handover")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Hand a paid POS order to the customer at the counter",
            description = "Moves CONFIRMED -> DELIVERED without requiring PACKED or SHIPPED.")
    public ResponseEntity<OrderResponse> handoverOrder(
            @PathVariable Long id,
            @Valid @RequestBody(required = false) HandoverOrderRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this handover")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(orderService.handoverOrder(id, request, idempotencyKey));
    }

    @GetMapping("/{id}/history")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get the append-only lifecycle history of an order")
    public ResponseEntity<List<OrderHistoryResponse>> getOrderHistory(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.getOrderHistory(id));
    }
}
