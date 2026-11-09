# Phase 03.1 — Review Fixes & POS Order Workflow Audit Report

Ngày lập báo cáo: 09/11/2026  
Repository: `multichannel-inventory-management`  
Nhánh làm việc: `feat/phase-03-order-pos-workflow`  
Trạng thái merge: Chưa merge vào `main` (`main` được bảo vệ nguyên vẹn ở `4dc15ae`)  
Base commit: `cb1880f` (Phase 03 implementation ban đầu)  

---

## 1. Tóm tắt điều hành (Executive Summary)

Báo cáo này ghi nhận toàn diện việc khắc phục 5 phát hiện kỹ thuật (Findings F01–F05) sau đợt review chuyên sâu Phase 03 về quy trình quản lý đơn hàng, bán hàng tại quầy (POS), xác nhận thanh toán, hết hạn đơn bỏ quên và bàn giao sản phẩm.

Toàn bộ các giải pháp khắc phục tuân thủ các nguyên tắc thiết kế bất biến:
1. **Không sửa đổi migration đã áp dụng**: Không chỉnh sửa `V1`–`V7`. Không thêm migration mới khi logic vận hành và sửa lỗi dữ liệu lịch sử có thể thực thi an toàn tại runtime có kiểm soát.
2. **Khóa dữ liệu theo thứ tự chuẩn tắc (Canonical Lock Hierarchy)**:
   $$\text{Product } (\text{sắp xếp } product\_id \uparrow) \longrightarrow \text{ProductVariant } (\text{sắp xếp } variant\_id \uparrow) \longrightarrow \text{InventoryBalance } (\text{sắp xếp } variant\_id \uparrow) \longrightarrow \text{Order } (\text{order\_id})$$
   Tuyệt đối loại bỏ deadlock và triệt tiêu nguy cơ đọc dữ liệu danh mục/tồn kho cũ (stale read) trong persistence context của Spring Data JPA / Hibernate.
3. **Mô hình Reserve-Before-Payment nguyên vẹn**: Tạo đơn chỉ giữ hàng (`reserved += quantity`), xác nhận thanh toán trừ kho (`reserved -= quantity` và `on_hand -= quantity`), hủy/hết hạn chỉ giải phóng hàng giữ (`reserved -= quantity`). Không double deduct, không double release.
4. **Tính lũy thừa (Idempotency) và phân biệt xung đột (Conflict Handling)**: Tách bạch rõ ràng giữa yêu cầu phát lại hợp lệ (replay) và xung đột nghiệp vụ (conflict trả HTTP 409 `PAYMENT_CONFLICT` / `HANDOVER_NOT_APPLICABLE`), tuyệt đối không ghi đè dữ liệu hoặc tạo bút toán phụ.
5. **Đồng hồ cơ sở dữ liệu làm nguồn sự thật thời gian**: Quét hết hạn và xác định deadline bằng `clock_timestamp()` của PostgreSQL, không phụ thuộc vào đồng hồ JVM ứng dụng.
6. **Kiểm thử tích hợp thực tế trên PostgreSQL**: Toàn bộ 70 test (67 test trong `FoundationPostgresIntegrationTest`, 1 unit test sweep `OrderExpirySweepTest`, 1 migration test `OrderIdentityMigrationTest`, 1 seed test `DevelopmentSeedIntegrationTest`) chạy trên PostgreSQL 17 Testcontainers đều đạt `BUILD SUCCESS`.

---

## 2. Chi tiết các phát hiện và giải pháp khắc phục (Findings F01–F05)

### Finding F01 (High) — Checkout có thể sử dụng dữ liệu giá/SKU/tiền tệ/trạng thái sản phẩm cũ (Stale Read)

- **Nguyên nhân gốc rễ (Root Cause):**
  - Khi tạo đơn POS (`createOrder`) hoặc đơn kênh (`createChannelOrder`), `resolveOrder()` trước đây tải toàn bộ entity `ProductVariant` qua `variantRepository.findBySku()` trước khi lấy khóa bi quan.
  - Sau đó, khi `reserveAndSave()` thực hiện khóa dòng `products` bằng `findByIdForUpdate()`, transaction checkout có thể phải chờ một transaction quản lý danh mục (đang đổi giá, sửa SKU hoặc đổi trạng thái sản phẩm sang `ARCHIVED`).
  - Khi transaction quản lý danh mục commit và transaction checkout tiếp tục, Hibernate persistence context vẫn giữ phiên bản managed entity `ProductVariant` cũ đã tải từ trước khi chờ lock. Hậu quả là đơn hàng được tạo với giá cũ, tiền tệ cũ, SKU cũ hoặc gắn với sản phẩm đã bị ARCHIVED; hoặc nếu SKU bị đổi, hệ thống có thể âm thầm thay thế mã hoặc không bắt được lỗi.
