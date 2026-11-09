# Phase 02.1 — Review Fixes & Data Integrity Audit Report

Ngày lập báo cáo: 08/11/2026  
Repository: `multichannel-inventory-management`  
Nhánh làm việc: `feat/phase-02-inventory-receiving-workflow`  
Trạng thái merge: Chưa merge vào `main` (`main` được bảo vệ nguyên vẹn)  

---

## 1. Tóm tắt điều hành (Executive Summary)

Báo cáo này tài liệu hóa kết quả khắc phục 4 phát hiện (Findings F01, F02, F03, F04) được chỉ ra sau đợt review Phase 02 liên quan đến quản lý danh mục sản phẩm (Products & Variants), xuất/giữ hàng (Orders & Reservations), và nhập kho (Goods Receiving).

Toàn bộ các bản vá tuân thủ nghiêm ngặt nguyên tắc:
1. **Không sửa đổi migration cũ**: Bổ sung migration mới `V6__phase_02_1_audit_and_variant_fixes.sql` duy trì tính tương thích tiến/lùi.
2. **Khóa thứ bậc nhất quán chống Deadlock**: Xác lập thứ tự khóa chuẩn tắc `Product (product_id ASC) → ProductVariant (variant_id ASC) → InventoryBalance (variant_id ASC) → Tài liệu (Order / Reservation / Receipt)`.
3. **Audit toàn vẹn và bất biến**: Ghi nhận toàn bộ diff cấu trúc (before/after) khi sửa phiếu nhập nháp và nhật ký biến động SKU vào bảng chuyên dụng.
4. **An toàn ràng buộc dữ liệu (DB Check Constraints)**: Loại bỏ nguy cơ vi phạm ràng buộc độ dài ghi chú (`chk_receipt_events_note_length`) khi đóng phiếu thiếu với dữ liệu đầu vào cực đại 500 ký tự.
5. **Kiểm thử tích hợp PostgreSQL thực tế**: Toàn bộ 51 test tích hợp trên PostgreSQL 17 (qua Testcontainers) đều vượt qua (`BUILD SUCCESS`).

---

## 2. Chi tiết các phát hiện và giải pháp khắc phục (Findings & Root Causes)

### Finding F01 (High) — Race Conditions giữa Product Archive, Variant Update, Order Placement và Reservation

- **Nguyên nhân gốc rễ (Root Cause):**
  - Trước đây, khi cập nhật biến thể (`ProductServiceImpl.updateVariant`), hệ thống chỉ khóa dòng trong `product_variants` mà không khóa dòng `Product` tương ứng trong bảng `products`. Do đó, nếu một giao dịch đồng thời chuyển trạng thái sản phẩm sang `ARCHIVED` trong khi giao dịch khác đang cập nhật biến thể, có thể xảy ra race condition khiến biến thể của sản phẩm `ARCHIVED` bị sửa đổi hoặc gây ra deadlock nếu thứ tự khóa hàng ngược nhau.
  - Tương tự, khi tạo đơn hàng (`OrderServiceImpl.createOrder` / `createChannelOrder`) hoặc tạo phiếu giữ hàng (`ReservationServiceImpl.reserve`), hệ thống chỉ khóa tồn kho `inventory_balances` mà không kiểm tra trạng thái `ARCHIVED` của sản phẩm gốc dưới khóa bi quan (`PESSIMISTIC_WRITE`). Điều này dẫn tới việc đơn hàng hoặc giữ hàng mới vẫn được tạo cho sản phẩm đã lưu trữ (ngừng kinh doanh).
