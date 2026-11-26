package com.octoflow.api.adapter;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.util.HexFormat;
import java.util.Map;
import java.util.TreeMap;

public final class LazadaRequestSigner {

    private LazadaRequestSigner() {}

    public static String sign(String apiPath, Map<String, String> parameters, String appSecret) {
        if (apiPath == null || !apiPath.startsWith("/") || appSecret == null || appSecret.isBlank()) {
            throw new IllegalArgumentException("Lazada signature inputs are invalid.");
        }
        StringBuilder content = new StringBuilder(apiPath);
        new TreeMap<>(parameters).forEach((key, value) -> {
            if (key != null && !key.isBlank() && value != null && !value.isEmpty()
                    && !"sign".equals(key)) {
                content.append(key).append(value);
            }
        });
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(appSecret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            return HexFormat.of().withUpperCase().formatHex(mac.doFinal(content.toString().getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("Lazada request signing is unavailable.", ex);
        }
    }
}
