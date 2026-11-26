-- A sale is not proof that all remote stock drift has been explained.
ALTER TABLE channel_listings ADD COLUMN order_reconciliation_required BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE woocommerce_order_imports (
    order_id BIGINT PRIMARY KEY REFERENCES orders(id) ON DELETE RESTRICT,
    fingerprint VARCHAR(64) NOT NULL,
    store_fingerprint VARCHAR(64) NOT NULL,
    external_status VARCHAR(32) NOT NULL,
    external_modified_at VARCHAR(64),
    imported_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);

CREATE TABLE woocommerce_order_import_lines (
    order_id BIGINT NOT NULL REFERENCES woocommerce_order_imports(order_id) ON DELETE RESTRICT,
    external_line_id VARCHAR(20) NOT NULL,
    listing_id BIGINT NOT NULL REFERENCES channel_listings(id) ON DELETE RESTRICT,
    mapping_version BIGINT NOT NULL,
    product_id VARCHAR(20) NOT NULL,
    variation_id VARCHAR(20) NOT NULL,
    external_sku VARCHAR(64) NOT NULL,
    quantity INT NOT NULL CHECK (quantity > 0),
    reduced_stock INT NOT NULL CHECK (reduced_stock = quantity),
    PRIMARY KEY (order_id, external_line_id)
);
