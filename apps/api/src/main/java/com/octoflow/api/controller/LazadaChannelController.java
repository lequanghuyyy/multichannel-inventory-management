package com.octoflow.api.controller;

import com.octoflow.api.dto.response.LazadaVerifyResponse;
import com.octoflow.api.service.LazadaConnectionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/v1/channels/{channelId}/lazada")
@Tag(name = "Lazada", description = "Lazada Open Platform channel connection operations")
public class LazadaChannelController {

    private final LazadaConnectionService connectionService;

    public LazadaChannelController(LazadaConnectionService connectionService) {
        this.connectionService = connectionService;
    }

    @PostMapping("/verify")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Verify Lazada product and order read access with live reads")
    public LazadaVerifyResponse verify(@PathVariable Long channelId) {
        return connectionService.verify(channelId);
    }

    @PostMapping("/disconnect")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Clear local Lazada credentials and disconnect the channel")
    public LazadaVerifyResponse disconnect(@PathVariable Long channelId) {
        return connectionService.disconnect(channelId);
    }
}
