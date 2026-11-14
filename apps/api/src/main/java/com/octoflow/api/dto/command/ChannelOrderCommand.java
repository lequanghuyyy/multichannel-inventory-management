package com.octoflow.api.dto.command;

import com.octoflow.api.entity.Order;

import java.util.List;

/**
 * Internal, non-HTTP marketplace order boundary. A future Shopify/WooCommerce/eBay connector
 * normalizes an external order into this command; staff-facing POS requests cannot construct it.
 *
 * <p>The marketplace identity is {@code (channelId, externalOrderId)}. There is no shop table in
 * Phase 01.1, so {@code channelId} carries the connection identity; Phase 02 can add the shop
 * dimension without changing the uniqueness rule.</p>
 *
 * <p>Prices are never supplied by the connector. The service resolves each SKU to its current
 * server-side price, exactly as for POS orders.</p>
 */
public record ChannelOrderCommand(
        Long channelId,
        Order.Source source,
        String externalOrderId,
        String currency,
        List<ChannelOrderLine> lines
) {
    public record ChannelOrderLine(
            String sku,
            Integer quantity
    ) {}
}
