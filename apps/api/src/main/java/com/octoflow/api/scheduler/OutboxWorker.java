package com.octoflow.api.scheduler;

import com.octoflow.api.service.OutboxDispatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Fans inventory outbox events out to durable per-listing sync jobs.
 */
@Component
@ConditionalOnProperty(name = "app.sync.workers-enabled", havingValue = "true", matchIfMissing = true)
public class OutboxWorker {

    private static final Logger log = LoggerFactory.getLogger(OutboxWorker.class);
    private final OutboxDispatchService dispatchService;

    public OutboxWorker(OutboxDispatchService dispatchService) {
        this.dispatchService = dispatchService;
    }

    @Scheduled(fixedDelayString = "${app.sync.outbox-poll-interval-ms:1000}")
    public void processOutbox() {
        try {
            int processed = dispatchService.processDueEvents();
            if (processed > 0) {
                log.debug("Outbox worker fanned out {} event(s)", processed);
            }
        } catch (Exception ex) {
            log.error("Outbox worker tick failed: {}", ex.getMessage(), ex);
        }
    }
}
