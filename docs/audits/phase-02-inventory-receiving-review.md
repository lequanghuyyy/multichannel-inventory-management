# Phase 02 — Inventory & Receiving Review

Ngày audit: 08/11/2026
Repository: `multichannel-inventory-management`
Nhánh triển khai: `feat/phase-02-inventory-receiving-workflow`
Base commit: `01a7d33` (Phase 01.1)
`main` vẫn ở `4dc15ae`; Phase 02 chưa được merge vào `main`.

## A. Tóm tắt

Phase 02 bổ sung phần còn thiếu của nghiệp vụ kho trung tâm:

1. Quản lý sản phẩm/SKU trọn vòng đời `DRAFT → PUBLISHED → ARCHIVED` và quay lại `DRAFT`, thêm biến thể, đổi SKU có lý do, và chặn xóa khi đã có dấu vết tồn kho/đơn/phiếu nhập/mapping kênh.
2. Tồn kho trung tâm giữ nguyên công thức `ATS = On Hand − Reserved − Safety Buffer`; điều chỉnh tồn bắt buộc có lý do, kiểm tra invariant, ghi ledger và outbox; bổ sung cập nhật tồn đệm an toàn.
3. Nhập hàng nhiều đợt độc lập: mỗi lần nhận là một batch riêng, chỉ số lượng **chấp nhận** của batch đó mới tăng `on_hand`. Batch chỉ có hàng lỗi vẫn được lưu audit nhưng không tạo ledger/outbox.
4. Preview không ghi dữ liệu, đóng phiếu thiếu có lý do nhưng không cộng phần thiếu, hủy phiếu nháp không chạm tồn.

Thay đổi hành vi lớn nhất so với Phase 01.1 là **receiving không còn cộng dồn**: `accepted_qty`/`rejected_qty` trên dòng phiếu nhập vẫn là tổng lũy kế để đọc, nhưng request gửi lên là **delta của riêng batch hiện tại**. Trạng thái bền vững đổi từ `RECEIVING/COMPLETED` sang `DRAFT → PARTIALLY_RECEIVED → RECEIVED`, cộng `CLOSED_SHORT` và `CANCELLED`.

**Kết quả kiểm chứng:** `mvn -f apps/api/pom.xml verify` đạt `BUILD SUCCESS` với **41 test** (39 test PostgreSQL trong `FoundationPostgresIntegrationTest`, 1 test nâng cấp V3→V5 trong `OrderIdentityMigrationTest`, 1 test seed profile `dev`). Flyway áp dụng đủ V1–V5 trên schema sạch và trên schema legacy V3.

## B. Hành vi kế thừa và phần được thiết kế lại

| Hạng mục | Trước Phase 02 (kế thừa Go/Java Phase 01.1) | Phase 02 |
|---|---|---|
| Phiếu nhập | `RECEIVING` khi nhận một phần, `COMPLETED` khi đủ | `PARTIALLY_RECEIVED` / `RECEIVED`, thêm `CLOSED_SHORT`, `CANCELLED` |
| Số lượng nhận | Client gửi số **lũy kế**; server chỉ cộng phần chênh lệch dương | Client gửi **delta của batch**; server cộng đúng delta đã kiểm tra |
| Audit nhận hàng | Chỉ có tổng trên `receipt_items` | `receipt_events` + `receipt_event_items` bất biến cho từng batch |
| Rejected-only | Không có mô hình rõ ràng | Có event audit, không có ledger/outbox, không tăng tồn |
| Preview | Chưa có | `POST /preview` chỉ đọc, trả cảnh báo từng dòng |
| Sửa/hủy phiếu | Chưa đầy đủ | Sửa/hủy chỉ khi `DRAFT`, có version và lý do hủy |
| Đóng thiếu | Chưa có | Chỉ từ `PARTIALLY_RECEIVED`, có lý do, không cộng phần thiếu |
| Sản phẩm | Tạo sản phẩm + biến thể, cập nhật cơ bản | Thêm biến thể, sửa biến thể, lifecycle, chặn xóa theo lịch sử |
| Tồn đệm | Chỉ đọc | Điều chỉnh được qua lệnh adjustment có lý do/version/invariant |
| Ledger | Thiếu before/after của reserved/buffer | Trả đầy đủ before/after để giải thích ATS |

