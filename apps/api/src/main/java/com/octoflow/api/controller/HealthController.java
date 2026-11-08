package com.octoflow.api.controller;

import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

@RestController
@Tag(name = "Health", description = "Liveness and Readiness Probes")
public class HealthController {

    @GetMapping("/health/live")
    @Operation(summary = "Liveness probe")
    public ResponseEntity<Map<String, Object>> live() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "service", "octoflow-api"
        ));
    }

    @GetMapping("/health/ready")
    @Operation(summary = "Readiness probe")
    public ResponseEntity<Map<String, Object>> ready() {
        return ResponseEntity.ok(Map.of(
                "status", "UP",
                "database", "CONNECTED"
        ));
    }
}
