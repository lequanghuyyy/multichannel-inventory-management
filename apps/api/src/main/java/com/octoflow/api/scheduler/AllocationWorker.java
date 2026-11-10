package com.octoflow.api.scheduler;

import com.octoflow.api.service.AllocationExecutionService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Advances confirmed allocation plans through Decrease -> verify -> Increase. Each tick processes
 * at most one step per plan and never holds a database transaction while talking to a channel.
 */
@Component
@ConditionalOnProperty(name = "app.sync.workers-enabled", havingValue = "true", matchIfMissing = true)
public class AllocationWorker {

    private static final Logger log = LoggerFactory.getLogger(AllocationWorker.class);
    private final AllocationExecutionService executionService;

    public AllocationWorker(AllocationExecutionService executionService) {
        this.executionService = executionService;
    }

    @Scheduled(fixedDelayString = "${app.sync.allocation-poll-interval-ms:1000}")
    public void processAllocations() {
        try {
            int processed = executionService.processDuePlans();
            if (processed > 0) {
                log.debug("Allocation worker advanced {} plan step(s)", processed);
            }
        } catch (Exception ex) {
            log.error("Allocation worker tick failed: {}", ex.getMessage(), ex);
        }
    }
}
