# Phase 03 — Order Management & POS Workflow Review

Ngày audit: 09/11/2026  
Repository: `multichannel-inventory-management`  
Nhánh triển khai: `feat/phase-03-order-pos-workflow`  
Base commit: `59d30e7` (Phase 02)  
`main` vẫn ở `4dc15ae` (Phase 01.1); Phase 03 chưa được merge vào `main`.  
Trạng thái working tree: các thay đổi Phase 02.1 và Phase 03 đang nằm trong working tree, chưa commit; không có thay đổi nào bị mất hoặc ghi đè.

## A. Tóm tắt

Phase 03 hoàn thiện vòng đời đơn hàng và quy trình bán tại quầy (POS) trên nền kiến trúc Java hiện có, giữ nguyên mô hình **reserve-before-payment** của Phase 01/01.1:

1. Tạo đơn POS chỉ tăng `inventory_balances.reserved`; chưa trừ `on_hand`.
2. Xác nhận thanh toán trừ đúng một lần cả `reserved` và `on_hand`, ghi nhận chi tiết thanh toán CASH/BANK_TRANSFER.
3. Hủy đơn chưa thanh toán chỉ giải phóng `reserved`; tuyệt đối không chạm `on_hand` và không giải phóng hai lần.
4. Đơn chưa thanh toán bị bỏ quên được giải phóng theo TTL 15 phút qua worker nền; chỉ áp dụng cho đơn POS `PLACED` + `PENDING`, không áp dụng cho đơn marketplace.
5. Vòng đời chuẩn `PLACED → CONFIRMED → PACKED → SHIPPED → DELIVERED`; bổ sung bàn giao tại quầy `CONFIRMED → DELIVERED` không cần `PACKED`/`SHIPPED`.
6. Mọi thay đổi trạng thái, thanh toán, hủy, hết hạn và bàn giao đều ghi lịch sử append-only trong cùng transaction với mutation đơn hàng.
7. Hủy đơn đã thanh toán/void/refund bị chặn có chủ đích bằng lỗi nghiệp vụ riêng; marketplace không được thao tác qua API POS.

**Kết quả kiểm chứng:** `mvn -f apps/api/pom.xml test` đạt `BUILD SUCCESS` với **59 test** (57 test PostgreSQL trong `FoundationPostgresIntegrationTest`, 1 test nâng cấp V3→V7 trong `OrderIdentityMigrationTest`, 1 test seed profile `dev`). Flyway áp dụng đủ V1–V7 trên schema sạch và trên schema legacy V3.

## B. So sánh với bản gốc Go

Đối chiếu với kho mã nguồn Go tham chiếu `C:\Users\admin\AppData\Local\Temp\opencode\go-reference` (module `internal/modules/orders`):