- **Giải pháp triển khai:**
  1. **Quy trình phân giải hai pha (Two-Phase Resolution):**
     - **Pha 1 (Identity-Only Resolution):** Thêm projection `ProductVariantRepository.findIdentityBySku(sku)` chỉ truy vấn các ID nguyên thủy (`variantId`, `productId`, `sku`). Không tải managed entity `ProductVariant` vào persistence context.
     - **Pha 2 (Locked Re-read & Verification):** Khóa `Product` theo thứ tự `productId ASC` (`lockAndVerifyOrderLines`), sau đó khóa `ProductVariant` theo `variantId ASC` bằng `findByIdForUpdate()`. Đọc lại toàn bộ thông tin từ hàng đã khóa:
       - Kiểm tra `variant.getSku().equals(requested.sku())`: Nếu SKU đã bị đổi sau khi request gửi lên, từ chối ngay lập tức với lỗi `PRICE_OR_STOCK_CHANGED`, tuyệt đối không âm thầm thế SKU.
       - Kiểm tra `variant.getProduct().getId()` có khớp với `productId` đã khóa: Ngăn chặn biến thể bị chuyển sản phẩm cha.
       - Kiểm tra `product.getStatus() == ARCHIVED`: Từ chối với mã lỗi `BAD_REQUEST`.
       - Tính toán lại đơn giá (`requireVariantPrice`), tiền tệ (`normalizeCurrency`) và tổng tiền từ dữ liệu đã khóa. Nếu client gửi kèm `expectedUnitPrice` mà giá đã đổi, từ chối với lỗi `PRICE_OR_STOCK_CHANGED`.
  2. **Khóa tồn kho tiếp nối:**
     - Trong `reserveAndSave()`, loại bỏ việc khóa lại Product (vì đã được khóa và xác minh ở bước trước), chỉ khóa `InventoryBalance` theo thứ tự `variant_id ASC` và kiểm tra `availableToSell` trên dữ liệu đã khóa trước khi lưu đơn và tăng `reserved`.

---

### Finding F02 (High) — Xác nhận thanh toán ghi đè chi tiết thanh toán khác biệt hoặc giả mạo phương thức thanh toán

- **Nguyên nhân gốc rễ (Root Cause):**
  - Trước đây, khi đơn đã ở trạng thái `PAID`, phương thức `confirmPaymentInternal()` lập tức trả về `toResponse(order)`.
  - Nếu một request gửi tới cùng một đơn đã thanh toán bằng tiền mặt (CASH) nhưng khai báo phương thức thanh toán chuyển khoản (BANK_TRANSFER), hoặc thay đổi số tiền khách đưa (`cashReceived`), mã tham chiếu (`reference`) hoặc ghi chú (`note`), hệ thống vẫn trả về thành công 200 mà không phát hiện sự bất nhất, hoặc chấp nhận ghi nhận sai lệch nếu request gửi kèm một key mới.
  - Nguy hiểm hơn, request có body rỗng (dành cho endpoint cũ ghi `MANUAL`) nếu gửi lại trên đơn đã thanh toán CASH có thể che giấu lỗi, hoặc một thanh toán MANUAL có thể bị client gửi lại yêu cầu ghi đè thành CASH.
