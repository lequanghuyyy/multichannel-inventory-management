package com.octoflow.api.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

@RestController
@RequestMapping("/api/v1/system")
@Tag(name = "System", description = "System capabilities and operational state flags")
public class SystemController {

    @Value("${app.channels.shopify.enabled:false}")
    private boolean shopifyEnabled;

    @Value("${app.ai.dynamic-buffer-enabled:false}")
    private boolean aiDynamicBufferEnabled;

    @GetMapping
    @Operation(summary = "Get system feature and subsystem readiness flags")
    public ResponseEntity<Map<String, Object>> getSystemStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        status.put("service", "octoflow-api");
        status.put("version", "1.0.0");
        status.put("stage", "foundation");
        status.put("inventory_ready", true);
        status.put("inventory_read_available", true);
        status.put("inventory_write_available", true);
        status.put("reservation_audit_available", true);
        status.put("marketplace_connected", shopifyEnabled);
        status.put("ai_ready", aiDynamicBufferEnabled);
        status.put("ai_available", true);
        status.put("catalog_available", true);
        status.put("catalog_write_available", true);
        status.put("product_media_available", true);
        status.put("orders_available", true);
        status.put("adjustment_available", true);
        status.put("receiving_available", true);
        status.put("authentication_available", true);
        status.put("reports_available", true);
        status.put("channels_available", true);
        status.put("outbox_available", true);
        status.put("sync_events_available", true);
        status.put("sync_stream_available", true);
        status.put("sync_active_subscribers", 0);
        status.put("sync_delivery_available", false);
        status.put("shopify_integration_enabled", shopifyEnabled);
        status.put("shopify_connection_verified", false);
        status.put("shopify_delivery_available", false);
        status.put("simulator_delivery_available", true);
        status.put("simulator_available", true);

        return ResponseEntity.ok(status);
    }
}
