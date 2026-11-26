package com.octoflow.api.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.sql.Timestamp;
import java.time.Instant;
import java.util.List;

@Service
public class LazadaOAuthStateRecorder {

    private final JdbcTemplate jdbcTemplate;

    public LazadaOAuthStateRecorder(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    @Transactional
    public void create(String stateHash, Long userId, String redirectUri, Instant createdAt, Instant expiresAt) {
        jdbcTemplate.update("""
                INSERT INTO lazada_oauth_states
                    (state_hash, user_id, redirect_uri, created_at, expires_at)
                VALUES (?, ?, ?, ?, ?)
                """, stateHash, userId, redirectUri, Timestamp.from(createdAt), Timestamp.from(expiresAt));
    }

    @Transactional
    public OAuthState consume(String stateHash, Instant now) {
        List<OAuthState> rows = jdbcTemplate.query("""
                SELECT state_hash, user_id, redirect_uri, expires_at
                FROM lazada_oauth_states
                WHERE state_hash = ?
                """, (rs, row) -> new OAuthState(
                rs.getString("state_hash"),
                rs.getLong("user_id"),
                rs.getString("redirect_uri"),
                rs.getTimestamp("expires_at").toInstant()), stateHash);
        if (rows.isEmpty()) return null;

        OAuthState row = rows.getFirst();
        boolean sameHash = MessageDigest.isEqual(
                stateHash.getBytes(StandardCharsets.US_ASCII),
                row.stateHash().getBytes(StandardCharsets.US_ASCII));
        if (!sameHash) return null;

        int consumed = jdbcTemplate.update("""
                UPDATE lazada_oauth_states
                SET consumed_at = ?
                WHERE state_hash = ? AND consumed_at IS NULL AND expires_at > ?
                """, Timestamp.from(now), stateHash, Timestamp.from(now));
        return consumed == 1 ? row : null;
    }

    public record OAuthState(String stateHash, Long userId, String redirectUri, Instant expiresAt) {}
}
