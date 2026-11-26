package com.octoflow.api.support;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicInteger;

public final class LazadaMockServer implements AutoCloseable {

    public final AtomicInteger tokenExchangeCount = new AtomicInteger();
    public final AtomicInteger tokenRefreshCount = new AtomicInteger();
    public final AtomicInteger productReadCount = new AtomicInteger();
    public final AtomicInteger orderReadCount = new AtomicInteger();
    public volatile int tokenExchangeStatus = 200;
    public volatile int tokenRefreshStatus = 200;
    public volatile int productReadStatus = 200;
    public volatile int orderReadStatus = 200;
    public volatile long productReadDelayMs;
    public volatile String tokenExchangeBody = tokenResponse();
    public volatile String tokenRefreshBody = tokenResponse();
    public volatile String productReadBody = "{\"code\":\"0\",\"data\":{\"products\":[]}}";
    public volatile String orderReadBody = "{\"code\":\"0\",\"data\":{\"orders\":[]}}";
    public volatile String lastTokenExchangeQuery;
    public volatile String lastProductReadQuery;
    public volatile String lastOrderReadQuery;

    private final HttpServer server;
    private final ExecutorService executor;

    public LazadaMockServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool(task -> {
            Thread thread = new Thread(task, "lazada-mock-server");
            thread.setDaemon(true);
            return thread;
        });
        server.setExecutor(executor);
        server.createContext("/", this::handle);
        server.start();
    }

    public String baseUrl() {
        return "http://127.0.0.1:" + server.getAddress().getPort();
    }

    public void reset() {
        tokenExchangeCount.set(0);
        tokenRefreshCount.set(0);
        productReadCount.set(0);
        orderReadCount.set(0);
        tokenExchangeStatus = 200;
        tokenRefreshStatus = 200;
        productReadStatus = 200;
        orderReadStatus = 200;
        productReadDelayMs = 0;
        tokenExchangeBody = tokenResponse();
        tokenRefreshBody = tokenResponse();
        productReadBody = "{\"code\":\"0\",\"data\":{\"products\":[]}}";
        orderReadBody = "{\"code\":\"0\",\"data\":{\"orders\":[]}}";
        lastTokenExchangeQuery = null;
        lastProductReadQuery = null;
        lastOrderReadQuery = null;
    }

    private void handle(HttpExchange exchange) {
        String path = exchange.getRequestURI().getPath();
        String query = exchange.getRequestURI().getRawQuery();
        try {
            if ("/rest/auth/token/create".equals(path)) {
                tokenExchangeCount.incrementAndGet();
                lastTokenExchangeQuery = query;
                respond(exchange, tokenExchangeStatus, tokenExchangeBody);
            } else if ("/rest/auth/token/refresh".equals(path)) {
                tokenRefreshCount.incrementAndGet();
                respond(exchange, tokenRefreshStatus, tokenRefreshBody);
            } else if ("/rest/products/get".equals(path)) {
                productReadCount.incrementAndGet();
                lastProductReadQuery = query;
                if (productReadDelayMs > 0) Thread.sleep(productReadDelayMs);
                respond(exchange, productReadStatus, productReadBody);
            } else if ("/rest/orders/get".equals(path)) {
                orderReadCount.incrementAndGet();
                lastOrderReadQuery = query;
                respond(exchange, orderReadStatus, orderReadBody);
            } else {
                respond(exchange, 404, "{\"error\":\"not found\"}");
            }
        } catch (IOException ignored) {
            // The client may close a timed-out mock response.
        } catch (InterruptedException ex) {
            Thread.currentThread().interrupt();
        } finally {
            exchange.close();
        }
    }

    private void respond(HttpExchange exchange, int status, String body) throws IOException {
        byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json");
        exchange.sendResponseHeaders(status, bytes.length);
        exchange.getResponseBody().write(bytes);
    }

    private static String tokenResponse() {
        return """
                {"code":"0","access_token":"ACCESS-TOKEN-TEST","refresh_token":"REFRESH-TOKEN-TEST",
                 "expires_in":"86400","refresh_expires_in":"4320000","country":"vn",
                 "country_user_info":[{"country":"vn","seller_id":"seller-test"}]}
                """;
    }

    @Override
    public void close() {
        server.stop(0);
        executor.shutdownNow();
    }
}