- **Giải pháp triển khai:**
  1. **Kiểm tra đối sánh thanh toán nghiêm ngặt (`paymentMatches`):**
     - Khi đơn đã `PAID`, hệ thống tải bản ghi `PosPaymentDetail` hiện có của đơn.
     - Phân giải yêu cầu thanh toán mới thành `PaymentCommand` (với cờ `enforceAmount = false` để tránh validate lại tiền thừa nếu cùng thông tin).
     - So sánh chi tiết: `currency`, `method`, `amountDue`, `cashReceived`, `changeAmount`, `reference`, `note`.
  2. **Xử lý xung đột thanh toán (`PAYMENT_CONFLICT` — HTTP 409):**
     - Nếu payload mới không khớp hoàn toàn với bản ghi thanh toán đã lưu: Ném `ApiException(HttpStatus.CONFLICT, ErrorCode.PAYMENT_CONFLICT)`.
     - Nếu đơn chưa `PAID` nhưng đã tồn tại bản ghi `PosPaymentDetail` (dữ liệu không nhất quán do lỗi hệ thống ngoài ý muốn): Ném `PAYMENT_CONFLICT` để giữ an toàn cho thủ quỹ và kế toán tra soát thủ công.
     - Khi bị từ chối 409, transaction rollback hoàn toàn: Không ghi đè `pos_payment_details`, không trừ kho, không ghi ledger, không ghi history, và bản ghi idempotency claim bị hủy.
  3. **Hỗ trợ Replay an toàn:**
     - Cùng `Idempotency-Key` + cùng payload: Trả về kết quả thanh toán đã hoàn tất từ cache idempotency.
     - Khác `Idempotency-Key` nhưng nội dung thanh toán tương đương: Nhận diện đơn đã thanh toán đúng giao dịch này và trả về kết quả thành công, không tạo thêm bản ghi thanh toán thứ hai.
     - Thanh toán `MANUAL` (tương thích backward) không thể bị ghi đè hay biến đổi thành `CASH` hoặc `BANK_TRANSFER`.

---

### Finding F03 (Medium) — Đơn POS cũ (Legacy) thiếu hạn giữ hàng (`hold_expires_at = NULL`)

- **Nguyên nhân gốc rễ (Root Cause):**
  - Migration `V7` bổ sung cột `hold_expires_at` với ràng buộc kiểm tra `chk_orders_hold_expires_scope`. Tuy nhiên, các đơn POS ở trạng thái `PLACED` + `PENDING` được tạo từ trước thời điểm áp dụng V7 có thể có `hold_expires_at = NULL`.
  - Vì worker quét hết hạn chỉ tìm các đơn có `hold_expires_at IS NOT NULL AND hold_expires_at <= now`, các đơn POS cũ này sẽ vĩnh viễn bị treo hàng giữ trong `inventory_balances.reserved`, làm giảm số lượng hàng có thể bán (`available_to_sell`) của kho.
- **Giải pháp triển khai:**
  1. **Cơ chế Runtime Repair Metadata-Only (`LegacyHoldRepairProcessor`):**
     - Không viết thêm Flyway migration để can thiệp dữ liệu cũ (tuân thủ nguyên tắc đóng băng migration).
     - Tích hợp một pha rà soát và khắc phục đơn POS legacy ngay trong chu kỳ chạy của `expireAbandonedOrders()`, trước khi thực hiện truy vấn quét hết hạn.
  2. **Quy tắc phân loại và khắc phục an toàn:**
     - Sử dụng keyset pagination (`findLegacyPosHoldCandidates(source, status, paymentStatus, afterId, pageable)`) theo `id ASC` để duyệt từng lô có chặn trên, bảo đảm một bản ghi lỗi không làm tắc nghẽn toàn bộ tiến trình.
     - Mỗi đơn được xử lý trong một transaction độc lập `Propagation.REQUIRES_NEW`.
     - Khóa theo thứ tự chuẩn tắc: Khóa `InventoryBalance` các biến thể liên quan (theo `variant_id ASC`), sau đó khóa dòng `Order` (`findByIdForUpdate`).
     - **Kiểm định tính toàn vẹn (Integrity Invariants):**
       - Đơn phải có dòng hàng hợp lệ, số lượng > 0.
       - Tổng tiền `total_amount` phải khớp chính xác với tổng giá trị các dòng hàng.
       - Không tồn tại bản ghi thanh toán `pos_payment_details`.
       - Lượng hàng giữ `inventory_balances.reserved` phải $\ge$ số lượng đặt của đơn.
     - **Cập nhật hạn giữ hàng:** Nếu thỏa mãn, cập nhật `hold_expires_at = created_at + app.orders.hold-ttl`.
     - **Không sinh bút toán thừa:** Quá trình repair tuyệt đối **không** ghi ledger, không ghi `order_status_history`, không sinh sự kiện outbox và không giải phóng tồn kho. Việc giải phóng tồn kho và ghi audit chỉ xảy ra khi đơn thực sự hết hạn và được xử lý bởi `OrderExpiryProcessor`.
  3. **Cô lập bất thường (Anomalies Isolation):**
     - Nếu phát hiện đơn legacy có dữ liệu mâu thuẫn (thiếu dòng hàng, sai lệch tổng tiền, hàng giữ không đủ, đã có thanh toán): Đơn được đánh dấu là `ANOMALY`, log cảnh báo kèm `orderId` và lý do chi tiết, giữ nguyên trạng thái để thủ quỹ/kế toán kiểm tra thủ công, không tự ý sửa đổi hoặc hủy bỏ.