- **Giải pháp triển khai:**
  1. **Thứ bậc khóa chuẩn tắc (Canonical Lock Hierarchy):**
     $$\text{Product } (\text{sắp xếp } product\_id \uparrow) \longrightarrow \text{ProductVariant } (\text{sắp xếp } variant\_id \uparrow) \longrightarrow \text{InventoryBalance } (\text{sắp xếp } variant\_id \uparrow)$$
  2. Trong `ProductServiceImpl.updateVariant`: Khóa sản phẩm cha bằng `productRepository.findByIdForUpdate(productId)` trước khi khóa biến thể. Kiểm tra nghiêm ngặt `product.getStatus() == Product.Status.ARCHIVED` để từ chối mọi thay đổi trên sản phẩm đã lưu trữ với mã lỗi `BAD_REQUEST`.
  3. Trong `OrderServiceImpl.reserveAndSave`: Thu thập toàn bộ `productId` của các dòng đơn, loại bỏ trùng lặp, sắp xếp theo thứ tự tăng dần (`product_id ASC`), khóa từng sản phẩm bằng `findByIdForUpdate` và từ chối nếu có bất kỳ sản phẩm nào có trạng thái `ARCHIVED`.
  4. Trong `ReservationServiceImpl.reserveInternal`: Khóa sản phẩm gốc tương ứng với SKU trước khi khóa tồn kho, từ chối tạo giữ hàng nếu sản phẩm đã `ARCHIVED`.
  5. **Bảo toàn vòng đời giao dịch cũ:** Các đơn hàng, phiếu giữ hàng hoặc phiếu nhập kho đã được tạo **trước** thời điểm sản phẩm bị `ARCHIVED` vẫn được phép thanh toán (`confirmPayment`), xác nhận bán (`confirmSale`), hủy hoặc nhập kho (`receiveStock`, `closeShort`), đảm bảo không làm gián đoạn dòng tiền và hàng hóa đang luân chuyển.

---

### Finding F02 (Medium) — Thiếu Audit Before/After khi Cập nhật Phiếu nhập Nháp (Draft Receipt)

- **Nguyên nhân gốc rễ (Root Cause):**
  - Khi cập nhật phiếu nhập ở trạng thái `DRAFT` qua `ReceiptServiceImpl.updateReceipt()`, hệ thống ghi nhận một sự kiện loại `UPDATED` vào `receipt_events`, nhưng ghi chú (`note`) chỉ là chuỗi text chung chung ("Cập nhật phiếu nháp"). Không có thông tin về việc trường nào đã bị sửa đổi, dòng hàng nào được thêm mới, cập nhật số lượng/đơn giá, hay bị xóa bỏ.
- **Giải pháp triển khai:**
  1. Bổ sung cột `payload TEXT` vào bảng `receipt_events` thông qua migration `V6__phase_02_1_audit_and_variant_fixes.sql`.
  2. Mở rộng entity `ReceiptEvent` với trường `payload`, đồng thời mở rộng DTO `ReceiptResponse` và `ReceiptResponse.ReceiptEventResponse` để hiển thị dữ liệu audit cấu trúc.
  3. Trong `ReceiptServiceImpl.updateReceiptInternal`: Chụp snapshot trạng thái trước khi cập nhật (`supplier_name_before`, `note_before`, `version_before`, `items_before`), đối chiếu với trạng thái mong muốn mới để tính toán:
     - `added_items`: danh sách biến thể mới được bổ sung kèm số lượng dự kiến và đơn giá;
     - `updated_items`: danh sách dòng có sự thay đổi về `expectedQty` hoặc `unitCost` (ghi rõ `from` vs `to`);
     - `removed_items`: danh sách dòng bị xóa khỏi phiếu;
     - `actor` và `timestamp` của lần cập nhật.
  4. Tuần tự hóa đối tượng diff sang chuỗi JSON và lưu vào trường `payload` của `ReceiptEvent` loại `UPDATED`.

---

### Finding F03 (Medium) — Vi phạm Check Constraint `chk_receipt_events_note_length` khi Đóng thiếu Phiếu nhập

- **Nguyên nhân gốc rễ (Root Cause):**
  - Migration `V5__phase_02_inventory_receiving.sql` đặt ràng buộc cơ sở dữ liệu `CONSTRAINT chk_receipt_events_note_length CHECK (length(note) <= 500)`.
  - Hợp đồng API cho phép trường `reason` trong `CloseShortRequest` có độ dài tối đa 500 ký tự (`MAX_REASON_LENGTH = 500`).
  - Trong mã nguồn `ReceiptServiceImpl.closeShortInternal()`, ghi chú sự kiện được ghép chuỗi:
    ```java
    appendEvent(receipt, ReceiptEvent.Type.CLOSED_SHORT, nextVersion(receipt),
            reason + " (thiếu " + missing + ")");
    ```
  - Nếu người dùng nhập lý do dài đúng 500 ký tự (hợp lệ ở tầng validation), việc cộng thêm `" (thiếu " + missing + ")"` làm chuỗi vượt quá 500 ký tự, dẫn đến `DataIntegrityViolationException` / vi phạm check constraint trên PostgreSQL.