| Tiêu chí | Bản gốc Go | Bản Java Phase 03 | Đánh giá |
|---|---|---|---|
| Mô hình giữ hàng | Mỗi dòng đơn tạo một `reservations` row với TTL mặc định 900 giây; worker expiry của reservations giải phóng hold | POS order giữ hàng trực tiếp trên `inventory_balances.reserved`; thêm `orders.hold_expires_at` và worker expiry riêng cho đơn POS | **Tương thích nghiệp vụ**: cùng TTL 15 phút, cùng nguyên tắc chỉ giải phóng `reserved` khi hết hạn |
| Trạng thái đơn | `status` và `fulfillment_status` tách riêng; status `placed/confirmed/packed/shipped/delivered/cancelled` | Dùng `orders.status` cho cả vòng đời và fulfillment; không thêm cột `fulfillment_status` | **Đơn giản hóa có chủ đích** cho phạm vi POS Phase 03 |
| State machine | `placed → confirmed → packed → shipped → delivered`; hủy được từ `placed/confirmed/packed` | Cùng chuỗi cơ sở; hủy chỉ từ `PLACED` khi chưa thanh toán; thêm `CONFIRMED → DELIVERED` cho bàn giao tại quầy | **Khác có chủ đích**: Phase 03 chặn hủy đơn đã thanh toán để tránh hoàn tiền/void chưa được thiết kế |
| Thanh toán POS | `ConfirmPayment` cập nhật `payment_status='paid'`, ghi `pos_payment_details` và `order_payment_confirmations`; CASH lưu tiền nhận/thối | `confirmPayment` trừ `reserved` + `on_hand` đúng một lần, ghi `pos_payment_details`; CASH lưu amount due/cash received/change; BANK_TRANSFER lưu reference/note; body rỗng giữ tương thích và ghi `MANUAL` | **Tương thích contract cũ**, bổ sung CASH/BANK_TRANSFER theo yêu cầu Phase 03 |
| Lịch sử trạng thái | `order_status_history` lưu `from_status`, `to_status`, `reason`, actor, thời gian | `order_status_history` bổ sung `action`, `from_payment_status`, `to_payment_status`; ghi trong cùng transaction qua `OrderAuditRecorder` | **Mở rộng**: đủ dữ liệu để giải thích cả thay đổi trạng thái và thanh toán |
| Hủy đơn | Trả hàng về kho qua `ReturnCancelledOrderStock`; có guard fulfillment eBay/Shopify và guard marketplace | Hủy đơn chưa thanh toán chỉ release `reserved`; đơn đã thanh toán bị chặn bằng `PAID_ORDER_CANCELLATION_BLOCKED` | **Khác có chủ đích**: Java giữ mô hình reserve-before-payment, chưa mở phạm vi refund/return |
| Marketplace | Có inbound/outbound connector, snapshot, fulfillment và cancellation guard riêng | API POS từ chối mọi thao tác trên đơn marketplace bằng `MARKETPLACE_ACTION_FORBIDDEN`; connector boundary vẫn là đường duy nhất | **Giữ ranh giới kiến trúc**, connector thực tế vẫn deferred |
| Hết hạn hold | Reservations có expiry worker và health signal | Order-level expiry worker chạy mỗi 60 giây; mỗi đơn expiry trong transaction `REQUIRES_NEW`; DB constraint giới hạn scope | **Tương thích nghiệp vụ**, đơn giản hơn vì POS order không tạo reservation row |
| Tiền tệ | Số nguyên minor units; POS payment details dùng `*_minor` | `BIGINT` minor units; chỉ hỗ trợ `VND` ở Phase 03; validate currency trước khi ghi payment | **Tương thích**, phạm vi tiền tệ thu hẹp có chủ đích |
| Idempotency | Claim-first `inventory_commands` cho create/transition/payment | `IdempotencyService` hiện có; key + fingerprint cho create/payment/cancel/transition/handover | **Tương thích nền tảng Phase 01/02** |

## C. Quyết định kiến trúc

1. **Giữ reserve-before-payment.** Tạo đơn chỉ tăng `reserved`. Thanh toán giảm `reserved` và `on_hand` đúng một lần. Hủy/hết hạn chỉ giảm `reserved`. Đây là mô hình đã có test Phase 01 và phù hợp BR-09.
2. **Dùng `orders.status` làm nguồn sự thật duy nhất cho lifecycle và fulfillment.** Không thêm cột `fulfillment_status` để tránh hai state machine song song trong phạm vi POS.
3. **Bàn giao tại quầy là action riêng.** `POST /handover` cho phép `CONFIRMED → DELIVERED` mà không bắt buộc `PACKED`/`SHIPPED`, phù hợp nghiệp vụ bán tại quầy.
4. **Lịch sử append-only, cùng transaction.** `OrderAuditRecorder` dùng `Propagation.MANDATORY`; nếu transaction cha rollback thì history/outbox cũng rollback. Không có API sửa/xóa history.
5. **Một bản ghi thanh toán cho mỗi đơn.** `pos_payment_details` khóa chính là `order_id`, bảo đảm không thể ghi hai lần thanh toán cho cùng đơn.
6. **Server sở hữu số tiền phải trả.** Client không gửi `amountDue`; server lấy `orders.total_amount` đã tính khi tạo đơn. CASH bắt buộc `cashReceived >= amountDue`; `change = cashReceived - amountDue`. BANK_TRANSFER không nhận tiền mặt/tiền thừa.
7. **Hold expiry ở cấp đơn cho POS.** Vì POS order không tạo reservation row, `orders.hold_expires_at` là nguồn TTL. DB constraint `chk_orders_hold_expires_scope` chỉ cho phép giá trị này trên đơn `POS` + `PLACED` + `PENDING`.
8. **Expiry worker tách transaction từng đơn.** `OrderExpiryProcessor.expireOne` dùng `REQUIRES_NEW`; một đơn lỗi không kéo rollback các đơn khác. Mỗi lần sweep trả `expired/skipped/failed`.
9. **Khóa theo thứ tự chuẩn tắc.** `Product (id ASC) → ProductVariant → InventoryBalance (variant_id ASC) → Order`. Payment/cancel/expiry đều khóa balance tăng dần trước, rồi mới khóa order, tránh deadlock và bảo đảm quyết định trạng thái dựa trên dữ liệu đã khóa.
10. **Đọc đồng hồ database sau khi khóa.** Payment kiểm tra `ORDER_HOLD_EXPIRED` và expiry kiểm tra `hold_expires_at` bằng `clock_timestamp()` sau khi đã giữ lock, tránh quyết định bằng clock ứng dụng bị lệch.
11. **Marketplace tách khỏi POS API.** `requirePosOrder` chặn payment/cancel/transition/ship/handover trên đơn marketplace. Expiry sweep cũng loại marketplace ở cả query lẫn constraint.
12. **Không sửa migration cũ.** Toàn bộ schema Phase 03 nằm trong `V7__phase_03_order_pos_workflow.sql`; V1–V6 giữ nguyên.

