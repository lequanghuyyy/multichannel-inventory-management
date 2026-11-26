package com.octoflow.api.adapter;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.config.LazadaProperties;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.io.InputStream;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.TreeMap;

@Component
public class LazadaOpenPlatformClient {

    private static final int MAX_RESPONSE_BYTES = 1_048_576;
    private final LazadaProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public LazadaOpenPlatformClient(LazadaProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(properties.getConnectTimeoutMs()))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public JsonNode exchangeCode(String code) {
        return get(properties.getAuthBaseUrl(), "/rest/auth/token/create",
                Map.of("code", code), null);
    }

    public JsonNode refreshToken(String refreshToken) {
        return get(properties.getAuthBaseUrl(), "/rest/auth/token/refresh",
                Map.of("refresh_token", refreshToken), null);
    }

    public JsonNode readProducts(String accessToken) {
        return get(properties.getApiBaseUrl(), "/products/get",
                Map.of("filter", "all", "limit", "1", "offset", "0"), accessToken);
    }

    public JsonNode readRecentOrders(String accessToken, Instant now) {
        String after = DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                OffsetDateTime.ofInstant(now.minusSeconds(900), ZoneOffset.UTC));
        String before = DateTimeFormatter.ISO_OFFSET_DATE_TIME.format(
                OffsetDateTime.ofInstant(now, ZoneOffset.UTC));
        return get(properties.getApiBaseUrl(), "/orders/get",
                Map.of("created_after", after, "created_before", before,
                        "limit", "1", "offset", "0", "sort_by", "created_at",
                        "sort_direction", "DESC"), accessToken);
    }

    private JsonNode get(String baseUrl, String path, Map<String, String> businessParameters,
                         String accessToken) {
        if (!properties.isConfigured()) {
            throw new LazadaApiException(LazadaApiException.Kind.UPSTREAM);
        }

        Map<String, String> parameters = new LinkedHashMap<>();
        parameters.put("app_key", properties.getAppKey());
        parameters.put("timestamp", Long.toString(System.currentTimeMillis()));
        parameters.put("sign_method", "sha256");
        if (accessToken != null) parameters.put("access_token", accessToken);
        parameters.putAll(businessParameters);
        parameters.put("sign", LazadaRequestSigner.sign(path, parameters, properties.getAppSecret()));

        String query = new TreeMap<>(parameters).entrySet().stream()
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .collect(java.util.stream.Collectors.joining("&"));
        URI uri;
        try {
            uri = URI.create(stripTrailingSlash(baseUrl) + path + "?" + query);
        } catch (IllegalArgumentException ex) {
            throw new LazadaApiException(LazadaApiException.Kind.PROTOCOL, ex);
        }

        HttpRequest request = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(properties.getReadTimeoutMs()))
                .header("Accept", "application/json")
                .GET()
                .build();
        HttpResponse<InputStream> response;
        try {
            response = httpClient.send(request, HttpResponse.BodyHandlers.ofInputStream());
        } catch (java.net.http.HttpTimeoutException ex) {
            throw new LazadaApiException(LazadaApiException.Kind.TIMEOUT, ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new LazadaApiException(LazadaApiException.Kind.UPSTREAM, ex);
        } catch (IOException ex) {
            throw new LazadaApiException(LazadaApiException.Kind.UPSTREAM, ex);
        }

        byte[] body;
        try (InputStream input = response.body()) {
            body = input.readNBytes(MAX_RESPONSE_BYTES + 1);
        } catch (IOException ex) {
            throw new LazadaApiException(LazadaApiException.Kind.UPSTREAM, ex);
        }
        if (body.length > MAX_RESPONSE_BYTES) {
            throw new LazadaApiException(LazadaApiException.Kind.PROTOCOL);
        }
        int status = response.statusCode();
        if (status == 401) throw new LazadaApiException(LazadaApiException.Kind.AUTHENTICATION);
        if (status == 403) throw new LazadaApiException(LazadaApiException.Kind.FORBIDDEN);
        if (status == 429) throw new LazadaApiException(LazadaApiException.Kind.RATE_LIMITED);
        if (status < 200 || status >= 300) throw new LazadaApiException(LazadaApiException.Kind.UPSTREAM);

        JsonNode json;
        try {
            json = objectMapper.readTree(body);
        } catch (IOException ex) {
            throw new LazadaApiException(LazadaApiException.Kind.PROTOCOL, ex);
        }
        if (json == null) throw new LazadaApiException(LazadaApiException.Kind.PROTOCOL);
        String code = json.path("code").asText();
        if (!"0".equals(code)) {
            if ("IllegalAccessToken".equalsIgnoreCase(code)
                    || "IllegalRefreshToken".equalsIgnoreCase(code)) {
                throw new LazadaApiException(LazadaApiException.Kind.AUTHENTICATION);
            }
            if ("AUTH_TYPE_UNSUPPORTED".equalsIgnoreCase(code)) {
                throw new LazadaApiException(LazadaApiException.Kind.FORBIDDEN);
            }
            throw new LazadaApiException(LazadaApiException.Kind.UPSTREAM);
        }
        return json;
    }

    private String encode(String value) {
        return URLEncoder.encode(value, StandardCharsets.UTF_8);
    }

    private String stripTrailingSlash(String value) {
        String result = value == null ? "" : value.trim();
        while (result.endsWith("/")) result = result.substring(0, result.length() - 1);
        return result;
    }
}
