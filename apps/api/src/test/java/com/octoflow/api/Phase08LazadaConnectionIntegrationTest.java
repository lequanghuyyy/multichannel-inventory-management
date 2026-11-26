package com.octoflow.api;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.octoflow.api.adapter.LazadaRequestSigner;
import com.octoflow.api.support.LazadaMockServer;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.test.context.support.WithMockUser;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;

import java.io.IOException;
import java.net.URI;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.Arrays;
import java.util.HexFormat;
import java.util.Map;
import java.util.stream.Collectors;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.anonymous;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = {
        "app.sync.workers-enabled=false",
        "app.channels.simulator.enabled=false",
        "app.channels.lazada.enabled=true",
        "app.channels.lazada.country=VN",
        "app.channels.lazada.environment=sandbox",
        "app.channels.lazada.app-key=lazada-test-app",
        "app.channels.lazada.app-secret=lazada-test-secret",
        "app.channels.lazada.redirect-uri=http://localhost:8085/api/v1/integrations/lazada/callback",
        "app.channels.lazada.frontend-base-url=http://localhost:5174",
        "app.channels.lazada.frontend-channels-path=/channels",
        "app.channels.lazada.token-encryption-key=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=",
        "app.channels.lazada.token-key-id=test-v1",
        "app.channels.lazada.allowed-environments=sandbox",
        "app.channels.lazada.product-write-enabled=false",
        "app.channels.lazada.inventory-write-enabled=false",
        "app.channels.lazada.order-write-enabled=false",
        "app.channels.lazada.connect-timeout-ms=1000",
        "app.channels.lazada.read-timeout-ms=1000"
})
@AutoConfigureMockMvc
@Testcontainers
@WithMockUser(username = "admin", roles = "ADMIN")
class Phase08LazadaConnectionIntegrationTest {

    private static final String TEST_SECRET = "lazada-test-secret";
    private static final LazadaMockServer LAZADA = startLazada();

    @Container
    static final PostgreSQLContainer<?> POSTGRES = new PostgreSQLContainer<>("postgres:17-alpine");

    @DynamicPropertySource
    static void properties(DynamicPropertyRegistry registry) {
        registry.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        registry.add("spring.datasource.username", POSTGRES::getUsername);
        registry.add("spring.datasource.password", POSTGRES::getPassword);
        registry.add("spring.flyway.baseline-on-migrate", () -> false);
        registry.add("app.channels.lazada.auth-base-url", LAZADA::baseUrl);
        registry.add("app.channels.lazada.api-base-url", () -> LAZADA.baseUrl() + "/rest");
    }

    @Autowired JdbcTemplate jdbcTemplate;
    @Autowired MockMvc mockMvc;
    @Autowired ObjectMapper objectMapper;

    @BeforeEach
    void reset() {
        LAZADA.reset();
        jdbcTemplate.update("DELETE FROM lazada_oauth_states");
        jdbcTemplate.update("DELETE FROM lazada_connections");
        jdbcTemplate.update("DELETE FROM channels WHERE code = 'lazada'");
        jdbcTemplate.update("""
                INSERT INTO users (username, email, password_hash, role, is_active)
                VALUES ('admin', 'admin@lazada-test.invalid', 'not-used', 'ADMIN', TRUE)
                ON CONFLICT (username) DO NOTHING
                """);
    }