Không thay đổi các nền tảng đã đạt của Phase 01/01.1: transaction boundary, `IdempotencyService`, `InventoryMovementRecorder`, ledger, transactional outbox, pessimistic row lock, Spring Security/RBAC, error envelope, Flyway V1–V4.

## C. Luồng nghiệp vụ đã hoàn thiện

### C.1. Sản phẩm và SKU

- Tạo sản phẩm kèm danh sách biến thể; mỗi biến thể mới tạo một dòng `inventory_balances` với tồn 0.
- `initialStock` chỉ chấp nhận `null` hoặc `0`; mọi giá trị khác bị từ chối. Tồn chỉ vào kho qua nhập hàng hoặc điều chỉnh có lý do.
- Thêm biến thể vào sản phẩm chưa `ARCHIVED`; SKU duy nhất ở cả service và database.
- Sửa biến thể: title/price/currency; đổi SKU bắt buộc có `reason` trong cùng request.
- Lifecycle: `DRAFT → PUBLISHED|ARCHIVED`, `PUBLISHED → ARCHIVED`, `ARCHIVED → DRAFT`; cùng trạng thái là no-op. Sản phẩm `ARCHIVED` là read-only: không sửa metadata, không thêm/sửa biến thể cho đến khi đưa về `DRAFT`.
- Xóa sản phẩm bị chặn khi bất kỳ biến thể có: ledger, tồn vật lý/đang giữ/tồn đệm khác 0, reservation, order item, channel listing hoặc receipt item. Trường hợp sạch được xóa theo cascade của catalog.
- Không thao tác catalog nào được phép thay đổi tồn.

### C.2. Tồn kho trung tâm

- `on_hand`, `reserved`, `safety_buffer`, `available_to_sell` và `version` được trả trong snapshot.
- `ATS = on_hand − reserved − safety_buffer`; entity ném lỗi nếu invariant bị vi phạm thay vì che bằng `Math.max(0, ...)`.
- Adjustment yêu cầu quyền `ADMIN`, lý do, kiểm tra overflow/không âm, và `reserved + safety_buffer <= on_hand` sau thay đổi.
- `safetyBuffer` có thể đổi trong cùng lệnh adjustment; delta 0 chỉ hợp lệ khi buffer thực sự đổi.
- `expectedVersion` được kiểm tra khi client gửi lên; balance được khóa bằng `SELECT ... FOR UPDATE`, balance đầu tiên được tạo bằng `INSERT ... ON CONFLICT`.
- Mỗi adjustment ghi ledger đầy đủ before/after và một outbox event trong cùng transaction. Ledger trả thêm `operation`, `on_hand_before/after`, `reserved_before/after`, `safety_buffer_before/after`, `actor_name`.

### C.3. Nhập hàng nhiều đợt

- Tạo phiếu nháp với supplier, note, danh sách dòng (variant, expected qty, unit cost); snapshot `sku` và `variant_title` tại thời điểm tạo/sửa để phiếu cũ vẫn đọc được sau khi catalog đổi.
- Mỗi biến thể chỉ xuất hiện một dòng trong một phiếu; tối đa 200 dòng; expected qty 1..1.000.000; unit cost không âm.
- Sửa phiếu nháp thay thế toàn bộ nội dung bằng `expectedVersion`; dòng được giữ ổn định theo variant id, dòng bỏ bị xóa, dòng mới được thêm.
- Hủy phiếu nháp bắt buộc lý do; không tạo balance, không ghi ledger/outbox.
- Preview kiểm tra status, dòng thuộc phiếu, trùng dòng, số lượng âm/vượt remaining, lý do từ chối và overflow tồn; trả `remaining_total` toàn phiếu sau batch đề xuất nhưng **không ghi dữ liệu**.
- Một lần receive là một batch độc lập:
  - `accepted + rejected > 0` và `<= remaining` của từng dòng;
  - rejected > 0 bắt buộc có `rejectionReason`;
  - rejected không bao giờ tăng `on_hand`;
  - cộng delta vào tổng lũy kế của `receipt_items`;
  - ghi một `RECEIVED` event và các `receipt_event_items` của riêng batch;
  - chỉ accepted > 0 mới ghi ledger/outbox, reference dạng `receiptNumber#eventId`.
