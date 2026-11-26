package com.octoflow.api.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.util.Base64;
import java.util.List;
import java.util.Locale;

@Component
@ConfigurationProperties(prefix = "app.channels.lazada")
public class LazadaProperties {

    private boolean enabled;
    private String country = "VN";
    private String environment = "sandbox";
    private String appKey;
    private String appSecret;
    private String redirectUri;
    private String authBaseUrl = "https://auth.lazada.com";
    private String apiBaseUrl = "https://api.lazada.vn/rest";
    private String frontendBaseUrl;
    private String frontendChannelsPath = "/channels";
    private int connectTimeoutMs = 3_000;
    private int readTimeoutMs = 10_000;
    private String tokenEncryptionKey;
    private String tokenKeyId = "v1";
    private List<String> allowedEnvironments = List.of("sandbox");
    private boolean productWriteEnabled;
    private boolean inventoryWriteEnabled;
    private boolean orderWriteEnabled;

    public boolean isEnabled() { return enabled; }
    public void setEnabled(boolean enabled) { this.enabled = enabled; }
    public String getCountry() { return country; }
    public void setCountry(String country) { this.country = country; }
    public String getEnvironment() { return environment; }
    public void setEnvironment(String environment) { this.environment = environment; }
    public String getAppKey() { return appKey; }
    public void setAppKey(String appKey) { this.appKey = appKey; }
    public String getAppSecret() { return appSecret; }
    public void setAppSecret(String appSecret) { this.appSecret = appSecret; }
    public String getRedirectUri() { return redirectUri; }
    public void setRedirectUri(String redirectUri) { this.redirectUri = redirectUri; }
    public String getAuthBaseUrl() { return authBaseUrl; }
    public void setAuthBaseUrl(String authBaseUrl) { this.authBaseUrl = authBaseUrl; }
    public String getApiBaseUrl() { return apiBaseUrl; }
    public void setApiBaseUrl(String apiBaseUrl) { this.apiBaseUrl = apiBaseUrl; }
    public String getFrontendBaseUrl() { return frontendBaseUrl; }
    public void setFrontendBaseUrl(String frontendBaseUrl) { this.frontendBaseUrl = frontendBaseUrl; }
    public String getFrontendChannelsPath() { return frontendChannelsPath; }
    public void setFrontendChannelsPath(String frontendChannelsPath) { this.frontendChannelsPath = frontendChannelsPath; }
    public int getConnectTimeoutMs() { return Math.max(500, connectTimeoutMs); }
    public void setConnectTimeoutMs(int connectTimeoutMs) { this.connectTimeoutMs = connectTimeoutMs; }
    public int getReadTimeoutMs() { return Math.max(1_000, readTimeoutMs); }
    public void setReadTimeoutMs(int readTimeoutMs) { this.readTimeoutMs = readTimeoutMs; }
    public String getTokenEncryptionKey() { return tokenEncryptionKey; }
    public void setTokenEncryptionKey(String tokenEncryptionKey) { this.tokenEncryptionKey = tokenEncryptionKey; }
    public String getTokenKeyId() { return tokenKeyId; }
    public void setTokenKeyId(String tokenKeyId) { this.tokenKeyId = tokenKeyId; }
    public List<String> getAllowedEnvironments() {
        return allowedEnvironments == null || allowedEnvironments.isEmpty()
                ? List.of("sandbox") : allowedEnvironments;
    }
    public void setAllowedEnvironments(List<String> allowedEnvironments) { this.allowedEnvironments = allowedEnvironments; }
    public boolean isProductWriteEnabled() { return productWriteEnabled; }
    public void setProductWriteEnabled(boolean productWriteEnabled) { this.productWriteEnabled = productWriteEnabled; }
    public boolean isInventoryWriteEnabled() { return inventoryWriteEnabled; }
    public void setInventoryWriteEnabled(boolean inventoryWriteEnabled) { this.inventoryWriteEnabled = inventoryWriteEnabled; }
    public boolean isOrderWriteEnabled() { return orderWriteEnabled; }
    public void setOrderWriteEnabled(boolean orderWriteEnabled) { this.orderWriteEnabled = orderWriteEnabled; }

