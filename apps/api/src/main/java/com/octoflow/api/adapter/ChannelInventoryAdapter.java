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

    RemoteStock readStock(Channel channel, ChannelListing listing) throws ChannelAdapterException;

    DeliveryReceipt writeStock(Channel channel, ChannelListing listing,
                               int targetQuantity, String idempotencyReference)
            throws ChannelAdapterException;

    MappingSnapshot verifyMapping(Channel channel, ChannelListing listing)
            throws ChannelAdapterException;

    record RemoteStock(int quantity, long version, String reference) {}

    record DeliveryReceipt(int sentQuantity, int acknowledgedQuantity, String reference) {}

    record MappingSnapshot(String externalSku, String externalVariantId,
                           int quantity, long version) {}
}
