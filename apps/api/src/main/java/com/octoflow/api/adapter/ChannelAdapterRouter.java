package com.octoflow.api.adapter;

import com.octoflow.api.entity.Channel;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Routes a channel to a connector. The simulator is intentionally gated by both an explicit
 * feature flag and the channel environment; every other channel remains fail-closed so no code
 * path can pretend a real Shopify/WooCommerce/eBay update was delivered.
 */
@Component
public class ChannelAdapterRouter {

    private static final Logger log = LoggerFactory.getLogger(ChannelAdapterRouter.class);

    private final SimulatorChannelAdapter simulatorAdapter;
    private final boolean simulatorEnabled;

    public ChannelAdapterRouter(SimulatorChannelAdapter simulatorAdapter,
                                @Value("${app.channels.simulator.enabled:false}") boolean simulatorEnabled) {
        this.simulatorAdapter = simulatorAdapter;
        this.simulatorEnabled = simulatorEnabled;
    }

    public boolean isSimulatorChannel(Channel channel) {
        return channel != null && "simulated".equalsIgnoreCase(channel.getEnvironment());
    }

    /**
     * Returns true only when the configured environment is the simulator and the feature flag is
     * on. Real channels deliberately have no writable adapter yet.
     */
    public boolean writeAvailable(Channel channel) {
        return simulatorEnabled && isSimulatorChannel(channel);
    }

    public ChannelInventoryAdapter require(Channel channel) {
        if (channel == null) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    "Channel configuration is missing.");
        }
        if (writeAvailable(channel)) {
            return simulatorAdapter;
        }
        log.debug("No writable adapter for channel env={} code={}", channel.getEnvironment(), channel.getCode());
        throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                "No delivery adapter is configured for this channel; the operation is fail-closed.");
    }

    public boolean simulatorEnabled() {
        return simulatorEnabled;
    }
}
