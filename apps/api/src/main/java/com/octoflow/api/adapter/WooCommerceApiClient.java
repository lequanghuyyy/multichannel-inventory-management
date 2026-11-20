package com.octoflow.api.adapter;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.config.WooCommerceProperties;
import org.springframework.stereotype.Component;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.ConnectException;
import java.net.NoRouteToHostException;
import java.net.URI;
import java.net.URLDecoder;
import java.net.URLEncoder;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.HttpTimeoutException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Small, dependency-free WooCommerce REST client for the {@code wc/v3} API.
 *
 * Safety properties:
 * - credentials are only sent as a Basic header over HTTPS, or used to sign OAuth 1.0a query
 *   parameters over an explicitly trusted plain-HTTP development host (WooCommerce rejects
 *   Basic auth on HTTP); the consumer secret is never put in the URL;
 * - redirects are never followed;
 * - product and variation IDs must be numeric, so a mapping can never inject a path;
 * - failures are translated into stable reason codes and messages that never contain the
 *   request URL, query credentials or response body secrets.
 */
@Component
public class WooCommerceApiClient {

    private static final String API_PATH = "/wp-json/wc/v3";
    private static final String INDEX_PATH = "/wp-json/";
    private static final int MAX_REMOTE_MESSAGE = 200;

    private final WooCommerceProperties properties;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    public WooCommerceApiClient(WooCommerceProperties properties, ObjectMapper objectMapper) {
        this.properties = properties;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newBuilder()
                .connectTimeout(Duration.ofMillis(properties.getConnectTimeoutMs()))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    public record SiteInfo(String name, String url) {
    }

    public record ConnectionSnapshot(SiteInfo site, boolean productsRead, String wcVersion,
                                     String wpVersion, String currency, String authMode) {
    }

    public record RemoteItem(String productId, String variationId, String type, String status,
                             String sku, boolean manageStock, Integer stockQuantity, long version) {
    }

    /**
     * Verifies the store is reachable, the credentials can list products, and (best effort)
     * reads the platform versions/currency. A successful check proves read access only; it says
     * nothing about inventory write permission.
     */
    public ConnectionSnapshot inspectConnection() {
        properties.validatedBaseUri();
        JsonNode index = getJson(INDEX_PATH, false);
        JsonNode products = getJson(API_PATH + "/products?per_page=1", true);
        if (products == null || !products.isArray()) {
            throw invalidResponse("WooCommerce products response was not a JSON array.");
        }
        JsonNode system = optionalSystemStatus();
        // WooCommerce exposes the plugin version as environment.version; older stores and
        // mocks used environment.wc_version. Accept both so the status is never blank.
        String wcVersion = nodeText(system, "environment", "version");
        if (wcVersion == null) {
            wcVersion = nodeText(system, "environment", "wc_version");
        }
        return new ConnectionSnapshot(
                new SiteInfo(text(index, "name"), text(index, "url")),
                true,
                wcVersion,
                nodeText(system, "environment", "wp_version"),
                nodeText(system, "settings", "currency"),
                properties.authMode());
    }

    public RemoteItem fetchProduct(String productId) {
        String id = requireNumeric(productId, WooCommerceReason.PRODUCT_ID_INVALID);
        JsonNode node = getJson(API_PATH + "/products/" + id, true);
        requireObject(node, "product");
        String returnedId = text(node, "id");
        if (!id.equals(returnedId)) {
            throw invalidResponse("WooCommerce returned a different product id than requested.");
        }
        return new RemoteItem(id, null, text(node, "type"), text(node, "status"),
                text(node, "sku"), bool(node, "manage_stock"),
                integer(node, "stock_quantity"), version(node));
    }

    public RemoteItem fetchVariation(String productId, String variationId) {
        String parent = requireNumeric(productId, WooCommerceReason.PRODUCT_ID_INVALID);
        String id = requireNumeric(variationId, WooCommerceReason.VARIATION_ID_INVALID);
        JsonNode node = getJson(API_PATH + "/products/" + parent + "/variations/" + id, true);
        requireObject(node, "variation");
        String returnedId = text(node, "id");
        if (!id.equals(returnedId)) {
            throw invalidResponse("WooCommerce returned a different variation id than requested.");
        }
        String returnedParent = text(node, "parent_id");
        if (returnedParent != null && !parent.equals(returnedParent)) {
            throw invalidResponse("WooCommerce returned a variation under a different product.");
        }
        return new RemoteItem(parent, id, "variation", null, text(node, "sku"),
                bool(node, "manage_stock"), integer(node, "stock_quantity"), version(node));
    }

    /** Sends only {@code stock_quantity}; stock management is never enabled by this call. */
    public Integer updateProductStock(String productId, int quantity) {
        String id = requireNumeric(productId, WooCommerceReason.PRODUCT_ID_INVALID);
        return updateStock(API_PATH + "/products/" + id, quantity);
    }

    /** Sends only {@code stock_quantity}; stock management is never enabled by this call. */
    public Integer updateVariationStock(String productId, String variationId, int quantity) {
        String parent = requireNumeric(productId, WooCommerceReason.PRODUCT_ID_INVALID);
        String id = requireNumeric(variationId, WooCommerceReason.VARIATION_ID_INVALID);
        return updateStock(API_PATH + "/products/" + parent + "/variations/" + id, quantity);
    }

    private Integer updateStock(String path, int quantity) {
        String body;
        try {
            body = objectMapper.writeValueAsString(objectMapper.createObjectNode()
                    .put("stock_quantity", quantity));
        } catch (JsonProcessingException ex) {
            throw invalidResponse("Could not encode the stock update.", ex);
        }
        try {
            JsonNode node = executeJson("PUT", path, body, true);
            requireObject(node, "stock update");
            return integer(node, "stock_quantity");
        } catch (ChannelAdapterException ex) {
            if (ex.getKind() == ChannelAdapterException.Kind.PROTOCOL) {
                // The request was sent and the store answered, but its answer cannot be read.
                // The mutation may have been applied; only a read-back can decide, so never
                // let this look like a retryable "request was not sent" failure.
                throw new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                        ex.reasonCodeOrKind(),
                        "WooCommerce accepted the stock update but its response could not be read; "
                                + "the remote result is uncertain until it is read back.", ex);
            }
            throw ex;
        }
    }

