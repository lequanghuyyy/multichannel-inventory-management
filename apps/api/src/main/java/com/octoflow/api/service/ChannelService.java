package com.octoflow.api.service;

import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;

import java.util.List;

public interface ChannelService {

    List<ChannelResponse> listChannels();

    ChannelResponse getChannelById(Long channelId);

    List<ChannelListingResponse> getChannelListings(Long channelId);

    void reconcileListing(Long channelId, Long listingId);
}
