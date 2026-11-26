package com.octoflow.api.service;

import com.octoflow.api.config.LazadaProperties;
import com.octoflow.api.dto.response.LazadaStatusResponse;
import com.octoflow.api.exception.ErrorCode;
import com.octoflow.api.exception.ResourceNotFoundException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class LazadaConnectionRecorder {

    private final JdbcTemplate jdbcTemplate;
    private final LazadaProperties properties;

    public LazadaConnectionRecorder(JdbcTemplate jdbcTemplate, LazadaProperties properties) {
        this.jdbcTemplate = jdbcTemplate;
        this.properties = properties;
    }

    @Transactional(readOnly = true)
    public LazadaStatusResponse status() {
        Instant now = Instant.now();
        List<LazadaStatusResponse.Connection> rows = jdbcTemplate.query("""
                SELECT c.id, lc.seller_id, lc.country, lc.status, lc.access_expires_at,
                       lc.refresh_expires_at, lc.refresh_token_ciphertext,
                       lc.last_verified_at, lc.last_error_code,
                       lc.last_order_poll_at, lc.order_poll_error,
                       COALESCE((lc.capabilities ->> 'products_read')::boolean, FALSE) AS products_read,
                       COALESCE((lc.capabilities ->> 'orders_read')::boolean, FALSE) AS orders_read,
                       COALESCE((lc.capabilities ->> 'products_write')::boolean, FALSE) AS products_write,
                       COALESCE((lc.capabilities ->> 'inventory_write')::boolean, FALSE) AS inventory_write
                FROM channels c
                LEFT JOIN lazada_connections lc ON lc.channel_id = c.id
                WHERE c.code = 'lazada'
                """, (rs, row) -> {
            if (rs.getObject("status") == null) return null;
            long id = rs.getLong("id");
            Instant refreshExpiresAt = instant(rs.getTimestamp("refresh_expires_at"));
            String persistedStatus = rs.getString("status");
            boolean hasRefreshToken = rs.getString("refresh_token_ciphertext") != null;
            boolean reauthorizationRequired = "reauthorization_required".equals(persistedStatus)
                    || (hasRefreshToken && (refreshExpiresAt == null || !refreshExpiresAt.isAfter(now)))
                    || (!"disconnected".equals(persistedStatus) && !hasRefreshToken);
            String connectionStatus = reauthorizationRequired
                    ? "reauthorization_required" : persistedStatus;
            return new LazadaStatusResponse.Connection(
                    Long.toString(id),
                    rs.getString("seller_id"),
                    rs.getString("country"),
                    connectionStatus,
                    instant(rs.getTimestamp("access_expires_at")),
                    refreshExpiresAt,
                    instant(rs.getTimestamp("last_verified_at")),
                    rs.getString("last_error_code"),
                    instant(rs.getTimestamp("last_order_poll_at")),
                    rs.getString("order_poll_error"),
                    new LazadaStatusResponse.Capabilities(
                            !reauthorizationRequired && rs.getBoolean("products_read"),
                            !reauthorizationRequired && rs.getBoolean("orders_read"),
                            false,
                            false));
        }).stream().filter(java.util.Objects::nonNull).toList();

        return new LazadaStatusResponse(
                properties.isEnabled(),
                properties.isConfigured(),
                properties.getCountry(),
                properties.isProductWriteEnabled() || properties.isInventoryWriteEnabled()
                        || properties.isOrderWriteEnabled(),
                properties.isProductWriteEnabled(),
                properties.isInventoryWriteEnabled(),
                properties.isOrderWriteEnabled(),
                rows.isEmpty() ? null : rows.getFirst());
    }

    @Transactional(readOnly = true)
    public Optional<ConnectionRecord> findByChannelId(Long channelId) {
        List<ConnectionRecord> rows = jdbcTemplate.query("""
                SELECT channel_id, seller_id, country, access_token_ciphertext,
                       refresh_token_ciphertext, token_key_id, access_expires_at,
                       refresh_expires_at, status
                FROM lazada_connections
                WHERE channel_id = ?
                """, (rs, row) -> new ConnectionRecord(
                rs.getLong("channel_id"),
                rs.getString("seller_id"),
                rs.getString("country"),
                rs.getString("access_token_ciphertext"),
                rs.getString("refresh_token_ciphertext"),
                rs.getString("token_key_id"),
                instant(rs.getTimestamp("access_expires_at")),
                instant(rs.getTimestamp("refresh_expires_at")),
                rs.getString("status")), channelId);
        return rows.stream().findFirst();
    }

    @Transactional
    public Long saveAuthorization(TokenSet tokenSet, String accessCiphertext, String refreshCiphertext,
                                  String keyId, String environment, Instant now) {
        Long channelId = jdbcTemplate.queryForObject("""
                INSERT INTO channels
                    (code, name, environment, status, connector_name, connector_version,
                     connection_verified_at, connection_products_read, connection_auth_mode,
                     connection_last_error_code, connection_last_error_message,
                     connection_target_fingerprint, created_at, updated_at)
                VALUES ('lazada', 'Lazada VN', ?, 'DISCONNECTED', 'lazada', 'open-platform',
                        NULL, FALSE, 'oauth2', NULL, NULL, NULL, ?, ?)
                ON CONFLICT (code) DO UPDATE SET
                    environment = EXCLUDED.environment,
                    status = 'DISCONNECTED',
                    connector_name = 'lazada',
                    connector_version = 'open-platform',
                    connection_verified_at = NULL,
                    connection_products_read = FALSE,
                    connection_auth_mode = 'oauth2',
                    connection_last_error_code = NULL,
                    connection_last_error_message = NULL,
                    connection_target_fingerprint = NULL,
                    updated_at = EXCLUDED.updated_at
                RETURNING id
                """, Long.class, environment, Timestamp.from(now), Timestamp.from(now));

        jdbcTemplate.update("""
                INSERT INTO lazada_connections
                    (channel_id, seller_id, country, access_token_ciphertext,
                     refresh_token_ciphertext, token_key_id, access_expires_at,
                     refresh_expires_at, status, capabilities, last_verified_at,
                     last_error_code, last_order_poll_at, order_poll_error, version,
                     refresh_lock_id, refresh_lock_until, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'disconnected',
                        '{"products_read":false,"orders_read":false,"products_write":false,"inventory_write":false}'::jsonb,
                        NULL, NULL, NULL, NULL, 0, NULL, NULL, ?, ?)
                ON CONFLICT (channel_id) DO UPDATE SET
                    seller_id = EXCLUDED.seller_id,
                    country = EXCLUDED.country,
                    access_token_ciphertext = EXCLUDED.access_token_ciphertext,
                    refresh_token_ciphertext = EXCLUDED.refresh_token_ciphertext,
                    token_key_id = EXCLUDED.token_key_id,
                    access_expires_at = EXCLUDED.access_expires_at,
                    refresh_expires_at = EXCLUDED.refresh_expires_at,
                    status = 'disconnected',
                    capabilities = EXCLUDED.capabilities,
                    last_verified_at = NULL,
                    last_error_code = NULL,
                    last_order_poll_at = NULL,
                    order_poll_error = NULL,
                    version = lazada_connections.version + 1,
                    refresh_lock_id = NULL,
                    refresh_lock_until = NULL,
                    updated_at = EXCLUDED.updated_at
                """, channelId, tokenSet.sellerId(), tokenSet.country(), accessCiphertext,
                refreshCiphertext, keyId, Timestamp.from(tokenSet.accessExpiresAt()),
                Timestamp.from(tokenSet.refreshExpiresAt()), Timestamp.from(now), Timestamp.from(now));
        return channelId;
    }

    @Transactional
    public void markVerified(Long channelId, boolean ordersRead, String ordersReadError, Instant now) {
        requireLazadaChannel(channelId);
        jdbcTemplate.update("""
                UPDATE channels
                SET status = 'CONNECTED', connection_verified_at = ?,
                    connection_products_read = TRUE, connection_auth_mode = 'oauth2',
                    connection_last_error_code = NULL, connection_last_error_message = NULL,
                    updated_at = ?
                WHERE id = ? AND code = 'lazada'
                """, Timestamp.from(now), Timestamp.from(now), channelId);
        jdbcTemplate.update("""
                UPDATE lazada_connections
                SET status = 'connected',
                    capabilities = jsonb_build_object('products_read', TRUE, 'orders_read', ?,
                        'products_write', FALSE, 'inventory_write', FALSE),
                    last_verified_at = ?, last_error_code = NULL,
                    order_poll_error = ?,
                    version = version + 1, updated_at = ?
                WHERE channel_id = ?
                """, ordersRead, Timestamp.from(now), ordersReadError, Timestamp.from(now), channelId);
    }

    @Transactional
    public void markFailure(Long channelId, String status, String errorCode, String safeMessage, Instant now) {
        requireLazadaChannel(channelId);
        jdbcTemplate.update("""
                UPDATE channels
                SET status = 'ERROR', connection_verified_at = NULL,
                    connection_products_read = FALSE, connection_last_error_code = ?,
                    connection_last_error_message = ?, updated_at = ?
                WHERE id = ? AND code = 'lazada'
                """, errorCode, safeMessage, Timestamp.from(now), channelId);
        jdbcTemplate.update("""
                UPDATE lazada_connections
                SET status = ?, capabilities = '{"products_read":false,"orders_read":false,"products_write":false,"inventory_write":false}'::jsonb,
                    last_verified_at = NULL, last_error_code = ?,
                    version = version + 1, updated_at = ?
                WHERE channel_id = ?
                """, status, errorCode, Timestamp.from(now), channelId);
    }

    @Transactional
    public void disconnect(Long channelId, Instant now) {
        requireLazadaChannel(channelId);
        jdbcTemplate.update("""
                UPDATE channels
                SET status = 'DISCONNECTED', connection_verified_at = NULL,
                    connection_products_read = FALSE, connection_auth_mode = NULL,
                    connection_last_error_code = NULL, connection_last_error_message = NULL,
                    updated_at = ?
                WHERE id = ? AND code = 'lazada'
                """, Timestamp.from(now), channelId);
        jdbcTemplate.update("""
                UPDATE lazada_connections
                SET access_token_ciphertext = NULL, refresh_token_ciphertext = NULL,
                    access_expires_at = NULL, refresh_expires_at = NULL,
                    status = 'disconnected',
                    capabilities = '{"products_read":false,"orders_read":false,"products_write":false,"inventory_write":false}'::jsonb,
                    last_verified_at = NULL, last_error_code = NULL,
                    refresh_lock_id = NULL, refresh_lock_until = NULL,
                    version = version + 1, updated_at = ?
                WHERE channel_id = ?
                """, Timestamp.from(now), channelId);
    }

    @Transactional
    public boolean acquireRefreshLease(Long channelId, UUID leaseId, Instant now,
                                       Instant leaseUntil, Instant refreshCutoff) {
        return jdbcTemplate.update("""
                UPDATE lazada_connections
                SET refresh_lock_id = ?, refresh_lock_until = ?, updated_at = ?
                WHERE channel_id = ? AND access_expires_at <= ? AND refresh_expires_at > ?
                  AND (refresh_lock_until IS NULL OR refresh_lock_until < ?)
                """, leaseId, Timestamp.from(leaseUntil), Timestamp.from(now), channelId,
                Timestamp.from(refreshCutoff), Timestamp.from(now), Timestamp.from(now)) == 1;
    }

    @Transactional
    public boolean storeRefreshedToken(Long channelId, UUID leaseId, TokenSet tokenSet,
                                       String accessCiphertext, String refreshCiphertext,
                                       String keyId, Instant now) {
        return jdbcTemplate.update("""
                UPDATE lazada_connections
                SET access_token_ciphertext = ?, refresh_token_ciphertext = ?,
                    token_key_id = ?, access_expires_at = ?, refresh_expires_at = ?,
                    version = version + 1, updated_at = ?,
                    refresh_lock_id = NULL, refresh_lock_until = NULL
                WHERE channel_id = ? AND refresh_lock_id = ?
                """, accessCiphertext, refreshCiphertext, keyId,
                Timestamp.from(tokenSet.accessExpiresAt()), Timestamp.from(tokenSet.refreshExpiresAt()),
                Timestamp.from(now), channelId, leaseId) == 1;
    }

    @Transactional
    public void releaseRefreshLease(Long channelId, UUID leaseId, Instant now) {
        jdbcTemplate.update("""
                UPDATE lazada_connections
                SET refresh_lock_id = NULL, refresh_lock_until = NULL, updated_at = ?
                WHERE channel_id = ? AND refresh_lock_id = ?
                """, Timestamp.from(now), channelId, leaseId);
    }

    private void requireLazadaChannel(Long channelId) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM channels WHERE id = ? AND code = 'lazada'", Integer.class, channelId);
        if (count == null || count == 0) {
            throw new ResourceNotFoundException(ErrorCode.CHANNEL_NOT_FOUND,
                    "Không tìm thấy kênh Lazada #" + channelId);
        }
    }

    private Instant instant(Timestamp timestamp) {
        return timestamp == null ? null : timestamp.toInstant();
    }

    public record ConnectionRecord(
            Long channelId,
            String sellerId,
            String country,
            String accessCiphertext,
            String refreshCiphertext,
            String tokenKeyId,
            Instant accessExpiresAt,
            Instant refreshExpiresAt,
            String status
    ) {}

    public record TokenSet(
            String accessToken,
            String refreshToken,
            String sellerId,
            String country,
            Instant accessExpiresAt,
            Instant refreshExpiresAt
    ) {}
}
