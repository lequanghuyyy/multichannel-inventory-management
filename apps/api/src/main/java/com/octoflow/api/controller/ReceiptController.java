package com.octoflow.api.controller;

import com.octoflow.api.dto.request.CancelReceiptRequest;
import com.octoflow.api.dto.request.CloseShortRequest;
import com.octoflow.api.dto.request.CreateReceiptRequest;
import com.octoflow.api.dto.request.ReceiveItemsRequest;
import com.octoflow.api.dto.request.UpdateReceiptRequest;
import com.octoflow.api.dto.response.ReceiptPreviewResponse;
import com.octoflow.api.dto.response.ReceiptResponse;
import com.octoflow.api.service.ReceiptService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;

import java.util.List;

@RestController
@RequestMapping("/api/v1/receipts")
@Tag(name = "Receiving", description = "Inbound purchase receipts and warehouse inspection")
public class ReceiptController {

    private final ReceiptService receiptService;

    public ReceiptController(ReceiptService receiptService) {
        this.receiptService = receiptService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List all inbound receipts with batch history and remaining quantities")
    public ResponseEntity<List<ReceiptResponse>> listReceipts() {
        return ResponseEntity.ok(receiptService.listReceipts());
    }

    @GetMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get receipt details by ID")
    public ResponseEntity<ReceiptResponse> getReceiptById(@PathVariable Long id) {
        return ResponseEntity.ok(receiptService.getReceiptById(id));
    }

    @PostMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Create draft inbound receipt")
    public ResponseEntity<ReceiptResponse> createReceipt(
            @Valid @RequestBody CreateReceiptRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact receipt request")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(receiptService.createReceipt(request, idempotencyKey));
    }

    @PatchMapping("/{id}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Replace an editable DRAFT receipt and its lines")
    public ResponseEntity<ReceiptResponse> updateReceipt(
            @PathVariable Long id,
            @Valid @RequestBody UpdateReceiptRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact draft update")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(receiptService.updateReceipt(id, request, idempotencyKey));
    }

    @PostMapping("/{id}/cancel")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Cancel a DRAFT receipt without touching inventory")
    public ResponseEntity<ReceiptResponse> cancelReceipt(
            @PathVariable Long id,
            @Valid @RequestBody CancelReceiptRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact cancellation")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(receiptService.cancelReceipt(id, request, idempotencyKey));
    }

    @PostMapping("/{id}/close-short")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Close a partially received receipt short, recording the missing quantity")
    public ResponseEntity<ReceiptResponse> closeShort(
            @PathVariable Long id,
            @Valid @RequestBody CloseShortRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact close-short command")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(receiptService.closeShort(id, request, idempotencyKey));
    }

    @PostMapping("/{id}/preview")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Preview a receive batch without mutating inventory")
    public ResponseEntity<ReceiptPreviewResponse> previewReceive(
            @PathVariable Long id,
            @Valid @RequestBody ReceiveItemsRequest request) {
        return ResponseEntity.ok(receiptService.previewReceive(id, request));
    }

    @PostMapping("/{id}/receive")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Inspect and receive one independent batch into physical on-hand")
    public ResponseEntity<ReceiptResponse> receiveStock(
            @PathVariable Long id,
            @Valid @RequestBody ReceiveItemsRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact receiving batch")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(receiptService.receiveStock(id, request, idempotencyKey));
    }
}
