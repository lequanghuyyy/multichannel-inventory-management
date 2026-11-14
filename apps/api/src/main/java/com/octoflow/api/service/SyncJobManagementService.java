package com.octoflow.api.service;

import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.ListingSyncStatusResponse;
import com.octoflow.api.dto.response.SyncJobResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.ChannelSyncEvidence;
import com.octoflow.api.entity.ProductVariant;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.exception.BusinessRuleException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelSyncEvidenceRepository;
import com.octoflow.api.repository.SyncJobRepository;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Map;

@Service
public class SyncJobManagementService {

    private final SyncJobRepository jobRepository;
    private final ChannelListingRepository listingRepository;
    private final ChannelSyncEvidenceRepository evidenceRepository;
    private final SyncEventBroadcaster broadcaster;

    public SyncJobManagementService(SyncJobRepository jobRepository,
                                    ChannelListingRepository listingRepository,
                                    ChannelSyncEvidenceRepository evidenceRepository,
                                    SyncEventBroadcaster broadcaster) {
        this.jobRepository = jobRepository;
        this.listingRepository = listingRepository;
        this.evidenceRepository = evidenceRepository;
        this.broadcaster = broadcaster;
    }

    @Transactional(readOnly = true)
    public SyncJobResponse get(Long jobId) {
        SyncJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SYNC_JOB_NOT_FOUND,
                        "Không tìm thấy sync job #" + jobId));
        return toJobResponse(job);
    }

    @Transactional(readOnly = true)
    public List<SyncJobResponse> list(Long listingId, SyncJob.Status status, int limit) {
        int pageSize = limit <= 0 ? 50 : Math.min(limit, 200);
        PageRequest page = PageRequest.of(0, pageSize);
        List<SyncJob> jobs;
        if (listingId != null) {
            jobs = jobRepository.findByListingIdOrderByCreatedAtDescIdDesc(listingId, page);
        } else if (status != null) {
            jobs = jobRepository.findByStatusOrderByCreatedAtDescIdDesc(status, page);
        } else {
            jobs = jobRepository.findAllByOrderByCreatedAtDescIdDesc(page);
        }
        return jobs.stream().map(this::toJobResponse).toList();
    }

    @Transactional
    public SyncJobResponse retry(Long jobId) {
        SyncJob job = jobRepository.findById(jobId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.SYNC_JOB_NOT_FOUND,
                        "Không tìm thấy sync job #" + jobId));
        if (job.getStatus() == SyncJob.Status.SUPERSEDED) {
            throw new BusinessRuleException(ErrorCode.SYNC_RETRY_NOT_ALLOWED,
                    "Sync job #" + jobId + " đã bị thay thế bởi một target mới và không được thử lại.");
        }
        if (job.getStatus() == SyncJob.Status.UNCONFIRMED) {
            throw new BusinessRuleException(ErrorCode.SYNC_RETRY_NOT_ALLOWED,
                    "Sync job #" + jobId + " có kết quả remote chưa xác nhận; hãy đối soát trước khi thử lại.");
        }

        ChannelListing listing = listingRepository.findByChannelIdAndIdForUpdate(job.getChannelId(), job.getListingId())
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + job.getListingId()));
        if (!listing.isActive()
                || listing.getMappingStatus() != ChannelListing.MappingStatus.VERIFIED
                || listing.getMappingVerifiedAt() == null) {
            throw new BusinessRuleException(ErrorCode.SYNC_RETRY_NOT_ALLOWED,
                    "Mapping của listing chưa được xác minh; không thể thử lại sync job.");
        }
        if (listing.getAllocatedQuota() != job.getTargetQuantity()
                || listing.getTargetAllocationRevision() != job.getAllocationRevision()) {
            throw new BusinessRuleException(ErrorCode.SYNC_RETRY_NOT_ALLOWED,
                    "Target hoặc allocation revision đã thay đổi; một job mới sẽ giao giá trị hiện tại.");
        }
        boolean otherActive = jobRepository.existsByListingIdAndStatusInAndIdNot(listing.getId(),
                List.of(SyncJob.Status.PENDING, SyncJob.Status.PROCESSING, SyncJob.Status.RETRY_PENDING),
                jobId);
        if (otherActive) {
            throw new BusinessRuleException(ErrorCode.SYNC_RETRY_NOT_ALLOWED,
                    "Listing đang có một sync job khác chưa kết thúc; không thể thử lại.");
        }

        int reset = jobRepository.resetForRetry(jobId);
        if (reset == 0) {
            throw new BusinessRuleException(ErrorCode.SYNC_RETRY_NOT_ALLOWED,
                    "Sync job #" + jobId + " đang ở trạng thái " + job.getStatus() + " và không thể thử lại.");
        }
        SyncJob refreshed = jobRepository.findById(jobId).orElseThrow();
        broadcaster.broadcastAfterCommit("SYNC_JOB_UPDATED", Map.of(
                "job_id", refreshed.getId(),
                "listing_id", refreshed.getListingId(),
                "status", refreshed.getStatus().name(),
                "refresh_required", true));
        return toJobResponse(refreshed);
    }

    @Transactional(readOnly = true)
    public ListingSyncStatusResponse getListingStatus(Long channelId, Long listingId) {
        ChannelListing listing = listingRepository.findByChannelIdAndId(channelId, listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId + " thuộc kênh #" + channelId));
        Channel channel = listing.getChannel();
        ProductVariant variant = listing.getVariant();
        List<ChannelSyncEvidenceResponse> evidence = evidenceRepository
                .findByListingIdOrderByObservedAtDescIdDesc(listingId, PageRequest.of(0, 50))
                .stream().map(this::toEvidenceResponse).toList();
        return new ListingSyncStatusResponse(
                listing.getId(),
                channel.getId(),
                channel.getCode(),
                channel.getEnvironment(),
                variant.getId(),
                variant.getSku(),
                listing.getExternalListingId(),
                listing.getExternalVariantId(),
                listing.getMappingStatus().name(),
                listing.getMappingVerifiedAt(),
                listing.isActive(),
                listing.getAllocatedQuota(),
                listing.getMappingStatus() == ChannelListing.MappingStatus.VERIFIED
                        && listing.getMappingVerifiedAt() != null,
                listing.getSyncStatus().name(),
                listing.getReportedStock(),
                listing.getSentQuantity(),
                listing.getAcknowledgedQuantity(),
                listing.getVerifiedQuantity(),
                listing.getLastSyncError(),
                listing.getLastVerifiedAt(),
                listing.getTargetAllocationRevision(),
                evidence);
    }

    private SyncJobResponse toJobResponse(SyncJob job) {
        ChannelListing listing = listingRepository.findById(job.getListingId()).orElse(null);
        Channel channel = listing != null ? listing.getChannel() : null;
        ProductVariant variant = listing != null ? listing.getVariant() : null;
        List<ChannelSyncEvidenceResponse> evidence = evidenceRepository
                .findByJobIdOrderByObservedAtDescIdDesc(job.getId())
                .stream().map(this::toEvidenceResponse).toList();
        return new SyncJobResponse(
                job.getId(),
                job.getJobKind(),
                job.getListingId(),
                job.getChannelId(),
                channel != null ? channel.getCode() : null,
                job.getVariantId(),
                variant != null ? variant.getSku() : null,
                job.getTargetQuantity(),
                job.getCoreVersion(),
                job.getAllocationRevision(),
                job.getStatus().name(),
                job.getAttempts(),
                job.getMaxAttempts(),
                job.getNextAttemptAt(),
                job.getSentQuantity(),
                job.getAcknowledgedQuantity(),
                job.getVerifiedQuantity(),
                job.getRemoteBefore(),
                job.getRemoteAfter(),
                job.getAdapter(),
                job.getIdempotencyReference(),
                job.getLastError(),
                job.getCreatedAt(),
                job.getLastAttemptAt(),
                job.getVerifiedAt(),
                evidence);
    }

    private ChannelSyncEvidenceResponse toEvidenceResponse(ChannelSyncEvidence evidence) {
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
