package com.octoflow.api.service;

import com.octoflow.api.config.LazadaProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

@Component
public class LazadaTokenCipher {

    private static final int IV_BYTES = 12;
    private static final int TAG_BITS = 128;
    private final LazadaProperties properties;
    private final SecureRandom secureRandom = new SecureRandom();

    public LazadaTokenCipher(LazadaProperties properties) {
        this.properties = properties;
    }

    public String encrypt(String token) {
        if (token == null || token.isBlank()) throw new IllegalArgumentException("Token is required.");
        byte[] key = properties.encryptionKeyBytes();
        if (key == null) throw new IllegalStateException("Lazada token encryption is not configured.");
        byte[] iv = new byte[IV_BYTES];
        secureRandom.nextBytes(iv);
        try {
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.ENCRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, iv));
            byte[] encrypted = cipher.doFinal(token.getBytes(java.nio.charset.StandardCharsets.UTF_8));
            byte[] combined = new byte[iv.length + encrypted.length];
            System.arraycopy(iv, 0, combined, 0, iv.length);
            System.arraycopy(encrypted, 0, combined, iv.length, encrypted.length);
            return Base64.getEncoder().encodeToString(combined);
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Lazada token encryption failed.", ex);
        }
    }

    public String decrypt(String ciphertext) {
        byte[] key = properties.encryptionKeyBytes();
        if (key == null || ciphertext == null || ciphertext.isBlank()) {
            throw new IllegalStateException("Lazada token cannot be decrypted.");
        }
        try {
            byte[] combined = Base64.getDecoder().decode(ciphertext);
            if (combined.length <= IV_BYTES + 16) {
                throw new IllegalArgumentException("Ciphertext is invalid.");
            }
            byte[] iv = java.util.Arrays.copyOfRange(combined, 0, IV_BYTES);
            byte[] encrypted = java.util.Arrays.copyOfRange(combined, IV_BYTES, combined.length);
            Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE, new SecretKeySpec(key, "AES"), new GCMParameterSpec(TAG_BITS, iv));
            return new String(cipher.doFinal(encrypted), java.nio.charset.StandardCharsets.UTF_8);
        } catch (GeneralSecurityException | IllegalArgumentException ex) {
            throw new IllegalStateException("Lazada token cannot be decrypted.", ex);
        }
    }
}
