package com.octoflow.api.adapter;

import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;

/**
 * One reusable contract for every channel connector. The current implementation only has a
 * durable simulator; real marketplace connectors deliberately fail closed until they implement
 * this interface with write and read-back verification.
 */
public interface ChannelInventoryAdapter {

    String name();

    /**
     * Real connectors must prove the remote quantity still matches the last verified stock before
     * publishing an absolute target. The simulator is stateless towards external sales, so it keeps
     * its Phase 04 self-recovery behaviour.
     */
    default boolean requiresVerifiedStockBaseline() {
        return true;
    }

    RemoteStock readStock(Channel channel, ChannelListing listing) throws ChannelAdapterException;

    DeliveryReceipt writeStock(Channel channel, ChannelListing listing,
                               int targetQuantity, String idempotencyReference)
            throws ChannelAdapterException;

    MappingSnapshot verifyMapping(Channel channel, ChannelListing listing)
            throws ChannelAdapterException;

    record RemoteStock(int quantity, long version, String reference) {}

    /**
     * {@code acknowledgedQuantity} is null when the channel accepted the write but did not echo a
     * quantity back. A null acknowledgement is not proof of delivery: only an independent
     * read-back may make the delivery VERIFIED.
     */
    record DeliveryReceipt(int sentQuantity, Integer acknowledgedQuantity, String reference) {}

    record MappingSnapshot(String externalSku, String externalVariantId,
                           int quantity, long version) {}
}