---

### Finding F04 (Medium) — Quét hết hạn (Expiry Sweep) phụ thuộc đồng hồ JVM, không phân trang ổn định và thiếu cô lập lỗi

- **Nguyên nhân gốc rễ (Root Cause):**
  - `expireAbandonedOrders()` trước đây dùng `Instant.now()` của máy chủ ứng dụng để lọc ứng viên hết hạn. Nếu đồng hồ JVM bị lệch so với cơ sở dữ liệu PostgreSQL, các đơn chưa hết hạn có thể bị quét nhầm hoặc đơn quá hạn bị bỏ sót.
  - Truy vấn `findExpiredOrderCandidates` không giới hạn số lượng kết quả (`Pageable`), có thể gây tràn bộ nhớ khi có đột biến đơn tồn đọng lớn. Thứ tự sắp xếp theo `id` không phản ánh đúng thứ tự đơn nào cần hết hạn trước.
  - Nếu bước repair legacy gặp lỗi ngoại lệ nghiêm trọng trên một đơn, sweep có thể dừng lại khiến các đơn quá hạn khác không được giải phóng.
- **Giải pháp triển khai:**
  1. **Đồng hồ PostgreSQL làm căn cứ duy nhất:**
     - Lấy thời gian hiện tại từ DB bằng `orderRepository.databaseNow()` (`SELECT clock_timestamp()`) trước khi tìm kiếm ứng viên.
     - Trong `OrderExpiryProcessor.expireOne()`, sau khi đã sở hữu khóa hàng của `InventoryBalance` và `Order`, hệ thống đọc lại `databaseNow()` một lần nữa để đánh giá điều kiện `holdExpiresAt.isAfter(now)`. Điều này bảo đảm nếu transaction phải đợi lấy lock, thời điểm đánh giá luôn là thời gian thực của DB.
  2. **Phân trang và thứ tự ổn định:**
     - Bổ sung cấu hình `app.orders.expiry-batch-size: ${ORDER_EXPIRY_BATCH_SIZE:100}` (mặc định 100 đơn/lần quét).
     - Cập nhật truy vấn: `ORDER BY o.holdExpiresAt ASC, o.id ASC` kèm tham số `Pageable`. Đơn đến hạn trước được ưu tiên xử lý trước; `id ASC` đảm bảo thứ tự xác định khi nhiều đơn có cùng deadline.
  3. **Cô lập lỗi toàn diện:**
     - Mỗi đơn hết hạn được xử lý bởi `OrderExpiryProcessor` trong transaction `REQUIRES_NEW`. Nếu một đơn thất bại (ví dụ dữ liệu tồn kho bị lỗi), lỗi được bắt, log chi tiết và tăng biến đếm `failed`. Vòng lặp tiếp tục xử lý các đơn còn lại trong đợt quét mà không làm gián đoạn hệ thống.
     - Hỗ trợ an toàn khi có nhiều worker chạy đồng thời: Đơn nào bị worker khác xử lý trước sẽ được `expireOne` nhận diện và trả về `false` (tính vào `skipped`), không gây xung đột hay giải phóng trùng lặp.

---

### Finding F05 (Medium) — Bàn giao đơn hàng (Handover) phát lại sai lệch trên đơn đã giao qua vận chuyển

- **Nguyên nhân gốc rễ (Root Cause):**
  - Quy trình bán hàng tại quầy cho phép chuyển nhanh `CONFIRMED → DELIVERED` qua endpoint `/api/v1/orders/{id}/handover` với action ghi lịch sử là `HANDED_OVER`.
  - Tuy nhiên, nếu một đơn hàng được giao theo quy trình vận chuyển thông thường (`CONFIRMED → PACKED → SHIPPED → DELIVERED`), trạng thái cuối cùng của đơn cũng là `DELIVERED`.
  - Trước đây, nếu ai đó gọi nhầm `/handover` trên đơn đã giao qua vận chuyển, hệ thống kiểm tra `order.getStatus() == DELIVERED` và coi đó là thao tác lặp lại vô hại (no-op/replay), trả về HTTP 200. Điều này làm sai lệch ngữ nghĩa vận hành, khiến người dùng hiểu lầm rằng đơn này đã được bàn giao tại quầy.
