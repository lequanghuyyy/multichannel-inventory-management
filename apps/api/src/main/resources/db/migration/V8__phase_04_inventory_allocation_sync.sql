-- Phase 04: multi-channel allocation, durable inventory sync jobs, verification evidence,
-- and a stateful simulator adapter. V1-V7 are intentionally untouched.

-- ---------------------------------------------------------------------------
-- Channel mapping identity and last verified state
-- ---------------------------------------------------------------------------
ALTER TABLE channel_listings
    ADD COLUMN external_variant_id VARCHAR(128),
    ADD COLUMN mapping_status VARCHAR(24) NOT NULL DEFAULT 'UNVERIFIED',
    ADD COLUMN mapping_verified_at TIMESTAMPTZ,
    ADD COLUMN active BOOLEAN NOT NULL DEFAULT TRUE,
    ADD COLUMN sent_quantity INT,
    ADD COLUMN acknowledged_quantity INT,
    ADD COLUMN verified_quantity INT,
    ADD COLUMN last_sync_error VARCHAR(500),
    ADD COLUMN last_verified_at TIMESTAMPTZ,
    ADD COLUMN target_allocation_revision BIGINT NOT NULL DEFAULT 0;

ALTER TABLE channel_listings
    ADD CONSTRAINT chk_channel_listing_mapping_status
        CHECK (mapping_status IN ('UNVERIFIED', 'REGISTERED', 'VERIFIED')),
    ADD CONSTRAINT chk_channel_listing_quota_nonnegative CHECK (allocated_quota >= 0),
    ADD CONSTRAINT chk_channel_listing_reported_nonnegative CHECK (reported_stock >= 0),
    ADD CONSTRAINT chk_channel_listing_sync_status
        CHECK (sync_status IN ('UNVERIFIED', 'SYNCED', 'OUT_OF_SYNC', 'ERROR')),
    ADD CONSTRAINT chk_channel_listing_sent_nonnegative
        CHECK (sent_quantity IS NULL OR sent_quantity >= 0),
    ADD CONSTRAINT chk_channel_listing_ack_nonnegative
        CHECK (acknowledged_quantity IS NULL OR acknowledged_quantity >= 0),
    ADD CONSTRAINT chk_channel_listing_verified_nonnegative
        CHECK (verified_quantity IS NULL OR verified_quantity >= 0),
    ADD CONSTRAINT chk_channel_listing_target_revision_nonnegative
        CHECK (target_allocation_revision >= 0),
    ADD CONSTRAINT chk_channel_listing_verified_mapping
        CHECK ((mapping_status = 'VERIFIED') = (mapping_verified_at IS NOT NULL));

-- New registrations must not claim the same external identity twice. Legacy rows stay
-- UNVERIFIED/NULL so an upgrade never invents identity data and never fails on old duplicates.
CREATE UNIQUE INDEX uq_channel_external_listing_registered
    ON channel_listings(channel_id, external_listing_id)
    WHERE mapping_status IN ('REGISTERED', 'VERIFIED');
CREATE UNIQUE INDEX uq_channel_external_variant_identity
    ON channel_listings(channel_id, external_variant_id)
    WHERE external_variant_id IS NOT NULL;

CREATE INDEX idx_channel_listings_variant_active
    ON channel_listings(variant_id, active, mapping_status);

