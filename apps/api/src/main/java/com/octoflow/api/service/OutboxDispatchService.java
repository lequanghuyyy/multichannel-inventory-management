package com.octoflow.api.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * Supervises outbox dispatch. Each event is fanned out in its own transaction; a failure is
 * recorded with bounded exponential backoff and eventually becomes a dead letter.
 */
@Service
public class OutboxDispatchService {

    private static final Logger log = LoggerFactory.getLogger(OutboxDispatchService.class);

    private final OutboxEventProcessor processor;
    private final int batchSize;
    private final long leaseSeconds;

    public OutboxDispatchService(OutboxEventProcessor processor,
                                 @Value("${app.sync.outbox-batch-size:100}") int batchSize,
                                 @Value("${app.sync.lease-seconds:30}") long leaseSeconds) {
        this.processor = processor;
        this.batchSize = Math.max(1, batchSize);
        this.leaseSeconds = Math.max(1, leaseSeconds);
    }

    public int processDueEvents() {
        List<Long> eventIds = processor.claimDue(batchSize, leaseSeconds);
        int processed = 0;
        for (Long eventId : eventIds) {
            try {
                processor.processEvent(eventId);
                processed++;
            } catch (RuntimeException ex) {
                log.error("Outbox event #{} failed: {}", eventId, ex.getMessage(), ex);
                safeMarkFailed(eventId, ex.getMessage());
            }
        }
        return processed;
    }

    private void safeMarkFailed(Long eventId, String message) {
        try {
            processor.markFailed(eventId, message == null ? "Unknown outbox dispatch failure" : message);
        } catch (RuntimeException ex) {
            log.error("Unable to record outbox failure for event #{}: {}", eventId, ex.getMessage(), ex);
        }
    }
}