- **Giải pháp triển khai:**
  1. Không thực hiện nối chuỗi vào trường `note`. Lưu nguyên vẹn chuỗi `reason` hợp lệ (tối đa 500 ký tự) vào trường `note`.
  2. Đưa các thông tin siêu dữ liệu vận hành (số lượng thiếu `missing_quantity`, thời điểm đóng thiếu `closed_short_at`, `actor`, `reason`) vào đối tượng JSON cấu trúc và lưu vào cột `payload` mới của `receipt_events`.
  3. Đảm bảo mọi giá trị `reason` từ 1 đến 500 ký tự đều được ghi nhận thành công, bảo toàn ràng buộc cơ sở dữ liệu.

---

### Finding F04 (Medium) — Thiếu Bảng Audit khi Thay đổi SKU và Chưa Đồng bộ Trạng thái Kênh Bán

- **Nguyên nhân gốc rễ (Root Cause):**
  - Khi cập nhật SKU của biến thể (`ProductServiceImpl.updateVariant`), hệ thống yêu cầu cung cấp lý do (`reason`), nhưng lý do này không được lưu vào bất kỳ bảng nhật ký chuyên biệt nào. Nếu biến thể đổi SKU nhiều lần, lịch sử thay đổi bị mất.
  - Ngoài ra, khi SKU biến thể nội bộ thay đổi, các bản ghi mapping kênh (`channel_listings`) liên kết với biến thể đó không được cập nhật trạng thái đồng bộ, dẫn đến việc các kênh bán hàng vẫn giữ trạng thái cũ (`SYNCED`), gây sai lệch nhận diện mã vạch và đồng bộ tồn kho.
- **Giải pháp triển khai:**
  1. **Tạo bảng nhật ký `variant_update_audit`** trong migration `V6__phase_02_1_audit_and_variant_fixes.sql`:
     ```sql
     CREATE TABLE IF NOT EXISTS variant_update_audit (
         id BIGSERIAL PRIMARY KEY,
         variant_id BIGINT NOT NULL REFERENCES product_variants(id) ON DELETE RESTRICT,
         from_sku VARCHAR(64) NOT NULL,
         to_sku VARCHAR(64) NOT NULL,
         reason VARCHAR(500) NOT NULL,
         actor VARCHAR(64) NOT NULL DEFAULT 'system',
         changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
         CONSTRAINT chk_variant_update_audit_reason_length CHECK (length(reason) <= 500)
     );
     CREATE INDEX IF NOT EXISTS idx_variant_update_audit_variant 
         ON variant_update_audit(variant_id, changed_at DESC);
     ```
  2. Thêm Entity JPA `VariantUpdateAudit` và Spring Data Repository `VariantUpdateAuditRepository`.
  3. Cập nhật `ProductServiceImpl.updateVariant`:
     - Giữ nguyên `variant_id` (định danh vật lý bất biến), không làm đứt gãy khóa ngoại của `order_items` hay `receipt_items`.
     - Ghi nhận một dòng vào `variant_update_audit` ngay trong cùng transaction cập nhật.
     - Tìm toàn bộ các kênh bán đang map với biến thể này (`channelListingRepository.findByVariantId(variant.getId())`) và chuyển `sync_status` sang `OUT_OF_SYNC`, đánh dấu cần đồng bộ lại.
  4. Cập nhật phương thức kiểm tra xóa sản phẩm `ProductServiceImpl.deleteProduct`: Bổ sung kiểm tra `variantUpdateAuditRepository.existsByVariantIdIn(variantIds)`, ngăn chặn xóa vĩnh viễn sản phẩm/biến thể đã có lịch sử thay đổi SKU (bắt buộc chuyển trạng thái sang `ARCHIVED`).

---

## 3. So sánh với Kiến trúc Gốc (Go Reference Comparison)

Đối chiếu với kho mã nguồn gốc `D:\DATN-ai-driven-cross-platform-source`:

