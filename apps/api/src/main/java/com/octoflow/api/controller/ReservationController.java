package com.octoflow.api.controller;

import com.octoflow.api.dto.request.ReserveStockRequest;
import com.octoflow.api.dto.response.ApiResponse;
import com.octoflow.api.dto.response.ReservationResponse;
import com.octoflow.api.service.ReservationService;
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
@Tag(name = "Reservations", description = "Stock Hold, Sale Confirmation and Release Lifecycle")
public class ReservationController {

    private final ReservationService reservationService;

    public ReservationController(ReservationService reservationService) {
        this.reservationService = reservationService;
    }

    @GetMapping("/api/v1/reservations")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List all stock reservations")
    public ResponseEntity<List<ReservationResponse>> listReservations() {
        return ResponseEntity.ok(reservationService.listReservations());
    }

    @GetMapping("/api/v1/reservations/{reservationId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get reservation audit details by ID")
    public ResponseEntity<ReservationResponse> getReservationById(@PathVariable Long reservationId) {
        return ResponseEntity.ok(reservationService.getReservationById(reservationId));
    }

    @PostMapping("/api/v1/inventory/reserve")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Hold stock for a transaction", description = "Increases reserved count without decreasing physical on-hand")
    public ResponseEntity<ReservationResponse> reserve(
            @Valid @RequestBody ReserveStockRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact reservation")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        ReservationResponse response = reservationService.reserve(request, idempotencyKey);
        return ResponseEntity.ok(response);
    }

    @PostMapping("/api/v1/inventory/sell")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Confirm sale of held stock", description = "Decrements both on-hand and reserved simultaneously")
    public ResponseEntity<ApiResponse<Void>> confirmSale(
            @RequestParam Long reservationId,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact sale confirmation")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        reservationService.confirmSale(reservationId, idempotencyKey);
        return ResponseEntity.ok(ApiResponse.ok("Xác nhận bán hàng thành công", null));
    }

    @PostMapping("/api/v1/inventory/release")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Release held stock", description = "Returns reserved count to sellable pool")
    public ResponseEntity<ApiResponse<Void>> release(@RequestParam Long reservationId) {
        reservationService.release(reservationId);
        return ResponseEntity.ok(ApiResponse.ok("Giải phóng giữ hàng thành công", null));
    }

    @PostMapping("/api/v1/inventory/cancel")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Cancel hold immediately")
    public ResponseEntity<ApiResponse<Void>> cancel(@RequestParam Long reservationId) {
        reservationService.release(reservationId);
        return ResponseEntity.ok(ApiResponse.ok("Hủy giữ hàng thành công", null));
    }

    @PostMapping("/api/v1/inventory/expire")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Trigger manual expiration sweep of active holds past TTL")
    public ResponseEntity<ApiResponse<Void>> expire() {
        reservationService.expireHolds();
        return ResponseEntity.ok(ApiResponse.ok("Quét và hủy các giữ hàng quá hạn thành công", null));
    }
}
