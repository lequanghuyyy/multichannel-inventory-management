-- Phase 06: persisted WooCommerce connection metadata.
--
-- Credentials are never stored here. Only the non-secret result of a live
-- connection check and the last classified error are kept so the seller UI can
-- show whether a channel was actually verified instead of inferring it from a
-- configured URL.

ALTER TABLE channels
    ADD COLUMN connector_name VARCHAR(64),
    ADD COLUMN connector_version VARCHAR(64),
    ADD COLUMN connection_verified_at TIMESTAMPTZ,
    ADD COLUMN connection_products_read BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN connection_auth_mode VARCHAR(32),
    ADD COLUMN external_store_name VARCHAR(255),
    ADD COLUMN external_store_url VARCHAR(512),
    ADD COLUMN external_wc_version VARCHAR(64),
    ADD COLUMN external_wp_version VARCHAR(64),
    ADD COLUMN external_currency VARCHAR(8),
    ADD COLUMN connection_last_error_code VARCHAR(64),
    ADD COLUMN connection_last_error_message VARCHAR(500);

ALTER TABLE channels
    ADD CONSTRAINT chk_channels_connection_last_error_message_length
        CHECK (connection_last_error_message IS NULL OR char_length(connection_last_error_message) <= 500);
