# Phase 01.1 — Java Data-Safety Review

Ngày audit: 08/11/2026
Repository triển khai: `multichannel-inventory-management`
Nhánh: `fix/java-foundation-review-findings`
Java baseline: `main` tại `4dc15ae4f338242a12a9fe9eece8f1f903c4884b`
Go reference: checkout cục bộ `D:\DATN-ai-driven-cross-platform-source` (chỉ đọc; không sửa, không chạy Go test suite)

## A. Executive Summary

Phase 01 đã khóa transaction, idempotency, ledger và outbox cho các luồng tồn kho cốt lõi. Rà soát tiếp theo tập trung vào bốn lỗ hổng còn lại trước Phase 02:

1. **Order creation** vẫn cho phép client chọn `source`, gửi `externalOrderId` và dùng `unitPrice` như giá bán; nhiều dòng cùng SKU có thể vượt ATS; thứ tự khóa balance chưa được chuẩn hóa theo `variant_id`.
2. **Marketplace order identity** chưa có ràng buộc bền vững. Hai lần giao cùng một đơn từ kênh với `Idempotency-Key` khác nhau có thể tạo hai order và giữ tồn hai lần.
3. **Product validation** chưa chặn SKU trùng trong cùng request, giá âm, currency/status không hợp lệ hoặc dữ liệu rỗng trước khi ghi database.
4. **Reservation expiry và receiving** còn có thể mất tính nhất quán: một reservation lỗi có thể làm hỏng cả lượt expire, release sau hạn có thể bị ghi sai trạng thái, và receive lặp/không đủ điều kiện có thể cộng tồn sai.

Phase 01.1 đã xử lý các điểm trên mà không thay đổi các nền tảng đã đạt của Phase 01: `IdempotencyService`, transaction boundary, `InventoryMovementRecorder`, inventory ledger, transactional outbox, Flyway V1–V3, Spring Security/RBAC và error envelope.

**Kết quả:** 32 integration test PostgreSQL trong `FoundationPostgresIntegrationTest`, 1 test nâng cấp V3→V4 trong `OrderIdentityMigrationTest` và 1 test seed profile `dev` đều đạt; full `mvn verify` được ghi lại ở mục H. Các thay đổi hành vi API được mô tả ở mục C. Không có thay đổi nào được merge vào `main` trong phạm vi này.

## B. Findings và trạng thái

| Mức | Finding | Trạng thái / bằng chứng |
|---|---|---|
| Critical | `POST /api/v1/orders` nhận `source` tùy ý, `externalOrderId` và giá client, nên staff có thể giả đơn marketplace hoặc hạ giá bán. | Đã xử lý: HTTP order là POS-only; `source` khác POS hoặc external ID khác rỗng bị trả `400 ORDER_SOURCE_FORBIDDEN`; giá/currency/tổng tiền do server quyết định; `unitPrice` chỉ là expected-price check và lệch giá trả `422 PRICE_OR_STOCK_CHANGED`. |
| Critical | Không có định danh marketplace bền vững; giao lặp cùng đơn với key khác có thể tạo order/reservation thứ hai. | Đã xử lý: identity `(channel_id, external_order_id)`, advisory transaction lock, partial unique index; lần giao lặp trả order cũ mà không khóa/giữ tồn; payload khác trả `409 EXTERNAL_ORDER_CONFLICT`. |
| High | Nhiều dòng cùng SKU kiểm tra ATS riêng lẻ, có thể vượt tồn; khóa balance theo thứ tự client gửi, tạo nguy cơ deadlock với các luồng khác. | Đã xử lý: gộp SKU trước khi resolve, kiểm tra tổng ATS cho mọi dòng trước khi mutate, sắp xếp balance theo `variant_id ASC`, giữ nguyên một transaction nhiều SKU. Có test đa SKU đồng thời. |
| High | `confirmPayment` đọc `Order` entity trước khi khóa balance; transaction chờ khóa có thể dùng trạng thái PENDING cũ và trừ tồn hai lần. | Đã xử lý: đọc quantity bằng scalar projection trước, khóa balance theo `variant_id ASC`, rồi khóa order; PAID trả idempotent, CANCELLED bị từ chối. Có test confirm đồng thời. |
| High | `expireHolds()` chạy một transaction chung; một reservation lỗi có thể rollback toàn bộ các expiry hợp lệ. Release sau hạn bị ghi CANCELLED thay vì EXPIRED; quyết định hạn dùng clock ứng dụng trước khi chờ khóa. | Đã xử lý: mỗi reservation expire trong `REQUIRES_NEW` qua bean riêng, lỗi được log/đếm và sweep tiếp tục; trạng thái/clock được đọc lại sau khóa bằng `clock_timestamp()`; release quá hạn ghi `EXPIRED`. |
| High | Receiving có thể cộng tồn lặp, vượt `expected_qty`, nhận số âm hoặc không nhất quán giữa accepted/rejected giữa các lần nhận. | Đã xử lý: nhận theo lượng lũy kế, chỉ cộng phần chênh lệch dương, không cho giảm accepted/rejected, `accepted + rejected <= expected`, partial vẫn `RECEIVING`, chỉ `COMPLETED` khi mọi dòng khớp expected; khóa balance trước receipt. |
| High | Product create/update có thể ghi SKU trùng, giá âm, currency/status sai hoặc tên rỗng; một số lỗi chỉ lộ ra ở database. | Đã xử lý: validation + normalization ở service, `@Valid` ở update controller, DB check constraints ở V4. Product mới vẫn DRAFT, tồn 0; không mở rộng publishing. |
| Medium | V4 phải xử lý dữ liệu legacy trước khi dựng unique index; tự động xóa/viết lại lịch sử đơn là không an toàn. | Đã xử lý: POS external ID bị xóa, external ID được trim, currency legacy được chuẩn hóa; duplicate legacy `(source, external_order_id)` làm migration abort để con người xử lý thay vì tự chọn bản ghi. |