- Batch rejected-only vẫn có event audit và batch history nhưng không có ledger/outbox.
- Trạng thái `RECEIVED` chỉ khi mọi dòng có `remaining = 0`; ngược lại `PARTIALLY_RECEIVED`.
- `close-short` chỉ từ `PARTIALLY_RECEIVED`, bắt buộc lý do, ghi event kèm số lượng thiếu, không cộng phần thiếu vào tồn và khóa phiếu khỏi mọi lần nhận tiếp theo. Phiếu `DRAFT` chưa nhận hàng phải dùng `cancel`.
- Phiếu `RECEIVED`, `CLOSED_SHORT`, `CANCELLED` không thể nhận thêm.

## D. Transaction, idempotency và concurrency

- Mọi lệnh ghi phiếu nhập chạy trong một transaction; lỗi ở bất kỳ dòng nào rollback toàn bộ batch, kể cả event, ledger, outbox và thay đổi balance.
- Thứ tự khóa cố định: **receipt row trước**, sau đó **inventory balance theo `variant_id` tăng dần**. Cùng thứ tự này được dùng cho reservation/order để tránh deadlock.
- Trước khi mutate, server khóa receipt; `expectedReceiptVersion` (nếu gửi) được so với version hiện tại; version tăng đúng một lần cho mỗi lệnh audit, kể cả khi status không đổi (`PARTIALLY_RECEIVED → PARTIALLY_RECEIVED`).
- Version của receipt được quản lý tường minh, không dùng JPA `@Version`, vì Hibernate không tăng version khi chỉ thêm event/collection mà không đổi cột scalar. Row lock vẫn là cơ chế chống ghi đồng thời.
- `receipt_events` bất biến; unique `(receipt_id, receipt_version)` bảo đảm một event cho mỗi version.
- Các lệnh create/update/cancel/close-short/receive dùng `Idempotency-Key`; fingerprint và response được lưu trong cùng transaction. Retry cùng key trả lại response cũ, không cộng tồn/không tạo batch thứ hai. Key mới là batch vật lý mới.
- Số lượng được kiểm tra bằng `Math.addExact`; không có `Math.max(0, ...)` để che mất cân bằng tồn.
- Batch nhiều SKU: nếu một balance không thể nhận (overflow), toàn bộ batch rollback; test scenario D xác nhận balance, ledger, outbox, status và event đều không đổi.

## E. Schema và migration V5

Migration mới: `V5__phase_02_inventory_receiving.sql`. Không sửa V1–V4.

- `receipts`: thêm `version BIGINT NOT NULL DEFAULT 0`, `note`, `cancel_reason`, `cancelled_at`, `close_short_reason`, `closed_short_at`.
- Chuyển status legacy: `RECEIVING → PARTIALLY_RECEIVED`, `COMPLETED → RECEIVED`; `DRAFT`/`CANCELLED` giữ nguyên.
- Backfill legacy `CANCELLED` với lý do `Legacy CANCELLED status (pre-Phase 02)` và `cancelled_at = updated_at/created_at` để thỏa constraint mới mà không xóa lịch sử.
- `receipt_items`: thêm `sku`, `variant_title`, `rejection_reason`; backfill SKU/title từ `product_variants`; unique `(receipt_id, variant_id)`.
- Migration **abort có chủ đích** nếu legacy có nhiều dòng cùng variant trong một phiếu, thay vì tự chọn/xóa dòng.
- Bảng mới `receipt_events`: lý do, actor, version, timestamp, loại `CREATED/UPDATED/RECEIVED/CLOSED_SHORT/CANCELLED`; unique `(receipt_id, receipt_version)`.
- Bảng mới `receipt_event_items`: accepted/rejected/reason của từng dòng trong từng batch; FK RESTRICT tới `receipt_items`, FK CASCADE từ event.
- Legacy receipts không được tự tạo event `CREATED` giả; lịch sử batch của chúng bắt đầu từ lần thao tác đầu tiên sau migration. Version legacy bắt đầu ở 0.
- Các check constraint của V1/V4 vẫn giữ: `accepted_qty + rejected_qty <= expected_qty`, `unit_cost >= 0`, số lượng không âm, và invariant `reserved + safety_buffer <= on_hand`.

