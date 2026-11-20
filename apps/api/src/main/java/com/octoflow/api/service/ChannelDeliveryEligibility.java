package com.octoflow.api.service;

import com.octoflow.api.adapter.ChannelAdapterRouter;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.repository.ChannelRepository;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;

/**
 * The single definition of a deliverable listing: active, verified mapping, connected channel,
 * and an adapter that can actually write. Allocation, sync and reconciliation all use it.
 */
@Component
public class ChannelDeliveryEligibility {

    private final ChannelRepository channelRepository;
    private final ChannelAdapterRouter adapterRouter;

    public ChannelDeliveryEligibility(ChannelRepository channelRepository,
                                      ChannelAdapterRouter adapterRouter) {
        this.channelRepository = channelRepository;
        this.adapterRouter = adapterRouter;
    }

    public List<String> issues(ChannelListing listing) {
        List<String> issues = new ArrayList<>();
        if (listing == null) {
            issues.add("Listing không tồn tại.");
            return issues;
        }
        if (!listing.isActive()) {
            issues.add("Listing đang bị tắt.");
        }
        if (listing.isOrderReconciliationRequired()) {
            issues.add("Đơn WooCommerce cần được đối soát trước khi ghi tồn kho.");
        }
        if (listing.getMappingStatus() != ChannelListing.MappingStatus.VERIFIED
                || listing.getMappingVerifiedAt() == null) {
            issues.add("Mapping chưa được xác minh.");
        }
        Channel channel = listing.getChannel() != null ? listing.getChannel() : null;
        if (channel == null) {
            issues.add("Không tìm thấy kênh.");
            return issues;
        }
        if (channel.getStatus() != Channel.Status.CONNECTED) {
            issues.add("Kênh chưa ở trạng thái CONNECTED.");
        }
        if (!adapterRouter.writeAvailable(channel)) {
            issues.add("Không có adapter ghi khả dụng cho kênh này (fail-closed).");
        }
        return issues;
    }

    public boolean isDeliverable(ChannelListing listing) {
        return issues(listing).isEmpty();
    }

    public Channel loadChannel(ChannelListing listing) {
        if (listing == null || listing.getChannel() == null) {
            return null;
        }
        return channelRepository.findById(listing.getChannel().getId()).orElse(null);
    }
}