## C. Thay đổi contract API

### C.1. `POST /api/v1/orders` — POS-only

- `source` được giữ để tương thích nhưng chỉ chấp nhận rỗng hoặc `POS` (không phân biệt hoa/thường, có trim). Giá trị khác trả `400 ORDER_SOURCE_FORBIDDEN`.
- `externalOrderId` phải rỗng/null. Gửi giá trị khác rỗng trả `400 ORDER_SOURCE_FORBIDDEN`; định danh marketplace chỉ do connector nội bộ gán.
- `unitPrice` trên từng dòng là **giá kỳ vọng tùy chọn**, không phải giá ghi đè. Server luôn dùng giá hiện tại của `product_variants`. Nếu giá đã đổi, trả `422 PRICE_OR_STOCK_CHANGED`.
- Client không gửi tổng tiền, currency hay trạng thái; server tính `total_amount` bằng phép cộng/nhân có kiểm tra overflow.
- Nhiều dòng cùng SKU được gộp; tổng quantity mỗi SKU tối đa 1.000.000; tối đa 200 dòng; quantity mỗi dòng phải dương. Tổng vượt giới hạn trả `400 BAD_REQUEST`.
- Order tạo ra luôn `source=POS`, `channel_id=null`, `external_order_id=null`, `currency=VND`, `status=PLACED`, `payment_status=PENDING`; reserve, order/items, ledger và outbox nằm trong cùng transaction.

Ví dụ hợp lệ:

```json
{
  "source": "POS",
  "items": [
    { "sku": "SKU-001", "quantity": 2, "unitPrice": 1250000 }
  ]
}
```

`unitPrice` có thể bỏ qua. Nếu có, nó phải bằng giá server hiện tại.

### C.2. Marketplace — boundary nội bộ, không phải HTTP

Marketplace không đi qua `CreateOrderRequest`. Connector tương lai chuẩn hóa đơn thành `ChannelOrderCommand` và gọi `OrderService.createChannelOrder(command, idempotencyKey)`:

```java
new ChannelOrderCommand(
    channelId,
    Order.Source.SHOPIFY,      // bất kỳ source nào khác POS
    "shopify-order-1001",      // 1..128 ký tự: A-Z a-z 0-9 . _ : / -
    "VND",                     // rỗng -> VND; Phase 01.1 chỉ hỗ trợ VND
    List.of(new ChannelOrderLine("SKU-001", 2))
);
```

- `channelId` bắt buộc và phải tồn tại.
- `source` bắt buộc, không được `POS`.
- `externalOrderId` bắt buộc, được trim, khớp `^[A-Za-z0-9._:/-]{1,128}$`.
- 1..200 dòng; SKU/quantity được kiểm tra như luồng POS.
- Command không có trường giá. Giá và currency của từng variant do server đọc; đơn vị tiền tệ đơn hàng phải khớp currency variant.
- Phase 01.1 chỉ hỗ trợ `VND`; currency khác trả `422 INVALID_CURRENCY`.

### C.3. Định danh đơn marketplace

