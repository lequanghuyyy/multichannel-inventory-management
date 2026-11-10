package com.octoflow.api.controller;

import com.octoflow.api.dto.request.AllocationPreviewRequest;
import com.octoflow.api.dto.response.AllocationPlanResponse;
import com.octoflow.api.service.AllocationService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.enums.ParameterIn;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/inventory/allocations")
@Tag(name = "Inventory Allocation", description = "Manual multi-channel quota preview, confirmation and execution")
public class AllocationController {

    private final AllocationService allocationService;

    public AllocationController(AllocationService allocationService) {
        this.allocationService = allocationService;
    }

    @PostMapping("/preview")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Preview a manual quota allocation",
            description = "Stores a projected plan with the inventory version and allocation revision it was built from. "
                    + "Preview never changes on_hand, reserved or any listing quota.")
    public ResponseEntity<AllocationPlanResponse> preview(@RequestBody AllocationPreviewRequest request) {
        return ResponseEntity.ok(allocationService.preview(request));
    }

    @PostMapping("/{planId}/execute")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Confirm and execute a previewed allocation",
            description = "Rechecks the previewed inventory version and allocation revision, then starts "
                    + "Decrease -> verify -> Increase delivery. Requires an Idempotency-Key.")
    public ResponseEntity<AllocationPlanResponse> confirm(
            @PathVariable Long planId,
            @Parameter(name = "Idempotency-Key", in = ParameterIn.HEADER, required = true,
                    description = "Stable key reused for retries of this exact confirmation")
            @RequestHeader(value = "Idempotency-Key", required = false) String idempotencyKey) {
        return ResponseEntity.ok(allocationService.confirm(planId, idempotencyKey));
    }

    @GetMapping("/{planId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get an allocation plan with item-level delivery evidence")
    public ResponseEntity<AllocationPlanResponse> get(@PathVariable Long planId) {
        return ResponseEntity.ok(allocationService.get(planId));
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List recent allocation plans for a SKU")
    public ResponseEntity<List<AllocationPlanResponse>> list(@RequestParam String sku) {
        return ResponseEntity.ok(allocationService.listBySku(sku));
    }
}