| Tiêu chí | Bản gốc Go (`DATN-ai-driven-cross-platform-source`) | Bản Java Phase 02.1 (`multichannel-inventory-management`) | Đánh giá tương thích |
|---|---|---|---|
| **Audit biến động SKU** | Bảng `variant_update_audit` được tạo trong migration `00018_variant_update.sql` và check constraint `00027_products_safety.sql`. Ghi nhận `variant_id`, `from_sku`, `to_sku`, `reason`, `changed_at`. | Bảng `variant_update_audit` được tạo trong migration `V6__phase_02_1_audit_and_variant_fixes.sql`. Entity `VariantUpdateAudit` ánh xạ tương đương, chặn xóa sản phẩm có audit. | **Khớp hoàn toàn**: Tái hiện chính xác mô hình append-only audit trail của Go. |
| **Độ dài lý do thay đổi SKU** | `CHECK (length(reason) <= 500)` trên bảng `variant_update_audit`. | `CHECK (length(reason) <= 500)` trên bảng `variant_update_audit`. | **Khớp hoàn toàn**. |
| **Trạng thái đồng bộ kênh** | Quản lý qua `channel_listings` với các cờ `listed`, `pushed_version`, `quantity_basis`. | Đánh dấu `sync_status = OUT_OF_SYNC` trên toàn bộ dòng `channel_listings` liên kết với biến thể đổi SKU. | **Khớp nghiệp vụ**: Báo hiệu cho worker đồng bộ kênh biết SKU cần được đẩy lại. |
| **Thứ tự khóa tránh Deadlock** | Go dùng các truy vấn SQL trực tiếp tuần tự với thứ tự xác định theo ID biến thể hoặc ID đơn. | Chuẩn hóa thứ bậc khóa tường minh: `Product (ID ASC) → Variant (ID ASC) → Balance (ID ASC)`. | **Cải tiến trong Java**: Đảm bảo an toàn tuyệt đối khi Spring Data JPA quản lý Transaction bi quan. |
| **Audit chi tiết nhận hàng** | Lưu sự kiện và batch history trong các bảng audit nhận hàng riêng biệt. | Sử dụng bảng `receipt_events` với cột `payload TEXT` để lưu diff before/after dưới dạng JSON cấu trúc, giữ `note` VARCHAR(500) không bị tràn. | **Cải tiến trong Java**: Giải quyết triệt để lỗi vi phạm check constraint độ dài chuỗi. |

---

## 4. Danh sách các tệp thay đổi (Changed Files)

### 4.1. Migration Cơ sở dữ liệu
- `apps/api/src/main/resources/db/migration/V6__phase_02_1_audit_and_variant_fixes.sql`
  - Thêm cột `payload TEXT` vào `receipt_events`.
  - Tạo bảng `variant_update_audit` kèm ràng buộc `chk_variant_update_audit_reason_length` và chỉ mục tìm kiếm.

### 4.2. Entity & Repository
- `apps/api/src/main/java/com/octoflow/api/entity/VariantUpdateAudit.java`: Entity JPA đại diện cho bảng audit SKU.
- `apps/api/src/main/java/com/octoflow/api/repository/VariantUpdateAuditRepository.java`: Repository Spring Data cho `VariantUpdateAudit`.
- `apps/api/src/main/java/com/octoflow/api/entity/ReceiptEvent.java`: Thêm trường `payload`, phương thức getter/setter.

### 4.3. DTO & Mappers
- `apps/api/src/main/java/com/octoflow/api/dto/response/ReceiptResponse.java`: Bổ sung danh sách `events` và trường `payload` trong phản hồi API.
- `apps/api/src/main/java/com/octoflow/api/mapper/ReceiptMapper.java`: Ánh xạ `payload` từ entity sang DTO response.

### 4.4. Dịch vụ Nghiệp vụ (Service Implementations)
- `apps/api/src/main/java/com/octoflow/api/service/impl/ProductServiceImpl.java`:
  - Khóa `Product` trước khi khóa `ProductVariant`.
  - Chặn sửa biến thể trên sản phẩm `ARCHIVED`.
  - Ghi audit vào `variant_update_audit` khi đổi SKU.
  - Chuyển trạng thái `channel_listings` sang `OUT_OF_SYNC`.
  - Chặn xóa sản phẩm khi có bản ghi trong `variant_update_audit`.
- `apps/api/src/main/java/com/octoflow/api/service/impl/OrderServiceImpl.java`:
  - Khóa bi quan danh sách `Product` theo thứ tự ID tăng dần (`product_id ASC`).
  - Từ chối tạo đơn mới cho sản phẩm có trạng thái `ARCHIVED`.
- `apps/api/src/main/java/com/octoflow/api/service/impl/ReservationServiceImpl.java`:
  - Khóa `Product` tương ứng với SKU trước khi khóa tồn kho.
  - Từ chối tạo giữ hàng mới cho sản phẩm có trạng thái `ARCHIVED`.