- **Giải pháp triển khai:**
  1. **Phân định kênh giao hàng dựa trên lịch sử kiểm toán:**
     - Bổ sung phương thức `orderStatusHistoryRepository.existsByOrderIdAndAction(orderId, OrderStatusHistory.Action.HANDED_OVER)`.
     - Khi tiếp nhận yêu cầu `handoverOrder` cho một đơn đã ở trạng thái `DELIVERED`:
       - Nếu trong lịch sử **đã có** hành động `HANDED_OVER`: Đây là một yêu cầu phát lại (idempotent replay) hợp lệ của chính thao tác bàn giao tại quầy $\rightarrow$ Trả về thông tin đơn hiện tại (HTTP 200), không ghi thêm lịch sử hay outbox.
       - Nếu trong lịch sử **chưa từng có** hành động `HANDED_OVER` (tức đơn đạt `DELIVERED` thông qua bước `SHIPPED` của quy trình vận chuyển): Từ chối ngay với lỗi xung đột nghiệp vụ:
         `ApiException(HttpStatus.CONFLICT, ErrorCode.HANDOVER_NOT_APPLICABLE, "Đơn đã được giao qua quy trình vận chuyển; không thể ghi nhận bàn giao tại quầy.")`.
  2. **Bảo toàn dữ liệu:**
     - Không cho phép gán đè lịch sử bàn giao tại quầy lên đơn giao hàng từ xa.
     - Lần gọi bị từ chối 409 không tạo bản ghi lịch sử mới và không phát sinh outbox event.

---

## 3. So sánh với kiến trúc tham chiếu Go (Go Reference Comparison)

Đối chiếu với kho mã nguồn Go gốc (`C:\Users\admin\AppData\Local\Temp\opencode\go-reference\apps\api\internal\modules\orders` và tài liệu kỹ thuật liên quan):

| Tiêu chí | Bản tham chiếu Go | Bản Java Phase 03.1 (Sau khi khắc phục) | Đánh giá & Cải tiến trong Java |
|---|---|---|---|
| **Pha xác minh danh mục khi Checkout (F01)** | Trừ kho trực tiếp hoặc giữ qua `reservations`; kiểm tra gián đoạn bằng snapshot và lệnh lock. Có nguy cơ đọc giá cũ nếu cache danh mục chưa xóa. | Sử dụng **Two-Phase Checkout**: Phase 1 chỉ lấy identity; Phase 2 khóa bi quan `Product (ASC)` $\rightarrow$ `Variant (ASC)` rồi mới đọc giá, tiền tệ, trạng thái và SKU. | **Vượt trội về an toàn**: Loại bỏ hoàn toàn stale read trong persistence context; bảo đảm giá và SKU trên đơn là giá thực tế đã khóa. |
| **Xử lý xung đột thanh toán POS (F02)** | Ghi nhận thanh toán thủ công qua bảng `order_payment_confirmations` và `order_payment_observations`. Dùng `inventory_commands` kiểm tra fingerprint request. | Kiểm tra đối sánh toàn diện payload mới với bản ghi `PosPaymentDetail` đã lưu (`method`, `amountDue`, `cashReceived`, `change`, `ref`, `note`). Sai lệch ném HTTP 409 `PAYMENT_CONFLICT`. Body rỗng giữ `MANUAL`. | **Chặt chẽ hơn**: Chặn đứng nguy cơ sửa đổi phương thức thanh toán hoặc số tiền của đơn đã thanh toán khi gọi kèm key mới. |
| **Bảo trì đơn POS cũ thiếu TTL (F03)** | Hạn giữ hàng nằm trong bảng `reservations` với TTL 900s. Đơn POS không giữ trực tiếp trên `orders`. | Đơn POS lưu TTL trực tiếp tại `orders.hold_expires_at`. Tự động backfill đơn legacy từ `created_at + hold_ttl` bằng transaction `REQUIRES_NEW`, metadata-only, cách ly bất thường. | **Thích ứng hoàn hảo**: Bảo vệ kho không bị chiếm dụng bởi các đơn rác trước đợt nâng cấp schema mà không cần migration sửa đổi dữ liệu tĩnh. |
| **Đồng hồ và phân trang Expiry (F04)** | Worker Go định kỳ quét cơ sở dữ liệu dựa trên câu truy vấn SQL với `clock_timestamp()`. | Lấy mốc thời gian từ PostgreSQL (`orderRepository.databaseNow()`), phân trang ổn định `ORDER BY hold_expires_at ASC, id ASC`, giới hạn lô bằng `expiry-batch-size`, cô lập lỗi từng đơn qua `REQUIRES_NEW`. | **Chuẩn hóa công nghiệp**: Ngăn chặn clock skew giữa server Java và DB PostgreSQL; bảo đảm tải DB luôn ổn định dưới áp lực cao. |
| **Tính lũy thừa của Handover (F05)** | Quản lý trạng thái fulfillment qua các cột riêng biệt và cờ vận chuyển. | Kiểm tra hành động `HANDED_OVER` trong `order_status_history`. Replay thành công nếu đơn đã handover; ném `HANDOVER_NOT_APPLICABLE` (HTTP 409) nếu đơn đã giao qua shipping. | **Nhất quán mô hình trạng thái**: Giữ nguyên triết lý dùng `orders.status` làm nguồn sự thật duy nhất mà vẫn phân định chính xác phương thức giao hàng. |