- Identity bền vững là `(channel_id, external_order_id)`. `Idempotency-Key` chỉ dedupe retry của cùng payload trong TTL và **không thay thế** identity nghiệp vụ.
- Lần giao lặp cùng external order — kể cả với `Idempotency-Key` khác — trả order đã lưu, không tạo order mới và không reserve thêm.
- Cùng external identity nhưng `source` hoặc tổng quantity theo SKU khác payload đã lưu trả `409 EXTERNAL_ORDER_CONFLICT`; không ghi đè order cũ.
- Cùng `external_order_id` ở hai channel khác nhau là hai đơn khác nhau.
- Unique index là backstop bền vững; advisory lock chỉ tuần tự hóa đường kiểm tra/đọc lại để giao lặp không đi qua reserve trước khi phát hiện trùng.
- Java chưa có bảng shop. `channel_id` đại diện connection/shop trong Phase 01.1; Phase 02 có thể thêm chiều shop mà không đổi nguyên tắc uniqueness.

## D. Database — V4 và dữ liệu legacy

Migration mới: `V4__order_identity_and_domain_integrity.sql`. V1–V3 không bị sửa.

### D.1. Order identity

- Thêm `orders.channel_id BIGINT` + FK `channels(id) ON DELETE RESTRICT`.
- Partial unique index `uq_orders_channel_external_order (channel_id, external_order_id)` cho rows có đủ cả hai.
- Partial unique index `uq_orders_legacy_external_order (source, external_order_id)` cho rows legacy `channel_id IS NULL AND external_order_id IS NOT NULL`.
- `chk_orders_source_identity`:
  - `POS` phải có `channel_id IS NULL` và `external_order_id IS NULL`.
  - Non-POS được phép legacy `channel_id IS NULL`, hoặc bắt buộc có cả `channel_id` và `external_order_id`.
- `chk_orders_total_amount_nonnegative`, `chk_orders_currency` (`^[A-Z]{3}$`), `chk_orders_external_order_id_length` (1..128), `chk_order_items_unit_price_nonnegative`, `chk_order_items_sku_nonblank`.

### D.2. Chuẩn hóa legacy

- `external_order_id` được `btrim`; chuỗi rỗng chuyển thành `NULL`.
- Mọi external ID trên order `POS` bị xóa vì trước đây client tự gửi và không phải identity POS hợp lệ.
- Currency của `orders` và `product_variants` được `upper(btrim(...))` trước khi cài check ISO-3. Giá trị thật sự sai vẫn làm migration fail.
- Nếu tồn tại nhiều hơn một order legacy non-POS có cùng `(source, external_order_id)` và `channel_id IS NULL`, migration **abort** với thông báo `duplicate legacy` kèm số nhóm. Không tự chọn giữ/xóa/ghép lịch sử; operator phải đối chiếu và xử lý dữ liệu trước khi migrate.
- Trước rollout cần dry-run V4 trên bản sao database thật. V4 không thể tự xác định channel đúng cho legacy row; các row non-POS cũ được giữ `channel_id = NULL` và bảo vệ bởi legacy unique index.

### D.3. Catalog và receiving constraints

- `product_variants`: giá không âm, currency ISO-3, SKU/title không rỗng và đúng độ dài.
- `products`: tên không rỗng/đúng độ dài, status thuộc `DRAFT|PUBLISHED|ARCHIVED`, category tối đa 64 ký tự.
- `receipt_items`: `unit_cost` NULL được backfill 0 rồi `NOT NULL`; `unit_cost >= 0`; `accepted_qty + rejected_qty <= expected_qty`.
- `receipts`: status thuộc `DRAFT|RECEIVING|COMPLETED|CANCELLED`; supplier name rỗng hoặc 1..255 ký tự.
- Các check này là backstop cho service; service vẫn validate trước khi ghi để trả lỗi nghiệp vụ rõ ràng thay vì lỗi constraint.

## E. Quy tắc khóa và transaction

### E.1. Tạo order nhiều SKU

1. Validate request, gộp các dòng trùng SKU và kiểm tra overflow/giới hạn.
2. Resolve từng SKU sang variant; kiểm tra giá, currency và expected price.
3. Sắp xếp các dòng theo `variant_id ASC`.
4. Khóa toàn bộ balance theo thứ tự đó bằng `SELECT ... FOR UPDATE`.
5. Kiểm tra ATS tổng hợp của **mọi** dòng trước khi mutate bất kỳ balance nào.
6. Cộng reserved, ghi order/items, ledger và outbox trong cùng transaction.
7. Bất kỳ lỗi nào — thiếu tồn, overflow, lỗi ghi — rollback toàn bộ order, reservation, ledger, outbox.

