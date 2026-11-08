package com.octoflow.api.controller;

import com.octoflow.api.dto.response.ApiResponse;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
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

    @PostMapping("/{channelId}/inventory/{listingId}/reconcile")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Reconcile out-of-sync listing balance")
    public ResponseEntity<ApiResponse<Void>> reconcileListing(
            @PathVariable Long channelId,
            @PathVariable Long listingId) {
        channelService.reconcileListing(channelId, listingId);
        return ResponseEntity.ok(ApiResponse.ok("Đối soát và đồng bộ tồn kho thành công", null));
    }
}
