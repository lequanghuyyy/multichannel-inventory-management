package com.octoflow.api.service;

import com.octoflow.api.adapter.WooCommerceApiClient;
import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.dto.response.WooCommerceChannelStatusResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;

/**
 * Persists a completed WooCommerce connection check. Remote I/O happens in the service before
 * this recorder is called, so no database transaction is held while the store is contacted.
 */
@Service
public class WooCommerceConnectionRecorder {

    private static final int MAX_ERROR = 500;

    private final ChannelRepository channelRepository;
    private final ChannelListingRepository listingRepository;
    private final WooCommerceProperties properties;

    public WooCommerceConnectionRecorder(ChannelRepository channelRepository,
                                         ChannelListingRepository listingRepository,
                                         WooCommerceProperties properties) {
        this.channelRepository = channelRepository;
        this.listingRepository = listingRepository;
        this.properties = properties;
    }

    @Transactional
    public WooCommerceChannelStatusResponse applyVerified(Long channelId,
                                                          WooCommerceApiClient.ConnectionSnapshot snapshot) {
        Channel channel = lock(channelId);
        channel.setStatus(Channel.Status.CONNECTED);
        channel.setConnectorName("woocommerce");
        channel.setConnectorVersion(WooCommerceProperties.API_VERSION);
        channel.setConnectionVerifiedAt(Instant.now());
        channel.setConnectionProductsRead(snapshot.productsRead());
        channel.setConnectionAuthMode(snapshot.authMode());
        channel.setExternalStoreName(truncate(snapshot.site() == null ? null : snapshot.site().name(), 255));
        channel.setExternalStoreUrl(truncate(snapshot.site() == null ? null : snapshot.site().url(), 512));
        channel.setExternalWcVersion(truncate(snapshot.wcVersion(), 64));
        channel.setExternalWpVersion(truncate(snapshot.wpVersion(), 64));
        channel.setExternalCurrency(truncate(snapshot.currency(), 8));
        channel.setConnectionLastErrorCode(null);
        channel.setConnectionLastErrorMessage(null);
        return status(channel);
    }

    @Transactional
    public WooCommerceChannelStatusResponse applyFailure(Long channelId, String errorCode, String message) {
        Channel channel = lock(channelId);
        channel.setStatus(Channel.Status.ERROR);
        channel.setConnectorName("woocommerce");
        channel.setConnectorVersion(WooCommerceProperties.API_VERSION);
        channel.setConnectionProductsRead(false);
        channel.setConnectionLastErrorCode(truncate(errorCode, 64));
        channel.setConnectionLastErrorMessage(truncate(sanitize(message), MAX_ERROR));
        return status(channel);
    }

    @Transactional
    public WooCommerceChannelStatusResponse disconnect(Long channelId) {
        Channel channel = lock(channelId);
        channel.setStatus(Channel.Status.DISCONNECTED);
        channel.setConnectorName(null);
        channel.setConnectorVersion(null);
        channel.setConnectionVerifiedAt(null);
        channel.setConnectionProductsRead(false);
        channel.setConnectionAuthMode(null);
        channel.setExternalStoreName(null);
        channel.setExternalStoreUrl(null);
        channel.setExternalWcVersion(null);
        channel.setExternalWpVersion(null);
        channel.setExternalCurrency(null);
        channel.setConnectionLastErrorCode(null);
        channel.setConnectionLastErrorMessage(null);
        return status(channel);
    }

    @Transactional(readOnly = true)
    public WooCommerceChannelStatusResponse status(Long channelId) {
        return status(load(channelId));
    }

    private WooCommerceChannelStatusResponse status(Channel channel) {
        boolean environmentAllowed = properties.environmentAllowed(channel);
        boolean connected = channel.getStatus() == Channel.Status.CONNECTED;
        boolean verified = connected && channel.getConnectionVerifiedAt() != null
                && "woocommerce".equals(channel.getConnectorName());
        boolean readAvailable = verified && properties.readAvailable(channel);
        boolean writeAvailable = verified && properties.writeAvailable(channel);
        return new WooCommerceChannelStatusResponse(
                channel.getId(),
                channel.getCode(),
                channel.getName(),
                channel.getEnvironment(),
                "woocommerce",
                WooCommerceProperties.API_VERSION,
                properties.isEnabled(),
                properties.credentialsConfigured() && properties.urlIssue() == null,
                environmentAllowed,
                channel.getStatus().name(),
                verified,
                channel.getConnectionVerifiedAt(),
                channel.isConnectionProductsRead(),
                channel.getConnectionAuthMode(),
                channel.getExternalStoreName(),
                channel.getExternalStoreUrl(),
                channel.getExternalWcVersion(),
                channel.getExternalWpVersion(),
                channel.getExternalCurrency(),
                properties.isWriteEnabled(),
                writeAvailable,
                readAvailable,
                listingRepository.countByChannelId(channel.getId()),
                listingRepository.countByChannelIdAndMappingStatus(
                        channel.getId(), com.octoflow.api.entity.ChannelListing.MappingStatus.VERIFIED),
                listingRepository.countByChannelIdAndSyncStatus(
                        channel.getId(), com.octoflow.api.entity.ChannelListing.SyncStatus.OUT_OF_SYNC),
                listingRepository.countByChannelIdAndSyncStatus(
                        channel.getId(), com.octoflow.api.entity.ChannelListing.SyncStatus.ERROR),
                channel.getConnectionLastErrorCode(),
                channel.getConnectionLastErrorMessage(),
                Instant.now());
    }

    private Channel lock(Long channelId) {
        return channelRepository.findByIdForUpdate(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + channelId));
    }

    private Channel load(Long channelId) {
        return channelRepository.findById(channelId)
                .orElseThrow(() -> new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                        "Không tìm thấy kênh #" + channelId));
    }

    private String truncate(String value, int max) {
        if (value == null) {
            return null;
        }
        return value.length() <= max ? value : value.substring(0, max);
    }

    private String sanitize(String value) {
        return value == null ? null : value.replaceAll("[\\r\\n\\t]", " ").trim();
    }
}
