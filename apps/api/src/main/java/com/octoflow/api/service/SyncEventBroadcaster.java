package com.octoflow.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * SSE hub. Signals are deliberately generic state-change notifications: clients re-read an
 * authoritative snapshot, and a success label is only emitted after a verified read-back.
 */
@Component
public class SyncEventBroadcaster {

    private static final Logger log = LoggerFactory.getLogger(SyncEventBroadcaster.class);
    private final List<SseEmitter> emitters = new CopyOnWriteArrayList<>();

    public SseEmitter subscribe() {
        SseEmitter emitter = new SseEmitter(180_000L);
        emitters.add(emitter);
        emitter.onCompletion(() -> emitters.remove(emitter));
        emitter.onTimeout(() -> emitters.remove(emitter));
        emitter.onError(ex -> emitters.remove(emitter));
        try {
            emitter.send(SseEmitter.event()
                    .name("CONNECTED")
                    .data("{\"status\":\"STREAM_CONNECTED\"}"));
        } catch (IOException ex) {
            emitters.remove(emitter);
        }
        return emitter;
    }

    public int activeSubscribers() {
        return emitters.size();
    }

    public void broadcast(String eventType, Object data) {
        for (SseEmitter emitter : emitters) {
            try {
                emitter.send(SseEmitter.event()
                        .name(eventType)
                        .data(data, MediaType.APPLICATION_JSON));
            } catch (IOException | IllegalStateException ex) {
                emitters.remove(emitter);
                log.debug("Removed closed SSE emitter: {}", ex.getMessage());
            }
        }
    }

    /**
     * Defers a signal until the surrounding transaction commits. When called outside a
     * transaction the signal is sent immediately.
     */
    public void broadcastAfterCommit(String eventType, Object data) {
        if (TransactionSynchronizationManager.isSynchronizationActive()
                && TransactionSynchronizationManager.isActualTransactionActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    broadcast(eventType, data);
                }
            });
        } else {
            broadcast(eventType, data);
        }
    }
}