    public boolean isConfigured() {
        return !isBlank(appKey) && !isBlank(appSecret) && validRedirectUri()
                && encryptionKeyBytes() != null
                && !isBlank(tokenKeyId) && !isBlank(country) && !isBlank(environment)
                && validAuthBaseUrl()
                && validApiBaseUrl()
                && (!enabled || validFrontendBaseUrl());
    }

    public boolean environmentAllowed(String channelEnvironment) {
        if (isBlank(channelEnvironment)) return false;
        return getAllowedEnvironments().stream()
                .filter(value -> value != null)
                .map(value -> value.trim().toLowerCase(Locale.ROOT))
                .anyMatch(channelEnvironment.trim().toLowerCase(Locale.ROOT)::equals);
    }

    public byte[] encryptionKeyBytes() {
        if (isBlank(tokenEncryptionKey)) return null;
        try {
            byte[] key = Base64.getDecoder().decode(tokenEncryptionKey.trim());
            return key.length == 32 ? key : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private boolean validRedirectUri() {
        URI uri = parseUri(redirectUri);
        return uri != null && uri.getRawUserInfo() == null && uri.getRawQuery() == null
                && uri.getRawFragment() == null && isHttpScheme(uri)
                && "/api/v1/integrations/lazada/callback".equals(uri.getPath())
                && secureOrLoopback(uri);
    }

    private boolean validFrontendBaseUrl() {
        URI uri = parseUri(frontendBaseUrl);
        return uri != null && uri.getRawUserInfo() == null && uri.getRawQuery() == null
                && uri.getRawFragment() == null && isHttpScheme(uri)
                && (uri.getPath() == null || uri.getPath().isEmpty() || "/".equals(uri.getPath()))
                && secureOrLoopback(uri);
    }

    private boolean validAuthBaseUrl() {
        URI uri = parseUri(authBaseUrl);
        if (uri == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || !isHttpScheme(uri) || !secureOrLoopback(uri)
                || (uri.getPath() != null && !uri.getPath().isEmpty() && !"/".equals(uri.getPath()))) {
            return false;
        }
        return "auth.lazada.com".equalsIgnoreCase(uri.getHost()) || isLoopback(uri.getHost());
    }

    private boolean validApiBaseUrl() {
        URI uri = parseUri(apiBaseUrl);
        if (uri == null || uri.getRawUserInfo() != null || uri.getRawQuery() != null
                || uri.getRawFragment() != null || !isHttpScheme(uri) || !secureOrLoopback(uri)
                || !"/rest".equals(uri.getPath())) {
            return false;
        }
        if (isLoopback(uri.getHost())) return true;
        String expectedHost = switch (country.trim().toUpperCase(Locale.ROOT)) {
            case "VN" -> "api.lazada.vn";
            case "SG" -> "api.lazada.sg";
            case "PH" -> "api.lazada.com.ph";
            case "MY" -> "api.lazada.com.my";
            case "TH" -> "api.lazada.co.th";
            case "ID" -> "api.lazada.co.id";
            default -> null;
        };
        return expectedHost != null && expectedHost.equalsIgnoreCase(uri.getHost());
    }

    private URI parseUri(String value) {
        if (isBlank(value)) return null;
        try {
            URI uri = URI.create(value.trim());
            return uri.isAbsolute() && uri.getHost() != null ? uri : null;
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    private boolean isHttpScheme(URI uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) || "http".equalsIgnoreCase(uri.getScheme());
    }

    private boolean secureOrLoopback(URI uri) {
        return "https".equalsIgnoreCase(uri.getScheme()) || isLoopback(uri.getHost());
    }

    private boolean isLoopback(String host) {
        if (host == null) return false;
        String value = host.toLowerCase(Locale.ROOT);
        return value.equals("localhost") || value.equals("127.0.0.1") || value.equals("::1")
                || value.equals("[::1]");
    }

    private boolean isBlank(String value) {
        return value == null || value.isBlank();
    }
}
