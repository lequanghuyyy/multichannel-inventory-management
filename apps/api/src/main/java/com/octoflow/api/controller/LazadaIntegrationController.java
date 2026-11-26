package com.octoflow.api.controller;

import com.octoflow.api.dto.response.LazadaAuthorizationResponse;
import com.octoflow.api.dto.response.LazadaStatusResponse;
import com.octoflow.api.service.LazadaConnectionService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.security.core.Authentication;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.net.URI;

@RestController
@RequestMapping("/api/v1/integrations/lazada")
@Tag(name = "Lazada", description = "Lazada Open Platform OAuth and connection lifecycle")
public class LazadaIntegrationController {

    private final LazadaConnectionService connectionService;

    public LazadaIntegrationController(LazadaConnectionService connectionService) {
        this.connectionService = connectionService;
    }

    @GetMapping("/status")
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Get Lazada connector configuration and connection status")
    public LazadaStatusResponse status() {
        return connectionService.status();
    }

    @PostMapping("/connect")
    @PreAuthorize("hasRole('ADMIN')")
    @Operation(summary = "Start Lazada seller OAuth authorization")
    public LazadaAuthorizationResponse connect(Authentication authentication) {
        return connectionService.connect(authentication.getName());
    }

    @GetMapping("/callback")
    // Public OAuth callback; the single-use, expiring state is validated before processing the code.
    @Operation(summary = "Complete Lazada OAuth callback")
    public ResponseEntity<Void> callback(@RequestParam(required = false) String code,
                                          @RequestParam(required = false) String state,
                                          @RequestParam(required = false) String error) {
        URI target = connectionService.callback(code, state, error);
        return ResponseEntity.status(HttpStatus.FOUND)
                .header(HttpHeaders.LOCATION, target.toASCIIString())
                .build();
    }
}
