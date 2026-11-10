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

/**
 * Persists a verified mapping after the adapter call has completed. Keeping this in its own
 * transactional bean guarantees no database transaction is open during remote I/O.
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
                                                ChannelInventoryAdapter.MappingSnapshot snapshot) {
        ChannelListing listing = listingRepository.findByChannelIdAndIdForUpdate(channelId, listingId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                        "Không tìm thấy liên kết #" + listingId + " thuộc kênh #" + channelId));
        Channel channel = listing.getChannel();
        if (channel == null || channel.getStatus() != Channel.Status.CONNECTED) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                    "Kênh chưa CONNECTED nên không thể xác minh mapping.");
        }
        if (snapshot.externalSku() != null && listing.getExternalSku() == null) {
            listing.setExternalSku(snapshot.externalSku());
        }
        if (snapshot.externalVariantId() != null && listing.getExternalVariantId() == null) {
            listing.setExternalVariantId(snapshot.externalVariantId());
        }
        listing.setMappingStatus(ChannelListing.MappingStatus.VERIFIED);
        listing.setMappingVerifiedAt(Instant.now());
        listing.setActive(true);
        ChannelListing saved = listingRepository.save(listing);

        evidenceRecorder.record(saved.getId(), null, null, null, "MAPPING_VERIFY",
                adapterName, "VERIFIED", null, null, null, snapshot.quantity(),
                null, snapshot.quantity(), null, null, "mapping:" + saved.getId());
        return channelMapper.toListingResponse(saved);
    }
}
