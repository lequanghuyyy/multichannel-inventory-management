package com.octoflow.api.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

/**
 * A tiny WooCommerce-shaped HTTP server for connector tests.
 *
 * It implements only the endpoints Phase 06 uses, records whether a stock mutation reached the
 * server, and can simulate auth rejection, remote clamping and timeouts. It never sees production
 * credentials: tests pass throwaway values.
 */
public final class WooCommerceMockStore implements AutoCloseable {

    private static final ObjectMapper JSON = new ObjectMapper();

    public final AtomicInteger putCount = new AtomicInteger();
    public final AtomicInteger completedPuts = new AtomicInteger();
    public final AtomicInteger productReads = new AtomicInteger();
    public volatile String lastPutBody;
    public volatile String productType = "simple";
    public volatile String productSku = "WOO-SKU-A";
    public volatile String variationSku = "WOO-SKU-VAR";
    public volatile boolean manageStock = true;
    public volatile int stock = 8;
    public volatile int variationStock = 4;
    public volatile Integer clampStockTo;
    public volatile long putDelayMs;
    public volatile boolean rejectProducts;
    /** When true, a PUT succeeds but the response omits stock_quantity, like some WooCommerce setups. */
    public volatile boolean omitStockQuantityOnPut;
    /** When true, a PUT is applied but the response body is not valid JSON. */
    public volatile boolean malformedPutResponse;

    private final HttpServer server;
    private final ExecutorService executor;

    public WooCommerceMockStore() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", this::handle);
        executor = Executors.newCachedThreadPool(task -> {
            Thread thread = new Thread(task, "woocommerce-mock-store");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(executor);
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public void reset() {
        putCount.set(0);
        completedPuts.set(0);
        lastPutBody = null;
        productReads.set(0);
        productType = "simple";
        productSku = "WOO-SKU-A";
        variationSku = "WOO-SKU-VAR";
        manageStock = true;
        stock = 8;
        variationStock = 4;
        clampStockTo = null;
        putDelayMs = 0;
        rejectProducts = false;
        omitStockQuantityOnPut = false;
        malformedPutResponse = false;
    }

    /**
     * WooCommerce requires OAuth 1.0a on plain HTTP. Tests do not re-check the HMAC, but they do
     * fail if the client degrades to raw key/secret query parameters.
     */
    private boolean authenticated(String query) {
        return query != null
                && query.contains("oauth_consumer_key=")
                && query.contains("oauth_signature=")
                && query.contains("oauth_signature_method=HMAC-SHA1");
    }

    private void handle(HttpExchange exchange) {
        String method = exchange.getRequestMethod();
        String path = exchange.getRequestURI().getPath();
        String query = exchange.getRequestURI().getRawQuery();
        try {
            if ("/wp-json/".equals(path)) {
                respond(exchange, 200, site());
                return;
            }
            if ("/wp-json/wc/v3/system_status".equals(path)) {
                respond(exchange, 200, systemStatus());
                return;
            }
            if ("/wp-json/wc/v3/products".equals(path) && "GET".equals(method)) {
                if (rejectProducts || !authenticated(query)) {
                    respond(exchange, 401, error("woocommerce_rest_cannot_view",
                            "Sorry, you cannot list resources."));
                    return;
                }
                productReads.incrementAndGet();
                ArrayNode products = JSON.createArrayNode();
                products.add(product());
                respond(exchange, 200, products);
                return;
            }
            if ("/wp-json/wc/v3/products/101".equals(path)) {
                boolean put = "PUT".equals(method);
                if (put) {
                    putCount.incrementAndGet();
                    String body = readBody(exchange);
                    lastPutBody = body;
                    try {
                        if (putDelayMs > 0) {
                            Thread.sleep(putDelayMs);
                        }
                        int requested = JSON.readTree(body).path("stock_quantity").asInt();
                        stock = clampStockTo == null ? requested : clampStockTo;
                    } finally {
                        completedPuts.incrementAndGet();
                    }
                }
                // Only the PUT response may omit the field. A GET must still report the real
                // stock, otherwise read-back could never prove the write.
                if (put && malformedPutResponse) {
                    respondRaw(exchange, 200, "{\"id\":101,");
                } else {
                    respond(exchange, 200, put && omitStockQuantityOnPut ? productWithoutStock() : product());
                }
                return;
            }
            if ("/wp-json/wc/v3/products/101/variations/202".equals(path)) {
                respond(exchange, 200, variation());
                return;
            }
            respond(exchange, 404, error("rest_no_route", "No route was found."));
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        } catch (IOException ex) {
            // A client timeout can close the socket before the delayed mock response is written.
        } finally {
            exchange.close();
        }
    }

    private ObjectNode site() {
        ObjectNode node = JSON.createObjectNode();
        node.put("name", "OctoFlow Development Store");
        node.put("url", baseUrl());
        return node;
    }

    private ObjectNode systemStatus() {
        ObjectNode node = JSON.createObjectNode();
        node.putObject("environment").put("wc_version", "9.5.1").put("wp_version", "6.7.1");
        node.putObject("settings").put("currency", "VND");
        return node;
    }

    private ObjectNode product() {
        ObjectNode node = JSON.createObjectNode();
        node.put("id", 101);
        node.put("type", productType);
        node.put("status", "publish");
        node.put("sku", productSku);
        node.put("manage_stock", manageStock);
        node.put("stock_quantity", stock);
        node.put("date_modified_gmt", "2026-01-01T00:00:00Z");
        return node;
    }

    private ObjectNode productWithoutStock() {
        ObjectNode node = product();
        node.remove("stock_quantity");
        return node;
    }

    private ObjectNode variation() {
        ObjectNode node = JSON.createObjectNode();
        node.put("id", 202);
        node.put("parent_id", 101);
        node.put("sku", variationSku);
        node.put("manage_stock", manageStock);
        node.put("stock_quantity", variationStock);
        node.put("date_modified_gmt", "2026-01-01T00:00:00Z");
        return node;
    }

    private ObjectNode error(String code, String message) {
        ObjectNode node = JSON.createObjectNode();
        node.put("code", code);
        node.put("message", message);
        return node;
    }

    private String readBody(HttpExchange exchange) throws IOException {
        return new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
    }

    private void respond(HttpExchange exchange, int status, JsonNode body) throws IOException {
        respondRaw(exchange, status, JSON.writeValueAsString(body));
    }

    private void respondRaw(HttpExchange exchange, int status, String body) throws IOException {
        byte[] payload = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, payload.length);
        exchange.getResponseBody().write(payload);
    }

    public boolean awaitCompletedPuts(int expected, long timeoutMs) {
        long deadline = System.currentTimeMillis() + timeoutMs;
        while (completedPuts.get() < expected && System.currentTimeMillis() < deadline) {
            try {
                Thread.sleep(20);
            } catch (InterruptedException ex) {
                Thread.currentThread().interrupt();
                return false;
            }
        }
        return completedPuts.get() >= expected;
    }

    @Override
    public void close() {
        server.stop(0);
        executor.shutdownNow();
    }
}
