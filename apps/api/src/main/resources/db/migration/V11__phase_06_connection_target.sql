-- Phase 06: bind a verified WooCommerce connection to the exact store target.
--
-- The fingerprint is a SHA-256 of the normalized base URL plus the consumer key. It is not a
-- credential and cannot be used to authenticate. Keeping it lets the backend notice that the
-- configured URL or credentials now point at a different store, which invalidates the old
-- connection proof and every mapping verified against it.

ALTER TABLE channels
    ADD COLUMN connection_target_fingerprint VARCHAR(64);