---

## 4. Danh sách các tệp thay đổi (Changed Files)

### 4.1. Core Domain & Business Logic
1. `apps/api/src/main/java/com/octoflow/api/exception/ErrorCode.java`:
   - Thêm mã lỗi mới: `PAYMENT_CONFLICT`, `HANDOVER_NOT_APPLICABLE`.
2. `apps/api/src/main/java/com/octoflow/api/repository/ProductVariantRepository.java`:
   - Thêm interface projection `VariantIdentity` (`variantId`, `productId`, `sku`).
   - Thêm query `findIdentityBySku(@Param("sku") String sku)` phục vụ pha 1 của checkout.
3. `apps/api/src/main/java/com/octoflow/api/repository/OrderStatusHistoryRepository.java`:
   - Thêm phương thức `existsByOrderIdAndAction(Long orderId, OrderStatusHistory.Action action)`.
4. `apps/api/src/main/java/com/octoflow/api/repository/OrderRepository.java`:
   - Cập nhật `findExpiredOrderCandidates` nhận `Pageable` và sắp xếp `holdExpiresAt ASC, id ASC`.
   - Thêm projection `LegacyHoldCandidate`.
   - Thêm truy vấn `findLegacyPosHoldCandidates` với phân trang keyset `o.id > :afterId`.
5. `apps/api/src/main/java/com/octoflow/api/service/impl/LegacyHoldRepairProcessor.java` *(Tạo mới)*:
   - Bộ xử lý sửa chữa hạn giữ hàng cho đơn POS legacy trong transaction riêng `REQUIRES_NEW`.
   - Kiểm tra ràng buộc dữ liệu toàn vẹn, cập nhật `hold_expires_at`, cô lập các đơn bất thường (`ANOMALY`).
6. `apps/api/src/main/java/com/octoflow/api/service/impl/OrderServiceImpl.java`:
   - Tái cấu trúc checkout với `resolveRequestedVariants` và `lockAndVerifyOrderLines`.
   - Cập nhật `confirmPaymentInternal` với kiểm tra đối sánh `paymentMatches` và từ chối xung đột `PAYMENT_CONFLICT`.
   - Cập nhật `handoverOrder` với kiểm tra lịch sử `HANDED_OVER` và từ chối `HANDOVER_NOT_APPLICABLE`.
   - Cập nhật `expireAbandonedOrders` tích hợp repair đơn legacy, đọc đồng hồ PostgreSQL, phân trang lô `expiry-batch-size`.
7. `apps/api/src/main/resources/application.yml`:
   - Bổ sung cấu hình `app.orders.expiry-batch-size: ${ORDER_EXPIRY_BATCH_SIZE:100}`.

### 4.2. Testing & Quality Assurance
8. `apps/api/src/test/java/com/octoflow/api/service/impl/OrderExpirySweepTest.java` *(Tạo mới)*:
   - Unit test kiểm tra `expireAbandonedOrders()` gọi đúng `orderRepository.databaseNow()` và truyền phân trang có giới hạn.