## D. Quy tắc trạng thái và nghiệp vụ

### D.1. State machine

| Từ | Đến | Điều kiện | Action ghi history |
|---|---|---|---|
| `PLACED` | `CONFIRMED` | Chỉ qua xác nhận thanh toán; đơn POS, `PENDING`, chưa hết hạn, tiền tệ hợp lệ | `PAYMENT_CONFIRMED` |
| `CONFIRMED` | `PACKED` | Đơn đã `PAID` | `STATUS_CHANGED` |
| `PACKED` | `SHIPPED` | Đơn đã `PAID` | `STATUS_CHANGED` |
| `SHIPPED` | `DELIVERED` | Đơn đã `PAID` | `STATUS_CHANGED` |
| `CONFIRMED` | `DELIVERED` | Bàn giao tại quầy; đơn POS đã `PAID` | `HANDED_OVER` |
| `PLACED` | `CANCELLED` | Hủy đơn chưa thanh toán, có lý do; hoặc expiry | `CANCELLED` / `EXPIRED` |

Các chuyển đổi bị chặn:

- `PLACED → PACKED/SHIPPED/DELIVERED` (nhảy cóc).
- `CONFIRMED → SHIPPED/DELIVERED` qua `/transition` (DELIVERED chỉ qua `/handover`).
- `PACKED → DELIVERED` (phải qua SHIPPED hoặc handover từ CONFIRMED).
- Mọi chuyển đổi từ `DELIVERED`/`CANCELLED`.
- Chuyển trạng thái khi đơn chưa `PAID` → `ORDER_NOT_PAID`.
- Chuyển sang `PLACED` hoặc `CANCELLED` qua `/transition` → `BAD_REQUEST`.
- Đơn marketplace qua bất kỳ thao tác POS nào → `MARKETPLACE_ACTION_FORBIDDEN`.
- Hủy đơn đã thanh toán → `PAID_ORDER_CANCELLATION_BLOCKED`.
- Thanh toán đơn đã hủy → `INVALID_ORDER_STATE`.
- Thanh toán đơn đã hết hạn hold → `ORDER_HOLD_EXPIRED`.

Cùng trạng thái đích là **no-op**, không ghi thêm history: `ship` khi đã `SHIPPED`, `handover` khi đã `DELIVERED`, `cancel` khi đã `CANCELLED`, `transition` khi trạng thái đích trùng hiện tại.

### D.2. Thanh toán

