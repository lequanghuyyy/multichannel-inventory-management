CREATE TABLE idempotency_records (
    id BIGSERIAL PRIMARY KEY,
    scope VARCHAR(255) NOT NULL,
    idempotency_key VARCHAR(128) NOT NULL
        CHECK (idempotency_key ~ '^[A-Za-z0-9._:-]{1,128}$'),
    request_hash VARCHAR(64) NOT NULL CHECK (request_hash ~ '^[a-f0-9]{64}$'),
    status VARCHAR(16) NOT NULL CHECK (status IN ('PROCESSING', 'COMPLETED')),
    response_status INTEGER,
    response_body TEXT,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_idempotency_scope_key UNIQUE (scope, idempotency_key),
    CONSTRAINT chk_idempotency_response CHECK (
        (status = 'PROCESSING' AND response_status IS NULL AND response_body IS NULL)
        OR (status = 'COMPLETED' AND response_status BETWEEN 200 AND 299 AND response_body IS NOT NULL)
    )
);
CREATE INDEX idx_idempotency_expiry ON idempotency_records(expires_at) WHERE status = 'COMPLETED';

ALTER TABLE outbox_events ADD COLUMN event_id UUID;
UPDATE outbox_events SET event_id = gen_random_uuid() WHERE event_id IS NULL;
ALTER TABLE outbox_events ALTER COLUMN event_id SET NOT NULL;
ALTER TABLE outbox_events ADD CONSTRAINT uq_outbox_event_id UNIQUE (event_id);
ALTER TABLE outbox_events ADD COLUMN aggregate_version BIGINT;
ALTER TABLE outbox_events ADD COLUMN correlation_id VARCHAR(128);
ALTER TABLE outbox_events ADD COLUMN next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE outbox_events ADD COLUMN locked_at TIMESTAMPTZ;
ALTER TABLE outbox_events ADD COLUMN locked_by VARCHAR(128);
ALTER TABLE outbox_events ADD COLUMN published_at TIMESTAMPTZ;
CREATE INDEX idx_outbox_ready ON outbox_events(status, next_attempt_at, created_at) WHERE status = 'PENDING';
ALTER TABLE outbox_events ADD CONSTRAINT chk_outbox_retry_count CHECK (retry_count >= 0);
ALTER TABLE outbox_events ADD CONSTRAINT chk_outbox_status
    CHECK (status IN ('PENDING', 'PROCESSING', 'PUBLISHED', 'DEAD_LETTER'));

ALTER TABLE inventory_ledger ADD COLUMN operation VARCHAR(32) NOT NULL DEFAULT 'ADJUSTMENT';
ALTER TABLE inventory_ledger ADD COLUMN on_hand_before INT;
ALTER TABLE inventory_ledger ADD COLUMN reserved_before INT;
ALTER TABLE inventory_ledger ADD COLUMN safety_buffer_before INT;
ALTER TABLE inventory_ledger ADD COLUMN safety_buffer_after INT;
ALTER TABLE inventory_ledger ADD COLUMN actor_name VARCHAR(64) NOT NULL DEFAULT 'system';
UPDATE inventory_ledger
SET on_hand_before = on_hand_after - delta,
    reserved_before = reserved_after
WHERE on_hand_before IS NULL OR reserved_before IS NULL;
ALTER TABLE inventory_ledger ALTER COLUMN on_hand_before SET NOT NULL;
ALTER TABLE inventory_ledger ALTER COLUMN reserved_before SET NOT NULL;
ALTER TABLE inventory_ledger ADD CONSTRAINT chk_inventory_ledger_on_hand_delta
    CHECK (on_hand_before::BIGINT + delta::BIGINT = on_hand_after::BIGINT);
ALTER TABLE inventory_ledger ADD CONSTRAINT chk_inventory_ledger_reserved_nonnegative
    CHECK (reserved_before >= 0 AND reserved_after >= 0);
CREATE INDEX idx_inventory_ledger_variant_created ON inventory_ledger(variant_id, created_at DESC, id DESC);
