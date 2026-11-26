package com.octoflow.api.service;

import com.octoflow.api.config.LazadaProperties;
import org.junit.jupiter.api.Test;

import java.util.Base64;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class LazadaTokenCipherTest {

    @Test
    void encryptsTokensWithAesGcmAndFailsClosedForTheWrongKey() {
        LazadaProperties firstProperties = properties(new byte[32]);
        LazadaTokenCipher firstCipher = new LazadaTokenCipher(firstProperties);
        String ciphertext = firstCipher.encrypt("access-token-secret");

        assertNotEquals("access-token-secret", ciphertext);
        assertEquals("access-token-secret", firstCipher.decrypt(ciphertext));

        byte[] otherKey = new byte[32];
        otherKey[0] = 1;
        assertThrows(IllegalStateException.class,
                () -> new LazadaTokenCipher(properties(otherKey)).decrypt(ciphertext));
    }

    private LazadaProperties properties(byte[] key) {
        LazadaProperties properties = new LazadaProperties();
        properties.setTokenEncryptionKey(Base64.getEncoder().encodeToString(key));
        return properties;
    }
}