- `apps/api/src/main/java/com/octoflow/api/service/impl/ReceiptServiceImpl.java`:
  - Thu thập diff cấu trúc before/after (nhà cung cấp, ghi chú, dòng hàng thêm/sửa/xóa) khi cập nhật phiếu nháp và lưu vào `payload`.
  - Khắc phục `closeShortInternal()`: lưu lý do nguyên bản vào `note` và chuyển thông tin chi tiết vào `payload`, loại bỏ hoàn toàn nguy cơ vi phạm ràng buộc 500 ký tự.

### 4.5. Kiểm thử Tích hợp (Integration Tests)
- `apps/api/src/test/java/com/octoflow/api/FoundationPostgresIntegrationTest.java`:
  - Cập nhật số lượng migration áp dụng từ 5 lên 6.
  - Thêm kiểm tra cấu trúc bảng `variant_update_audit` và cột `receipt_events.payload`.
  - Thêm 7 ca kiểm thử tích hợp chuyên biệt cho Phase 02.1 (chi tiết tại mục 5).

---

## 5. Kết quả Kiểm thử (Test Results & Verifications)

### 5.1. Tóm tắt kết quả chạy Test
- **Lệnh thực hiện:** `mvn -f apps/api/pom.xml verify`
- **Môi trường chạy:** PostgreSQL 17-alpine chạy thông qua Testcontainers.
- **Tổng số test:** 51 tests.
- **Kết quả:** **51 / 51 tests PASSED, 0 Failures, 0 Errors, 0 Skipped.**
- **Build Status:** `BUILD SUCCESS` (Tổng thời gian: 1 phút 11 giây).

### 5.2. Các ca kiểm thử bổ sung xác minh 4 Findings

1. `cannotCreateOrderOrReservationOrMutateVariantsForArchivedProduct`:
   - Xác minh sản phẩm sau khi chuyển sang `ARCHIVED` sẽ từ chối: tạo đơn hàng mới, tạo giữ hàng mới, thêm biến thể mới, và cập nhật biến thể hiện có. Tất cả đều trả mã lỗi `BAD_REQUEST`.
2. `existingOrderAndReservationCanCompleteAfterProductArchived`:
   - Xác minh các đơn hàng và phiếu giữ hàng được tạo khi sản phẩm còn `PUBLISHED` vẫn hoàn tất thanh toán (`confirmPayment` thành công chuyển trạng thái `CONFIRMED` / `PAID`) và bán hàng (`confirmSale` thành công) sau khi sản phẩm bị chuyển sang `ARCHIVED`. Tồn kho bị trừ chính xác và các biến động được lưu đầy đủ vào ledger.
3. `existingReceiptCanBeReceivedOrClosedShortAfterProductArchived`:
   - Xác minh phiếu nhập hàng đã tạo trước đó vẫn có thể nhận hàng đợt (`receiveStock` thành công vào `on_hand`) và đóng thiếu (`closeShort` thành công sang `CLOSED_SHORT`) ngay cả khi sản phẩm đã bị `ARCHIVED`.
4. `multiItemOrderLocksProductsInAscendingOrderPreventingDeadlock`:
   - Mô phỏng 4 luồng đồng thời tạo đơn hàng chứa nhiều sản phẩm theo thứ tự SKU ngược chiều nhau (`Order AB` vs `Order BA`). Nhờ cơ chế khóa `product_id ASC` trước khi khóa biến thể và tồn kho, toàn bộ 4 giao dịch đều hoàn thành an toàn, không xảy ra bất kỳ deadlock hay timeout nào.
5. `concurrentArchiveAndVariantUpdateDoesNotRaceOrCorruptState`:
   - Chạy đồng thời một luồng chuyển sản phẩm sang `ARCHIVED` và một luồng cập nhật thông tin biến thể. Kết quả luôn tuần tự hóa chính xác: hoặc cập nhật biến thể hoàn tất trước rồi mới archive, hoặc archive trước và cập nhật biến thể bị từ chối sạch sẽ với lỗi nghiệp vụ. Không xảy ra lỗi tranh chấp hay hỏng dữ liệu.
