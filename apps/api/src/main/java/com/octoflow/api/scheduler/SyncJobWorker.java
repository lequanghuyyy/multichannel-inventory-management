package com.octoflow.api.scheduler;

import com.octoflow.api.service.SyncJobDispatchService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Delivers durable sync jobs with write -> independent read-back verification.
 */
@Component
@ConditionalOnProperty(name = "app.sync.workers-enabled", havingValue = "true", matchIfMissing = true)
public class SyncJobWorker {

    private static final Logger log = LoggerFactory.getLogger(SyncJobWorker.class);
    private final SyncJobDispatchService dispatchService;

    public SyncJobWorker(SyncJobDispatchService dispatchService) {
        this.dispatchService = dispatchService;
    }

    @Scheduled(fixedDelayString = "${app.sync.job-poll-interval-ms:1000}")
    public void processSyncJobs() {
        try {
            int processed = dispatchService.processDueJobs();
            if (processed > 0) {
                log.debug("Sync worker processed {} job(s)", processed);
            }
        } catch (Exception ex) {
            log.error("Sync job worker tick failed: {}", ex.getMessage(), ex);
        }
    }
}