    @Test
    void statusIsConfiguredButHasNoConnectionAndNeverEnablesWrites() throws Exception {
        String body = mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true))
                .andExpect(jsonPath("$.configured").value(true))
                .andExpect(jsonPath("$.country").value("VN"))
                .andExpect(jsonPath("$.write_enabled").value(false))
                .andExpect(jsonPath("$.product_write_enabled").value(false))
                .andExpect(jsonPath("$.inventory_write_enabled").value(false))
                .andExpect(jsonPath("$.order_write_enabled").value(false))
                .andReturn().getResponse().getContentAsString();
        assertTrue(objectMapper.readTree(body).get("connection").isNull());
    }

    @Test
    void connectStoresOnlyTheHashedSingleUseStateAndReturnsOfficialAuthorizationUrl() throws Exception {
        String url = mockMvc.perform(post("/api/v1/integrations/lazada/connect").with(csrf()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        JsonNode body = objectMapper.readTree(url);
        URI authorization = URI.create(body.path("authorization_url").asText());
        Map<String, String> query = query(authorization);

        assertEquals("https", authorization.getScheme());
        assertEquals("auth.lazada.com", authorization.getHost());
        assertEquals("/oauth/authorize", authorization.getPath());
        assertEquals("code", query.get("response_type"));
        assertEquals("true", query.get("force_auth"));
        assertEquals("lazada-test-app", query.get("client_id"));
        assertEquals("http://localhost:8085/api/v1/integrations/lazada/callback", query.get("redirect_uri"));
        assertTrue(query.containsKey("state"));
        assertFalse(body.asText().contains(TEST_SECRET));
        assertFalse(body.asText().contains("ACCESS-TOKEN-TEST"));

        String expectedHash = sha256(query.get("state"));
        assertEquals(expectedHash, jdbcTemplate.queryForObject(
                "SELECT state_hash FROM lazada_oauth_states WHERE state_hash = ?", String.class, expectedHash));
        assertFalse(expectedHash.equals(query.get("state")));
    }

    @Test
    void invalidExpiredAndReplayedStatesNeverExchangeAuthorizationCodeTwice() throws Exception {
        mockMvc.perform(get("/api/v1/integrations/lazada/callback")
                        .param("code", "must-not-be-used")
                        .param("state", "not-a-valid-state")
                        .with(anonymous()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("LAZADA_OAUTH_STATE_INVALID"));
        assertEquals(0, LAZADA.tokenExchangeCount.get());

        String expiredState = startOAuth();
        Instant expiredAt = Instant.now().minusSeconds(60);
        jdbcTemplate.update("UPDATE lazada_oauth_states SET created_at = ?, expires_at = ? WHERE state_hash = ?",
                Timestamp.from(expiredAt.minusSeconds(600)), Timestamp.from(expiredAt), sha256(expiredState));
        mockMvc.perform(get("/api/v1/integrations/lazada/callback")
                        .param("code", "expired-code")
                        .param("state", expiredState)
                        .with(anonymous()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("LAZADA_OAUTH_STATE_INVALID"));
        assertEquals(0, LAZADA.tokenExchangeCount.get());

        String oneTimeState = startOAuth();
        mockMvc.perform(get("/api/v1/integrations/lazada/callback")
                        .param("code", "single-use-code")
                        .param("state", oneTimeState)
                        .with(anonymous()))
                .andExpect(status().isFound());
        mockMvc.perform(get("/api/v1/integrations/lazada/callback")
                        .param("code", "single-use-code")
                        .param("state", oneTimeState)
                        .with(anonymous()))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.error.code").value("LAZADA_OAUTH_STATE_INVALID"));
        assertEquals(1, LAZADA.tokenExchangeCount.get());
    }

    @Test
    void callbackEncryptsTokensAndDoesNotClaimConnectionBeforeLiveVerification() throws Exception {
        String state = startOAuth();
        String location = mockMvc.perform(get("/api/v1/integrations/lazada/callback")
                        .param("code", "one-time-auth-code")
                        .param("state", state)
                        .with(anonymous()))
                .andExpect(status().isFound())
                .andReturn().getResponse().getHeader("Location");

        assertNotNull(location);
        URI redirect = URI.create(location);
        Map<String, String> query = query(redirect);
        assertEquals("success", query.get("lazada_oauth"));
        assertNotNull(query.get("channel_id"));
        assertFalse(location.contains("one-time-auth-code"));
        assertFalse(location.contains("ACCESS-TOKEN-TEST"));
        assertFalse(location.contains("REFRESH-TOKEN-TEST"));
        assertFalse(location.contains(TEST_SECRET));

        Map<String, Object> connection = jdbcTemplate.queryForMap("""
                SELECT seller_id, country, access_token_ciphertext, refresh_token_ciphertext,
                       status, last_verified_at
                FROM lazada_connections
                """);
        assertEquals("seller-test", connection.get("seller_id"));
        assertEquals("VN", connection.get("country"));
        assertEquals("disconnected", connection.get("status"));
        assertNull(connection.get("last_verified_at"));
        assertFalse(connection.get("access_token_ciphertext").toString().contains("ACCESS-TOKEN-TEST"));
        assertFalse(connection.get("refresh_token_ciphertext").toString().contains("REFRESH-TOKEN-TEST"));
        assertEquals("DISCONNECTED", jdbcTemplate.queryForObject(
                "SELECT status FROM channels WHERE code = 'lazada'", String.class));
    }

    @Test
    void successfulLiveReadsAreRequiredBeforeConnectionCapabilitiesBecomeTrue() throws Exception {
        String state = startOAuth();
        completeOAuth(state);

        mockMvc.perform(post("/api/v1/channels/{id}/lazada/verify", channelId()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("connected"));

        assertEquals(1, LAZADA.productReadCount.get());
        assertEquals(1, LAZADA.orderReadCount.get());
        assertSignedQuery(LAZADA.lastProductReadQuery, "/products/get");
        assertSignedQuery(LAZADA.lastOrderReadQuery, "/orders/get");
        assertEquals("CONNECTED", jdbcTemplate.queryForObject(
                "SELECT status FROM channels WHERE code = 'lazada'", String.class));
        mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.channel_id").value(Long.toString(channelId())))
                .andExpect(jsonPath("$.connection.status").value("connected"))
                .andExpect(jsonPath("$.connection.capabilities.products_read").value(true))
                .andExpect(jsonPath("$.connection.capabilities.orders_read").value(true))
                .andExpect(jsonPath("$.connection.capabilities.products_write").value(false))
                .andExpect(jsonPath("$.connection.capabilities.inventory_write").value(false));
    }

    @Test
    void expiredAccessTokenIsRefreshedUnderTheDatabaseLeaseBeforeLiveVerification() throws Exception {
        String state = startOAuth();
        completeOAuth(state);
        jdbcTemplate.update("UPDATE lazada_connections SET access_expires_at = ? WHERE channel_id = ?",
                Timestamp.from(Instant.now().minusSeconds(60)), channelId());

        mockMvc.perform(post("/api/v1/channels/{id}/lazada/verify", channelId()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("connected"));

        assertEquals(1, LAZADA.tokenRefreshCount.get());
        assertEquals("CONNECTED", jdbcTemplate.queryForObject(
                "SELECT status FROM channels WHERE code = 'lazada'", String.class));
    }

    @Test
    void productsReadAuthorizationFailureRequiresReauthorizationAndNeverConnects() throws Exception {
        String state = startOAuth();
        completeOAuth(state);
        LAZADA.productReadStatus = 401;

        mockMvc.perform(post("/api/v1/channels/{id}/lazada/verify", channelId()).with(csrf()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error.code").value("LAZADA_AUTH_FAILED"));

        mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.status").value("reauthorization_required"))
                .andExpect(jsonPath("$.connection.capabilities.products_read").value(false));
        assertEquals("ERROR", jdbcTemplate.queryForObject(
                "SELECT status FROM channels WHERE code = 'lazada'", String.class));
    }

    @Test
    void productsReadServerFailureNeverMarksTheConnectionAsVerified() throws Exception {
        String state = startOAuth();
        completeOAuth(state);
        LAZADA.productReadStatus = 500;

        mockMvc.perform(post("/api/v1/channels/{id}/lazada/verify", channelId()).with(csrf()))
                .andExpect(status().isBadGateway())
                .andExpect(jsonPath("$.error.code").value("LAZADA_UPSTREAM_ERROR"));

        mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.status").value("error"))
                .andExpect(jsonPath("$.connection.capabilities.products_read").value(false));
    }

    @Test
    void productsReadTimeoutNeverMarksTheConnectionAsVerified() throws Exception {
        String state = startOAuth();
        completeOAuth(state);
        LAZADA.productReadDelayMs = 1_500;

        mockMvc.perform(post("/api/v1/channels/{id}/lazada/verify", channelId()).with(csrf()))
                .andExpect(status().isGatewayTimeout())
                .andExpect(jsonPath("$.error.code").value("LAZADA_UPSTREAM_ERROR"));

        mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.status").value("error"))
                .andExpect(jsonPath("$.connection.capabilities.products_read").value(false));
    }

    @Test
    void unavailableOrdersPermissionRemainsFalseWhileProductsProveConnection() throws Exception {
        String state = startOAuth();
        completeOAuth(state);
        LAZADA.orderReadStatus = 403;

        mockMvc.perform(post("/api/v1/channels/{id}/lazada/verify", channelId()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("connected"))
                .andExpect(jsonPath("$.warning_code").value("LAZADA_ORDERS_READ_UNAVAILABLE"));
        mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.status").value("connected"))
                .andExpect(jsonPath("$.connection.capabilities.products_read").value(true))
                .andExpect(jsonPath("$.connection.capabilities.orders_read").value(false));
    }

    @Test
    void expiredRefreshTokenIsReportedAsReauthorizationRequiredByStatus() throws Exception {
        String state = startOAuth();
        completeOAuth(state);

        jdbcTemplate.update("UPDATE lazada_connections SET refresh_expires_at = ? WHERE channel_id = ?",
                Timestamp.from(Instant.now().minusSeconds(1)), channelId());
        mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.status").value("reauthorization_required"))
                .andExpect(jsonPath("$.connection.capabilities.products_read").value(false));

        jdbcTemplate.update("UPDATE lazada_connections SET refresh_expires_at = ? WHERE channel_id = ?",
                Timestamp.from(Instant.now().plusSeconds(86_400)), channelId());
        mockMvc.perform(post("/api/v1/channels/{id}/lazada/verify", channelId()).with(csrf()))
                .andExpect(status().isOk());
        jdbcTemplate.update("UPDATE lazada_connections SET refresh_expires_at = ? WHERE channel_id = ?",
                Timestamp.from(Instant.now().minusSeconds(1)), channelId());

        mockMvc.perform(get("/api/v1/integrations/lazada/status"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.connection.status").value("reauthorization_required"))
                .andExpect(jsonPath("$.connection.capabilities.products_read").value(false));
    }

    @Test
    void disconnectClearsLocalTokensAndIsIdempotent() throws Exception {
        String state = startOAuth();
        completeOAuth(state);

        mockMvc.perform(post("/api/v1/channels/{id}/lazada/disconnect", channelId()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("disconnected"));
        mockMvc.perform(post("/api/v1/channels/{id}/lazada/disconnect", channelId()).with(csrf()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("disconnected"));

        Map<String, Object> tokens = jdbcTemplate.queryForMap("""
                SELECT access_token_ciphertext, refresh_token_ciphertext, status
                FROM lazada_connections
                """);
        assertNull(tokens.get("access_token_ciphertext"));
        assertNull(tokens.get("refresh_token_ciphertext"));
        assertEquals("disconnected", tokens.get("status"));
        assertEquals(0, LAZADA.productReadCount.get());
    }

    private String startOAuth() throws Exception {
        String body = mockMvc.perform(post("/api/v1/integrations/lazada/connect").with(csrf()))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        URI authorization = URI.create(objectMapper.readTree(body).path("authorization_url").asText());
        return query(authorization).get("state");
    }

    private void completeOAuth(String state) throws Exception {
        mockMvc.perform(get("/api/v1/integrations/lazada/callback")
                        .param("code", "test-auth-code")
                        .param("state", state)
                        .with(anonymous()))
                .andExpect(status().isFound());
    }

    private Long channelId() {
        return jdbcTemplate.queryForObject("SELECT id FROM channels WHERE code = 'lazada'", Long.class);
    }

    private void assertSignedQuery(String rawQuery, String apiPath) {
        Map<String, String> parameters = query(rawQuery);
        String signature = parameters.remove("sign");
        assertNotNull(signature);
        assertEquals(LazadaRequestSigner.sign(apiPath, parameters, TEST_SECRET), signature);
    }

    private Map<String, String> query(URI uri) {
        return query(uri.getRawQuery());
    }

    private Map<String, String> query(String rawQuery) {
        return Arrays.stream(rawQuery.split("&"))
                .map(part -> part.split("=", 2))
                .collect(Collectors.toMap(
                        pair -> URLDecoder.decode(pair[0], StandardCharsets.UTF_8),
                        pair -> URLDecoder.decode(pair.length > 1 ? pair[1] : "", StandardCharsets.UTF_8)));
    }

    private String sha256(String value) throws NoSuchAlgorithmException {
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256")
                .digest(value.getBytes(StandardCharsets.UTF_8)));
    }

    private static LazadaMockServer startLazada() {
        try {
            return new LazadaMockServer();
        } catch (IOException ex) {
            throw new ExceptionInInitializerError(ex);
        }
    }
}