9. `apps/api/src/test/java/com/octoflow/api/FoundationPostgresIntegrationTest.java`:
   - Cập nhật kỳ vọng test cũ cho F05 (đơn giao qua shipping bị từ chối 409 khi handover).
   - Thêm kịch bản test tích hợp F01: Giá đổi đồng thời, SKU đổi đồng thời, Product bị ARCHIVED đồng thời.
   - Thêm kịch bản test tích hợp F02: Thanh toán CASH lặp lại, thanh toán tương đương key khác, từ chối xung đột phương thức/tiền/ghi chú, tranh chấp thanh toán khác loại cùng lúc.
   - Thêm kịch bản test tích hợp F03: Đơn legacy được gắn deadline và expire đúng chuẩn; backfill không sinh ledger/history; đơn anomaly và đơn ngoại phạm vi được giữ nguyên.
   - Thêm kịch bản test tích hợp F04: Đợt quét tiếp tục khi một đơn bị lỗi; hai worker chạy song song không release trùng.
   - Thêm kịch bản test tích hợp F05: Handover đồng thời và replay lũy thừa an toàn.

---

## 5. Kết quả kiểm chứng (Verification & Test Results)

### 5.1. Kết quả thực thi Test Suite
Chạy toàn bộ kiểm thử trên môi trường Docker PostgreSQL 17-alpine (Testcontainers) thông qua Maven:
```powershell
mvn -f apps/api/pom.xml test
```
**Kết quả:**
- `com.octoflow.api.DevelopmentSeedIntegrationTest`: 1 run, 0 failures, 0 errors.
- `com.octoflow.api.FoundationPostgresIntegrationTest`: 67 runs, 0 failures, 0 errors.
- `com.octoflow.api.OrderIdentityMigrationTest`: 1 run, 0 failures, 0 errors.
- `com.octoflow.api.service.impl.OrderExpirySweepTest`: 1 run, 0 failures, 0 errors.
- **Tổng cộng: 70 tests run, 0 failures, 0 errors, 0 skipped.**
- **Thời gian hoàn thành:** ~48 giây.
- **Trạng thái:** `BUILD SUCCESS`.

### 5.2. Các kịch bản kiểm thử trọng yếu của Phase 03.1
| Mã test | Kịch bản kiểm thử | Hành vi được xác nhận |
|---|---|---|
| **F01.1** | `concurrentPriceChangeAfterResolutionUsesTheLockedVerifiedPrice` | Khi giá biến thể thay đổi đồng thời ngay sau pha phân giải ban đầu, giao dịch checkout nhận diện chính xác giá mới đã khóa, tính tổng tiền đúng và đặt đơn thành công. |
| **F01.2** | `concurrentSkuChangeAfterResolutionRejectsCheckoutWithoutSilentSubstitution` | Khi SKU bị thay đổi đồng thời ngay trước khi khóa hàng, checkout phát hiện SKU không còn khớp, từ chối với lỗi `PRICE_OR_STOCK_CHANGED`, không trừ kho và không lưu order_items. |
| **F01.3** | `concurrentArchiveAfterResolutionRejectsCheckoutWithoutReservingStock` | Khi sản phẩm bị chuyển sang `ARCHIVED` đồng thời trước khi khóa hàng, checkout từ chối với `BAD_REQUEST`, không giữ kho và không tạo đơn. |
| **F02.1** | `paidOrderRejectsDifferentPaymentContentWithoutSideEffects` | Đơn đã thanh toán CASH từ chối yêu cầu đổi sang BANK_TRANSFER, đổi số tiền hoặc đổi ghi chú với HTTP 409 `PAYMENT_CONFLICT`; không đổi tồn kho, không tăng history/outbox/ledger. Body rỗng MANUAL được bảo vệ không thể đổi sang CASH/BANK. |
| **F02.2** | `concurrentDifferentPaymentContentsCommitExactlyOnePayment` | Hai luồng cùng lúc gửi thanh toán CASH và BANK_TRANSFER cho cùng một đơn: Đúng một luồng chiến thắng (HTTP 200), luồng thua nhận 409 `PAYMENT_CONFLICT`; tồn kho trừ đúng 1 lần, ledger và history có đúng 1 bút toán thanh toán. |
| **F03.1** | `legacyPosHoldIsBackfilledFromCreatedAtAndExpiresThroughNormalAudit` | Đơn POS cũ có `hold_expires_at = NULL` và `created_at` quá khứ được backfill deadline và giải phóng tồn kho sạch sẽ trong đợt quét, ghi lịch sử `EXPIRED` và outbox `ORDER_EXPIRED`. |
| **F03.2** | `legacyHoldBackfillIsMetadataOnlyAndDoesNotCreateLedgerOrHistory` | Đơn POS cũ hợp lệ chưa hết hạn chỉ được cập nhật `hold_expires_at`; hoàn toàn không sinh dòng lịch sử, không sinh outbox và không sinh bút toán ledger. |
| **F03.3** | `legacyHoldRepairLeavesAnomaliesAndNonCandidatesUntouched` | Đơn có dữ liệu tồn kho mâu thuẫn được giữ nguyên (`ANOMALY`), đơn marketplace/đã thanh toán/đã hủy không bị tác động. Khi sự cố tồn kho được khắc phục, đơn tiếp tục được repair và expire thành công. |
| **F04.1** | `expiryBatchContinuesAfterOneOrderFailsAndTwoWorkersReleaseEachHoldOnce` | Khi một đơn trong đợt quét gặp lỗi dữ liệu, worker ghi nhận lỗi và tiếp tục xử lý thành công đơn tiếp theo. Hai worker quét đồng thời chỉ giải phóng mỗi đơn đúng một lần. |
| **F04.2** | `sweepUsesDatabaseClockAndBoundedStableBatches` | Kiểm chứng độc lập việc sweep luôn gọi `orderRepository.databaseNow()` và áp dụng phân trang có chặn trên theo thứ tự ưu tiên deadline. |
| **F05.1** | `handoverIsIdempotentOnlyForCounterDeliveredOrders` | Hai yêu cầu handover gửi đồng thời cho đơn CONFIRMED đều thành công với đúng 1 lịch sử `HANDED_OVER`; yêu cầu phát lại sau đó là no-op. |
| **F05.2** | `stateMachineBlocksInvalidJumpsUnpaidShippingAndMarketplaceActions` (Updated) | Đơn đã DELIVERED qua quy trình vận chuyển đường dài từ chối yêu cầu handover với HTTP 409 `HANDOVER_NOT_APPLICABLE`. |