- `CASH`: bắt buộc `cashReceived`; từ chối thiếu tiền bằng `PAYMENT_UNDERPAID`; lưu `amount_due`, `cash_received`, `change_amount`, actor, thời gian.
- `BANK_TRANSFER`: không nhận `cashReceived`/`change`; lưu xác nhận của nhân viên, `reference` tùy chọn, `note` tùy chọn.
- Body rỗng trên endpoint cũ: ghi `MANUAL` với `amount_due`, giữ tương thích client Phase 01.
- `CARD`, `WALLET`, `COD` và phương thức khác bị từ chối `BAD_REQUEST` ở Phase 03.
- Chỉ hỗ trợ `VND`; đơn có currency khác bị từ chối `INVALID_CURRENCY` trước khi ghi payment.
- Đơn đã `PAID` trả lại response hiện tại, không trừ kho/không tạo payment thứ hai.
- Retry cùng `Idempotency-Key` trả response đã lưu; key khác trên đơn đã PAID vẫn không gây double payment.

### D.3. Hủy đơn và hết hạn

- Chỉ hủy đơn POS `PLACED` + `PENDING`; bắt buộc lý do 1..500 ký tự.
- Hủy giải phóng `reserved` theo từng variant, không đổi `on_hand`, ghi ledger `ORDER_CANCELLED`, history `CANCELLED`, outbox `ORDER_CANCELLED` trong cùng transaction.
- Đơn đã `CANCELLED` trả response hiện tại; không release lần hai dù dùng key khác.
- Expiry chỉ chọn đơn `POS` + `PLACED` + `PENDING` + `hold_expires_at <= now`; marketplace bị loại ở query và DB constraint.
- Expiry giải phóng `reserved`, đặt `status = CANCELLED`, `hold_expires_at = NULL`, ghi ledger `ORDER_EXPIRED`, history `EXPIRED`, outbox `ORDER_EXPIRED`.
- Đơn đã thanh toán hoặc đã hủy không bị expiry chạm tới.
- Race payment/cancel/expiry: bên nào khóa được order trước sẽ quyết định; bên còn lại thấy trạng thái cuối và no-op hoặc trả lỗi nghiệp vụ. Test xác nhận đúng một terminal event và `reserved = 0`.

## E. Transaction, idempotency và concurrency

- Mọi lệnh ghi đơn chạy trong một transaction; history, outbox, ledger, balance và order cùng commit/rollback.
- `OrderAuditRecorder` dùng `Propagation.MANDATORY`, không thể ghi audit ngoài transaction nghiệp vụ.
- Payment/cancel/expiry khóa balance theo `variant_id` tăng dần trước, sau đó khóa order row; payment cố ý **không load Order entity trước khi khóa** để tránh stale `PENDING` trong persistence context.
- `Idempotency-Key` được dùng cho create/payment/cancel/transition/handover; fingerprint gồm orderId + payload nghiệp vụ. `/ship` giữ endpoint cũ không key nhưng same-target là no-op.
- `OrderExpiryProcessor` chạy `REQUIRES_NEW` cho từng đơn; sweep ngoài cùng dùng `NOT_SUPPORTED`, nhờ đó một đơn lỗi không rollback các đơn đã expire.
- `OrderExpirationWorker` chạy mỗi 60 giây. Nhiều instance cùng chạy an toàn nhờ row lock + kiểm tra lại trạng thái; instance thua cuộc trả `skipped`.
- Không dùng JPA `@Version` cho order; row lock là hàng rào chống ghi đồng thời, idempotency là hàng rào chống retry.

## F. Schema và migration V7

Migration mới duy nhất: `V7__phase_03_order_pos_workflow.sql`. Không sửa V1–V6.

### F.1. `order_status_history`

- `id`, `order_id` (FK RESTRICT), `action`, `from_status`, `to_status`, `from_payment_status`, `to_payment_status`, `reason`, `actor`, `changed_at`.
- `action` ∈ `CREATED`, `PAYMENT_CONFIRMED`, `STATUS_CHANGED`, `HANDED_OVER`, `CANCELLED`, `EXPIRED`.
- Constraint bắt buộc:
  - `CREATED` phải có `from_status = NULL`, `from_payment_status = NULL`, `to_status = PLACED`, `to_payment_status = PENDING`.
  - Mọi action khác `CREATED` phải có `from_status`.
  - `from_status <> to_status`.
  - `CANCELLED`/`EXPIRED` phải có lý do 1..500 ký tự.
  - `actor` 1..64 ký tự; `reason` tối đa 500 ký tự.
- Index `(order_id, changed_at DESC, id DESC)` cho truy vấn history; index riêng cho các đơn đã hủy.

### F.2. `pos_payment_details`

