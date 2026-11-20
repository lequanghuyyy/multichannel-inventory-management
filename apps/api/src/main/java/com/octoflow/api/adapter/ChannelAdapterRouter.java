package com.octoflow.api.adapter;

import com.octoflow.api.config.WooCommerceProperties;
import com.octoflow.api.entity.Channel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Routes a channel to a connector. The simulator and WooCommerce are the only writable
 * connectors; every other channel remains fail-closed so no code path can pretend a real
 * Shopify/eBay update was delivered.
 *
 * Read/verify and write are deliberately separate decisions: mapping verification and
 * read-only reconciliation can use a connector while its inventory write flag is off.
 */
@Component
public class ChannelAdapterRouter {

    private static final Logger log = LoggerFactory.getLogger(ChannelAdapterRouter.class);

    private final SimulatorChannelAdapter simulatorAdapter;
    private final WooCommerceChannelAdapter wooCommerceAdapter;
    private final WooCommerceProperties wooCommerceProperties;
    private final boolean simulatorEnabled;

    public ChannelAdapterRouter(SimulatorChannelAdapter simulatorAdapter,
                                WooCommerceChannelAdapter wooCommerceAdapter,
                                WooCommerceProperties wooCommerceProperties,
                                @Value("${app.channels.simulator.enabled:false}") boolean simulatorEnabled) {
        this.simulatorAdapter = simulatorAdapter;
        this.wooCommerceAdapter = wooCommerceAdapter;
        this.wooCommerceProperties = wooCommerceProperties;
        this.simulatorEnabled = simulatorEnabled;
    }

    public boolean isSimulatorChannel(Channel channel) {
        return channel != null && "simulated".equalsIgnoreCase(channel.getEnvironment());
    }

    public boolean isWooCommerceChannel(Channel channel) {
        return channel != null && "woocommerce".equalsIgnoreCase(channel.getCode());
    }

    /**
     * Evidence label for the connector a channel maps to, even while that connector is not
     * currently usable. Never claims a different adapter handled the write.
     */
    public String adapterName(Channel channel) {
        if (simulatorEnabled && isSimulatorChannel(channel)) {
            return simulatorAdapter.name();
        }
        if (isWooCommerceChannel(channel)) {
            return wooCommerceAdapter.name();
        }
        return "none";
    }

    /** True only when the channel can receive an inventory write right now. */
    public boolean writeAvailable(Channel channel) {
        if (simulatorEnabled && isSimulatorChannel(channel)) {
            return true;
        }
        return isWooCommerceChannel(channel)
                && connectionBound(channel)
                && wooCommerceProperties.writeAvailable(channel);
    }

    /** True when the channel can be read or verified, even with inventory writes disabled. */
    public boolean readAvailable(Channel channel) {
        if (simulatorEnabled && isSimulatorChannel(channel)) {
            return true;
        }
        return isWooCommerceChannel(channel)
                && connectionBound(channel)
                && wooCommerceProperties.readAvailable(channel);
    }

    /**
     * Connected is not enough for a real connector: the persisted proof must still describe the
     * configured store. A changed URL or credential pair forces a fresh verification.
     */
    private boolean connectionBound(Channel channel) {
        return channel.getStatus() == Channel.Status.CONNECTED
                && channel.getConnectionVerifiedAt() != null
                && "woocommerce".equalsIgnoreCase(channel.getConnectorName())
                && wooCommerceProperties.storeTargetIssue(channel) == null;
    }

    public ChannelInventoryAdapter require(Channel channel) {
        if (channel == null) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    "Channel configuration is missing.");
        }
        if (simulatorEnabled && isSimulatorChannel(channel)) {
            return simulatorAdapter;
        }
        if (isWooCommerceChannel(channel)) {
            String issue = wooCommerceProperties.configurationIssue(channel);
            if (issue == null && wooCommerceProperties.isWriteEnabled()) {
                return wooCommerceAdapter;
            }
            if (WooCommerceReason.WRITE_DISABLED.equals(issue) || issue == null) {
                throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                        WooCommerceReason.WRITE_DISABLED,
                        "WooCommerce inventory writes are disabled by configuration.");
            }
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE, issue,
                    "WooCommerce is not available for inventory delivery.");
        }
        log.debug("No writable adapter for channel env={} code={}", channel.getEnvironment(), channel.getCode());
        throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                "No delivery adapter is configured for this channel; the operation is fail-closed.");
    }

    /** Used by mapping verification and read-only reconciliation. */
    public ChannelInventoryAdapter requireRead(Channel channel) {
        if (channel == null) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    "Channel configuration is missing.");
        }
        if (simulatorEnabled && isSimulatorChannel(channel)) {
            return simulatorAdapter;
        }
        if (isWooCommerceChannel(channel)) {
            String configurationIssue = wooCommerceProperties.configurationIssue(channel);
            if (configurationIssue != null) {
                throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                        configurationIssue,
                        "WooCommerce is not available for read/verification.");
            }
            if (connectionBound(channel)) {
                return wooCommerceAdapter;
            }
            String issue = wooCommerceProperties.storeTargetIssue(channel);
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    issue == null ? WooCommerceReason.CONNECTION_NOT_VERIFIED : issue,
                    "WooCommerce is not available for read/verification.");
        }
        log.debug("No readable adapter for channel env={} code={}", channel.getEnvironment(), channel.getCode());
        throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                "No read/verification adapter is configured for this channel; the operation is fail-closed.");
    }

    public boolean simulatorEnabled() {
        return simulatorEnabled;
    }

    public boolean wooCommerceEnabled() {
        return wooCommerceProperties.isEnabled();
    }
}
