# Phase 07 Task 02: WooCommerce order ingestion

`WooCommerceOrderIngestionService` is an internal service, not an HTTP endpoint. It reads a bounded
page of order IDs and independently fetches each order. Each result includes an order ID or a
reason for review, so one invalid order does not roll back other orders on the page. The caller
must request further pages and retry incomplete pages; this task does not maintain a sync cursor.
WooCommerce page offsets can move while orders are edited, so a single scan is not evidence of a
complete interval. Task 03 must define overlapping rescans and durable progress before relying on it.

Only a verified WooCommerce connection and verified, active mappings with matching product ID,
variation ID and SKU are accepted. Each line must contain a unique WooCommerce line ID and an
`_reduced_stock` value equal to its ordered quantity. The connector accepts paid `processing` and
`completed` orders in VND without refunds. Missing or inconsistent evidence, `pending`, `on-hold`,
`cancelled`, `failed`, `refunded`, partial refunds, unsupported currency, or non-integral VND
amounts require review. No status is changed on WooCommerce. The core currently cannot represent
different prices for repeated lines of one SKU or fractional VND unit prices, so these are also
rejected for review.

The existing `(channel_id, external_order_id)` unique constraint and transaction advisory lock
serialize an order identity. The import keeps a fingerprint of the store and relevant order
content; a replay returns the same order, while changed content is a conflict. Imported line IDs,
listing identity, mapping version, quantity and stock-reduction evidence are stored for later
reconciliation. A concurrent listing sync causes the import to ask for a retry.

This project recognizes a paid sale against `on_hand` at import, as it does on POS payment; it does
not model a separate physical shipment deduction. The transaction leaves `reserved` untouched,
reduces `on_hand` and the originating listing quota by the ordered quantity, validates the ATS and
total quota, and writes inventory ledger and outbox entries. If any line fails, the entire order
rolls back. Other listings' quota is not changed. Imports wait for an applying or currently blocked
allocation to be resolved, because recovery may otherwise change another channel's quota.

Each imported listing is marked as requiring order reconciliation. Sync and allocation delivery
are blocked, mapping re-verification cannot create a new baseline, and reconciliation records
DRIFT even when the observed quantity matches quota. A matching number alone does not prove that
all remote changes are accounted for. Task 03 must establish and audit sufficient evidence before
clearing this guard; there is deliberately no automatic reset in Task 02. Webhooks, refunds,
returns, fulfillment and automatic order-status updates are outside this task.
