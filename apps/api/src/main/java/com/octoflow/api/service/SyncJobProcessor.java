package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.SyncJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Prepares and records one sync job at a time. Remote I/O is performed by the supervisor
 * between {@link #prepare(Long)} and {@link #completeSuccess}/{@link #completeFailure}.
 */
@Service
public class SyncJobProcessor {

    private static final Logger log = LoggerFactory.getLogger(SyncJobProcessor.class);

    private final SyncJobRepository jobRepository;
    private final ChannelListingRepository listingRepository;
    private final ChannelDeliveryEligibility eligibility;
    private final ChannelAdapterRouter adapterRouter;
    private final ChannelEvidenceRecorder evidenceRecorder;
    private final SyncEventBroadcaster broadcaster;
    private final String workerId;
    private final int maxAttempts;
    private final long retryBaseMs;
    private final long retryMaxMs;

    public SyncJobProcessor(SyncJobRepository jobRepository,
                            ChannelListingRepository listingRepository,
                            ChannelDeliveryEligibility eligibility,
                            ChannelAdapterRouter adapterRouter,
                            ChannelEvidenceRecorder evidenceRecorder,
                            SyncEventBroadcaster broadcaster,
                            @Value("${app.sync.max-attempts:8}") int maxAttempts,
                            @Value("${app.sync.retry-base-ms:500}") long retryBaseMs,
                            @Value("${app.sync.retry-max-ms:60000}") long retryMaxMs) {
        this.jobRepository = jobRepository;
        this.listingRepository = listingRepository;
        this.eligibility = eligibility;
        this.adapterRouter = adapterRouter;
        this.evidenceRecorder = evidenceRecorder;
        this.broadcaster = broadcaster;
        this.workerId = "sync-job-" + UUID.randomUUID();
        this.maxAttempts = Math.max(1, maxAttempts);
        this.retryBaseMs = Math.max(1, retryBaseMs);
        this.retryMaxMs = Math.max(retryBaseMs, retryMaxMs);
    }

    public record SyncJobSnapshot(Long jobId,
                                  Long listingId,
                                  Long channelId,
                                  Long variantId,
                                  int targetQuantity,
                                  long allocationRevision,
                                  int attempt,
                                  String adapterName,
                                  String idempotencyReference,
                                  Channel channel,
                                  ChannelListing listing) {}

    @Transactional
    public List<Long> claimDue(int batch, long leaseSeconds) {
        List<Long> ids = jobRepository.claimDueJobIds(Math.max(1, batch));
        if (!ids.isEmpty()) {
            jobRepository.markProcessing(ids, workerId, Instant.now().plusSeconds(Math.max(1, leaseSeconds)));
        }
        return ids;
    }

    @Transactional
    public SyncJobSnapshot prepare(Long jobId) {
        SyncJob job = jobRepository.findByIdForUpdate(jobId).orElse(null);
        if (job == null || job.getStatus() != SyncJob.Status.PROCESSING) {
            return null;
        }
        ChannelListing listing = listingRepository.findByIdForUpdate(job.getListingId()).orElse(null);
        if (listing == null) {
            deadLetter(job, "Listing no longer exists.");
            return null;
        }
        Channel channel = listing.getChannel();
        if (channel == null) {
            block(job, listing, "Channel no longer exists.", "CHANNEL_NOT_FOUND");
            return null;
        }

        if (listing.getTargetAllocationRevision() > job.getAllocationRevision()
                || listing.getAllocatedQuota() != job.getTargetQuantity()) {
            supersedeAndReplace(job, listing, "Target changed before delivery.");
            return null;
        }

        if (job.getAttempts() > job.getMaxAttempts()) {
            deadLetter(job, "Maximum attempts exceeded before delivery.");
            return null;
        }

        List<String> issues = eligibility.issues(listing);
        if (!issues.isEmpty()) {
            block(job, listing, String.join(" ", issues), "PREFLIGHT");
            return null;
        }

        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.require(channel);
        } catch (ChannelAdapterException ex) {
            block(job, listing, ex.getMessage(), ex.getKind().name());
            return null;
        }

        String reference = job.getIdempotencyReference();
        if (reference == null || reference.isBlank()) {
            reference = "sync-job:" + job.getId() + ":r" + job.getAllocationRevision()
                    + ":t" + job.getTargetQuantity();
            job.setIdempotencyReference(reference);
            jobRepository.save(job);
        }

        return new SyncJobSnapshot(
                job.getId(),
                listing.getId(),
                channel.getId(),
                job.getVariantId(),
                job.getTargetQuantity(),
                job.getAllocationRevision(),
                job.getAttempts(),
                adapter.name(),
                reference,
                snapshotChannel(channel),
                snapshotListing(listing, channel));
    }

    @Transactional
    public void completeSuccess(SyncJobSnapshot snapshot, int remoteBefore,
                                int sent, int acknowledged, int verified) {
        SyncJob job = jobRepository.findByIdForUpdate(snapshot.jobId()).orElse(null);
        if (job == null || job.getStatus() != SyncJob.Status.PROCESSING) {
            return;
        }
        ChannelListing listing = listingRepository.findByIdForUpdate(snapshot.listingId()).orElse(null);
        if (listing == null
                || listing.getTargetAllocationRevision() > job.getAllocationRevision()
                || listing.getAllocatedQuota() != job.getTargetQuantity()) {
            supersedeAndReplace(job, listing, "Target changed while the adapter was running.");
            return;
        }

        boolean matches = verified == job.getTargetQuantity();
        job.setSentQuantity(sent);
        job.setAcknowledgedQuantity(acknowledged);
        job.setVerifiedQuantity(verified);
        job.setRemoteBefore(remoteBefore);
        job.setRemoteAfter(verified);
        job.setAdapter(snapshot.adapterName());
        job.setIdempotencyReference(snapshot.idempotencyReference());
        job.setStatus(matches ? SyncJob.Status.VERIFIED : SyncJob.Status.DRIFT);
        job.setLastError(matches ? null
                : "Read-back quantity " + verified + " does not match target " + job.getTargetQuantity() + ".");
        job.setVerifiedAt(Instant.now());
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);

        listing.setSentQuantity(sent);
        listing.setAcknowledgedQuantity(acknowledged);
        listing.setVerifiedQuantity(verified);
        listing.setReportedStock(verified);
        listing.setLastVerifiedAt(job.getVerifiedAt());
        listing.setSyncStatus(matches ? ChannelListing.SyncStatus.SYNCED : ChannelListing.SyncStatus.OUT_OF_SYNC);
        listing.setLastSyncError(matches ? null : job.getLastError());
        listingRepository.save(listing);

        evidenceRecorder.record(listing.getId(),
                job.getId(),
                null,
                null,
                "INVENTORY_SYNC",
                snapshot.adapterName(),
                matches ? "VERIFIED" : "DRIFT",
                job.getTargetQuantity(),
                sent,
                acknowledged,
                verified,
                remoteBefore,
                verified,
                matches ? null : "READ_BACK_MISMATCH",
                job.getLastError(),
                snapshot.idempotencyReference());

        broadcaster.broadcastAfterCommit("SYNC_JOB_UPDATED", Map.of(
                "job_id", job.getId(),
                "listing_id", listing.getId(),
                "status", job.getStatus().name(),
                "verified", matches,
                "refresh_required", true));
    }

    @Transactional
    public void completeFailure(Long jobId, ChannelAdapterException.Kind kind, String message) {
        SyncJob job = jobRepository.findByIdForUpdate(jobId).orElse(null);
        if (job == null || job.getStatus() != SyncJob.Status.PROCESSING) {
            return;
        }
        ChannelListing listing = listingRepository.findByIdForUpdate(job.getListingId()).orElse(null);
        Channel channel = listing != null ? listing.getChannel() : null;
        String adapterName = channel != null ? "simulator" : "unknown";

        String safeMessage = truncate(message, 500);
        job.setLastError(safeMessage);
        job.setAdapter(adapterName);
        boolean blocked = kind == ChannelAdapterException.Kind.UNAVAILABLE;
        boolean exhausted = job.getAttempts() >= job.getMaxAttempts();
        if (blocked) {
            job.setStatus(SyncJob.Status.BLOCKED);
        } else if (exhausted) {
            job.setStatus(kind == ChannelAdapterException.Kind.TIMEOUT
                    ? SyncJob.Status.UNCONFIRMED : SyncJob.Status.DEAD_LETTER);
        } else {
            job.setStatus(SyncJob.Status.RETRY_PENDING);
            job.setNextAttemptAt(Instant.now().plusMillis(backoffMs(job.getAttempts())));
        }
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);

        if (listing != null) {
            listing.setLastSyncError(safeMessage);
            if (job.getStatus() != SyncJob.Status.RETRY_PENDING) {
                listing.setSyncStatus(ChannelListing.SyncStatus.ERROR);
            }
            listingRepository.save(listing);
        }

        String evidenceStatus = kind == ChannelAdapterException.Kind.TIMEOUT ? "UNCONFIRMED"
                : kind == ChannelAdapterException.Kind.REFUSED ? "REFUSED" : "ERROR";
        evidenceRecorder.record(job.getListingId(),
                job.getId(),
                null,
                null,
                "INVENTORY_SYNC",
                adapterName,
                evidenceStatus,
                job.getTargetQuantity(),
                job.getSentQuantity(),
                job.getAcknowledgedQuantity(),
                job.getVerifiedQuantity(),
                job.getRemoteBefore(),
                job.getRemoteAfter(),
                kind.name(),
                safeMessage,
                job.getIdempotencyReference());

        broadcaster.broadcastAfterCommit("SYNC_JOB_UPDATED", Map.of(
                "job_id", job.getId(),
                "listing_id", job.getListingId(),
                "status", job.getStatus().name(),
                "uncertain", kind == ChannelAdapterException.Kind.TIMEOUT,
                "refresh_required", true));
    }

    @Transactional
    public void releaseLease(Long jobId) {
        jobRepository.releaseLease(jobId);
    }

    @Transactional
    public void supersede(Long jobId, String reason) {
        SyncJob job = jobRepository.findByIdForUpdate(jobId).orElse(null);
        if (job == null) {
            return;
        }
        job.setStatus(SyncJob.Status.SUPERSEDED);
        job.setLastError(truncate(reason, 500));
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);
    }

    private void supersedeAndReplace(SyncJob job, ChannelListing listing, String reason) {
        job.setStatus(SyncJob.Status.SUPERSEDED);
        job.setLastError(truncate(reason, 500));
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);
        jobRepository.flush();

        if (listing == null) {
            return;
        }
        boolean activeExists = jobRepository.existsByListingIdAndStatusIn(listing.getId(),
                List.of(SyncJob.Status.PENDING, SyncJob.Status.PROCESSING, SyncJob.Status.RETRY_PENDING));
        if (activeExists) {
            return;
        }
        SyncJob replacement = new SyncJob();
        replacement.setJobKind("INVENTORY");
        replacement.setListingId(listing.getId());
        replacement.setChannelId(listing.getChannel().getId());
        replacement.setVariantId(listing.getVariant().getId());
        replacement.setTargetQuantity(listing.getAllocatedQuota());
        replacement.setCoreVersion(job.getCoreVersion());
        replacement.setAllocationRevision(listing.getTargetAllocationRevision());
        replacement.setStatus(SyncJob.Status.PENDING);
        replacement.setAttempts(0);
        replacement.setMaxAttempts(job.getMaxAttempts());
        replacement.setNextAttemptAt(Instant.now());
        jobRepository.save(replacement);
        log.info("Superseded sync job #{} and queued replacement #{} for listing #{}",
                job.getId(), replacement.getId(), listing.getId());
    }

    private void block(SyncJob job, ChannelListing listing, String message, String errorCode) {
        job.setStatus(SyncJob.Status.BLOCKED);
        job.setLastError(truncate(message, 500));
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);
        if (listing != null) {
            listing.setLastSyncError(truncate(message, 500));
            listing.setSyncStatus(ChannelListing.SyncStatus.ERROR);
            listingRepository.save(listing);
        }
        evidenceRecorder.record(job.getListingId(), job.getId(), null, null, "INVENTORY_SYNC",
                "none", "ERROR", job.getTargetQuantity(), null, null, null, null, null,
                errorCode, message, job.getIdempotencyReference());
        broadcaster.broadcastAfterCommit("SYNC_JOB_UPDATED", Map.of(
                "job_id", job.getId(),
                "listing_id", job.getListingId(),
                "status", job.getStatus().name(),
                "refresh_required", true));
    }

    private void deadLetter(SyncJob job, String message) {
        job.setStatus(SyncJob.Status.DEAD_LETTER);
        job.setLastError(truncate(message, 500));
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);
        evidenceRecorder.record(job.getListingId(), job.getId(), null, null, "INVENTORY_SYNC",
                "none", "ERROR", job.getTargetQuantity(), null, null, null, null, null,
                "DEAD_LETTER", message, job.getIdempotencyReference());
        broadcaster.broadcastAfterCommit("SYNC_JOB_UPDATED", Map.of(
                "job_id", job.getId(),
                "listing_id", job.getListingId(),
                "status", job.getStatus().name(),
                "refresh_required", true));
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

    private Channel snapshotChannel(Channel channel) {
        Channel copy = new Channel();
        copy.setId(channel.getId());
        copy.setCode(channel.getCode());
        copy.setName(channel.getName());
        copy.setEnvironment(channel.getEnvironment());
        copy.setStatus(channel.getStatus());
        return copy;
    }

    private ChannelListing snapshotListing(ChannelListing listing, Channel channel) {
        ChannelListing copy = new ChannelListing();
        copy.setId(listing.getId());
        copy.setExternalListingId(listing.getExternalListingId());
        copy.setExternalSku(listing.getExternalSku());
        copy.setExternalVariantId(listing.getExternalVariantId());
        copy.setChannel(snapshotChannel(channel));
        ProductVariant variant = new ProductVariant();
        variant.setId(listing.getVariant().getId());
        copy.setVariant(variant);
        copy.setAllocatedQuota(listing.getAllocatedQuota());
        copy.setMappingStatus(listing.getMappingStatus());
        return copy;
    }
}