- Khóa chính `order_id` (FK RESTRICT), một bản ghi/đơn.
- `method` ∈ `CASH`, `BANK_TRANSFER`, `MANUAL`; `currency` khớp `^[A-Z]{3}$`; `amount_due >= 0`.
- CASH: `cash_received >= amount_due`, `change_amount = cash_received - amount_due`.
- BANK_TRANSFER/MANUAL: `cash_received` và `change_amount` phải `NULL`.
- `reference` 1..128 ký tự nếu có; `note` tối đa 500; `actor` 1..64; `paid_at` mặc định `clock_timestamp()`.
- Index `(paid_at DESC)` phục vụ tra soát.

### F.3. `orders`

- Thêm `hold_expires_at TIMESTAMPTZ`.
- `chk_orders_hold_expires_scope`: `hold_expires_at IS NULL OR (source = 'POS' AND status = 'PLACED' AND payment_status = 'PENDING')`.
- Bổ sung `chk_orders_status` và `chk_orders_payment_status` để DB chặn giá trị ngoài enum.
- Partial index `idx_orders_pos_hold_expiry` trên `hold_expires_at` cho đúng scope POS + PLACED + PENDING.

### F.4. Tương thích migration

- Schema sạch: Flyway validate/apply đủ 7 migration.
- Schema legacy V3: `OrderIdentityMigrationTest` nâng lên V7 thành công; dữ liệu order legacy được giữ nguyên; V4 identity constraint vẫn hoạt động.
- `cleanPostgresRunsAllMigrationsAndJPAValidatesTheSchema` assert đủ bảng/cột/index mới.

## G. Thay đổi contract API

Giữ nguyên các endpoint cũ; chỉ thêm endpoint khi cần.

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| GET | `/api/v1/orders` | ADMIN, STAFF | Trả kèm `hold_expires_at`, `payment` nếu có |
| GET | `/api/v1/orders/{id}` | ADMIN, STAFF | |
| POST | `/api/v1/orders` | ADMIN, STAFF | `Idempotency-Key`; chỉ tạo đơn POS; server tính giá/tổng tiền |
| POST | `/api/v1/orders/{id}/payment/confirm` | ADMIN, STAFF | `Idempotency-Key`; body tùy chọn; CASH/BANK_TRANSFER; body rỗng = MANUAL |
| POST | `/api/v1/orders/{id}/cancel` | ADMIN, STAFF | `Idempotency-Key`; body `{ "reason": "..." }` |
| POST | `/api/v1/orders/{id}/transition` | ADMIN, STAFF | `Idempotency-Key`; body `{ "status": "PACKED", "reason": "..." }` |
| POST | `/api/v1/orders/{id}/ship` | ADMIN, STAFF | Endpoint cũ; chỉ `PACKED → SHIPPED`, đơn đã PAID |
| POST | `/api/v1/orders/{id}/handover` | ADMIN, STAFF | `Idempotency-Key`; body `{ "note": "..." }` tùy chọn; `CONFIRMED → DELIVERED` |
| GET | `/api/v1/orders/{id}/history` | ADMIN, STAFF | Lịch sử append-only, mới nhất trước |

`OrderResponse` bổ sung:

- `hold_expires_at`: thời điểm hết hạn giữ hàng POS; `null` sau thanh toán/hủy/expiry.
- `payment`: `method`, `currency`, `amount_due`, `cash_received`, `change`, `reference`, `note`, `actor`, `paid_at`.

`OrderHistoryResponse` gồm: `id`, `order_id`, `action`, `from_status`, `to_status`, `from_payment_status`, `to_payment_status`, `reason`, `actor`, `changed_at`.

Mã lỗi nghiệp vụ mới:

| Mã | Trường hợp |
|---|---|
| `MARKETPLACE_ACTION_FORBIDDEN` | Thao tác POS trên đơn marketplace |
| `PAID_ORDER_CANCELLATION_BLOCKED` | Hủy/void/refund đơn đã thanh toán (deferred) |
| `ORDER_NOT_PAID` | Chuyển trạng thái/bàn giao/ship khi chưa thanh toán |
| `ORDER_HOLD_EXPIRED` | Thanh toán đơn đã hết hạn giữ hàng |
| `PAYMENT_UNDERPAID` | Tiền mặt khách đưa nhỏ hơn số phải trả |
| `INVALID_ORDER_STATE` | Chuyển đổi trạng thái không hợp lệ hoặc đơn đã kết thúc |

