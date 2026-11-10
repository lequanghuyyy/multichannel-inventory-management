-- Phase 04.1: safety hardening for allocation/sync concurrency, mapping identity,
-- worker lease fencing and simulator idempotency. V1-V8 are intentionally untouched.

-- ---------------------------------------------------------------------------
-- Mapping identity version. Incremented whenever the external identity of a listing
-- changes, so an in-flight verify/write can detect that it checked an older identity.
-- ---------------------------------------------------------------------------
ALTER TABLE channel_listings
    ADD COLUMN mapping_version BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_channel_listing_mapping_version_nonnegative
        CHECK (mapping_version >= 0);

-- ---------------------------------------------------------------------------
-- Lease fencing tokens. A claim increments the generation; completion, failure and
-- release must match both owner and generation so an expired worker cannot overwrite
-- a newer claim.
-- ---------------------------------------------------------------------------
ALTER TABLE allocation_plans
    ADD COLUMN claim_generation BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_allocation_plan_claim_generation_nonnegative
        CHECK (claim_generation >= 0);

ALTER TABLE sync_jobs
    ADD COLUMN claim_generation BIGINT NOT NULL DEFAULT 0,
    ADD CONSTRAINT chk_sync_job_claim_generation_nonnegative
        CHECK (claim_generation >= 0);

-- ---------------------------------------------------------------------------
-- Evidence records the external identity that was actually checked.
-- ---------------------------------------------------------------------------
ALTER TABLE channel_sync_evidence
    ADD COLUMN external_listing_id VARCHAR(128),
    ADD COLUMN external_variant_id VARCHAR(128);

-- ---------------------------------------------------------------------------
-- A product may contain multiple sellable variants. Product-level uniqueness only
-- applies to listings that do not identify a variant; variant-level uniqueness is
-- already enforced by uq_channel_external_variant_identity.
-- ---------------------------------------------------------------------------
DROP INDEX uq_channel_external_listing_registered;
CREATE UNIQUE INDEX uq_channel_external_listing_no_variant
    ON channel_listings(channel_id, external_listing_id)
    WHERE external_variant_id IS NULL
      AND mapping_status IN ('REGISTERED', 'VERIFIED');

-- ---------------------------------------------------------------------------
-- Reconciliation: quota=0 listings with missing/problematic evidence, and unresolved
-- jobs, must still be selectable in a bounded batch.
-- ---------------------------------------------------------------------------
CREATE INDEX idx_channel_listing_reconcile_due
    ON channel_listings(active, mapping_status, last_verified_at, id)
    WHERE active = TRUE AND mapping_status = 'VERIFIED';

CREATE INDEX idx_sync_job_unresolved_listing
    ON sync_jobs(listing_id, status)
    WHERE status IN ('UNCONFIRMED', 'DRIFT');

-- ---------------------------------------------------------------------------
-- Simulator idempotency reference. Same reference + same payload is a no-op;
-- the same reference with a different payload is a conflict.
-- ---------------------------------------------------------------------------
ALTER TABLE simulator_listing_states
    ADD COLUMN last_idempotency_reference VARCHAR(128),
    ADD COLUMN last_write_quantity INT,
    ADD CONSTRAINT chk_simulator_last_write_nonnegative
        CHECK (last_write_quantity IS NULL OR last_write_quantity >= 0);
