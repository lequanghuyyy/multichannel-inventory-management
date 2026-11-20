package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.entity.AllocationPlan;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.repository.AllocationPlanItemRepository;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.SyncJobRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;

/**
 * Prepares and records one sync job at a time. Remote I/O is performed by the supervisor
 * between {@link #prepare(JobClaim)} and {@link #completeSuccess}/{@link #completeFailure}.
 * Every claim carries a fencing generation, so a worker whose lease expired can never
 * complete a job that a newer claim owns.
 */
@Service
public class SyncJobProcessor {

    private static final Logger log = LoggerFactory.getLogger(SyncJobProcessor.class);

    private final SyncJobRepository jobRepository;
    private final ChannelListingRepository listingRepository;
    private final AllocationPlanItemRepository allocationPlanItemRepository;
    private final ChannelDeliveryEligibility eligibility;
    private final ChannelAdapterRouter adapterRouter;
    private final ChannelEvidenceRecorder evidenceRecorder;
    private final StockBaselineService stockBaselineService;
    private final SyncEventBroadcaster broadcaster;
    private final String workerId;
    private final int maxAttempts;
    private final long retryBaseMs;
    private final long retryMaxMs;

    public SyncJobProcessor(SyncJobRepository jobRepository,
                            ChannelListingRepository listingRepository,
                            AllocationPlanItemRepository allocationPlanItemRepository,
                            ChannelDeliveryEligibility eligibility,
                            ChannelAdapterRouter adapterRouter,
                            ChannelEvidenceRecorder evidenceRecorder,
                            StockBaselineService stockBaselineService,
                            SyncEventBroadcaster broadcaster,
                            @Value("${app.sync.max-attempts:8}") int maxAttempts,
                            @Value("${app.sync.retry-base-ms:500}") long retryBaseMs,
                            @Value("${app.sync.retry-max-ms:60000}") long retryMaxMs) {
        this.jobRepository = jobRepository;
        this.listingRepository = listingRepository;
        this.allocationPlanItemRepository = allocationPlanItemRepository;
        this.eligibility = eligibility;
        this.adapterRouter = adapterRouter;
        this.evidenceRecorder = evidenceRecorder;
        this.stockBaselineService = stockBaselineService;
        this.broadcaster = broadcaster;
        this.workerId = "sync-job-" + UUID.randomUUID();
        this.maxAttempts = Math.max(1, maxAttempts);
        this.retryBaseMs = Math.max(1, retryBaseMs);
        this.retryMaxMs = Math.max(retryBaseMs, retryMaxMs);
    }

    public record JobClaim(Long jobId, long claimGeneration) {}

    public record SyncJobSnapshot(Long jobId,
                                  long claimGeneration,
                                  Long listingId,
                                  Long channelId,
                                  Long variantId,
                                  int targetQuantity,
                                  long allocationRevision,
                                  long mappingVersion,
                                  String externalListingId,
                                  String externalVariantId,
                                  String externalSku,
                                  int attempt,
                                  String adapterName,
                                  String idempotencyReference,
                                  Integer baselineQuantity,
                                  Channel channel,
                                  ChannelListing listing) {}

    @Transactional
    public List<JobClaim> claimDue(int batch, long leaseSeconds) {
        List<Long> ids = jobRepository.claimDueJobIds(Math.max(1, batch));
        if (ids.isEmpty()) {
            return List.of();
        }
        Instant leaseUntil = Instant.now().plusSeconds(Math.max(1, leaseSeconds));
        List<JobClaim> claims = new ArrayList<>();
        for (Long id : ids) {
            if (jobRepository.markProcessing(id, workerId, leaseUntil) == 1) {
                Long generation = jobRepository.findClaimGeneration(id);
                if (generation != null) {
                    claims.add(new JobClaim(id, generation));
                }
            }
        }
        return claims;
    }

    @Transactional(readOnly = true)
    public Long listingIdFor(Long jobId) {
        return jobRepository.findListingIdById(jobId);
    }

    /**
     * Must run while the listing advisory lock is held. Re-validates ownership, target,
     * allocation revision and mapping identity immediately before any remote I/O.
     */
    @Transactional
    public SyncJobSnapshot prepare(JobClaim claim) {
        Long listingId = jobRepository.findListingIdById(claim.jobId());
        ChannelListing listing = listingId == null ? null
                : listingRepository.findByIdForUpdate(listingId).orElse(null);
        SyncJob job = jobRepository.findByIdForUpdate(claim.jobId()).orElse(null);
        if (!ownedAndProcessing(job, claim)) {
            return null;
        }
        if (listing == null) {
            deadLetter(job, "Listing no longer exists.");
            return null;
        }
        Channel channel = listing.getChannel();
        if (channel == null) {
            block(job, listing, "Channel no longer exists.", "CHANNEL_NOT_FOUND");
            return null;
        }

        if (targetChanged(job, listing)) {
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
        if (currentTargetBlocked(listing)) {
            block(job, listing,
                    "The allocation for this target is blocked; resolve it before syncing inventory.",
                    "ALLOCATION_BLOCKED");
            return null;
        }

        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.require(channel);
        } catch (ChannelAdapterException ex) {
            block(job, listing, ex.getMessage(), ex.reasonCodeOrKind());
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
                claim.claimGeneration(),
                listing.getId(),
                channel.getId(),
                job.getVariantId(),
                job.getTargetQuantity(),
                job.getAllocationRevision(),
                listing.getMappingVersion(),
                listing.getExternalListingId(),
                listing.getExternalVariantId(),
                listing.getExternalSku(),
                job.getAttempts(),
                adapter.name(),
                reference,
                stockBaselineService.baselineFor(listing),
                snapshotChannel(channel),
                snapshotListing(listing, channel));
    }