---

## 6. Giới hạn đã biết & rủi ro tồn đọng (Known Deferred Scopes)

1. **Phạm vi hoàn tiền / Trả hàng (Refunds & Returns)**:
   - Các đơn hàng đã thanh toán (`PAID`) tiếp tục bị chặn hủy có chủ đích bằng lỗi `PAID_ORDER_CANCELLATION_BLOCKED`. Nghiệp vụ trả hàng, nhập lại kho hoàn trả và hoàn tiền khách hàng được bảo lưu cho Phase chuyên trách tiếp theo.
2. **Kênh Marketplace nâng cao**:
   - Các đơn hàng có nguồn `SHOPIFY`, `WOOCOMMERCE`, `EBAY` chỉ được tiếp nhận qua ranh giới nội bộ `createChannelOrder`. Việc kết nối cổng API thực tế và bộ lắng nghe sự kiện đồng bộ hai chiều (inbound webhook / polling) nằm ngoài phạm vi Phase 03.1.
3. **Thanh toán tách phần & Đa phương thức (Split Payment)**:
   - Hệ thống duy trì mỗi đơn gắn liền với duy nhất một bản ghi `PosPaymentDetail` (CASH, BANK_TRANSFER hoặc MANUAL). Chưa hỗ trợ chia nhỏ thanh toán (ví dụ: vừa quẹt thẻ vừa trả tiền mặt).
4. **Hạ tầng phân tán (Distributed Locks)**:
   - Việc phối hợp giữa nhiều worker nền hiện dựa trên Pessimistic Locking (`FOR UPDATE`) của PostgreSQL và tính chất transaction `REQUIRES_NEW`. Giải pháp này an toàn tuyệt đối cho kiến trúc cụm hiện tại, nhưng có thể mở rộng thêm Redis Distributed Lock hoặc ShedLock khi quy mô hàng trăm node worker.

---

## 7. Xác nhận phạm vi và cam kết (Scope Confirmation)

- **Nhánh làm việc**: Toàn bộ công việc được thực hiện trên nhánh `feat/phase-03-order-pos-workflow`. Tuyệt đối không tạo nhánh mới và không merge vào `main`.
- **Cam kết Git**: Các thay đổi được phân nhóm và commit rõ ràng theo từng nhóm phát hiện (F01–F05).
- **Trạng thái kho mã nguồn**: Mã nguồn sạch, không có tệp thừa, tài liệu audit được lưu trữ chuẩn xác tại `docs/audits/phase-03-review-fixes.md`.