Không có external call trong transaction. Idempotency record/claim và response replay vẫn nằm trong cùng transaction như Phase 01.

### E.2. Xác nhận thanh toán

1. Đọc `(variant_id, tổng quantity)` bằng scalar projection, **không** load `Order` entity trước.
2. Khóa balance theo `variant_id ASC`.
3. Khóa order row.
4. Nếu đã `PAID`, trả response hiện có (idempotent); nếu `CANCELLED`, từ chối.
5. Đối chiếu quantity đọc trước với order items đã khóa; lệch thì từ chối thay vì trừ mù.
6. Trừ cả `on_hand` và `reserved`, ghi ledger trong cùng transaction.

Lý do không load order trước: transaction thua cuộc chờ khóa có thể giữ entity PENDING trong persistence context và trừ tồn lần hai. Projection chỉ đọc số liệu, sau đó order được đọc lại bằng khóa.

### E.3. Reservation

- Thứ tự khóa thống nhất: **balance trước, reservation sau** cho reserve/confirm/release/expire.
- Reserve khóa balance, kiểm tra ATS, đọc `clock_timestamp()` sau khóa, tạo hold ACTIVE + ledger.
- Confirm khóa balance rồi hold; chỉ confirm hold ACTIVE và chưa quá hạn theo DB clock; trừ on_hand/reserved + ledger.
- Release khóa balance rồi hold; hold ACTIVE nhưng đã quá hạn được ghi `EXPIRED` (không phải `CANCELLED`); hold đã transition trả về không thay đổi.
- `expireHolds()` đọc candidate không khóa, sắp theo `(variant_id, id)`; mỗi candidate được expire trong transaction `REQUIRES_NEW` của `ReservationExpiryProcessor`. Processor khóa lại balance/hold, đọc DB clock sau khóa, chỉ expire hold ACTIVE đã quá hạn, và ném lỗi nếu reserved không đủ.
- Một candidate lỗi được log kèm reservation/variant ID, tăng `failed`, và không rollback các candidate khác. Kết quả sweep là `(expired, skipped, failed)`; worker log tổng kết thay vì nuốt lỗi.

### E.4. Receiving

- Create receipt: supplier name 1..255; 1..200 dòng; mỗi variant chỉ một dòng; variant phải tồn tại; `expectedQty` 1..1.000.000; `unitCost` mặc định 0 và không âm.
- Receive: đọc snapshot để xác định balance cần khóa và validate membership/duplicate; khóa balance theo `variant_id ASC` (tạo balance 0 nếu chưa có), sau đó khóa receipt row.
- Đọc lại receipt dưới khóa để lấy accepted/rejected chính thức. Accepted/rejected là **lũy kế**, không được giảm, không âm, mỗi giá trị <= 1.000.000, và `accepted + rejected <= expected`.
- Chỉ phần tăng `newAccepted - previousAccepted` được cộng vào `on_hand`; phần đã accepted trước đó không cộng lại. Mỗi lần tăng ghi ledger + outbox qua `InventoryMovementRecorder` trong cùng transaction.
- Receipt vẫn `RECEIVING` khi còn dòng chưa khớp `accepted + rejected == expected`; chỉ `COMPLETED` khi tất cả dòng khớp. Retry cùng `Idempotency-Key` replay response; giao lặp không cộng tồn lần hai.

### E.5. Product

- Create: tên 1..255; description <= 10.000; category <= 64; 1..200 variant; SKU/title bắt buộc và đúng độ dài; SKU trùng trong request hoặc đã tồn tại trả `422 DUPLICATE_SKU`.
- Giá null được chuẩn hóa 0; giá âm bị từ chối. Currency rỗng -> `VND`; ngược lại trim/uppercase và phải là ISO-3.
- `initialStock` chỉ chấp nhận null hoặc 0; product mới luôn DRAFT và có balance 0. Không có publish tự động.
- Update: `@Valid` ở controller; tên/description/category/status được validate; status chỉ nhận `DRAFT|PUBLISHED|ARCHIVED`.
- Delete vẫn giữ quy tắc Phase 01: không xóa product đã có ledger/reservation; trả `409 PRODUCT_HAS_INVENTORY_HISTORY`.

## F. Test coverage

PostgreSQL 17 qua Testcontainers; không dùng H2 cho locking/transaction/constraint.

