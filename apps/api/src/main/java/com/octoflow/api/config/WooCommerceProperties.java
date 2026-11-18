package com.octoflow.api.config;

import com.octoflow.api.adapter.ChannelAdapterException;
import com.octoflow.api.adapter.WooCommerceReason;
import com.octoflow.api.entity.Channel;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.List;
import java.util.Locale;

/**
 * WooCommerce connector configuration. Credentials live only in backend environment variables;
 * this class never exposes them in status responses or log messages.
 *
 * The connector is fail-closed: it must be enabled, fully configured, pointed at HTTPS or an
 * explicitly trusted development host, and attached to a development/test channel before any
 * read or write can happen.
 */
@Component
@ConfigurationProperties(prefix = "app.channels.woocommerce")
public class WooCommerceProperties {

    public static final String API_VERSION = "wc/v3";

    private boolean enabled;
    private String baseUrl = "http://localhost:8090";
    private String consumerKey;
    private String consumerSecret;
    private boolean writeEnabled;
    private int connectTimeoutMs = 3_000;
    private int readTimeoutMs = 10_000;
    private List<String> allowedEnvironments = List.of("sandbox", "development", "test");
    private List<String> developmentHostAllowlist = List.of("localhost", "127.0.0.1", "::1");

    public boolean isEnabled() {
        return enabled;
    }

    public void setEnabled(boolean enabled) {
        this.enabled = enabled;
    }

    public String getBaseUrl() {
        return baseUrl;
    }

    public void setBaseUrl(String baseUrl) {
        this.baseUrl = baseUrl;
    }

    public String getConsumerKey() {
        return consumerKey;
    }

    public void setConsumerKey(String consumerKey) {
        this.consumerKey = consumerKey;
    }

    public String getConsumerSecret() {
        return consumerSecret;
    }

    public void setConsumerSecret(String consumerSecret) {
        this.consumerSecret = consumerSecret;
    }

    public boolean isWriteEnabled() {
        return writeEnabled;
    }

    public void setWriteEnabled(boolean writeEnabled) {
        this.writeEnabled = writeEnabled;
    }

    public int getConnectTimeoutMs() {
        return Math.max(500, connectTimeoutMs);
    }

    public void setConnectTimeoutMs(int connectTimeoutMs) {
        this.connectTimeoutMs = connectTimeoutMs;
    }

    public int getReadTimeoutMs() {
        return Math.max(1_000, readTimeoutMs);
    }

    public void setReadTimeoutMs(int readTimeoutMs) {
        this.readTimeoutMs = readTimeoutMs;
    }

    public List<String> getAllowedEnvironments() {
        return allowedEnvironments == null || allowedEnvironments.isEmpty()
                ? List.of("sandbox", "development", "test")
                : allowedEnvironments;
    }

    public void setAllowedEnvironments(List<String> allowedEnvironments) {
        this.allowedEnvironments = allowedEnvironments;
    }

    public List<String> getDevelopmentHostAllowlist() {
        return developmentHostAllowlist == null || developmentHostAllowlist.isEmpty()
                ? List.of("localhost", "127.0.0.1", "::1")
                : developmentHostAllowlist;
    }

    public void setDevelopmentHostAllowlist(List<String> developmentHostAllowlist) {
        this.developmentHostAllowlist = developmentHostAllowlist;
    }

    public boolean credentialsConfigured() {
        return !isBlank(baseUrl) && !isBlank(consumerKey) && !isBlank(consumerSecret);
    }

    public boolean environmentAllowed(Channel channel) {
        if (channel == null || channel.getEnvironment() == null) {
            return false;
        }
        String environment = channel.getEnvironment().trim().toLowerCase(Locale.ROOT);
        return getAllowedEnvironments().stream()
                .filter(value -> value != null)
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .anyMatch(environment::equals);
    }

    /** Read/verify is allowed without the inventory write flag. */
    public boolean readAvailable(Channel channel) {
        return enabled
                && credentialsConfigured()
                && environmentAllowed(channel)
                && urlIssue() == null;
    }

    /** A write additionally requires the explicit inventory write flag. */
    public boolean writeAvailable(Channel channel) {
        return readAvailable(channel) && writeEnabled;
    }

    /** Null when the URL is safe; otherwise a stable reason code. */
    public String urlIssue() {
        if (isBlank(baseUrl)) {
            return WooCommerceReason.NOT_CONFIGURED;
        }
        URI uri;
        try {
            uri = new URI(baseUrl.trim());
        } catch (URISyntaxException ex) {
            return WooCommerceReason.BASE_URL_INVALID;
        }
        String scheme = uri.getScheme() == null ? "" : uri.getScheme().toLowerCase(Locale.ROOT);
        if (!"https".equals(scheme) && !"http".equals(scheme)) {
            return WooCommerceReason.BASE_URL_INVALID;
        }
        if (uri.getHost() == null || uri.getRawUserInfo() != null
                || uri.getRawQuery() != null || uri.getRawFragment() != null) {
            return WooCommerceReason.BASE_URL_INVALID;
        }
        if ("http".equals(scheme) && !trustedDevelopmentHost(uri.getHost())) {
            return WooCommerceReason.HTTP_TRUSTED_HOST_REQUIRED;
        }
        return null;
    }

    public URI validatedBaseUri() {
        if (!enabled) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.DISABLED, "WooCommerce connector is disabled.");
        }
        if (!credentialsConfigured()) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.NOT_CONFIGURED,
                    "WooCommerce connector credentials or base URL are not configured.");
        }
        String issue = urlIssue();
        if (issue != null) {
            String message = WooCommerceReason.HTTP_TRUSTED_HOST_REQUIRED.equals(issue)
                    ? "WooCommerce over plain HTTP is only allowed for explicitly trusted development hosts."
                    : "WooCommerce base URL is invalid.";
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE, issue, message);
        }
        try {
            return new URI(baseUrl.trim());
        } catch (URISyntaxException ex) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.BASE_URL_INVALID, "WooCommerce base URL is invalid.", ex);
        }
    }

    public String configurationIssue(Channel channel) {
        if (!enabled) {
            return WooCommerceReason.DISABLED;
        }
        if (!credentialsConfigured()) {
            return WooCommerceReason.NOT_CONFIGURED;
        }
        String urlIssue = urlIssue();
        if (urlIssue != null) {
            return urlIssue;
        }
        if (!environmentAllowed(channel)) {
            return WooCommerceReason.ENVIRONMENT_BLOCKED;
        }
        return null;
    }

    public String basePath() {
        String path = validatedBaseUri().getPath();
        if (path == null || path.isBlank() || "/".equals(path)) {
            return "";
        }
        return path.endsWith("/") ? path.substring(0, path.length() - 1) : path;
    }

    public boolean usesBasicAuth() {
        return "https".equalsIgnoreCase(validatedBaseUri().getScheme());
    }

    public String authMode() {
        return usesBasicAuth() ? "basic_tls" : "oauth1_dev_http";
    }

    private boolean trustedDevelopmentHost(String host) {
        String normalized = host.startsWith("[") && host.endsWith("]")
                ? host.substring(1, host.length() - 1)
                : host;
        return getDevelopmentHostAllowlist().stream()
                .filter(value -> value != null)
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .map(value -> value.startsWith("[") && value.endsWith("]")
                        ? value.substring(1, value.length() - 1) : value)
                .anyMatch(normalized.toLowerCase(Locale.ROOT)::equals);
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
