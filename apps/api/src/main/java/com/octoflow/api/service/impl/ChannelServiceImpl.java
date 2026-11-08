package com.octoflow.api.service.impl;

import com.octoflow.api.dto.response.ChannelListingResponse;
import com.octoflow.api.dto.response.ChannelResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.exception.ApiException;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.mapper.ChannelMapper;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import com.octoflow.api.service.ChannelService;
import org.springframework.stereotype.Service;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ChannelServiceImpl implements ChannelService {

    private final ChannelRepository channelRepository;
    private final ChannelListingRepository channelListingRepository;
    private final ChannelMapper channelMapper;

    public ChannelServiceImpl(ChannelRepository channelRepository,
                              ChannelListingRepository channelListingRepository,
                              ChannelMapper channelMapper) {
        this.channelRepository = channelRepository;
        this.channelListingRepository = channelListingRepository;
        this.channelMapper = channelMapper;
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChannelResponse> listChannels() {
        return channelMapper.toChannelResponses(channelRepository.findAll());
    }

    @Override
    @Transactional(readOnly = true)
    public ChannelResponse getChannelById(Long channelId) {
        Channel channel = channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND, "Không tìm thấy kênh #" + channelId));
        return channelMapper.toChannelResponse(channel);
    }

    @Override
    @Transactional(readOnly = true)
    public List<ChannelListingResponse> getChannelListings(Long channelId) {
        List<ChannelListing> listings = channelListingRepository.findByChannelId(channelId);
        return channelMapper.toListingResponses(listings);
    }

    @Override
    @Transactional
    public void reconcileListing(Long channelId, Long listingId) {
        if (!channelRepository.existsById(channelId)) {
            throw new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND, "Không tìm thấy kênh #" + channelId);
        }
        if (!channelListingRepository.existsById(listingId)) {
            throw new ResourceNotFoundException(ErrorCode.MAPPING_NOT_FOUND,
                    "Không tìm thấy liên kết sản phẩm #" + listingId);
        }
        throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, ErrorCode.CHANNEL_DELIVERY_UNAVAILABLE,
                "Chưa có connector để gửi và xác minh thay đổi tồn trên kênh.");
    }
}
