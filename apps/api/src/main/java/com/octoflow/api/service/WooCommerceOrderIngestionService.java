package com.octoflow.api.service;

import com.octoflow.api.adapter.WooCommerceApiClient;
import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import com.octoflow.api.repository.ChannelListingRepository;
import com.octoflow.api.repository.ChannelRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Objects;

/** Internal entry point: the caller can select a page, but cannot submit an order payload. */
@Service
public class WooCommerceOrderIngestionService {
    private final ChannelRepository channels;
    private final ChannelListingRepository listings;
    private final WooCommerceProperties properties;
    private final WooCommerceApiClient client;
    private final ListingLeaseService leases;
    private final WooCommerceOrderTransaction transaction;

    public WooCommerceOrderIngestionService(ChannelRepository channels, ChannelListingRepository listings,
            WooCommerceProperties properties, WooCommerceApiClient client, ListingLeaseService leases,
            WooCommerceOrderTransaction transaction) {
        this.channels = channels;
        this.listings = listings;
        this.properties = properties;
        this.client = client;
        this.leases = leases;
        this.transaction = transaction;
    }

    public record Result(String externalOrderId, Long orderId, String error) {}

    public List<Result> importPage(long channelId, Instant after, Instant before, int page, int perPage) {
        requireChannel(channelId);
        List<Result> results = new ArrayList<>();
        for (String orderId : client.fetchOrderIds(after, before, page, perPage)) {
            if (orderId == null) {
                results.add(new Result(null, null, "Không thể xác định ID của một đơn trong trang WooCommerce."));
                continue;
            }
            try {
                results.add(importOne(channelId, orderId));
            } catch (RuntimeException ex) {
                results.add(new Result(orderId, null, ex.getMessage()));
            }
        }
        return List.copyOf(results);
    }

    public Result importOne(long channelId, String externalOrderId) {
        requireChannel(channelId);
        var order = client.fetchOrder(externalOrderId);
        Result existing = transaction.checkExisting(channelId, order);
        if (existing != null) return existing;
        var candidates = listings.findByChannelId(channelId);
        List<Long> listingIds = new ArrayList<>();
        for (var line : order.lines()) {
            if (line.sku() == null || line.sku().isBlank()) {
                throw new IllegalArgumentException("Dòng đơn WooCommerce thiếu SKU.");
            }
            String variation = "0".equals(line.variationId()) ? null : line.variationId();
            ChannelListing listing = candidates.stream().filter(l -> l.isActive()
                    && l.getMappingStatus() == ChannelListing.MappingStatus.VERIFIED
                    && l.getMappingVerifiedAt() != null
                    && Objects.equals(l.getExternalListingId(), line.productId())
                    && Objects.equals(l.getExternalVariantId(), variation)
                    && Objects.equals(l.getExternalSku(), line.sku())).findFirst()
                    .orElseThrow(() -> new IllegalArgumentException("Không có mapping WooCommerce đã xác minh cho SKU " + line.sku()));
            listingIds.add(listing.getId());
        }
        List<Long> uniqueIds = listingIds.stream().distinct().sorted().toList();
        return leases.tryCallWithLocks(uniqueIds, () -> transaction.importOrder(channelId, order, listingIds))
                .orElseThrow(() -> new IllegalStateException("Listing đang đồng bộ, hãy thử lại."));
    }

    private void requireChannel(long id) {
        Channel channel = channels.findById(id).orElseThrow(() -> new IllegalArgumentException("Không tìm thấy kênh."));
        if (!"woocommerce".equalsIgnoreCase(channel.getCode())
                || !"woocommerce".equalsIgnoreCase(channel.getConnectorName())
                || channel.getStatus() != Channel.Status.CONNECTED || channel.getConnectionVerifiedAt() == null
                || !properties.readAvailable(channel) || properties.storeTargetIssue(channel) != null) {
            throw new IllegalStateException("Kết nối WooCommerce chưa được xác minh cho cửa hàng hiện tại.");
        }
    }
}