## F. Thay đổi contract API

### Sản phẩm

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/v1/products` | ADMIN, STAFF | Kèm tồn từng biến thể |
| GET | `/api/v1/products/{id}` | ADMIN, STAFF | |
| POST | `/api/v1/products` | ADMIN | `Idempotency-Key`; tồn khởi tạo 0 |
| PATCH | `/api/v1/products/{id}` | ADMIN | Metadata + lifecycle |
| POST | `/api/v1/products/{id}/variants` | ADMIN | `Idempotency-Key`; tồn khởi tạo 0 |
| PATCH | `/api/v1/products/{id}/variants/{variantId}` | ADMIN | Đổi SKU cần `reason` |
| DELETE | `/api/v1/products/{id}` | ADMIN | Chặn khi có lịch sử/tồn |

### Phiếu nhập

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/v1/receipts` | ADMIN, STAFF | Kèm batch history/tổng |
| GET | `/api/v1/receipts/{id}` | ADMIN, STAFF | |
| POST | `/api/v1/receipts` | ADMIN, STAFF | Tạo `DRAFT`, `Idempotency-Key` |
| PATCH | `/api/v1/receipts/{id}` | ADMIN, STAFF | Chỉ `DRAFT`, cần `expectedVersion` |
| POST | `/api/v1/receipts/{id}/cancel` | ADMIN, STAFF | Chỉ `DRAFT`, cần lý do + version |
| POST | `/api/v1/receipts/{id}/close-short` | ADMIN, STAFF | Chỉ `PARTIALLY_RECEIVED`, lý do + version |
| POST | `/api/v1/receipts/{id}/preview` | ADMIN, STAFF | Chỉ đọc |
| POST | `/api/v1/receipts/{id}/receive` | ADMIN, STAFF | Batch delta, `Idempotency-Key` |

`ReceiptResponse` trả thêm `note`, `version`, snapshot SKU/title, `processed_qty`, `remaining_qty`, `batches`, `accepted_total`, `rejected_total`, `remaining_total`, `cancel_reason`, `cancelled_at`, `close_short_reason`, `closed_short_at`.

`ReceiveItemsRequest` nhận `inspections` với `acceptedQty`, `rejectedQty`, `rejectionReason` là **delta của batch**, và `expectedReceiptVersion` tùy chọn.

### Tồn kho

- `POST /api/v1/inventory/adjust` nhận thêm `safetyBuffer`; `expectedVersion` được kiểm tra khi có.
- `GET /api/v1/inventory/{sku}/ledger` trả thêm `operation`, before/after của on-hand/reserved/buffer, `actor_name`.
- Các endpoint đọc giữ nguyên `on_hand`, `reserved`, `safety_buffer`, `available_to_sell`, `version`.

## G. Kiểm chứng

### Kịch bản A — sản phẩm/SKU mới, nhận hai batch độc lập

- Tạo sản phẩm với SKU mới; balance 0, không ledger.
- Tạo phiếu 10 đơn vị; preview batch 4 accepted + 1 rejected cho `remaining_total = 5`, `projected_on_hand = 4`, không đổi tồn/ledger.
- Batch 1: `PARTIALLY_RECEIVED`, accepted 4, rejected 1, remaining 5, tồn 4, 1 ledger, 1 outbox.
- Batch 2: 3 accepted + 2 rejected → `RECEIVED`, accepted total 7, rejected total 3, remaining 0, tồn 7, ledger delta `[4, 3]`, 2 outbox, batch history giữ đúng số của từng đợt.

### Kịch bản B — đóng thiếu

