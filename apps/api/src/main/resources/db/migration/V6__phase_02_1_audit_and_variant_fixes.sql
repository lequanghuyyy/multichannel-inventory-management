-- Phase 02.1: Audit history and variant lifecycle fixes.

-- F02 & F03: Add payload column to receipt_events to record structured before/after diffs on draft edits
-- and close-short metadata without overflowing note length.
ALTER TABLE receipt_events ADD COLUMN payload TEXT;

-- F04: Append-only audit trail for SKU and variant attribute changes.
CREATE TABLE IF NOT EXISTS variant_update_audit (
    id BIGSERIAL PRIMARY KEY,
    variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
    from_sku VARCHAR(64) NOT NULL,
    to_sku VARCHAR(64) NOT NULL,
    reason VARCHAR(500) NOT NULL,
    actor VARCHAR(64) NOT NULL DEFAULT 'system',
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_variant_update_audit_reason_length CHECK (length(reason) <= 500)
);

CREATE INDEX IF NOT EXISTS idx_variant_update_audit_variant ON variant_update_audit(variant_id, changed_at DESC);