    @Transactional
    public void completeSuccess(SyncJobSnapshot snapshot, int remoteBefore,
                                int sent, Integer acknowledged, int verified) {
        ChannelListing listing = listingRepository.findByIdForUpdate(snapshot.listingId()).orElse(null);
        SyncJob job = jobRepository.findByIdForUpdate(snapshot.jobId()).orElse(null);
        if (!ownedAndProcessing(job, claimOf(snapshot))) {
            return;
        }
        if (listing == null) {
            deadLetter(job, "Listing no longer exists.");
            return;
        }
        String staleReason = staleReason(snapshot, job, listing);
        if (staleReason != null) {
            // The remote write already happened, but it belongs to a superseded target or
            // mapping. Never claim VERIFIED for the newer revision; ask reconciliation to
            // read the channel back and queue a correction when needed.
            evidenceRecorder.record(snapshot.listingId(), snapshot.jobId(), null, null,
                    "INVENTORY_SYNC", snapshot.adapterName(), "UNCONFIRMED",
                    snapshot.targetQuantity(), sent, acknowledged, verified, remoteBefore, verified,
                    "STALE_AFTER_WRITE", staleReason, snapshot.idempotencyReference());
            supersedeAndReplace(job, listing, staleReason);
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

    /**
     * The remote quantity no longer matches the quantity OctoFlow last verified. The target was
     * therefore not sent: publishing it would overwrite an external stock change (for example a
     * sale WooCommerce has not reported yet). The job stays in DRIFT until reconciliation proves
     * whether the store already holds the target.
     */
    @Transactional
    public void completePreWriteDrift(SyncJobSnapshot snapshot, int observedQuantity, int baselineQuantity) {
        ChannelListing listing = listingRepository.findByIdForUpdate(snapshot.listingId()).orElse(null);
        SyncJob job = jobRepository.findByIdForUpdate(snapshot.jobId()).orElse(null);
        if (!ownedAndProcessing(job, claimOf(snapshot))) {
            return;
        }
        String message = "Remote stock " + observedQuantity
                + " differs from the last verified stock " + baselineQuantity
                + "; the write was blocked and requires reconciliation.";
        job.setStatus(SyncJob.Status.DRIFT);
        job.setLastError(truncate(message, 500));
        job.setAdapter(snapshot.adapterName());
        job.setRemoteBefore(observedQuantity);
        job.setRemoteAfter(observedQuantity);
        job.setVerifiedQuantity(observedQuantity);
        job.setVerifiedAt(Instant.now());
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);

        if (listing != null) {
            listing.setReportedStock(observedQuantity);
            listing.setSyncStatus(ChannelListing.SyncStatus.OUT_OF_SYNC);
            listing.setLastSyncError(truncate(message, 500));
            listingRepository.save(listing);
        }

        evidenceRecorder.record(snapshot.listingId(), snapshot.jobId(), null, null,
                "INVENTORY_SYNC", snapshot.adapterName(), "DRIFT",
                snapshot.targetQuantity(), null, null, observedQuantity,
                observedQuantity, observedQuantity,
                "UNEXPECTED_REMOTE_STOCK", message, snapshot.idempotencyReference());

        broadcaster.broadcastAfterCommit("SYNC_JOB_UPDATED", Map.of(
                "job_id", job.getId(),
                "listing_id", job.getListingId(),
                "status", job.getStatus().name(),
                "uncertain", false,
                "refresh_required", true));
    }

    @Transactional
    public void completeFailure(SyncJobSnapshot snapshot, ChannelAdapterException.Kind kind, String message) {
        completeFailure(snapshot, kind, kind.name(), message);
    }

    @Transactional
    public void completeFailure(SyncJobSnapshot snapshot, ChannelAdapterException.Kind kind,
                                String reasonCode, String message) {
        ChannelListing listing = listingRepository.findByIdForUpdate(snapshot.listingId()).orElse(null);
        SyncJob job = jobRepository.findByIdForUpdate(snapshot.jobId()).orElse(null);
        if (!ownedAndProcessing(job, claimOf(snapshot))) {
            return;
        }
        fail(job, listing, kind, reasonCode, message, snapshot.adapterName());
    }

    @Transactional
    public void completeFailure(JobClaim claim, ChannelAdapterException.Kind kind, String message) {
        completeFailure(claim, kind, kind.name(), message);
    }

    @Transactional
    public void completeFailure(JobClaim claim, ChannelAdapterException.Kind kind,
                                String reasonCode, String message) {
        Long listingId = jobRepository.findListingIdById(claim.jobId());
        ChannelListing listing = listingId == null ? null
                : listingRepository.findByIdForUpdate(listingId).orElse(null);
        SyncJob job = jobRepository.findByIdForUpdate(claim.jobId()).orElse(null);
        if (!ownedAndProcessing(job, claim)) {
            return;
        }
        fail(job, listing, kind, reasonCode, message,
                job.getAdapter() == null ? "unknown" : job.getAdapter());
    }

    @Transactional
    public void releaseLease(JobClaim claim) {
        jobRepository.releaseLease(claim.jobId(), workerId, claim.claimGeneration());
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

    private void fail(SyncJob job, ChannelListing listing,
                      ChannelAdapterException.Kind kind, String reasonCode,
                      String message, String adapterName) {
        String safeMessage = truncate(message, 500);
        String errorCode = reasonCode == null || reasonCode.isBlank() ? kind.name() : reasonCode;
        job.setLastError(safeMessage);
        job.setAdapter(adapterName);
        boolean blocked = kind == ChannelAdapterException.Kind.UNAVAILABLE;
        boolean uncertain = kind == ChannelAdapterException.Kind.TIMEOUT;
        boolean exhausted = job.getAttempts() >= job.getMaxAttempts();
        if (blocked) {
            job.setStatus(SyncJob.Status.BLOCKED);
        } else if (uncertain) {
            // A timeout may or may not have applied remotely. Never retry blindly; reconciliation
            // reads the channel back and resolves or supersedes this job.
            job.setStatus(SyncJob.Status.UNCONFIRMED);
        } else if (exhausted) {
            job.setStatus(SyncJob.Status.DEAD_LETTER);
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

        String evidenceStatus = uncertain ? "UNCONFIRMED"
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
                errorCode,
                safeMessage,
                job.getIdempotencyReference());

        broadcaster.broadcastAfterCommit("SYNC_JOB_UPDATED", Map.of(
                "job_id", job.getId(),
                "listing_id", job.getListingId(),
                "status", job.getStatus().name(),
                "uncertain", uncertain,
                "refresh_required", true));
    }

    private void supersedeAndReplace(SyncJob job, ChannelListing listing, String reason) {
        job.setStatus(SyncJob.Status.SUPERSEDED);
        job.setLastError(truncate(reason, 500));
        job.setLeaseOwner(null);
        job.setLeaseUntil(null);
        jobRepository.save(job);
        jobRepository.flush();

        if (listing == null
                || !listing.isActive()
                || listing.getMappingStatus() != ChannelListing.MappingStatus.VERIFIED
                || listing.getMappingVerifiedAt() == null) {
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

    private boolean ownedAndProcessing(SyncJob job, JobClaim claim) {
        return job != null
                && job.getStatus() == SyncJob.Status.PROCESSING
                && job.getClaimGeneration() == claim.claimGeneration()
                && workerId.equals(job.getLeaseOwner());
    }

    private JobClaim claimOf(SyncJobSnapshot snapshot) {
        return new JobClaim(snapshot.jobId(), snapshot.claimGeneration());
    }

    private boolean targetChanged(SyncJob job, ChannelListing listing) {
        return listing.getTargetAllocationRevision() > job.getAllocationRevision()
                || listing.getAllocatedQuota() != job.getTargetQuantity();
    }

    private boolean currentTargetBlocked(ChannelListing listing) {
        return allocationPlanItemRepository.existsForListingAtRevision(listing.getId(),
                listing.getTargetAllocationRevision(), AllocationPlan.Status.BLOCKED);
    }

    private String staleReason(SyncJobSnapshot snapshot, SyncJob job, ChannelListing listing) {
        if (targetChanged(job, listing)) {
            return "Target changed while the adapter was running.";
        }
        if (listing.getMappingVersion() != snapshot.mappingVersion()
                || !Objects.equals(listing.getExternalListingId(), snapshot.externalListingId())
                || !Objects.equals(listing.getExternalVariantId(), snapshot.externalVariantId())
                || !Objects.equals(listing.getExternalSku(), snapshot.externalSku())) {
            return "Mapping identity changed while the adapter was running.";
        }
        return null;
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
        // The adapter runs outside this transaction, so it must see the same proof of connection
        // that eligibility saw. Without these fields every real-connector job would be blocked.
        copy.setConnectorName(channel.getConnectorName());
        copy.setConnectorVersion(channel.getConnectorVersion());
        copy.setConnectionVerifiedAt(channel.getConnectionVerifiedAt());
        copy.setConnectionProductsRead(channel.isConnectionProductsRead());
        copy.setConnectionAuthMode(channel.getConnectionAuthMode());
        copy.setConnectionTargetFingerprint(channel.getConnectionTargetFingerprint());
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
