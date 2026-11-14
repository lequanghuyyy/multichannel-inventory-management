package com.octoflow.api.controller;

import com.octoflow.api.dto.response.SyncJobResponse;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.service.SyncJobManagementService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/sync/jobs")
@Tag(name = "Inventory Sync", description = "Durable per-listing delivery jobs, retries and verification evidence")
public class SyncJobController {

    private final SyncJobManagementService managementService;

    public SyncJobController(SyncJobManagementService managementService) {
        this.managementService = managementService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List sync jobs, optionally filtered by listing or status")
    public ResponseEntity<List<SyncJobResponse>> list(
            @RequestParam(required = false) Long listingId,
            @RequestParam(required = false) String status,
            @RequestParam(defaultValue = "50") int limit) {
        SyncJob.Status parsed = parseStatus(status);
        return ResponseEntity.ok(managementService.list(listingId, parsed, limit));
    }

    @GetMapping("/{jobId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get one sync job with append-only evidence")
    public ResponseEntity<SyncJobResponse> get(@PathVariable Long jobId) {
        return ResponseEntity.ok(managementService.get(jobId));
    }

    @PostMapping("/{jobId}/retry")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Reset a failed sync job for another attempt",
            description = "Only terminal or retryable states can be reset; a currently active job cannot be duplicated.")
    public ResponseEntity<SyncJobResponse> retry(@PathVariable Long jobId) {
        return ResponseEntity.ok(managementService.retry(jobId));
    }

    private SyncJob.Status parseStatus(String status) {
        if (status == null || status.isBlank()) {
            return null;
        }
        try {
            return SyncJob.Status.valueOf(status.trim().toUpperCase());
        } catch (IllegalArgumentException ex) {
            throw new BusinessRuleException(ErrorCode.BAD_REQUEST,
                    "Unknown sync job status '" + status + "'.");
        }
    }
}