    private JsonNode optionalSystemStatus() {
        try {
            JsonNode node = getJson(API_PATH + "/system_status", true);
            return node != null && node.isObject() ? node : null;
        } catch (ChannelAdapterException ex) {
            // Store versions and currency are useful metadata, but product read access is the
            // connection proof. A key with narrower permissions must not be reported as broken
            // when the required inventory read already succeeded.
            return null;
        }
    }

    private JsonNode getJson(String path, boolean authenticated) {
        return executeJson("GET", path, null, authenticated);
    }

    private JsonNode executeJson(String method, String path, String body, boolean authenticated) {
        String responseBody = execute(method, path, body, authenticated);
        try {
            JsonNode node = objectMapper.readTree(responseBody);
            if (node == null || node.isMissingNode()) {
                throw invalidResponse("WooCommerce returned an empty response.");
            }
            return node;
        } catch (JsonProcessingException ex) {
            throw invalidResponse("WooCommerce returned a response that is not valid JSON.", ex);
        }
    }

    private String execute(String method, String path, String body, boolean authenticated) {
        URI uri = buildUri(method, path, authenticated);
        HttpRequest.Builder builder = HttpRequest.newBuilder(uri)
                .timeout(Duration.ofMillis(properties.getReadTimeoutMs()))
                .header("Accept", "application/json")
                .header("User-Agent", "OctoFlow-WooCommerce-Connector/1.0");
        if (authenticated && properties.usesBasicAuth()) {
            String token = Base64.getEncoder().encodeToString(
                    (properties.getConsumerKey() + ":" + properties.getConsumerSecret())
                            .getBytes(StandardCharsets.UTF_8));
            builder.header("Authorization", "Basic " + token);
        }
        if (body == null) {
            builder.method(method, HttpRequest.BodyPublishers.noBody());
        } else {
            builder.header("Content-Type", "application/json")
                    .method(method, HttpRequest.BodyPublishers.ofString(body, StandardCharsets.UTF_8));
        }

        HttpResponse<String> response;
        try {
            response = httpClient.send(builder.build(), HttpResponse.BodyHandlers.ofString(StandardCharsets.UTF_8));
        } catch (HttpConnectTimeoutException ex) {
            // No TCP/TLS connection was established, so a PUT can never have reached the store.
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.CONNECTION_FAILED,
                    "WooCommerce did not accept a connection within " + properties.getConnectTimeoutMs()
                            + " ms; no request was sent.", ex);
        } catch (HttpTimeoutException ex) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                    WooCommerceReason.TIMEOUT,
                    "WooCommerce did not respond within " + properties.getReadTimeoutMs()
                            + " ms; the remote result is uncertain.", ex);
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
            throw new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                    WooCommerceReason.TIMEOUT,
                    "The WooCommerce call was interrupted; the remote result is uncertain.", ex);
        } catch (ConnectException | UnknownHostException | NoRouteToHostException ex) {
            // Definitely refused before any bytes were written: a retry cannot duplicate a write.
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.CONNECTION_FAILED,
                    "WooCommerce is unreachable; check the store URL and network. No request was sent.", ex);
        } catch (IOException ex) {
            // A reset/handshake failure can happen after the request body left this process. The
            // write may have been applied, so the caller must read back before retrying it.
            throw new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                    WooCommerceReason.CONNECTION_LOST,
                    "The WooCommerce connection was lost; the remote result is uncertain until it is read back.", ex);
        }

        int status = response.statusCode();
        if (status >= 200 && status < 300) {
            return response.body();
        }
        throw httpFailure(status, response.body());
    }

    private ChannelAdapterException httpFailure(int status, String body) {
        String detail = safeRemoteMessage(body);
        String suffix = detail == null ? "" : " " + detail;
        if (status == 401) {
            return new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.AUTH_FAILED,
                    "WooCommerce rejected the API credentials (HTTP 401)." + suffix);
        }
        if (status == 403) {
            return new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.PERMISSION_DENIED,
                    "WooCommerce API credentials do not have permission for this operation (HTTP 403)." + suffix);
        }
        if (status == 404) {
            return new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.NOT_FOUND,
                    "WooCommerce resource was not found (HTTP 404)." + suffix);
        }
        if (status == 429) {
            return new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                    WooCommerceReason.RATE_LIMITED,
                    "WooCommerce rate limit was reached (HTTP 429)." + suffix);
        }
        if (status == 408 || status >= 500) {
            // The store answered, but it may have applied the mutation before failing. Treat it
            // as uncertain so no caller retries the PUT before an independent read-back.
            return new ChannelAdapterException(ChannelAdapterException.Kind.TIMEOUT,
                    WooCommerceReason.HTTP_ERROR,
                    "WooCommerce returned HTTP " + status + "; the remote result is uncertain." + suffix);
        }
        return new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED,
                WooCommerceReason.HTTP_ERROR,
                "WooCommerce returned HTTP " + status + "." + suffix);
    }

    private URI buildUri(String method, String path, boolean authenticated) {
        URI base = properties.validatedBaseUri();
        URI relative = URI.create(path.startsWith("/") ? path : "/" + path);
        String rawPath = relative.getRawPath() == null ? "" : relative.getRawPath();
        String baseUrl = origin(base) + properties.basePath() + rawPath;
        if (!authenticated || properties.usesBasicAuth()) {
            return createUri(appendQuery(baseUrl, relative.getRawQuery()));
        }
        return createUri(signOAuth(method, baseUrl, relative.getRawQuery()));
    }

    /**
     * WooCommerce only accepts Basic auth over TLS. On plain HTTP it expects one-legged OAuth
     * 1.0a, so the key and an HMAC-SHA1 signature go in the query string while the secret stays
     * local as the signing key.
     */
    private String signOAuth(String method, String baseUrl, String rawQuery) {
        List<Map.Entry<String, String>> params = new ArrayList<>();
        if (rawQuery != null && !rawQuery.isBlank()) {
            for (String pair : rawQuery.split("&")) {
                if (pair.isBlank()) {
                    continue;
                }
                String[] parts = pair.split("=", 2);
                String key = decode(parts[0]);
                String value = parts.length == 2 ? decode(parts[1]) : "";
                params.add(Map.entry(key, value));
            }
        }
        params.add(Map.entry("oauth_consumer_key", properties.getConsumerKey()));
        params.add(Map.entry("oauth_nonce", UUID.randomUUID().toString().replace("-", "")));
        params.add(Map.entry("oauth_signature_method", "HMAC-SHA1"));
        params.add(Map.entry("oauth_timestamp", Long.toString(Instant.now().getEpochSecond())));
        params.add(Map.entry("oauth_version", "1.0"));

        params.add(Map.entry("oauth_signature", oauthSignature(method, baseUrl, params)));
        return appendQuery(baseUrl, params.stream()
                .map(entry -> encode(entry.getKey()) + "=" + encode(entry.getValue()))
                .reduce((left, right) -> left + "&" + right)
                .orElse(null));
    }

    private String oauthSignature(String method, String baseUrl, List<Map.Entry<String, String>> params) {
        List<Map.Entry<String, String>> encoded = params.stream()
                .map(entry -> Map.entry(encode(entry.getKey()), encode(entry.getValue())))
                .sorted(Comparator.<Map.Entry<String, String>, String>comparing(Map.Entry::getKey)
                        .thenComparing(Map.Entry::getValue))
                .toList();
        String normalized = encoded.stream()
                .map(entry -> entry.getKey() + "=" + entry.getValue())
                .reduce((left, right) -> left + "&" + right)
                .orElse("");
        String base = method.toUpperCase(Locale.ROOT) + "&" + encode(baseUrl) + "&" + encode(normalized);
        String key = encode(properties.getConsumerSecret()) + "&";
        try {
            Mac mac = Mac.getInstance("HmacSHA1");
            mac.init(new SecretKeySpec(key.getBytes(StandardCharsets.UTF_8), "HmacSHA1"));
            return Base64.getEncoder().encodeToString(mac.doFinal(base.getBytes(StandardCharsets.UTF_8)));
        } catch (GeneralSecurityException ex) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.NOT_CONFIGURED,
                    "Could not sign the WooCommerce request.", ex);
        }
    }

    private String appendQuery(String url, String rawQuery) {
        String normalized = rawQuery == null || rawQuery.isBlank() ? null : rawQuery;
        if (normalized == null) {
            return url;
        }
        return url + (url.contains("?") ? "&" : "?") + normalized;
    }

    private URI createUri(String url) {
        try {
            return URI.create(url);
        } catch (IllegalArgumentException ex) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.UNAVAILABLE,
                    WooCommerceReason.BASE_URL_INVALID, "WooCommerce base URL is invalid.", ex);
        }
    }

    private String decode(String value) {
        return URLDecoder.decode(value, StandardCharsets.UTF_8);
    }

    private String origin(URI base) {
        String host = base.getHost().toLowerCase(Locale.ROOT);
        String authorityHost = host.contains(":") && !host.startsWith("[") ? "[" + host + "]" : host;
        String authority = base.getPort() >= 0
                ? authorityHost + ":" + base.getPort()
                : authorityHost;
        return base.getScheme().toLowerCase(Locale.ROOT) + "://" + authority;
    }

    private String safeRemoteMessage(String body) {
        if (body == null || body.isBlank()) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(body);
            String message = node == null ? null : text(node, "message");
            if (message == null) {
                return null;
            }
            String sanitized = message.replaceAll("[\\r\\n\\t]", " ").trim();
            if (sanitized.isEmpty()) {
                return null;
            }
            return sanitized.length() <= MAX_REMOTE_MESSAGE
                    ? sanitized
                    : sanitized.substring(0, MAX_REMOTE_MESSAGE);
        } catch (JsonProcessingException ex) {
            return null;
        }
    }

    private JsonNode requireObject(JsonNode node, String label) {
        if (node == null || !node.isObject()) {
            throw invalidResponse("WooCommerce " + label + " response was not a JSON object.");
        }
        return node;
    }

    private String requireNumeric(String value, String reasonCode) {
        String trimmed = value == null ? null : value.trim();
        if (trimmed == null || !trimmed.matches("\\d{1,20}")) {
            throw new ChannelAdapterException(ChannelAdapterException.Kind.REFUSED, reasonCode,
                    "WooCommerce identifiers must be numeric.");
        }
        return trimmed;
    }

    private String text(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        String value = node.get(field).asText();
        return value == null || value.isBlank() ? null : value;
    }

    private String nodeText(JsonNode node, String parent, String field) {
        return node == null ? null : text(node.path(parent), field);
    }

    private boolean bool(JsonNode node, String field) {
        return node != null && node.path(field).asBoolean(false);
    }

    private Integer integer(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) {
            return null;
        }
        JsonNode value = node.get(field);
        if (!value.isNumber()) {
            throw invalidResponse("WooCommerce field '" + field + "' was not a number.");
        }
        return value.asInt();
    }

    private long version(JsonNode node) {
        String modified = text(node, "date_modified_gmt");
        if (modified == null) {
            modified = text(node, "date_modified");
        }
        if (modified == null) {
            return 0L;
        }
        try {
            if (modified.endsWith("Z")) {
                return Instant.parse(modified).getEpochSecond();
            }
            return LocalDateTime.parse(modified).toEpochSecond(ZoneOffset.UTC);
        } catch (DateTimeParseException ex) {
            return Math.abs((long) modified.hashCode());
        }
    }

    private String encode(String value) {
        return URLEncoder.encode(value == null ? "" : value, StandardCharsets.UTF_8)
                .replace("+", "%20")
                .replace("*", "%2A")
                .replace("%7E", "~");
    }

    private ChannelAdapterException invalidResponse(String message) {
        return new ChannelAdapterException(ChannelAdapterException.Kind.PROTOCOL,
                WooCommerceReason.INVALID_RESPONSE, message);
    }

    private ChannelAdapterException invalidResponse(String message, Throwable cause) {
        return new ChannelAdapterException(ChannelAdapterException.Kind.PROTOCOL,
                WooCommerceReason.INVALID_RESPONSE, message, cause);
    }
}
