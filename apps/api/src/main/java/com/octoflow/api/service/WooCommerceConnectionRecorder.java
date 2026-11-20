package com.octoflow.api.service;

import com.octoflow.api.adapter.WooCommerceApiClient;
import com.octoflow.api.adapter.WooCommerceReason;
import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.dto.response.WooCommerceChannelStatusResponse;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.util.List;
import java.util.Objects;

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
        String targetFingerprint = properties.targetFingerprint();
        // A null previous fingerprint means this connection predates target binding (pre-V11), so
        // its mappings were verified without proof of which store they belong to. Treat the first
        // binding like a target change: require the mappings to be verified again.
        boolean targetChanged = targetFingerprint != null
                && !Objects.equals(channel.getConnectionTargetFingerprint(), targetFingerprint);
        channel.setStatus(Channel.Status.CONNECTED);
        channel.setConnectorName("woocommerce");
        channel.setConnectorVersion(WooCommerceProperties.API_VERSION);
        channel.setConnectionVerifiedAt(Instant.now());
        channel.setConnectionProductsRead(snapshot.productsRead());
        channel.setConnectionAuthMode(snapshot.authMode());
        channel.setConnectionTargetFingerprint(targetFingerprint);
        channel.setExternalStoreName(truncate(snapshot.site() == null ? null : snapshot.site().name(), 255));
        channel.setExternalStoreUrl(truncate(snapshot.site() == null ? null : snapshot.site().url(), 512));
        channel.setExternalWcVersion(truncate(snapshot.wcVersion(), 64));
        channel.setExternalWpVersion(truncate(snapshot.wpVersion(), 64));
        channel.setExternalCurrency(truncate(snapshot.currency(), 8));
        channel.setConnectionLastErrorCode(null);
        channel.setConnectionLastErrorMessage(null);
        if (targetChanged) {
            // The live check reached a different store. Mappings verified against the old store
            // cannot be trusted even if their numeric ids happen to exist in the new one.
            invalidateMappings(channel, "Store target changed; verify this mapping again.");
        }
        return status(channel);
    }

    @Transactional
    public WooCommerceChannelStatusResponse applyFailure(Long channelId, String errorCode, String message) {
        Channel channel = lock(channelId);
        channel.setStatus(Channel.Status.ERROR);
        channel.setConnectorName("woocommerce");
        channel.setConnectorVersion(WooCommerceProperties.API_VERSION);
        // A failed check proves nothing about the store: withdraw the previous proof without
        // erasing the fingerprint, so a later successful check can still detect a target change.
        channel.setConnectionVerifiedAt(null);
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
        channel.setConnectionTargetFingerprint(null);
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
        String targetIssue = properties.storeTargetIssue(channel);
        boolean verified = connected && channel.getConnectionVerifiedAt() != null
                && "woocommerce".equals(channel.getConnectorName())
                && targetIssue == null;
        boolean readAvailable = verified && properties.readAvailable(channel);
        boolean writeAvailable = verified && properties.writeAvailable(channel);
        // Only a still-present proof can be invalidated by a target change. A channel whose last
        // verification failed has no proof left, so its classified failure is the useful error;
        // replacing it with "not verified" would hide an auth/network problem behind a tautology.
        boolean staleProof = targetIssue != null && channel.getConnectionVerifiedAt() != null;
        String lastErrorCode = staleProof ? targetIssue : channel.getConnectionLastErrorCode();
        String lastErrorMessage = staleProof
                ? targetIssueMessage(targetIssue)
                : channel.getConnectionLastErrorMessage();
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
                lastErrorCode,
                lastErrorMessage,
                Instant.now());
    }

    private void invalidateMappings(Channel channel, String message) {
        List<ChannelListing> listings = listingRepository.findByChannelId(channel.getId());
        if (listings.isEmpty()) {
            return;
        }
        for (ChannelListing listing : listings) {
            listing.setMappingStatus(ChannelListing.MappingStatus.UNVERIFIED);
            listing.setMappingVerifiedAt(null);
            listing.setSyncStatus(ChannelListing.SyncStatus.UNVERIFIED);
            listing.setLastSyncError(message);
        }
        listingRepository.saveAll(listings);
    }

    private String targetIssueMessage(String issue) {
        return switch (issue) {
            case WooCommerceReason.STORE_TARGET_CHANGED ->
                    "Configured store target differs from the verified connection; reconnect and verify mappings again.";
            default -> "This connection is not bound to the configured store; verify the connection again.";
        };
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