-- ---------------------------------------------------------------------------
-- Per-variant allocation revision. A preview reserves a candidate revision; only one
-- confirm can advance current_revision from the previewed base revision.
-- ---------------------------------------------------------------------------
CREATE TABLE variant_allocation_states (
    variant_id BIGINT PRIMARY KEY REFERENCES product_variants(id) ON DELETE CASCADE,
    current_revision BIGINT NOT NULL DEFAULT 0 CHECK (current_revision >= 0),
    next_revision BIGINT NOT NULL DEFAULT 1 CHECK (next_revision > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_variant_allocation_revision_order CHECK (next_revision > current_revision)
);

-- ---------------------------------------------------------------------------
-- Allocation plans and immutable preview snapshots
-- ---------------------------------------------------------------------------
CREATE TABLE allocation_plans (
    id BIGSERIAL PRIMARY KEY,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    status VARCHAR(24) NOT NULL DEFAULT 'PROJECTED',
    core_version BIGINT NOT NULL,
    base_allocation_revision BIGINT NOT NULL,
    allocation_revision BIGINT NOT NULL,
    on_hand INT NOT NULL,
    reserved INT NOT NULL,
    safety_buffer INT NOT NULL,
    available_to_sell INT NOT NULL,
    total_target INT NOT NULL,
    policy VARCHAR(16) NOT NULL DEFAULT 'MANUAL',
    can_execute BOOLEAN NOT NULL DEFAULT FALSE,
    issues TEXT,
    idempotency_key VARCHAR(128),
    created_by VARCHAR(64) NOT NULL,
    confirmed_by VARCHAR(64),
    confirmed_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    last_error VARCHAR(1000),
    lease_owner VARCHAR(128),
    lease_until TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_allocation_plan_revision UNIQUE (variant_id, allocation_revision),
    CONSTRAINT chk_allocation_plan_status
        CHECK (status IN ('PROJECTED', 'APPLYING', 'COMPLETED', 'BLOCKED', 'SUPERSEDED')),
    CONSTRAINT chk_allocation_plan_policy CHECK (policy IN ('MANUAL', 'EQUAL', 'WEIGHTED')),
    CONSTRAINT chk_allocation_plan_quantities
        CHECK (on_hand >= 0 AND reserved >= 0 AND safety_buffer >= 0
            AND available_to_sell >= 0 AND total_target >= 0),
    CONSTRAINT chk_allocation_plan_availability
        CHECK (total_target <= available_to_sell),
    CONSTRAINT chk_allocation_plan_revision_order
        CHECK (allocation_revision > base_allocation_revision)
);

-- At most one executing plan per variant. This is the durable backstop behind the
-- allocation-state row lock taken by Confirm.
CREATE UNIQUE INDEX uq_allocation_plan_active_variant
    ON allocation_plans(variant_id)
    WHERE status = 'APPLYING';
CREATE INDEX idx_allocation_plan_variant_created
    ON allocation_plans(variant_id, created_at DESC, id DESC);
CREATE INDEX idx_allocation_plan_due
    ON allocation_plans(status, lease_until)
    WHERE status = 'APPLYING';

CREATE TABLE allocation_plan_items (
    id BIGSERIAL PRIMARY KEY,
    plan_id BIGINT NOT NULL REFERENCES allocation_plans(id) ON DELETE CASCADE,
    listing_id BIGINT NOT NULL REFERENCES channel_listings(id) ON DELETE RESTRICT,
    channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    external_sku VARCHAR(64),
    current_quota INT NOT NULL,
    proposed_quota INT NOT NULL,
    direction VARCHAR(16) NOT NULL,
    status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
    issues TEXT,
    attempts INT NOT NULL DEFAULT 0,
    next_attempt_at TIMESTAMPTZ,
    last_error VARCHAR(500),
    sent_quantity INT,
    acknowledged_quantity INT,
    verified_quantity INT,
    remote_before INT,
    remote_after INT,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_allocation_plan_item_listing UNIQUE (plan_id, listing_id),
    CONSTRAINT chk_allocation_plan_item_quantities
        CHECK (current_quota >= 0 AND proposed_quota >= 0),
    CONSTRAINT chk_allocation_plan_item_direction
        CHECK (direction IN ('NONE', 'DECREASE', 'INCREASE')),
    CONSTRAINT chk_allocation_plan_item_status
        CHECK (status IN ('PENDING', 'RETRY_PENDING', 'VERIFIED', 'BLOCKED', 'SUPERSEDED')),
    CONSTRAINT chk_allocation_plan_item_attempts CHECK (attempts >= 0)
);

CREATE INDEX idx_allocation_plan_item_plan_status
    ON allocation_plan_items(plan_id, direction, status, next_attempt_at);

-- ---------------------------------------------------------------------------
-- Durable outbox lease. The existing worker writes status/lease in its own short
-- transaction before contacting any adapter, so a crash is recoverable by expiry.
-- ---------------------------------------------------------------------------
ALTER TABLE outbox_events ADD COLUMN lease_until TIMESTAMPTZ;
CREATE INDEX idx_outbox_lease_recovery
    ON outbox_events(status, lease_until)
    WHERE status = 'PROCESSING';

-- ---------------------------------------------------------------------------
-- Sync jobs are the per-listing delivery unit. An absolute target is safe to retry;
-- only one active job per listing is allowed so two workers cannot send conflicting values.
-- ---------------------------------------------------------------------------
CREATE TABLE sync_jobs (
    id BIGSERIAL PRIMARY KEY,
    job_kind VARCHAR(24) NOT NULL DEFAULT 'INVENTORY',
    outbox_event_id BIGINT REFERENCES outbox_events(id) ON DELETE SET NULL,
    listing_id BIGINT NOT NULL REFERENCES channel_listings(id) ON DELETE CASCADE,
    channel_id BIGINT NOT NULL REFERENCES channels(id) ON DELETE RESTRICT,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE CASCADE,
    target_quantity INT NOT NULL CHECK (target_quantity >= 0),
    core_version BIGINT NOT NULL,
    allocation_revision BIGINT NOT NULL,
    status VARCHAR(24) NOT NULL DEFAULT 'PENDING',
    attempts INT NOT NULL DEFAULT 0 CHECK (attempts >= 0),
    max_attempts INT NOT NULL DEFAULT 8 CHECK (max_attempts > 0),
    next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    lease_owner VARCHAR(128),
    lease_until TIMESTAMPTZ,
    sent_quantity INT,
    acknowledged_quantity INT,
    verified_quantity INT,
    remote_before INT,
    remote_after INT,
    adapter VARCHAR(32),
    idempotency_reference VARCHAR(128),
    last_error VARCHAR(500),
    last_attempt_at TIMESTAMPTZ,
    verified_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_sync_job_event_listing UNIQUE (outbox_event_id, listing_id),
    CONSTRAINT chk_sync_job_kind CHECK (job_kind IN ('INVENTORY', 'ALLOCATION')),
    CONSTRAINT chk_sync_job_status CHECK (status IN (
        'PENDING', 'PROCESSING', 'RETRY_PENDING', 'VERIFIED', 'DRIFT',
        'UNCONFIRMED', 'SUPERSEDED', 'BLOCKED', 'DEAD_LETTER')),
    CONSTRAINT chk_sync_job_quantities CHECK (
        (sent_quantity IS NULL OR sent_quantity >= 0)
        AND (acknowledged_quantity IS NULL OR acknowledged_quantity >= 0)
        AND (verified_quantity IS NULL OR verified_quantity >= 0)
        AND (remote_before IS NULL OR remote_before >= 0)
        AND (remote_after IS NULL OR remote_after >= 0))
);

CREATE UNIQUE INDEX uq_sync_job_active_listing
    ON sync_jobs(listing_id)
    WHERE status IN ('PENDING', 'PROCESSING', 'RETRY_PENDING');
CREATE INDEX idx_sync_job_due
    ON sync_jobs(status, next_attempt_at, id);
CREATE INDEX idx_sync_job_listing_created
    ON sync_jobs(listing_id, created_at DESC, id DESC);
CREATE INDEX idx_sync_job_channel_status
    ON sync_jobs(channel_id, status, created_at DESC);

-- ---------------------------------------------------------------------------
-- Append-only delivery and reconciliation evidence
-- ---------------------------------------------------------------------------
CREATE TABLE channel_sync_evidence (
    id BIGSERIAL PRIMARY KEY,
    listing_id BIGINT NOT NULL REFERENCES channel_listings(id) ON DELETE CASCADE,
    job_id BIGINT REFERENCES sync_jobs(id) ON DELETE SET NULL,
    plan_id BIGINT REFERENCES allocation_plans(id) ON DELETE SET NULL,
    plan_item_id BIGINT REFERENCES allocation_plan_items(id) ON DELETE SET NULL,
    kind VARCHAR(32) NOT NULL,
    adapter VARCHAR(32) NOT NULL,
    status VARCHAR(24) NOT NULL,
    target_quantity INT,
    sent_quantity INT,
    acknowledged_quantity INT,
    verified_quantity INT,
    remote_before INT,
    remote_after INT,
    error_code VARCHAR(64),
    error_message VARCHAR(500),
    idempotency_reference VARCHAR(128),
    observed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_channel_sync_evidence_kind CHECK (kind IN (
        'MAPPING_VERIFY', 'ALLOCATION_DECREASE', 'ALLOCATION_INCREASE',
        'INVENTORY_SYNC', 'RECONCILE')),
    CONSTRAINT chk_channel_sync_evidence_status CHECK (status IN (
        'VERIFIED', 'DRIFT', 'UNCONFIRMED', 'REFUSED', 'ERROR', 'OBSERVED')),
    CONSTRAINT chk_channel_sync_evidence_quantities CHECK (
        (target_quantity IS NULL OR target_quantity >= 0)
        AND (sent_quantity IS NULL OR sent_quantity >= 0)
        AND (acknowledged_quantity IS NULL OR acknowledged_quantity >= 0)
        AND (verified_quantity IS NULL OR verified_quantity >= 0)
        AND (remote_before IS NULL OR remote_before >= 0)
        AND (remote_after IS NULL OR remote_after >= 0))
);

CREATE INDEX idx_channel_sync_evidence_listing
    ON channel_sync_evidence(listing_id, observed_at DESC, id DESC);

-- ---------------------------------------------------------------------------
-- Durable simulator state and fault injection. The simulator is a first-class adapter,
-- not an in-memory mock: process restarts keep the last acknowledged channel quantity.
-- ---------------------------------------------------------------------------
CREATE TABLE simulator_listing_states (
    listing_id BIGINT PRIMARY KEY REFERENCES channel_listings(id) ON DELETE CASCADE,
    quantity INT NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    version BIGINT NOT NULL DEFAULT 0 CHECK (version >= 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE simulator_faults (
    listing_id BIGINT PRIMARY KEY REFERENCES channel_listings(id) ON DELETE CASCADE,
    fault_type VARCHAR(32) NOT NULL,
    remaining_count INT NOT NULL DEFAULT 1 CHECK (remaining_count > 0),
    delay_ms INT NOT NULL DEFAULT 0 CHECK (delay_ms >= 0 AND delay_ms <= 60000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_simulator_fault_type CHECK (fault_type IN (
        'REFUSE', 'TIMEOUT', 'TIMEOUT_AFTER_WRITE', 'WRONG_READ', 'DELAY', 'DUPLICATE'))
);