## H. Danh sách tệp thay đổi Phase 03

### H.1. Migration

- `apps/api/src/main/resources/db/migration/V7__phase_03_order_pos_workflow.sql`

### H.2. Entity & Repository

- `apps/api/src/main/java/com/octoflow/api/entity/OrderStatusHistory.java`
- `apps/api/src/main/java/com/octoflow/api/entity/PosPaymentDetail.java`
- `apps/api/src/main/java/com/octoflow/api/repository/OrderStatusHistoryRepository.java`
- `apps/api/src/main/java/com/octoflow/api/repository/PosPaymentDetailRepository.java`
- `apps/api/src/main/java/com/octoflow/api/entity/Order.java` (thêm `holdExpiresAt`)

### H.3. DTO & Mapper

- `apps/api/src/main/java/com/octoflow/api/dto/request/RecordPaymentRequest.java`
- `apps/api/src/main/java/com/octoflow/api/dto/request/CancelOrderRequest.java`
- `apps/api/src/main/java/com/octoflow/api/dto/request/OrderTransitionRequest.java`
- `apps/api/src/main/java/com/octoflow/api/dto/request/HandoverOrderRequest.java`
- `apps/api/src/main/java/com/octoflow/api/dto/response/OrderHistoryResponse.java`
- `apps/api/src/main/java/com/octoflow/api/dto/response/OrderResponse.java`
- `apps/api/src/main/java/com/octoflow/api/mapper/OrderMapper.java`

### H.4. Service, scheduler & controller

- `apps/api/src/main/java/com/octoflow/api/service/OrderAuditRecorder.java`
- `apps/api/src/main/java/com/octoflow/api/service/impl/OrderExpiryProcessor.java`
- `apps/api/src/main/java/com/octoflow/api/scheduler/OrderExpirationWorker.java`
- `apps/api/src/main/java/com/octoflow/api/service/impl/OrderServiceImpl.java`
- `apps/api/src/main/java/com/octoflow/api/service/OrderService.java`
- `apps/api/src/main/java/com/octoflow/api/controller/OrderController.java`
- `apps/api/src/main/java/com/octoflow/api/exception/ErrorCode.java`
- `apps/api/src/main/java/com/octoflow/api/repository/OrderRepository.java`
- `apps/api/src/main/resources/application.yml` (`app.orders.hold-ttl`, mặc định `PT15M`)

### H.5. Test

- `apps/api/src/test/java/com/octoflow/api/FoundationPostgresIntegrationTest.java`

### H.6. Ghi chú về Phase 02.1

Các tệp Phase 02.1 đang có trong working tree (`V6__phase_02_1_audit_and_variant_fixes.sql`, `VariantUpdateAudit`, `VariantUpdateAuditRepository`, các sửa đổi `ReceiptResponse`/`ReceiptEvent`/`ProductServiceImpl`/`ReceiptServiceImpl`/`ReservationServiceImpl`, `phase-02-review-fixes.md`) được giữ nguyên, không bị Phase 03 ghi đè. Phase 03 không sửa migration V6.

## I. Kiểm chứng

### I.1. Kết quả chạy test

- **Lệnh:** `mvn -f apps/api/pom.xml test`
- **Môi trường:** PostgreSQL 17-alpine qua Testcontainers.
- **Tổng số:** 59 test.
- **Kết quả:** 59 / 59 PASSED, 0 Failures, 0 Errors, 0 Skipped.
- **Build:** `BUILD SUCCESS` (khoảng 1 phút 30 giây).
- **Phân bổ:** 57 `FoundationPostgresIntegrationTest` + 1 `DevelopmentSeedIntegrationTest` + 1 `OrderIdentityMigrationTest`.

### I.2. Kịch bản A — POS cash checkout và vòng đời đầy đủ

Test: `posCashCheckoutDeductsStockOnceAndRecordsHistoryAndPayment`.

