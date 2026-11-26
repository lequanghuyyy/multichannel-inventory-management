CREATE TABLE lazada_connections (
    channel_id BIGINT PRIMARY KEY REFERENCES channels(id) ON DELETE RESTRICT,
    seller_id VARCHAR(64),
    country VARCHAR(8) NOT NULL,
    access_token_ciphertext TEXT,
    refresh_token_ciphertext TEXT,
    token_key_id VARCHAR(64) NOT NULL,
    access_expires_at TIMESTAMPTZ,
    refresh_expires_at TIMESTAMPTZ,
    status VARCHAR(32) NOT NULL CHECK (status IN ('connected', 'disconnected', 'reauthorization_required', 'error')),
    capabilities JSONB NOT NULL DEFAULT '{"products_read":false,"orders_read":false,"products_write":false,"inventory_write":false}'::jsonb,
    last_verified_at TIMESTAMPTZ,
    last_error_code VARCHAR(64),
    last_order_poll_at TIMESTAMPTZ,
    order_poll_error VARCHAR(64),
    version BIGINT NOT NULL DEFAULT 0,
    refresh_lock_id UUID,
    refresh_lock_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((access_token_ciphertext IS NULL) = (refresh_token_ciphertext IS NULL))
);

CREATE TABLE lazada_oauth_states (
    id BIGSERIAL PRIMARY KEY,
    state_hash CHAR(64) NOT NULL UNIQUE,
    user_id BIGINT NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    redirect_uri VARCHAR(512) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    consumed_at TIMESTAMPTZ,
    CHECK (expires_at > created_at)
);

CREATE INDEX idx_lazada_oauth_states_expiry ON lazada_oauth_states(expires_at);
