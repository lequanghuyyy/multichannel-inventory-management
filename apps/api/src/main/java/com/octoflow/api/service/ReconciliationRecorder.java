package com.octoflow.api.service;

import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ChannelSyncEvidence;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.SyncJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Map;

/**
 * Applies a reconciliation observation after the remote read has completed. The target is the
 * listing's allocated quota; a mismatch is recorded as drift and queues a correction job.
 */
@Service
public class ReconciliationRecorder {

    private final ChannelListingRepository listingRepository;
    private final SyncJobRepository jobRepository;
    private final ChannelEvidenceRecorder evidenceRecorder;
    private final SyncEventBroadcaster broadcaster;

    public ReconciliationRecorder(ChannelListingRepository listingRepository,
                                  SyncJobRepository jobRepository,
                                  ChannelEvidenceRecorder evidenceRecorder,
                                  SyncEventBroadcaster broadcaster) {
        this.listingRepository = listingRepository;
        this.jobRepository = jobRepository;
        this.evidenceRecorder = evidenceRecorder;
        this.broadcaster = broadcaster;
    }

    @Transactional
    public ChannelSyncEvidenceResponse applyObservation(Long listingId,
                                                        String adapterName,
                                                        int remoteQuantity,
                                                        String reference) {
        ChannelListing listing = listingRepository.findByIdForUpdate(listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId));

        int target = listing.getAllocatedQuota();
        int remoteBefore = listing.getReportedStock();
        boolean matches = remoteQuantity == target;

        ChannelSyncEvidence evidence = evidenceRecorder.record(listing.getId(),
                null,
                null,
                null,
                "RECONCILE",
                adapterName,
                matches ? "VERIFIED" : "DRIFT",
                target,
                null,
                null,
                remoteQuantity,
                remoteBefore,
                remoteQuantity,
                matches ? null : "RECONCILIATION_DRIFT",
                matches ? null
                        : "Remote quantity " + remoteQuantity + " differs from allocated target " + target + ".",
                reference);

        listing.setReportedStock(remoteQuantity);
        listing.setVerifiedQuantity(remoteQuantity);
        listing.setLastVerifiedAt(Instant.now());
        listing.setSyncStatus(matches ? ChannelListing.SyncStatus.SYNCED : ChannelListing.SyncStatus.OUT_OF_SYNC);
        listing.setLastSyncError(matches ? null
                : "Reconciliation observed " + remoteQuantity + " but target is " + target + ".");
        listingRepository.save(listing);

        if (!matches) {
            jobRepository.supersedeActiveForListing(listing.getId(),
                    "Reconciliation found drift; queued a fresh correction.");
            SyncJob correction = new SyncJob();
            correction.setJobKind("INVENTORY");
            correction.setListingId(listing.getId());
            correction.setChannelId(listing.getChannel().getId());
            correction.setVariantId(listing.getVariant().getId());
            correction.setTargetQuantity(target);
            correction.setCoreVersion(0L);
            correction.setAllocationRevision(listing.getTargetAllocationRevision());
            correction.setStatus(SyncJob.Status.PENDING);
            correction.setAttempts(0);
            correction.setNextAttemptAt(Instant.now());
            jobRepository.save(correction);
        }

        broadcaster.broadcastAfterCommit("RECONCILIATION_OBSERVED", Map.of(
                "listing_id", listing.getId(),
                "status", evidence.getStatus(),
                "target_quantity", target,
                "verified_quantity", remoteQuantity,
                "refresh_required", true));
        return toResponse(evidence);
    }

    private ChannelSyncEvidenceResponse toResponse(ChannelSyncEvidence evidence) {
        return new ChannelSyncEvidenceResponse(
                evidence.getId(),
                evidence.getListingId(),
                evidence.getJobId(),
                evidence.getPlanId(),
                evidence.getPlanItemId(),
                evidence.getKind(),
                evidence.getAdapter(),
                evidence.getStatus(),
                evidence.getTargetQuantity(),
                evidence.getSentQuantity(),
                evidence.getAcknowledgedQuantity(),
                evidence.getVerifiedQuantity(),
                evidence.getRemoteBefore(),
                evidence.getRemoteAfter(),
                evidence.getErrorCode(),
                evidence.getErrorMessage(),
                evidence.getIdempotencyReference(),
                evidence.getObservedAt());
    }
}
