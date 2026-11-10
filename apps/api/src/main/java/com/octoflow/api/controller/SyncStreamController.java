package com.octoflow.api.controller;

import com.octoflow.api.service.SyncEventBroadcaster;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import org.springframework.http.MediaType;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/sync")
@Tag(name = "Sync", description = "Real-time SSE event hub and reconciliation")
public class SyncStreamController {

    private final SyncEventBroadcaster broadcaster;

    public SyncStreamController(SyncEventBroadcaster broadcaster) {
        this.broadcaster = broadcaster;
    }

    @GetMapping(value = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    @PreAuthorize("hasAnyRole('ADMIN', 'STAFF')")
    @Operation(summary = "Real-time Server-Sent Events (SSE) stream for live inventory and sync updates")
    public SseEmitter streamEvents() {
        return broadcaster.subscribe();
    }

    public void broadcastEvent(String eventType, Object data) {
        broadcaster.broadcast(eventType, data);
    }
}
