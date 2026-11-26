package com.octoflow.api.config;

import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class LazadaPropertiesTest {

    @Test
    void defaultsAreDisabledAndUnconfiguredWithEveryWriteFlagOff() {
        LazadaProperties properties = new LazadaProperties();

        assertFalse(properties.isEnabled());
        assertFalse(properties.isConfigured());
        assertFalse(properties.isProductWriteEnabled());
        assertFalse(properties.isInventoryWriteEnabled());
        assertFalse(properties.isOrderWriteEnabled());
    }

    @Test
    void onlyAllowsTheConfiguredCountryEndpointOrLocalMockServer() {
        LazadaProperties properties = configuredProperties();
        assertTrue(properties.isConfigured());

        properties.setApiBaseUrl("https://attacker.example/rest");
        assertFalse(properties.isConfigured());

        properties.setApiBaseUrl("https://api.lazada.sg/rest");
        assertFalse(properties.isConfigured());

        properties.setApiBaseUrl("http://127.0.0.1:43123/rest");
        assertTrue(properties.isConfigured());
    }

    private LazadaProperties configuredProperties() {
        LazadaProperties properties = new LazadaProperties();
        properties.setCountry("VN");
        properties.setAppKey("test-app");
        properties.setAppSecret("test-secret");
        properties.setRedirectUri("https://seller.example/api/v1/integrations/lazada/callback");
        properties.setAuthBaseUrl("https://auth.lazada.com");
        properties.setApiBaseUrl("https://api.lazada.vn/rest");
        properties.setFrontendBaseUrl("https://seller.example");
        properties.setTokenEncryptionKey(Base64.getEncoder().encodeToString(new byte[32]));
        return properties;
    }
}
