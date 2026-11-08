package com.octoflow.api.scheduler;

import com.octoflow.api.repository.IdempotencyRecordRepository;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

@Component
public class IdempotencyRetentionWorker {

    private final IdempotencyRecordRepository repository;

    public IdempotencyRetentionWorker(IdempotencyRecordRepository repository) {
        this.repository = repository;
    }

    @Scheduled(fixedDelayString = "${app.idempotency.cleanup-interval-ms:3600000}")
    @Transactional
    public void removeExpiredRecords() {
        repository.deleteExpiredCompleted(Instant.now());
    }
}
