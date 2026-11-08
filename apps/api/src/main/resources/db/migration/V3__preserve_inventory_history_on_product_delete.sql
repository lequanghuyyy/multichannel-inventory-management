ALTER TABLE inventory_ledger DROP CONSTRAINT inventory_ledger_variant_id_fkey;
ALTER TABLE inventory_ledger
    ADD CONSTRAINT fk_inventory_ledger_variant_history
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;

ALTER TABLE reservations DROP CONSTRAINT reservations_variant_id_fkey;
ALTER TABLE reservations
    ADD CONSTRAINT fk_reservations_variant_history
    FOREIGN KEY (variant_id) REFERENCES product_variants(id) ON DELETE RESTRICT;