| Nhóm | Test chính |
|---|---|
| Migration / schema | Fresh schema chạy đủ V1–V4 và Hibernate validate; nâng cấp V3→V4 với legacy POS/marketplace; trim/uppercase; xóa external ID POS; abort duplicate legacy; index/constraint V4. |
| Order security | Staff không thể giả source/external ID/giá; duplicate SKU dùng ATS tổng hợp; validation tiền/currency/quantity/expected price; channel command từ chối POS source, currency không hỗ trợ, identity sai định dạng. |
| Order concurrency | Hai order đa SKU đồng thời dùng cùng thứ tự khóa và cùng commit; duplicate channel delivery đồng thời chỉ tạo/giữ tồn một lần; confirm payment đồng thời chỉ trừ một lần. |
| Identity | Cùng external order khác `Idempotency-Key` trả order cũ; payload khác trả conflict; cùng external ID khác channel tạo độc lập. |
| Inventory | Reserve unit cuối; confirm/release đồng thời; adjustment đầu tiên đồng thời; order nhiều dòng lỗi rollback order/reservation/ledger/outbox. |
| Reservation expiry | Một reservation lỗi không chặn expiry hợp lệ; release sau hạn ghi EXPIRED; confirm sau hạn không trừ tồn. |
| Receiving | Partial receipt lũy kế và ledger chỉ ghi phần tăng; validate expected/negative/duplicate/giảm số lượng; receipt đồng thời cùng variant không mất tồn. |
| Catalog / regression | Product validation không persist dữ liệu sai; V4 DB constraints; toàn bộ 18 test Phase 01 cũ vẫn chạy trong bộ 32 test. |

## G. Giữ nguyên và deferred

**Giữ nguyên từ Phase 01:** `IdempotencyService` và TTL; transaction boundary ở service; `InventoryMovementRecorder`; inventory ledger; transactional outbox; Flyway V1–V3; Spring Security/RBAC; JSON error envelope; DRAFT/zero-stock product rule.

**Deferred có chủ ý:**

| Ưu tiên | Công việc | Lý do |
|---|---|---|
| Phase 02 | Thêm chiều shop/connection vào identity marketplace và connector thật (Shopify/WooCommerce/eBay), webhook verification, read-back. | Phase 01.1 chưa có bảng shop/credential; identity hiện là `(channel_id, external_order_id)`. |
| Phase 02 | Multi-batch receiving, lot/expiry, quality status đầy đủ; order return/cancel/ship lifecycle. | Ngoài phạm vi data-safety Phase 01.1; không mở rộng nghiệp vụ. |
| Phase 04 | Outbox dispatcher `SKIP LOCKED`, retry/backoff/dead-letter, consumer idempotency, SSE replay. | Phase 01.1 chỉ bảo đảm ghi outbox nguyên tử. |
| Trước rollout | Dry-run V4 trên snapshot database thật; xử lý duplicate legacy `(source, external_order_id)` nếu có; xác nhận currency legacy. | Migration abort là cố ý; không tự đoán lịch sử. |
| P2 | CI/CD, Docker deployment, React UI, AI/ML, multi-channel allocation. | Không thuộc phạm vi Phase 01.1. |

Không triển khai trong phạm vi này: connector marketplace, sync worker, multi-channel allocation, wholesale refactor, Go-to-Java migration.

## H. Verification

| Kiểm tra | Kết quả |
|---|---|
| `mvn -q -f apps/api/pom.xml test-compile` | Exit 0. |
| `mvn -q -f apps/api/pom.xml "-Dtest=FoundationPostgresIntegrationTest,OrderIdentityMigrationTest" test` | 33/33 đạt, 0 failure/error. |
| `mvn -q -f apps/api/pom.xml "-Dtest=DevelopmentSeedIntegrationTest" test` | 1/1 đạt. |
| `mvn -f apps/api/pom.xml verify` | Exit 0. Tổng 34/34 test đạt: Foundation 32/32, migration V3→V4 1/1, dev seed 1/1; 0 failure/error/skip. Thời gian 01:27. |
| `git diff --check` | Không có whitespace error; chỉ cảnh báo LF→CRLF trên working tree Windows. |
| Go repository | Chỉ đọc checkout tham chiếu; không sửa và không chạy test suite Go. |

**Chưa xác minh:** nâng cấp V4 trên bản sao database triển khai thật; kết nối/read-back marketplace thật; xử lý duplicate legacy ngoài phạm vi test tổng hợp.
