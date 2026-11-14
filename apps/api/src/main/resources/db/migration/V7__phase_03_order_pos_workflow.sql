-- Phase 03: order lifecycle, POS payment recording, and abandoned-hold expiry.
--
-- The Java implementation keeps the reserve-before-payment model: creating an order only
-- increases inventory_balances.reserved. Payment confirmation decreases both reserved and
-- on_hand exactly once. Cancelling or expiring an unpaid order releases reserved only.

-- Append-only order audit trail. Every lifecycle move carries the status before/after, the
-- payment status before/after, the actor, the time, and (for cancellation/expiry) the reason.
CREATE TABLE order_status_history (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id) ON DELETE RESTRICT,
    action VARCHAR(32) NOT NULL,
    from_status VARCHAR(32),
    to_status VARCHAR(32) NOT NULL,
    from_payment_status VARCHAR(32),
    to_payment_status VARCHAR(32),
    reason VARCHAR(500),
    actor VARCHAR(64) NOT NULL DEFAULT 'system',
    changed_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_order_status_history_action CHECK (
        action IN ('CREATED', 'PAYMENT_CONFIRMED', 'STATUS_CHANGED', 'HANDED_OVER', 'CANCELLED', 'EXPIRED')
    ),
    CONSTRAINT chk_order_status_history_statuses CHECK (
        (from_status IS NULL OR from_status IN ('PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED'))
        AND to_status IN ('PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED')
    ),
    CONSTRAINT chk_order_status_history_payment_statuses CHECK (
        (from_payment_status IS NULL OR from_payment_status IN ('PENDING', 'RECORDED_MANUALLY', 'PAID', 'REFUNDED'))
        AND (to_payment_status IS NULL OR to_payment_status IN ('PENDING', 'RECORDED_MANUALLY', 'PAID', 'REFUNDED'))
    ),
    CONSTRAINT chk_order_status_history_move CHECK (from_status IS NULL OR from_status <> to_status),
    CONSTRAINT chk_order_status_history_created CHECK (
        action <> 'CREATED'
        OR (from_status IS NULL AND from_payment_status IS NULL
            AND to_status = 'PLACED' AND to_payment_status = 'PENDING')
    ),
    CONSTRAINT chk_order_status_history_from_status CHECK (action = 'CREATED' OR from_status IS NOT NULL),
    CONSTRAINT chk_order_status_history_reason CHECK (
        action NOT IN ('CANCELLED', 'EXPIRED')
        OR (reason IS NOT NULL AND length(btrim(reason)) BETWEEN 1 AND 500)
    ),
    CONSTRAINT chk_order_status_history_reason_length CHECK (reason IS NULL OR length(reason) <= 500),
    CONSTRAINT chk_order_status_history_actor CHECK (length(btrim(actor)) BETWEEN 1 AND 64)
);

CREATE INDEX idx_order_status_history_order
    ON order_status_history(order_id, changed_at DESC, id DESC);
CREATE INDEX idx_order_status_history_cancelled
    ON order_status_history(to_status, changed_at DESC)
    WHERE to_status = 'CANCELLED';

-- One POS payment record per order. Amounts are integer minor units. CASH requires the cash
-- received and an exact change calculation; BANK_TRANSFER/MANUAL must not carry cash fields.
-- MANUAL exists only for the legacy no-body payment endpoint.
CREATE TABLE pos_payment_details (
    order_id BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
    method VARCHAR(24) NOT NULL,
    currency VARCHAR(8) NOT NULL,
    amount_due BIGINT NOT NULL,
    cash_received BIGINT,
    change_amount BIGINT,
    reference VARCHAR(128),
    note VARCHAR(500),
    actor VARCHAR(64) NOT NULL,
    paid_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    CONSTRAINT chk_pos_payment_method CHECK (method IN ('CASH', 'BANK_TRANSFER', 'MANUAL')),
    CONSTRAINT chk_pos_payment_currency CHECK (currency ~ '^[A-Z]{3}$'),
    CONSTRAINT chk_pos_payment_amount_due CHECK (amount_due >= 0),
    CONSTRAINT chk_pos_payment_cash_received CHECK (cash_received IS NULL OR cash_received >= 0),
    CONSTRAINT chk_pos_payment_change CHECK (change_amount IS NULL OR change_amount >= 0),
    CONSTRAINT chk_pos_payment_reference CHECK (
        reference IS NULL OR length(btrim(reference)) BETWEEN 1 AND 128
    ),
    CONSTRAINT chk_pos_payment_note CHECK (note IS NULL OR length(note) <= 500),
    CONSTRAINT chk_pos_payment_actor CHECK (length(btrim(actor)) BETWEEN 1 AND 64),
    CONSTRAINT chk_pos_payment_cash_shape CHECK (
        (method = 'CASH'
            AND cash_received IS NOT NULL
            AND cash_received >= amount_due
            AND change_amount = cash_received - amount_due)
        OR (method IN ('BANK_TRANSFER', 'MANUAL')
            AND cash_received IS NULL
            AND change_amount IS NULL)
    )
);

CREATE INDEX idx_pos_payment_details_paid_at ON pos_payment_details(paid_at DESC);

-- The hold expiry is stored on the order itself because POS orders reserve stock without
-- creating per-line reservations. Marketplace orders must never be swept by the POS expiry
-- worker, so the constraint limits the column to unpaid, unconfirmed POS orders.
ALTER TABLE orders ADD COLUMN hold_expires_at TIMESTAMPTZ;
ALTER TABLE orders ADD CONSTRAINT chk_orders_hold_expires_scope CHECK (
    hold_expires_at IS NULL
    OR (source = 'POS' AND status = 'PLACED' AND payment_status = 'PENDING')
);
ALTER TABLE orders ADD CONSTRAINT chk_orders_status CHECK (
    status IN ('PLACED', 'CONFIRMED', 'PACKED', 'SHIPPED', 'DELIVERED', 'CANCELLED')
);
ALTER TABLE orders ADD CONSTRAINT chk_orders_payment_status CHECK (
    payment_status IN ('PENDING', 'RECORDED_MANUALLY', 'PAID', 'REFUNDED')
);

CREATE INDEX idx_orders_pos_hold_expiry ON orders(hold_expires_at)
    WHERE source = 'POS'
      AND status = 'PLACED'
      AND payment_status = 'PENDING'
      AND hold_expires_at IS NOT NULL;
