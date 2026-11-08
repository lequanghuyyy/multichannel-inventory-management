package com.octoflow.api.controller;

import com.octoflow.api.dto.request.InventoryAdjustRequest;
import com.octoflow.api.dto.response.InventorySnapshotResponse;
import com.octoflow.api.dto.response.LedgerEntryResponse;
import com.octoflow.api.service.InventoryService;
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
@RequestMapping("/api/v1/inventory")
@Tag(name = "Inventory", description = "Central Stock, Balances and Adjustments")
public class InventoryController {

    private final InventoryService inventoryService;

    public InventoryController(InventoryService inventoryService) {
        this.inventoryService = inventoryService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List all inventory balances", description = "Returns stock levels for all product variants")
    public ResponseEntity<List<InventorySnapshotResponse>> listInventory() {
        return ResponseEntity.ok(inventoryService.listInventory());
    }

    @GetMapping("/{sku}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get inventory balance by SKU", description = "Returns on-hand, reserved, safety buffer, and available-to-sell (ATS)")
    public ResponseEntity<InventorySnapshotResponse> getInventoryBySku(@PathVariable String sku) {
        InventorySnapshotResponse snapshot = inventoryService.getInventoryBySku(sku);
        return ResponseEntity.ok(snapshot);
    }

    @GetMapping("/{sku}/ledger")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get inventory adjustment audit ledger by SKU")
    public ResponseEntity<List<LedgerEntryResponse>> getLedgerBySku(
            @PathVariable String sku,
            @RequestParam(defaultValue = "50") int limit) {
        return ResponseEntity.ok(inventoryService.getLedgerBySku(sku, limit));
    }

    @PostMapping("/adjust")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Adjust inventory with reason", description = "Admin-only manual balance adjustment with version concurrency control")
    public ResponseEntity<InventorySnapshotResponse> adjustInventory(
            @Valid @RequestBody InventoryAdjustRequest request,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact adjustment")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        InventorySnapshotResponse result = inventoryService.adjustInventory(request, idempotencyKey);
        return ResponseEntity.ok(result);
    }
}
