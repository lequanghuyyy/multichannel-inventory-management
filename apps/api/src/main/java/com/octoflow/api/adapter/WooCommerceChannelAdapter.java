package com.octoflow.api.adapter;

import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.entity.Channel;
import com.octoflow.api.entity.ChannelListing;
import org.springframework.stereotype.Component;

import java.util.Objects;

/**
 * Real WooCommerce inventory connector.
 *
 * A mapping is usable only when the parent product (and, for variable products, the variation)
 * exists, its id and SKU exactly match the registered mapping, and WooCommerce already manages
 * stock for that item. The connector never enables stock management and never sends global
 * on-hand: callers pass the listing's allocated quota as an absolute target.
 */
@Component
public class WooCommerceChannelAdapter implements ChannelInventoryAdapter {

    private final WooCommerceProperties properties;
    private final WooCommerceApiClient client;

    public WooCommerceChannelAdapter(WooCommerceProperties properties, WooCommerceApiClient client) {
        this.properties = properties;
        this.client = client;
    }

    @Override
    public String name() {
        return "woocommerce";
    }

    @Override
    public RemoteStock readStock(Channel channel, ChannelListing listing) {
        requireReadAvailable(channel);
        WooCommerceApiClient.RemoteItem item = resolve(listing);
        return new RemoteStock(requireQuantity(item), item.version(), reference(item));
    }

    @Override
    public DeliveryReceipt writeStock(Channel channel, ChannelListing listing,
                                      int targetQuantity, String idempotencyReference) {
        if (!properties.isWriteEnabled()) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.WRITE_DISABLED,
                    "WooCommerce inventory writes are disabled by configuration.");
        }
        requireReadAvailable(channel);
        if (targetQuantity < 0) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.HTTP_ERROR, "Target quantity must not be negative.");
        }

        // Resolve immediately before the write so a mapping changed on the WooCommerce side can
        // never receive quota intended for another product.
        WooCommerceApiClient.RemoteItem item = resolve(listing);
        Integer acknowledged = item.variationId() == null
                ? client.updateProductStock(item.productId(), targetQuantity)
                : client.updateVariationStock(item.productId(), item.variationId(), targetQuantity);
        return new DeliveryReceipt(targetQuantity,
                acknowledged == null ? targetQuantity : acknowledged,
                reference(item));
    }

    @Override
    public MappingSnapshot verifyMapping(Channel channel, ChannelListing listing) {
        requireReadAvailable(channel);
        WooCommerceApiClient.RemoteItem item = resolve(listing);
        return new MappingSnapshot(item.sku(), item.variationId(),
                requireQuantity(item), item.version());
    }

    private WooCommerceApiClient.RemoteItem resolve(ChannelListing listing) {
        if (listing == null) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.MAPPING_MISMATCH, "Channel listing is missing.");
        }
        String productId = trimToNull(listing.getExternalListingId());
        if (productId == null) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.MAPPING_MISMATCH,
                    "WooCommerce mapping has no parent product id.");
        }

        WooCommerceApiClient.RemoteItem product = client.fetchProduct(productId);
        if ("trash".equalsIgnoreCase(product.status())) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.PRODUCT_UNAVAILABLE,
                    "WooCommerce product is in the trash and cannot be used for inventory.");
        }

        String variationId = trimToNull(listing.getExternalVariantId());
        if (variationId == null) {
            if (!"simple".equalsIgnoreCase(product.type())) {
                throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                        WooCommerceReason.PRODUCT_TYPE_UNSUPPORTED,
                        "WooCommerce product is not simple; register its variation id.");
            }
            verifySku(listing, product);
            requireStockManagement(product);
            return product;
        }

        if (!"variable".equalsIgnoreCase(product.type())) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.PRODUCT_TYPE_UNSUPPORTED,
                    "WooCommerce product is not variable; remove the variation id from the mapping.");
        }
        WooCommerceApiClient.RemoteItem variation = client.fetchVariation(productId, variationId);
        verifySku(listing, variation);
        requireStockManagement(variation);
        return variation;
    }

    private void verifySku(ChannelListing listing, WooCommerceApiClient.RemoteItem item) {
        String mappedSku = trimToNull(listing.getExternalSku());
        String remoteSku = trimToNull(item.sku());
        if (mappedSku == null) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.SKU_MISMATCH,
                    "Mapping has no WooCommerce SKU; an exact SKU mapping is required.");
        }
        if (!Objects.equals(mappedSku, remoteSku)) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.SKU_MISMATCH,
                    "WooCommerce SKU does not match the registered mapping.");
        }
    }

    private void requireStockManagement(WooCommerceApiClient.RemoteItem item) {
        if (!item.manageStock()) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.STOCK_MANAGEMENT_DISABLED,
                    "WooCommerce stock management is disabled for this item; OctoFlow will not enable it automatically.");
        }
    }

    private int requireQuantity(WooCommerceApiClient.RemoteItem item) {
        if (item.stockQuantity() == null) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.PROTOCOL,
                    WooCommerceReason.STOCK_QUANTITY_MISSING,
                    "WooCommerce did not return a stock quantity for a stock-managed item.");
        }
        return item.stockQuantity();
    }

    private void requireReadAvailable(Channel channel) {
        if (channel == null
                || channel.getStatus() != Channel.Status.CONNECTED
                || channel.getConnectionVerifiedAt() == null
                || !"woocommerce".equalsIgnoreCase(channel.getConnectorName())) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.CONNECTION_NOT_VERIFIED,
                    "WooCommerce connection has not been verified through the live API.");
        }
        String issue = properties.configurationIssue(channel);
        if (issue == null) {
            return;
        }
        String message = switch (issue) {
            case WooCommerceReason.DISABLED -> "WooCommerce connector is disabled.";
            case WooCommerceReason.NOT_CONFIGURED -> "WooCommerce connector credentials are not configured.";
            case WooCommerceReason.HTTP_TRUSTED_HOST_REQUIRED ->
                    "WooCommerce over plain HTTP is only allowed for explicitly trusted development hosts.";
            case WooCommerceReason.ENVIRONMENT_BLOCKED ->
                    "WooCommerce inventory operations are limited to development/test channels.";
            default -> "WooCommerce base URL is invalid.";
        };
        throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE, issue, message);
    }

    private String reference(WooCommerceApiClient.RemoteItem item) {
        String identity = item.variationId() == null
                ? "product:" + item.productId()
                : "product:" + item.productId() + ":variation:" + item.variationId();
        return "woo:" + identity + ":v" + item.version();
    }

    private String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