- Tạo đơn POS 2 đơn vị: `PLACED`, `PENDING`, có `hold_expires_at`, `reserved = 2`, `on_hand = 5`.
- Thanh toán CASH 2.500 cho amount due 2.000: `CONFIRMED`, `PAID`, `change = 500`, actor `cashier`, `paid_at` có giá trị, `hold_expires_at = null`.
- Tồn kho: `on_hand = 3`, `reserved = 0`; ledger có đúng 2 bút toán (reserve + sale).
- Retry cùng key trả đúng response cũ; key khác không trừ kho lần hai và không tạo payment thứ hai.
- Chuyển `PACKED → SHIPPED → DELIVERED` thành công; history có đủ creation, payment, 3 status change; handover lặp lại trên đơn đã DELIVERED là no-op.

### I.3. Kịch bản B — BANK_TRANSFER, handover tại quầy và validate thanh toán

Test: `posBankTransferHandoverSkipsShippingAndRejectsInvalidPaymentShapes`.

- CASH thiếu tiền → `PAYMENT_UNDERPAID`; CASH thiếu `cashReceived` → `BAD_REQUEST`.
- BANK_TRANSFER gửi kèm tiền mặt → `BAD_REQUEST`; phương thức `CARD` → `BAD_REQUEST`.
- Các lần lỗi không đổi tồn kho, không tạo payment row, không thêm history/outbox thanh toán.
- BANK_TRANSFER hợp lệ lưu `reference`/`note`, không có cash/change; tồn kho giảm đúng.
- Handover `CONFIRMED → DELIVERED` thành công, history `HANDED_OVER`, không có `PACKED`/`SHIPPED`; retry cùng key trả response cũ, không thêm history.
- Đơn currency `USD` bị từ chối `INVALID_CURRENCY`, giữ nguyên `PLACED` và `reserved`.

### I.4. Kịch bản C — hủy đơn chưa thanh toán và chặn hủy đơn đã thanh toán

Test: `unpaidCancellationReleasesOnlyReservedAndPaidCancellationIsBlocked`.

- Hủy đơn 2 đơn vị: `CANCELLED`, `PENDING`, `hold_expires_at = null`; `on_hand = 5`, `reserved = 0`; ledger chỉ có reserve + release.
- History có `CANCELLED` với `from_status = PLACED`, `to_status = CANCELLED`, đúng lý do; outbox `ORDER_CANCELLED` chứa lý do.
- Hủy lần hai với key khác không release lần hai, không thêm history.
- Đơn đã hủy không thể thanh toán/chuyển trạng thái/ship/handover (`INVALID_ORDER_STATE`).
- Hủy đơn đã thanh toán bị chặn `PAID_ORDER_CANCELLATION_BLOCKED`; tồn kho và trạng thái `CONFIRMED` giữ nguyên.

### I.5. Kịch bản D — state machine và ranh giới marketplace

Test: `stateMachineBlocksInvalidJumpsUnpaidShippingAndMarketplaceActions`.

- Đơn chưa thanh toán: ship/transition/handover đều `ORDER_NOT_PAID`.
- Sau thanh toán: `CONFIRMED → SHIPPED` bị chặn `INVALID_ORDER_STATE`; `ship` khi chưa `PACKED` bị chặn.
- `CONFIRMED → PACKED → SHIPPED → DELIVERED` thành công; `ship` lặp lại là no-op; đơn `DELIVERED` không thể quay lại `PACKED`; handover trên đơn đã `DELIVERED` là no-op.
- Đơn marketplace tạo qua connector: payment/cancel/transition/handover qua POS đều `MARKETPLACE_ACTION_FORBIDDEN`; tồn kho và trạng thái marketplace không đổi.

### I.6. Kịch bản E — expiry, marketplace exclusion và race

Các test:

- `abandonedPosOrdersExpireReleaseReservedOnlyAndMarketplaceOrdersAreExcluded`
- `concurrentPaymentAndExpiryNeverDoubleReleaseOrDoubleDeduct`
- `concurrentCancellationAndExpiryReleaseTheHoldExactlyOnce`
- `concurrentPaymentAndCancellationCommitExactlyOneTerminalOutcome`

Nội dung xác minh:

