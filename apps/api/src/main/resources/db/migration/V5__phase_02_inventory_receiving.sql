-- Phase 02: auditable multi-batch receiving and catalog lifecycle support.
--
-- The V4 receipt statuses (RECEIVING/COMPLETED) described a cumulative model. Phase 02 records
-- every receive operation as an independent batch, so the durable states are
-- DRAFT -> PARTIALLY_RECEIVED -> RECEIVED, plus CLOSED_SHORT and CANCELLED. Existing rows are
-- migrated without discarding their quantities or timestamps.

ALTER TABLE receipts ADD COLUMN version BIGINT NOT NULL DEFAULT 0;
ALTER TABLE receipts ADD COLUMN note TEXT;
ALTER TABLE receipts ADD COLUMN cancel_reason VARCHAR(500);
ALTER TABLE receipts ADD COLUMN cancelled_at TIMESTAMPTZ;
ALTER TABLE receipts ADD COLUMN close_short_reason VARCHAR(500);
ALTER TABLE receipts ADD COLUMN closed_short_at TIMESTAMPTZ;

-- Legacy CANCELLED rows predate the audited cancellation fields. Record the migration itself as
-- the reason instead of dropping the row or leaving the new constraint unsatisfiable.
UPDATE receipts
SET cancel_reason = COALESCE(cancel_reason, 'Legacy CANCELLED status (pre-Phase 02)'),
    cancelled_at = COALESCE(cancelled_at, updated_at, created_at)
WHERE status = 'CANCELLED';

ALTER TABLE receipts DROP CONSTRAINT chk_receipts_status;
UPDATE receipts SET status = 'PARTIALLY_RECEIVED' WHERE status = 'RECEIVING';
UPDATE receipts SET status = 'RECEIVED' WHERE status = 'COMPLETED';

ALTER TABLE receipts
    ADD CONSTRAINT chk_receipts_status
    CHECK (status IN ('DRAFT', 'PARTIALLY_RECEIVED', 'RECEIVED', 'CLOSED_SHORT', 'CANCELLED'));
ALTER TABLE receipts
    ADD CONSTRAINT chk_receipts_version_nonnegative CHECK (version >= 0);
ALTER TABLE receipts
    ADD CONSTRAINT chk_receipts_note_length CHECK (note IS NULL OR length(note) <= 2000);
ALTER TABLE receipts
    ADD CONSTRAINT chk_receipts_cancel_fields CHECK (
        (status <> 'CANCELLED') OR (cancel_reason IS NOT NULL AND cancelled_at IS NOT NULL)
    );
ALTER TABLE receipts
    ADD CONSTRAINT chk_receipts_close_short_fields CHECK (
        (status <> 'CLOSED_SHORT') OR (close_short_reason IS NOT NULL AND closed_short_at IS NOT NULL)
    );

-- Snapshot the catalog identity on each receipt line so historical receipts remain readable even
-- after a variant title changes. SKU/title were always non-null on product_variants.
ALTER TABLE receipt_items ADD COLUMN sku VARCHAR(64);
ALTER TABLE receipt_items ADD COLUMN variant_title VARCHAR(128);
ALTER TABLE receipt_items ADD COLUMN rejection_reason VARCHAR(500);

UPDATE receipt_items ri
SET sku = pv.sku,
    variant_title = pv.title
FROM product_variants pv
WHERE pv.id = ri.variant_id;

ALTER TABLE receipt_items ALTER COLUMN sku SET NOT NULL;
ALTER TABLE receipt_items ALTER COLUMN variant_title SET NOT NULL;

DO $$
DECLARE
    duplicate_groups BIGINT;
BEGIN
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
        SELECT receipt_id, variant_id
        FROM receipt_items
        GROUP BY receipt_id, variant_id
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_groups > 0 THEN
        RAISE EXCEPTION
            'V5 cannot install one-line-per-variant receipts: % duplicate (receipt_id, variant_id) groups exist.',
            duplicate_groups;
    END IF;
END $$;

ALTER TABLE receipt_items
    ADD CONSTRAINT uq_receipt_items_receipt_variant UNIQUE (receipt_id, variant_id);
ALTER TABLE receipt_items
    ADD CONSTRAINT chk_receipt_items_rejection_reason_length CHECK (
        rejection_reason IS NULL OR length(rejection_reason) <= 500
    );

-- Immutable audit trail. Every material receipt command appends one event; a receive event owns
-- one event item per inspected line. Receipt item rows only carry the running totals.
CREATE TABLE receipt_events (
    id BIGSERIAL PRIMARY KEY,
    receipt_id BIGINT NOT NULL REFERENCES receipts(id) ON DELETE RESTRICT,
    event_type VARCHAR(32) NOT NULL,
    note VARCHAR(500),
    receipt_version BIGINT NOT NULL,
    actor VARCHAR(64) NOT NULL DEFAULT 'system',
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_receipt_events_type CHECK (
        event_type IN ('CREATED', 'UPDATED', 'RECEIVED', 'CLOSED_SHORT', 'CANCELLED')
    ),
    CONSTRAINT chk_receipt_events_version_nonnegative CHECK (receipt_version >= 0),
    CONSTRAINT chk_receipt_events_note_length CHECK (note IS NULL OR length(note) <= 500),
    CONSTRAINT uq_receipt_events_receipt_version UNIQUE (receipt_id, receipt_version)
);

CREATE INDEX idx_receipt_events_receipt_order
    ON receipt_events(receipt_id, created_at, id);

CREATE TABLE receipt_event_items (
    id BIGSERIAL PRIMARY KEY,
    event_id BIGINT NOT NULL REFERENCES receipt_events(id) ON DELETE CASCADE,
    receipt_item_id BIGINT NOT NULL REFERENCES receipt_items(id) ON DELETE RESTRICT,
    variant_id BIGINT NOT NULL,
    sku VARCHAR(64) NOT NULL,
    accepted_qty INT NOT NULL DEFAULT 0 CHECK (accepted_qty >= 0),
    rejected_qty INT NOT NULL DEFAULT 0 CHECK (rejected_qty >= 0),
    rejection_reason VARCHAR(500),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_receipt_event_items_line UNIQUE (event_id, receipt_item_id),
    CONSTRAINT chk_receipt_event_items_counted CHECK (accepted_qty + rejected_qty > 0),
    CONSTRAINT chk_receipt_event_items_reason CHECK (
        rejected_qty = 0 OR rejection_reason IS NOT NULL
    ),
    CONSTRAINT chk_receipt_event_items_reason_length CHECK (
        rejection_reason IS NULL OR length(rejection_reason) <= 500
    )
);

CREATE INDEX idx_receipt_event_items_event ON receipt_event_items(event_id);
