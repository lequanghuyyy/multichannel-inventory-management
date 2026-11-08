package com.octoflow.api.mapper;

import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import org.springframework.stereotype.Component;

import java.util.Collections;
import java.util.List;
import java.util.stream.Collectors;

@Component
public class ChannelMapper {

    public ChannelResponse toChannelResponse(Channel channel) {
        if (channel == null) {
            return null;
        }
        return new ChannelResponse(
                channel.getId(),
                channel.getCode(),
                channel.getName(),
                channel.getEnvironment(),
                channel.getStatus() != null ? channel.getStatus().name() : Channel.Status.DISCONNECTED.name(),
                channel.getCreatedAt(),
                channel.getUpdatedAt()
        );
    }

    public List<ChannelResponse> toChannelResponses(List<Channel> channels) {
        if (channels == null || channels.isEmpty()) {
            return Collections.emptyList();
        }
        return channels.stream()
                .map(this::toChannelResponse)
                .collect(Collectors.toList());
    }

    public ChannelListingResponse toListingResponse(ChannelListing listing) {
        if (listing == null) {
            return null;
        }
        return new ChannelListingResponse(
                listing.getId(),
                listing.getChannel() != null ? listing.getChannel().getId() : null,
                listing.getVariant() != null ? listing.getVariant().getId() : null,
                listing.getVariant() != null ? listing.getVariant().getSku() : null,
                listing.getExternalListingId(),
                listing.getExternalSku(),
                listing.getAllocatedQuota(),
                listing.getReportedStock(),
                listing.getSyncStatus() != null ? listing.getSyncStatus().name() : ChannelListing.SyncStatus.UNVERIFIED.name(),
                listing.getUpdatedAt()
        );
    }

    public List<ChannelListingResponse> toListingResponses(List<ChannelListing> listings) {
        if (listings == null || listings.isEmpty()) {
            return Collections.emptyList();
        }
        return listings.stream()
                .map(this::toListingResponse)
                .collect(Collectors.toList());
    }
}