- Đơn POS quá hạn được sweep: `CANCELLED`, `PENDING`, `hold_expires_at = null`; `on_hand` không đổi, `reserved = 0`; history `EXPIRED`, outbox `ORDER_EXPIRED`; sweep lần hai không release lần hai.
- DB từ chối gán `hold_expires_at` cho đơn marketplace; sweep không chạm đơn marketplace.
- Payment vs expiry: một bên thắng; nếu payment thắng thì `PAID/CONFIRMED`, `on_hand` giảm đúng; nếu expiry thắng thì `CANCELLED/PENDING`, `on_hand` giữ nguyên; `reserved = 0`; đúng một terminal event và payment row chỉ tồn tại khi PAID.
- Cancellation vs expiry: kết quả luôn `CANCELLED/PENDING`, `reserved = 0`, `on_hand` không đổi, đúng một terminal event.
- Payment vs cancellation: kết quả luôn là một trong hai (`PAID/CONFIRMED` hoặc `CANCELLED/PENDING`), `reserved = 0`, đúng một terminal event, không double deduct/double release.

### I.7. Hồi quy Phase 01/01.1/02/02.1

- Toàn bộ test cũ vẫn chạy: idempotency, reservation expiry, order identity, price/stock safety, channel isolation, adjustment ledger, product lifecycle/variant audit, multi-batch receiving, close-short, rollback đa SKU, concurrent archive/variant update.
- `OrderIdentityMigrationTest` xác nhận nâng cấp V3 → V7 không phá dữ liệu legacy.
- `DevelopmentSeedIntegrationTest` xác nhận seed `dev` chạy được với V7.
- `cleanPostgresRunsAllMigrationsAndJPAValidatesTheSchema` xác nhận 7 migration, bảng/cột/index Phase 03 và JPA schema validation.

## J. Việc chưa làm / giới hạn đã biết

- **Refund/void/return đơn đã thanh toán:** chưa triển khai; hủy đơn PAID bị chặn có chủ đích bằng `PAID_ORDER_CANCELLATION_BLOCKED`. Đây là phạm vi Phase sau.
- **Marketplace connector:** không triển khai inbound/outbound thực tế; mọi thay đổi trạng thái/thanh toán/hủy marketplace phải đi qua connector boundary, API POS từ chối.
- **Phương thức thanh toán:** chỉ CASH/BANK_TRANSFER (và MANUAL cho endpoint legacy); chưa có card, ví, COD, trả góp.
- **Tiền tệ:** chỉ VND; chưa hỗ trợ đa tiền tệ hoặc tỷ giá.
- **Thanh toán một lần:** một payment row/đơn; chưa hỗ trợ thanh toán từng phần, nhiều phương thức trên một đơn hoặc split payment.
- **Expiry:** TTL cấu hình toàn cục `app.orders.hold-ttl` (mặc định 15 phút); chưa cấu hình riêng theo cửa hàng/kênh. Worker chạy theo lịch cố định 60 giây, chưa có distributed scheduler; an toàn nhờ row lock nhưng độ trễ expiry tối đa xấp xỉ một chu kỳ sweep.
- **Audit:** chỉ ghi các thay đổi thành công; không lưu các lần thử thất bại (underpaid, invalid transition). History append-only ở tầng ứng dụng/API; chưa có trigger DB chặn UPDATE/DELETE trực tiếp và chưa có retention/archival policy.
- **Shipping/fulfillment nâng cao:** không có tracking, carrier integration, partial fulfillment, bulk ship/export; `/ship` chỉ là bước state machine đơn giản.
- **Frontend, CI/CD, AI/ML, đa kho, import/export:** không nằm trong phạm vi Phase 03.
- **Không sửa repo Go cũ:** mọi thay đổi chỉ nằm trong repo Java hiện tại.

## K. Trạng thái bàn giao

- Toàn bộ thay đổi nằm trên nhánh `feat/phase-03-order-pos-workflow`, dựa trên Phase 02 `59d30e7`.
- `main` vẫn ở `4dc15ae`; Phase 03 chưa được merge.
- Phase 02.1 và Phase 03 đang ở working tree, chưa commit; không có thay đổi nào bị ghi đè.
- Không sửa migration cũ; `V7__phase_03_order_pos_workflow.sql` là migration duy nhất được thêm cho Phase 03.
- Không có thay đổi ngoài phạm vi order lifecycle, POS payment, cancellation/expiry và audit history.
