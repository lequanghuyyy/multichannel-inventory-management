package com.octoflow.api.adapter;

import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;

class LazadaRequestSignerTest {

    @Test
    void matchesTheOfficialOpenPlatformHmacSha256Example() {
        Map<String, String> parameters = Map.of(
                "access_token", "test",
                "app_key", "123456",
                "order_id", "1234",
                "sign_method", "sha256",
                "timestamp", "1517820392000");

        assertEquals("4190D32361CFB9581350222F345CB77F3B19F0E31D162316848A2C1FFD5FAB4A",
                LazadaRequestSigner.sign("/order/get", parameters, "helloworld"));
    }
}
