package com.octoflow.api.service;

import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.entity.AllocationPlan;
import com.octoflow.api.entity.AllocationPlanItem;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ChannelSyncEvidence;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.repository.AllocationPlanItemRepository;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.SyncJobRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/**
 * Applies a reconciliation observation after the remote read has completed. The target is the
 * listing's allocated quota; a mismatch is always recorded as drift with evidence.
 *
 * Only the simulator auto-queues a correction job. A real connector cannot explain an external
 * stock change yet (order ingestion does not exist in this phase), so silently overwriting the
 * store with the local quota would destroy inventory the operator has not accounted for. Live
 * channels therefore surface drift for review and leave the listing OUT_OF_SYNC.
 * A matching read also resolves an earlier UNCONFIRMED job instead of retrying it blindly.
 */
@Service
public class ReconciliationRecorder {

    private final ChannelListingRepository listingRepository;
    private final SyncJobRepository jobRepository;
    private final AllocationPlanItemRepository allocationPlanItemRepository;
    private final AllocationExecutionProcessor allocationExecutionProcessor;
    private final ChannelEvidenceRecorder evidenceRecorder;
    private final SyncEventBroadcaster broadcaster;

    public ReconciliationRecorder(ChannelListingRepository listingRepository,
                                  SyncJobRepository jobRepository,
                                  AllocationPlanItemRepository allocationPlanItemRepository,
                                  AllocationExecutionProcessor allocationExecutionProcessor,
                                  ChannelEvidenceRecorder evidenceRecorder,
                                  SyncEventBroadcaster broadcaster) {
        this.listingRepository = listingRepository;
        this.jobRepository = jobRepository;
        this.allocationPlanItemRepository = allocationPlanItemRepository;
        this.allocationExecutionProcessor = allocationExecutionProcessor;
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

        int remoteBefore = listing.getReportedStock();
        if (listing.isOrderReconciliationRequired()) {
            String message = "Đơn WooCommerce cần đối soát; số tồn trùng quota chưa chứng minh nguyên nhân.";
            ChannelSyncEvidence evidence = evidenceRecorder.record(listing.getId(), null, null, null,
                    "RECONCILE", adapterName, "DRIFT", listing.getAllocatedQuota(), null, null,
                    remoteQuantity, remoteBefore, remoteQuantity, "ORDER_RECONCILIATION_REQUIRED", message, reference);
            listing.setReportedStock(remoteQuantity);
            listing.setSyncStatus(ChannelListing.SyncStatus.OUT_OF_SYNC);
            listing.setLastSyncError(message);
            listingRepository.save(listing);
            return toResponse(evidence);
        }
        // Adopt an uncertain allocation step only when the store already holds its intended
        // quantity. This runs before the observation target is read, so a recovered step makes
        // the reconciliation result reflect the newly verified quota instead of the old one.
        allocationExecutionProcessor.recoverBlockedItemsFromReconciliation(
                listing, remoteQuantity, adapterName, reference);
        int target = listing.getAllocatedQuota();
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

        resolveUncertainJobs(listing, target, remoteQuantity, remoteBefore, adapterName, reference);

        if (!matches && autoCorrectionAllowed(adapterName)
                && !allocationInFlight(listing.getId()) && !currentTargetBlocked(listing)) {
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

    private void resolveUncertainJobs(ChannelListing listing, int target, int remoteQuantity,
                                      int remoteBefore, String adapterName, String reference) {
        List<SyncJob> unresolved = jobRepository.findByListingIdAndStatusIn(listing.getId(),
                List.of(SyncJob.Status.UNCONFIRMED, SyncJob.Status.DRIFT));
        for (SyncJob job : unresolved) {
            boolean stillCurrent = job.getTargetQuantity() == target
                    && job.getAllocationRevision() == listing.getTargetAllocationRevision();
            if (stillCurrent && remoteQuantity == target) {
                job.setStatus(SyncJob.Status.VERIFIED);
                job.setVerifiedQuantity(remoteQuantity);
                job.setRemoteBefore(remoteBefore);
                job.setRemoteAfter(remoteQuantity);
                job.setVerifiedAt(Instant.now());
                job.setLastError(null);
                job.setLeaseOwner(null);
                job.setLeaseUntil(null);
                jobRepository.save(job);
                evidenceRecorder.record(listing.getId(), job.getId(), null, null, "INVENTORY_SYNC",
                        adapterName, "VERIFIED", target, null, null, remoteQuantity,
                        remoteBefore, remoteQuantity, null,
                        "Resolved by reconciliation read-back.", reference);
            } else {
                job.setStatus(SyncJob.Status.SUPERSEDED);
                job.setLastError("Reconciliation observed " + remoteQuantity
                        + " for a different target; job superseded.");
                job.setLeaseOwner(null);
                job.setLeaseUntil(null);
                jobRepository.save(job);
            }
        }
    }

    /**
     * The simulator has no external stock movement, so a mismatch can only be a delivery defect
     * and auto-correction is the intended Phase 04 behaviour. Real channels wait for an operator.
     */
    private boolean autoCorrectionAllowed(String adapterName) {
        return "simulator".equalsIgnoreCase(adapterName);
    }

    private boolean allocationInFlight(Long listingId) {
        return allocationPlanItemRepository.existsActiveForListing(listingId,
                AllocationPlan.Status.APPLYING,
                List.of(AllocationPlanItem.Status.PENDING, AllocationPlanItem.Status.RETRY_PENDING));
    }

    /**
     * A blocked allocation leaves the listing target unconfirmed. Auto-correcting the remote to
     * that target would publish a quota the operator never successfully delivered (for example,
     * writing 0 after an 8-unit increase was blocked).
     */
    private boolean currentTargetBlocked(ChannelListing listing) {
        return allocationPlanItemRepository.existsForListingAtRevision(listing.getId(),
                listing.getTargetAllocationRevision(), AllocationPlan.Status.BLOCKED);
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