6. `receiptDraftUpdateStoresDetailedBeforeAfterAuditDiff` & `receiptMultipleDraftUpdatesPreserveAuditHistory`:
   - Xác minh khi sửa phiếu nháp (thay đổi nhà cung cấp, đổi ghi chú, tăng số lượng dòng A, thêm dòng B, xóa dòng C), toàn bộ diff before/after được lưu trữ chính xác dưới dạng JSON trong trường `payload` của sự kiện `UPDATED`. Khi sửa liên tiếp nhiều lần (`v0 → v1 → v2`), toàn bộ chuỗi lịch sử audit đều được bảo toàn nguyên vẹn.
7. `closeShortWithExact500CharacterReasonSucceedsWithoutConstraintViolation`:
   - Gửi yêu cầu đóng phiếu thiếu với lý do dài đúng **500 ký tự** (giới hạn tối đa của API). Giao dịch thực hiện thành công, cơ sở dữ liệu ghi nhận chuỗi 500 ký tự vào trường `note` mà không vi phạm check constraint `chk_receipt_events_note_length`. Thông tin số lượng thiếu được lưu an toàn trong `payload`.
8. `variantSkuUpdateRecordsAuditTrailAndFlagsChannelListingsOutOfSync` & `variantUpdateTransactionFailureRollsBackAudit`:
   - Xác minh khi đổi SKU, `variant_id` giữ nguyên, bản ghi mới được tạo trong `variant_update_audit` lưu vết `from_sku`, `to_sku`, `reason`, `actor`. Kênh bán hàng liên kết bị chuyển cờ sang `OUT_OF_SYNC`. Ảnh chụp SKU trên các đơn hàng cũ không bị biến dạng. Nếu giao dịch gặp lỗi (ví dụ giá âm), toàn bộ thao tác audit và cập nhật SKU được rollback sạch sẽ.

---

## 6. Phạm vi và Rủi ro còn lại (Scope & Residual Risks)

### 6.1. Xác nhận giới hạn phạm vi (Scope Invariants)
- **Không thay đổi phạm vi dự án**: Không triển khai giao diện người dùng (frontend), không viết các connector sàn thương mại thực tế, không bổ sung worker background chạy lịch trình (sync engine scheduler), không bổ sung AI/ML, không chia quota tự động cho kênh bán, không mở rộng tính năng POS nâng cao, không tạo quy trình trả hàng nhà cung cấp (supplier returns).
- **Không tái cấu trúc toàn diện backend**: Mọi can thiệp được giới hạn đúng trong các module sản phẩm, tồn kho và nhập hàng nhằm khắc phục triệt để các rủi ro toàn vẹn dữ liệu.

### 6.2. Rủi ro còn lại (Residual Risks)
1. **Đồng bộ kênh bán sau khi đổi SKU:** Biến thể đổi SKU hiện được đánh dấu `OUT_OF_SYNC` trên bảng `channel_listings`. Việc đẩy mã SKU mới lên sàn thương mại thực tế sẽ phụ thuộc vào connector/sync engine khi các module này được kích hoạt ở giai đoạn sau.
2. **Kích thước trường `payload` của `receipt_events`:** Trường `payload` được lưu dưới dạng `TEXT` của PostgreSQL (hỗ trợ tới 1GB), tuy nhiên các phiếu nhập cực lớn (ví dụ hàng trăm dòng hàng bị thay đổi đồng loạt) có thể tạo ra chuỗi JSON vài kilobyte. Cần lưu ý tối ưu hóa nén nếu khối lượng nghiệp vụ thực tế phát sinh đột biến.
3. **Đảo ngược phiếu nhập đã nhận đủ (`RECEIVED`):** Hiện tại hệ thống không cho phép hủy hoặc rollback trực tiếp một phiếu nhập đã hoàn thành nhận hàng (`RECEIVED`). Mọi sai lệch kiểm đếm thực tế sau khi nhận phải được xử lý qua quy trình điều chỉnh tồn kho trung tâm (`InventoryAdjustRequest`) có lý do giải trình.

---

## 7. Kết luận và Khuyến nghị

Toàn bộ 4 phát hiện (F01, F02, F03, F04) của Phase 02 đã được giải quyết trọn vẹn, tuân thủ kiến trúc gốc, đạt tính toàn vẹn dữ liệu cao nhất và được bảo vệ bởi bộ test tích hợp Testcontainers hoàn chỉnh.

Mã nguồn trên nhánh `feat/phase-02-inventory-receiving-workflow` đã sẵn sàng để nghiệm thu nghiệp vụ Phase 02.1 trước khi tiến hành quy trình merge vào nhánh chính (`main`).
