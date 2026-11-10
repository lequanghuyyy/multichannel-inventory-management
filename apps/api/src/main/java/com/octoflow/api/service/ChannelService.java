package com.octoflow.api.service;

import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
import com.octoflow.api.dto.response.ChannelSyncEvidenceResponse;
import com.octoflow.api.dto.response.ListingSyncStatusResponse;

import java.util.List;

public interface ChannelService {

    List<ChannelResponse> listChannels();

    ChannelResponse getChannelById(Long channelId);

    List<ChannelListingResponse> getChannelListings(Long channelId);

    ChannelListingResponse registerMapping(Long channelId,
                                           com.octoflow.api.dto.request.RegisterChannelMappingRequest request);

    ChannelListingResponse verifyMapping(Long channelId, Long listingId,
                                         com.octoflow.api.dto.request.VerifyChannelMappingRequest request);

    ListingSyncStatusResponse getListingSyncStatus(Long channelId, Long listingId);

    ChannelSyncEvidenceResponse reconcileListing(Long channelId, Long listingId);
}
