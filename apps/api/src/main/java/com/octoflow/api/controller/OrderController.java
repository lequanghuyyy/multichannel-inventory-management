package com.octoflow.api.controller;

import com.octoflow.api.dto.request.CreateOrderRequest;
import com.octoflow.api.dto.response.OrderResponse;
import com.octoflow.api.middleware.IdempotencyFilter;
import com.octoflow.api.service.OrderService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

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
    @Operation(summary = "Create a new order (POS or marketplace)")
    public ResponseEntity<OrderResponse> createOrder(
            @Valid @RequestBody CreateOrderRequest request,
            HttpServletRequest httpRequest) {
        String idempotencyKey = (String) httpRequest.getAttribute(IdempotencyFilter.IDEMPOTENCY_KEY_ATTR);
        return ResponseEntity.ok(orderService.createOrder(request, idempotencyKey));
    }

    @PostMapping("/{id}/payment/confirm")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Confirm payment and finalize stock deduction")
    public ResponseEntity<OrderResponse> confirmPayment(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.confirmPayment(id));
    }

    @PostMapping("/{id}/ship")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Mark order as shipped")
    public ResponseEntity<OrderResponse> shipOrder(@PathVariable Long id) {
        return ResponseEntity.ok(orderService.shipOrder(id));
    }
}
