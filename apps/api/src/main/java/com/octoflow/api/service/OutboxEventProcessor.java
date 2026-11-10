package com.octoflow.api.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.OutboxEvent;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.OutboxEventRepository;
import com.octoflow.api.repository.SyncJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Each inventory outbox event is fanned out to one durable sync job per eligible listing. The
 * target is the listing's current allocated quota (an absolute value), which makes retries safe.
 */
@Service
public class OutboxEventProcessor {

    private static final Logger log = LoggerFactory.getLogger(OutboxEventProcessor.class);

    private final OutboxEventRepository outboxRepository;
    private final ChannelListingRepository listingRepository;
    private final SyncJobRepository syncJobRepository;
    private final ObjectMapper objectMapper;
    private final String workerId;
    private final int maxAttempts;
    private final long retryBaseMs;
    private final long retryMaxMs;

    public OutboxEventProcessor(OutboxEventRepository outboxRepository,
                                ChannelListingRepository listingRepository,
                                SyncJobRepository syncJobRepository,
                                ObjectMapper objectMapper,
                                @Value("${app.sync.max-attempts:8}") int maxAttempts,
                                @Value("${app.sync.retry-base-ms:500}") long retryBaseMs,
                                @Value("${app.sync.retry-max-ms:60000}") long retryMaxMs) {
        this.outboxRepository = outboxRepository;
        this.listingRepository = listingRepository;
        this.syncJobRepository = syncJobRepository;
        this.objectMapper = objectMapper;
        this.workerId = "outbox-" + UUID.randomUUID();
        this.maxAttempts = Math.max(1, maxAttempts);
        this.retryBaseMs = Math.max(1, retryBaseMs);
        this.retryMaxMs = Math.max(retryBaseMs, retryMaxMs);
    }

    @Transactional
    public List<Long> claimDue(int batch, long leaseSeconds) {
        List<Long> ids = outboxRepository.claimDueEventIds(Math.max(1, batch));
        if (!ids.isEmpty()) {
            outboxRepository.markProcessing(ids, workerId,
                    Instant.now().plusSeconds(Math.max(1, leaseSeconds)));
        }
        return ids;
    }

    @Transactional
    public void processEvent(Long eventId) {
        OutboxEvent event = outboxRepository.findByIdForUpdate(eventId).orElse(null);
        if (event == null || event.getStatus() != OutboxEvent.Status.PROCESSING) {
            return;
        }

        if (!"INVENTORY_CHANGED".equals(event.getEventType())) {
            markPublished(event);
            return;
        }

        long variantId = extractVariantId(event);
        if (variantId <= 0) {
            markDeadLetter(event, "INVENTORY_CHANGED event has no variant_id.");
            return;
        }

        List<ChannelListing> listings = listingRepository.findByVariantId(variantId).stream()
                .sorted(Comparator.comparing(ChannelListing::getId))
                .toList();

        for (ChannelListing candidate : listings) {
            // Lock each listing in ascending id order so concurrent events serialize consistently.
            ChannelListing listing = listingRepository.findByIdForUpdate(candidate.getId()).orElse(null);
            if (listing == null) {
                continue;
            }
            Channel channel = listing.getChannel();
            if (!listing.isActive()
                    || listing.getMappingStatus() != ChannelListing.MappingStatus.VERIFIED
                    || listing.getMappingVerifiedAt() == null
                    || channel == null
                    || channel.getStatus() != Channel.Status.CONNECTED) {
                continue;
            }
            if (syncJobRepository.existsByOutboxEventIdAndListingId(event.getId(), listing.getId())) {
                continue;
            }

            syncJobRepository.supersedeActiveForListing(listing.getId(),
                    "Đã có sự kiện tồn kho mới hơn (event #" + event.getId() + ").");
            SyncJob job = new SyncJob();
            job.setJobKind("INVENTORY");
            job.setOutboxEventId(event.getId());
            job.setListingId(listing.getId());
            job.setChannelId(channel.getId());
            job.setVariantId(variantId);
            job.setTargetQuantity(listing.getAllocatedQuota());
            job.setCoreVersion(event.getAggregateVersion() == null ? 0L : event.getAggregateVersion());
            job.setAllocationRevision(listing.getTargetAllocationRevision());
            job.setStatus(SyncJob.Status.PENDING);
            job.setAttempts(0);
            job.setMaxAttempts(maxAttempts);
            job.setNextAttemptAt(Instant.now());
            syncJobRepository.save(job);
        }

        markPublished(event);
    }

    @Transactional
    public void markFailed(Long eventId, String error) {
        OutboxEvent event = outboxRepository.findByIdForUpdate(eventId).orElse(null);
        if (event == null) {
            return;
        }
        int attempts = event.getRetryCount() + 1;
        event.setRetryCount(attempts);
        event.setLastError(truncate(error, 500));
        event.setLockedAt(null);
        event.setLockedBy(null);
        event.setLeaseUntil(null);
        if (attempts >= maxAttempts) {
            event.setStatus(OutboxEvent.Status.DEAD_LETTER);
        } else {
            event.setStatus(OutboxEvent.Status.PENDING);
            event.setNextAttemptAt(Instant.now().plusMillis(backoffMs(attempts)));
        }
        outboxRepository.save(event);
        log.warn("Outbox event #{} failed (attempt {}): {}", eventId, attempts, error);
    }

    private void markPublished(OutboxEvent event) {
        event.setStatus(OutboxEvent.Status.PUBLISHED);
        event.setPublishedAt(Instant.now());
        event.setLockedAt(null);
        event.setLockedBy(null);
        event.setLeaseUntil(null);
        event.setLastError(null);
        outboxRepository.save(event);
    }

    private void markDeadLetter(OutboxEvent event, String error) {
        event.setStatus(OutboxEvent.Status.DEAD_LETTER);
        event.setLastError(truncate(error, 500));
        event.setLockedAt(null);
        event.setLockedBy(null);
        event.setLeaseUntil(null);
        outboxRepository.save(event);
    }

    private long extractVariantId(OutboxEvent event) {
        try {
            JsonNode root = objectMapper.readTree(event.getPayload());
            JsonNode node = root.path("variant_id");
            if (node.isNumber()) {
                return node.asLong();
            }
            if (node.isTextual()) {
                return Long.parseLong(node.asText());
            }
        } catch (Exception ex) {
            log.debug("Unable to parse outbox payload for event #{}: {}", event.getId(), ex.getMessage());
        }
        try {
            return Long.parseLong(event.getAggregateId());
        } catch (NumberFormatException ex) {
            return -1L;
        }
    }

    private long backoffMs(int attempts) {
        int exponent = Math.min(Math.max(attempts - 1, 0), 20);
        return Math.min(retryBaseMs * (1L << exponent), retryMaxMs);
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }
}
