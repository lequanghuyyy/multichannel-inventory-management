package com.octoflow.api.controller;

import com.octoflow.api.dto.response.WooCommerceChannelStatusResponse;
import com.octoflow.api.service.WooCommerceChannelService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.responses.ApiResponse;
import io.swagger.v3.oas.annotations.responses.ApiResponses;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/channels/{channelId}/woocommerce")
@Tag(name = "WooCommerce", description = "WooCommerce inventory connector connection and write status")
public class WooCommerceChannelController {

    private final WooCommerceChannelService wooCommerceChannelService;

    public WooCommerceChannelController(WooCommerceChannelService wooCommerceChannelService) {
        this.wooCommerceChannelService = wooCommerceChannelService;
    }

    @GetMapping("/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get WooCommerce connection, write flag and mapping status for a channel",
            description = "Reports what was actually verified. A CONNECTED channel does not imply inventory write permission.")
    public ResponseEntity<WooCommerceChannelStatusResponse> status(@PathVariable Long channelId) {
        return ResponseEntity.ok(wooCommerceChannelService.status(channelId));
    }

    @PostMapping("/verify")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Verify the WooCommerce connection through the live wc/v3 API",
            description = "The channel becomes CONNECTED only after the backend reads products from the store. "
                    + "Inventory writes remain disabled unless the dedicated write flag is on.")
    @ApiResponses({
            @ApiResponse(responseCode = "200", description = "Connection verified"),
            @ApiResponse(responseCode = "422", description = "Channel is not a development/test channel"),
            @ApiResponse(responseCode = "502", description = "WooCommerce rejected the request or returned invalid data"),
            @ApiResponse(responseCode = "503", description = "Connector is disabled or not configured"),
            @ApiResponse(responseCode = "504", description = "WooCommerce timed out; result is uncertain")
    })
    public ResponseEntity<WooCommerceChannelStatusResponse> verify(@PathVariable Long channelId) {
        return ResponseEntity.ok(wooCommerceChannelService.verify(channelId));
    }

    @PostMapping("/disconnect")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Disconnect a WooCommerce channel locally",
            description = "Clears connection verification metadata but keeps mappings and evidence. "
                    + "No remote store data is changed.")
    public ResponseEntity<WooCommerceChannelStatusResponse> disconnect(@PathVariable Long channelId) {
        return ResponseEntity.ok(wooCommerceChannelService.disconnect(channelId));
    }
}
