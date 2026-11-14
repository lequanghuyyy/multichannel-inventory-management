package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelInventoryAdapter;
import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ChannelMapper;
import com.octoflow.api.repository.ChannelListingRepository;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.Objects;

/**
 * Persists a verified mapping after the adapter call has completed. The listing is re-locked and
 * compared with the identity/version that was actually sent to the adapter, so a concurrent remap
 * can never inherit another identity's verification evidence.
 */
@Service
public class ChannelMappingRecorder {

    private final ChannelListingRepository listingRepository;
    private final ChannelEvidenceRecorder evidenceRecorder;
    private final ChannelMapper channelMapper;

    public ChannelMappingRecorder(ChannelListingRepository listingRepository,
                                  ChannelEvidenceRecorder evidenceRecorder,
                                  ChannelMapper channelMapper) {
        this.listingRepository = listingRepository;
        this.evidenceRecorder = evidenceRecorder;
        this.channelMapper = channelMapper;
    }

    @Transactional
    public ChannelListingResponse applyVerified(Long channelId,
                                                Long listingId,
                                                String adapterName,
                                                long expectedMappingVersion,
                                                String expectedExternalListingId,
                                                String expectedExternalVariantId,
                                                String expectedExternalSku,
                                                ChannelInventoryAdapter.MappingSnapshot snapshot) {
        ChannelListing listing = listingRepository.findByChannelIdAndIdForUpdate(channelId, listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId + " thuộc kênh #" + channelId));
        Channel channel = listing.getChannel();
        if (channel == null || channel.getStatus() != Channel.Status.CONNECTED) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Kênh chưa CONNECTED nên không thể xác minh mapping.");
        }
        if (listing.getMappingVersion() != expectedMappingVersion
                || !Objects.equals(listing.getExternalListingId(), expectedExternalListingId)
                || !Objects.equals(listing.getExternalVariantId(), expectedExternalVariantId)
                || !Objects.equals(listing.getExternalSku(), expectedExternalSku)) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.CONCURRENT_MODIFICATION,
                    "Mapping đã thay đổi trong lúc xác minh; kết quả cũ bị từ chối.");
        }

        rejectSnapshotMismatch(listing.getExternalSku(), snapshot.externalSku(), "external_sku");
        rejectSnapshotMismatch(listing.getExternalVariantId(), snapshot.externalVariantId(), "external_variant_id");

        boolean identityFilled = false;
        if (snapshot.externalSku() != null && listing.getExternalSku() == null) {
            listing.setExternalSku(snapshot.externalSku());
            identityFilled = true;
        }
        if (snapshot.externalVariantId() != null && listing.getExternalVariantId() == null) {
            listing.setExternalVariantId(snapshot.externalVariantId());
            identityFilled = true;
        }
        if (identityFilled) {
            listing.setMappingVersion(listing.getMappingVersion() + 1);
        }
        listing.setMappingStatus(ChannelListing.MappingStatus.VERIFIED);
        listing.setMappingVerifiedAt(Instant.now());
        listing.setActive(true);
        ChannelListing saved = listingRepository.save(listing);

        evidenceRecorder.record(saved.getId(), null, null, null, "MAPPING_VERIFY",
                adapterName, "VERIFIED", null, null, null, snapshot.quantity(),
                null, snapshot.quantity(), null, null, "mapping:" + saved.getId(),
                saved.getExternalListingId(), saved.getExternalVariantId());
        return channelMapper.toListingResponse(saved);
    }

    private void rejectSnapshotMismatch(String registered, String verified, String field) {
        if (registered != null && verified != null && !Objects.equals(registered, verified)) {
            throw new ApiException(HttpStatus.CONFLICT, ErrorCode.DATA_INTEGRITY_VIOLATION,
                    "Adapter xác minh " + field + " khác với mapping đã đăng ký.");
        }
    }
}
