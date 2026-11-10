package com.octoflow.api.controller;

import com.octoflow.api.dto.request.SimulatorFaultRequest;
import com.octoflow.api.dto.request.SimulatorStockRequest;
import com.octoflow.api.dto.response.SimulatorStateResponse;
import com.octoflow.api.service.SimulatorAdminService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/v1/channels/simulator")
@Tag(name = "Channel Simulator", description = "Admin-only durable simulator state and fault injection")
public class SimulatorAdminController {

    private final SimulatorAdminService simulatorAdminService;

    public SimulatorAdminController(SimulatorAdminService simulatorAdminService) {
        this.simulatorAdminService = simulatorAdminService;
    }

    @GetMapping("/{channelId}/listings/{listingId}")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Read the durable simulated channel quantity and active fault")
    public ResponseEntity<SimulatorStateResponse> getState(@PathVariable Long channelId,
                                                           @PathVariable Long listingId) {
        return ResponseEntity.ok(simulatorAdminService.getState(channelId, listingId));
    }

    @PutMapping("/{channelId}/listings/{listingId}/stock")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Force the simulated channel quantity without touching OctoFlow inventory",
            description = "Used to create drift for reconciliation tests. This never changes on_hand, reserved or allocated quota.")
    public ResponseEntity<SimulatorStateResponse> setStock(@PathVariable Long channelId,
                                                           @PathVariable Long listingId,
                                                           @RequestBody SimulatorStockRequest request) {
        return ResponseEntity.ok(simulatorAdminService.setStock(channelId, listingId,
                request == null ? null : request.quantity()));
    }

    @PostMapping("/{channelId}/listings/{listingId}/fault")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Inject a bounded simulator fault",
            description = "Fault types: REFUSE, TIMEOUT, TIMEOUT_AFTER_WRITE, WRONG_READ, DELAY, DUPLICATE.")
    public ResponseEntity<SimulatorStateResponse> injectFault(@PathVariable Long channelId,
                                                              @PathVariable Long listingId,
                                                              @RequestBody SimulatorFaultRequest request) {
        return ResponseEntity.ok(simulatorAdminService.injectFault(channelId, listingId, request));
    }

    @DeleteMapping("/{channelId}/listings/{listingId}/fault")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Clear any simulator fault for a listing")
    public ResponseEntity<SimulatorStateResponse> clearFault(@PathVariable Long channelId,
                                                            @PathVariable Long listingId) {
        return ResponseEntity.ok(simulatorAdminService.clearFault(channelId, listingId));
    }
}
