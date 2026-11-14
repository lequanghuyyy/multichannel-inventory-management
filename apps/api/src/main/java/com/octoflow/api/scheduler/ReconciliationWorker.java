package com.octoflow.api.scheduler;

import com.octoflow.api.service.ReconciliationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Periodically compares each deliverable listing's remote quantity with its allocated target.
 * Observations are evidence; drift queues a correction job and never reports success locally.
 */
@Component
@ConditionalOnProperty(name = "app.sync.workers-enabled", havingValue = "true", matchIfMissing = true)
public class ReconciliationWorker {

    private static final Logger log = LoggerFactory.getLogger(ReconciliationWorker.class);
    private final ReconciliationService reconciliationService;

    public ReconciliationWorker(ReconciliationService reconciliationService) {
        this.reconciliationService = reconciliationService;
    }

    @Scheduled(fixedDelayString = "${app.sync.reconciliation-interval-ms:60000}")
    public void reconcileListings() {
        List<Long> candidates;
        try {
            candidates = reconciliationService.candidateListingIds();
        } catch (Exception ex) {
            log.error("Reconciliation candidate query failed: {}", ex.getMessage(), ex);
            return;
        }
        for (Long listingId : candidates) {
            try {
                reconciliationService.reconcileListingById(listingId);
            } catch (Exception ex) {
                log.warn("Reconciliation skipped listing #{}: {}", listingId, ex.getMessage());
            }
        }
    }
}
