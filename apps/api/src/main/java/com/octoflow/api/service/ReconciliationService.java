package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.adapter.WooCommerceReason;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.entity.SyncJob;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelListingRepository;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Optional;

/**
 * Compares the channel's independently read quantity with the allocated target. The remote read
 * happens under a listing advisory lock and outside any database transaction; a separate
 * transactional recorder applies the observation. Channels without a connector remain
 * fail-closed with 503.
 */
@Service
public class ReconciliationService {

    private final ChannelListingRepository listingRepository;
    private final ChannelAdapterRouter adapterRouter;
    private final ReconciliationRecorder recorder;
    private final ListingLeaseService listingLeaseService;
    private final int candidateBatchSize;

    public ReconciliationService(ChannelListingRepository listingRepository,
                                 ChannelAdapterRouter adapterRouter,
                                 ReconciliationRecorder recorder,
                                 ListingLeaseService listingLeaseService,
                                 @Value("${app.sync.reconciliation-batch-size:50}") int candidateBatchSize) {
        this.listingRepository = listingRepository;
        this.adapterRouter = adapterRouter;
        this.recorder = recorder;
        this.listingLeaseService = listingLeaseService;
        this.candidateBatchSize = Math.max(1, candidateBatchSize);
    }

    public ChannelSyncEvidenceResponse reconcileListing(Long channelId, Long listingId) {
        ChannelListing listing = listingRepository.findDetailedByChannelIdAndId(channelId, listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId + " thuộc kênh #" + channelId));
        return doReconcile(listing);
    }

    public ChannelSyncEvidenceResponse reconcileListingById(Long listingId) {
        ChannelListing listing = listingRepository.findDetailedById(listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId));
        return doReconcile(listing);
    }

    public List<Long> candidateListingIds() {
        return listingRepository.findReconciliationCandidateIds(
                ChannelListing.MappingStatus.VERIFIED,
                List.of(ChannelListing.SyncStatus.OUT_OF_SYNC, ChannelListing.SyncStatus.ERROR),
                List.of(SyncJob.Status.UNCONFIRMED, SyncJob.Status.DRIFT),
                PageRequest.of(0, candidateBatchSize));
    }

    private ChannelSyncEvidenceResponse doReconcile(ChannelListing listing) {
        Channel channel = listing.getChannel();
        if (!deliverable(listing, channel)) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Chưa có connector để đọc và xác minh tồn trên kênh.");
        }

        ChannelInventoryAdapter adapter;
        try {
            adapter = adapterRouter.requireRead(channel);
        } catch (ChannelAdapterException ex) {
            throw readFailure(ex, "Chưa có connector để đọc và xác minh tồn trên kênh.");
        }

        Optional<ChannelSyncEvidenceResponse> result = listingLeaseService.tryCallWithLock(listing.getId(), () -> {
            ChannelInventoryAdapter.RemoteStock remote;
            try {
                remote = adapter.readStock(channel, listing);
            } catch (ChannelAdapterException ex) {
                throw readFailure(ex, "Không thể đọc tồn trên kênh.");
            }
            return recorder.applyObservation(listing.getId(), adapter.name(),
                    remote.quantity(), remote.reference());
        });

        return result.orElseThrow(() -> new ApiException(HttpStatus.CONFLICT,
                ErrorCode.CONCURRENT_MODIFICATION,
                "Listing #" + listing.getId() + " đang được đồng bộ bởi một worker khác; hãy thử lại."));
    }

    private boolean deliverable(ChannelListing listing, Channel channel) {
        return listing.isActive()
                && listing.getMappingStatus() == ChannelListing.MappingStatus.VERIFIED
                && listing.getMappingVerifiedAt() != null
                && channel != null
                && channel.getStatus() == Channel.Status.CONNECTED
                && adapterRouter.readAvailable(channel);
    }

    private ApiException readFailure(ChannelAdapterException ex, String prefix) {
        if (WooCommerceReason.ENVIRONMENT_BLOCKED.equals(ex.reasonCodeOrKind())) {
            return new ApiException(HttpStatus.UNPROCESSABLE_ENTITY, ErrorCode.CHANNEL_ENVIRONMENT_BLOCKED,
                    "Phase 06 chỉ cho phép đọc/đối soát WooCommerce ở môi trường development/test.");
        }
        HttpStatus status = ex.getKind() == ChannelAdapterException.Kind.TIMEOUT
                ? HttpStatus.GATEWAY_TIMEOUT
                : ex.getKind() == ChannelAdapterException.Kind.UNAVAILABLE
                ? HttpStatus.SERVICE_UNAVAILABLE
                : HttpStatus.UNPROCESSABLE_ENTITY;
        ErrorCode code = status == HttpStatus.UNPROCESSABLE_ENTITY
                ? ErrorCode.MAPPING_VERIFICATION_FAILED
                : ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE;
        return new ApiException(status, code,
                prefix + " (" + ex.reasonCodeOrKind() + "): " + ex.getMessage());
    }
}