- Phiếu 10, nhận 6 → `PARTIALLY_RECEIVED`, tồn 6, remaining 4.
- `close-short` với lý do → `CLOSED_SHORT`, lưu lý do/thời điểm, remaining vẫn 4, tồn vẫn 6, không thêm ledger/outbox.
- Nhận tiếp sau khi đóng thiếu bị từ chối.
- Đóng thiếu một phiếu `DRAFT` bị từ chối; phiếu chưa nhận phải hủy.

### Kịch bản C — reservation/sale/release (hồi quy Phase 01)

- Tồn 7, reserved 2, buffer 1 → ATS 4.
- Confirm sale đúng một lần → on-hand 5, reserved 0, ATS 4; retry cùng key không trừ lần hai.
- Reserve rồi release → on-hand 5, reserved 0, ATS 4.

### Kịch bản D — đồng thời và rollback đa SKU

- Hai request cùng `Idempotency-Key` chạy song song: chỉ một batch được ghi; tồn 4, 1 ledger, 1 outbox, response replay giống nhau.
- Hai batch khác key cùng tranh phần còn lại: đúng một batch thắng; không vượt expected.
- Receipt hai SKU, một balance gần `Integer.MAX_VALUE`: batch rollback toàn bộ; balance thứ nhất không đổi, ledger/outbox/event `RECEIVED` không có, phiếu vẫn `DRAFT`.

### Migration và hồi quy

- `OrderIdentityMigrationTest` nâng schema V3 chứa order legacy + receipt legacy `RECEIVING/COMPLETED/CANCELLED` lên V5: status được map đúng, accepted/rejected giữ nguyên, SKU/title được snapshot, cancellation legacy được backfill, V4 identity constraint vẫn hoạt động.
- `DevelopmentSeedIntegrationTest` xác nhận seed `dev` chạy được với V5.
- `FoundationPostgresIntegrationTest` giữ các test Phase 01/01.1: idempotency, reservation expiry, order identity, price/stock safety, channel isolation, adjustment ledger.
- Lần chạy cuối: `Tests run: 41, Failures: 0, Errors: 0, Skipped: 0` — `BUILD SUCCESS`.

## H. Việc chưa làm / giới hạn đã biết

- Không triển khai frontend, marketplace connector/sync dispatcher, phân bổ quota kênh, AI/ML, mở rộng POS/order lifecycle, đa kho, import/export, attachment/in chứng từ hoặc quy trình trả hàng nhà cung cấp phức tạp.
- Không thêm CI/CD hoặc GitHub Actions.
- Preview là ảnh chụp chỉ đọc, không giữ tồn; tồn có thể thay đổi giữa preview và receive. Receive luôn kiểm tra lại dưới row lock.
- `expectedVersion`/`expectedReceiptVersion` vẫn là tùy chọn ở HTTP để tương thích client Phase 01; khi được gửi, server từ chối version cũ bằng `STALE_VERSION`. Row lock + kiểm tra remaining là hàng rào cuối cùng chống nhận quá.
- Đóng thiếu áp dụng cho toàn phiếu, không có đóng thiếu từng dòng.
- Chưa có quy trình đảo/reversal một phiếu đã `RECEIVED`; hàng đã chấp nhận chỉ có thể giảm qua adjustment có lý do.
- `unit_cost` chỉ là số tiền minor units phục vụ đối chiếu nội bộ, chưa phải chứng từ kế toán/thuế.
- Phiếu nhập là chứng từ vận hành nội bộ; chưa có in/export/attachment.
- Không có multi-warehouse: toàn bộ tồn là kho trung tâm logic duy nhất.

## I. Trạng thái bàn giao

- Toàn bộ thay đổi nằm trên `feat/phase-02-inventory-receiving-workflow`, dựa trên Phase 01.1 `01a7d33`.
- `main` không bị thay đổi và Phase 02 chưa được merge.
- Không sửa migration cũ; V5 là migration duy nhất được thêm.
- Không có thay đổi nào ngoài phạm vi sản phẩm, tồn trung tâm và nhập hàng nhiều đợt.
