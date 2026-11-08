-- Phase 01.1 data-safety hardening.
--
-- Orders previously accepted a client-controlled source and external order id, and no database
-- constraint prevented two marketplace orders with the same external identity. Java has no shop
-- table yet, so the marketplace identity is (channel_id, external_order_id); the shop/connection
-- dimension is added in Phase 02 without changing this invariant.
--
-- Legacy rows are handled conservatively:
--   * POS rows could carry an external id supplied by the client. It was never a POS identity,
--     so it is cleared before the POS identity constraint is installed.
--   * Non-POS rows with no channel remain "legacy" rows and are protected by a legacy unique
--     index on (source, external_order_id). New marketplace rows must carry a channel.
--   * Ambiguous legacy marketplace identities abort the migration instead of silently keeping
--     duplicates or rewriting order history.

ALTER TABLE orders ADD COLUMN channel_id BIGINT;
ALTER TABLE orders
    ADD CONSTRAINT fk_orders_channel FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE RESTRICT;

UPDATE orders
SET external_order_id = btrim(external_order_id)
WHERE external_order_id IS NOT NULL;

UPDATE orders
SET external_order_id = NULL
WHERE external_order_id = '';

UPDATE orders
SET external_order_id = NULL
WHERE source = 'POS' AND external_order_id IS NOT NULL;

-- Legacy catalog rows may carry lowercase currency codes. Normalize them before the ISO-3
-- checks are installed; genuinely malformed values still abort the migration.
UPDATE product_variants
SET currency = upper(btrim(currency))
WHERE currency IS NOT NULL AND currency <> upper(btrim(currency));

UPDATE orders
SET currency = upper(btrim(currency))
WHERE currency IS NOT NULL AND currency <> upper(btrim(currency));

DO $$
DECLARE
    duplicate_groups BIGINT;
BEGIN
    SELECT COUNT(*) INTO duplicate_groups
    FROM (
        SELECT source, external_order_id
        FROM orders
        WHERE channel_id IS NULL AND external_order_id IS NOT NULL
        GROUP BY source, external_order_id
        HAVING COUNT(*) > 1
    ) duplicates;

    IF duplicate_groups > 0 THEN
        RAISE EXCEPTION
            'V4 cannot install unique marketplace order identity: % duplicate legacy (source, external_order_id) groups exist. Resolve them before migrating.',
            duplicate_groups;
    END IF;
END $$;

CREATE UNIQUE INDEX uq_orders_channel_external_order
    ON orders(channel_id, external_order_id)
    WHERE channel_id IS NOT NULL AND external_order_id IS NOT NULL;

CREATE UNIQUE INDEX uq_orders_legacy_external_order
    ON orders(source, external_order_id)
    WHERE channel_id IS NULL AND external_order_id IS NOT NULL;

ALTER TABLE orders
    ADD CONSTRAINT chk_orders_source_identity CHECK (
        (source = 'POS' AND channel_id IS NULL AND external_order_id IS NULL)
        OR (source <> 'POS'
            AND (channel_id IS NULL
                 OR (channel_id IS NOT NULL AND external_order_id IS NOT NULL)))
    );
ALTER TABLE orders
    ADD CONSTRAINT chk_orders_total_amount_nonnegative CHECK (total_amount >= 0);
ALTER TABLE orders
    ADD CONSTRAINT chk_orders_currency CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE orders
    ADD CONSTRAINT chk_orders_external_order_id_length CHECK (
        external_order_id IS NULL OR length(external_order_id) BETWEEN 1 AND 128
    );

ALTER TABLE order_items
    ADD CONSTRAINT chk_order_items_unit_price_nonnegative CHECK (unit_price >= 0);
ALTER TABLE order_items
    ADD CONSTRAINT chk_order_items_sku_nonblank CHECK (length(btrim(sku)) BETWEEN 1 AND 64);

ALTER TABLE product_variants
    ADD CONSTRAINT chk_product_variants_price_nonnegative CHECK (price >= 0);
ALTER TABLE product_variants
    ADD CONSTRAINT chk_product_variants_currency CHECK (currency ~ '^[A-Z]{3}$');
ALTER TABLE product_variants
    ADD CONSTRAINT chk_product_variants_sku_nonblank CHECK (length(btrim(sku)) BETWEEN 1 AND 64);
ALTER TABLE product_variants
    ADD CONSTRAINT chk_product_variants_title_nonblank CHECK (length(btrim(title)) BETWEEN 1 AND 128);

ALTER TABLE products
    ADD CONSTRAINT chk_products_name_nonblank CHECK (length(btrim(name)) BETWEEN 1 AND 255);
ALTER TABLE products
    ADD CONSTRAINT chk_products_status CHECK (status IN ('DRAFT', 'PUBLISHED', 'ARCHIVED'));
ALTER TABLE products
    ADD CONSTRAINT chk_products_category_length CHECK (category IS NULL OR length(category) <= 64);

UPDATE receipt_items SET unit_cost = 0 WHERE unit_cost IS NULL;
ALTER TABLE receipt_items ALTER COLUMN unit_cost SET NOT NULL;
ALTER TABLE receipt_items
    ADD CONSTRAINT chk_receipt_items_unit_cost_nonnegative CHECK (unit_cost >= 0);
ALTER TABLE receipt_items
    ADD CONSTRAINT chk_receipt_items_counted_lte_expected CHECK (accepted_qty + rejected_qty <= expected_qty);

ALTER TABLE receipts
    ADD CONSTRAINT chk_receipts_status CHECK (status IN ('DRAFT', 'RECEIVING', 'COMPLETED', 'CANCELLED'));
ALTER TABLE receipts
    ADD CONSTRAINT chk_receipts_supplier_name_length CHECK (
        supplier_name IS NULL OR length(btrim(supplier_name)) BETWEEN 1 AND 255
    );
