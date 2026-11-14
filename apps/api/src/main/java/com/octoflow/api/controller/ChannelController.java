package com.octoflow.api.controller;

import com.octoflow.api.dto.request.RegisterChannelMappingRequest;
import com.octoflow.api.dto.request.VerifyChannelMappingRequest;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.ListingSyncStatusResponse;
import com.octoflow.api.service.ChannelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/v1/channels")
@Tag(name = "Channels", description = "Multi-channel integrations (Shopify, WooCommerce, eBay)")
public class ChannelController {

    private final ChannelService channelService;

    public ChannelController(ChannelService channelService) {
        this.channelService = channelService;
    }

    @GetMapping
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "List all configured sales channels")
    public ResponseEntity<List<ChannelResponse>> listChannels() {
        return ResponseEntity.ok(channelService.listChannels());
    }

    @GetMapping("/{channelId}")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get sales channel status and details")
    public ResponseEntity<ChannelResponse> getChannelById(@PathVariable Long channelId) {
        return ResponseEntity.ok(channelService.getChannelById(channelId));
    }

    @GetMapping("/{channelId}/mappings")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get product variant listings mapped to this channel")
    public ResponseEntity<List<ChannelListingResponse>> getChannelListings(@PathVariable Long channelId) {
        return ResponseEntity.ok(channelService.getChannelListings(channelId));
    }

    @PostMapping("/{channelId}/mappings")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Register (but do not verify) an external listing identity for a SKU",
            description = "Allocation requires a mapping that has been verified through the channel adapter.")
    public ResponseEntity<ChannelListingResponse> registerMapping(
            @PathVariable Long channelId,
            @RequestBody RegisterChannelMappingRequest request) {
        return ResponseEntity.ok(channelService.registerMapping(channelId, request));
    }

    @PostMapping("/{channelId}/mappings/{listingId}/verify")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Verify a registered external listing through the channel adapter",
            description = "Verification is fail-closed for channels without a writable, read-back capable connector.")
    public ResponseEntity<ChannelListingResponse> verifyMapping(
            @PathVariable Long channelId,
            @PathVariable Long listingId,
            @RequestBody(required = false) VerifyChannelMappingRequest request) {
        return ResponseEntity.ok(channelService.verifyMapping(channelId, listingId, request));
    }

    @GetMapping("/{channelId}/mappings/{listingId}/sync-status")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get target, sent, acknowledged and verified quantities with evidence")
    public ResponseEntity<ListingSyncStatusResponse> getListingSyncStatus(
            @PathVariable Long channelId,
            @PathVariable Long listingId) {
        return ResponseEntity.ok(channelService.getListingSyncStatus(channelId, listingId));
    }

    @PostMapping("/{channelId}/inventory/{listingId}/reconcile")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Reconcile a listing against the channel's independent read",
            description = "Uses the simulator when explicitly enabled; real channels without a connector remain "
                    + "fail-closed with 503. Drift is recorded as evidence and queues a correction job.")
    @io.swagger.v3.oas.annotations.responses.ApiResponses({
            @io.swagger.v3.oas.annotations.responses.ApiResponse(
                    responseCode = "503", description = "Channel delivery and verification are unavailable")
    })
    public ResponseEntity<ChannelSyncEvidenceResponse> reconcileListing(
            @PathVariable Long channelId,
            @PathVariable Long listingId) {
        return ResponseEntity.ok(channelService.reconcileListing(channelId, listingId));
    }
}
