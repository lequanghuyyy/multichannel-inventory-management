package com.octoflow.api.service.impl;

import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.service.ChannelService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.stream.Collectors;

@Service
public class ChannelServiceImpl implements ChannelService {

    private final ChannelRepository channelRepository;
    private final ChannelListingRepository channelListingRepository;

    public ChannelServiceImpl(ChannelRepository channelRepository,
                              ChannelListingRepository channelListingRepository) {
        this.channelRepository = channelRepository;
        this.channelListingRepository = channelListingRepository;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChannelResponse> listChannels() {
        return channelRepository.findAll().stream()
                .map(this::mapToChannelResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional(readOnly = true)
    public ChannelResponse getChannelById(Long channelId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND, "Không tìm thấy kênh #" + channelId));
        return mapToChannelResponse(channel);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChannelListingResponse> getChannelListings(Long channelId) {
        return channelListingRepository.findByChannelId(channelId).stream()
                .map(this::mapToListingResponse)
                .collect(Collectors.toList());
    }

    @Override
    @Transactional
    public void reconcileListing(Long channelId, Long listingId) {
        ChannelListing listing = channelListingRepository.findById(listingId)
                .orElseThrow(() -> new ResourceNotFoundException("Không tìm thấy liên kết sản phẩm #" + listingId));

        listing.setSyncStatus(ChannelListing.SyncStatus.SYNCED);
        listing.setReportedStock(listing.getAllocatedQuota());
        channelListingRepository.save(listing);
    }

    private ChannelResponse mapToChannelResponse(Channel c) {
        return new ChannelResponse(
                c.getId(),
                c.getCode(),
                c.getName(),
                c.getEnvironment(),
                c.getStatus().name(),
                c.getCreatedAt(),
                c.getUpdatedAt()
        );
    }

    private ChannelListingResponse mapToListingResponse(ChannelListing l) {
        return new ChannelListingResponse(
                l.getId(),
                l.getChannel().getId(),
                l.getVariant().getId(),
                l.getVariant().getSku(),
                l.getExternalListingId(),
                l.getExternalSku(),
                l.getAllocatedQuota(),
                l.getReportedStock(),
                l.getSyncStatus().name(),
                l.getUpdatedAt()
        );
    }
}
