# Phase 04 — Multi-channel Inventory Allocation & Sync Review

Ngày audit: 09/11/2026  
Cập nhật hardening F01–F06: 10/11/2026  
Repository: `multichannel-inventory-management`  
Nhánh triển khai: `feat/phase-04-inventory-allocation-sync`  
Base commit: `b6ba73d` (Phase 03.1)  
`main` vẫn ở `4dc15ae` (Phase 01.1); Phase 04 chưa được merge vào `main`.  
Trạng thái: toàn bộ thay đổi Phase 04 được commit trên nhánh riêng; V1–V8 không bị sửa, hardening nằm trong V9.

## A. Tóm tắt

Phase 04 bổ sung lớp phân bổ tồn kho đa kênh và pipeline đồng bộ bền vững trên nền Java hiện có:

1. **Preview không thay đổi dữ liệu.** Mỗi preview lưu một `allocation_plans` ở trạng thái `PROJECTED`, kèm `core_version` của `inventory_balances` và `base_allocation_revision` / `allocation_revision` của SKU. Preview không chạm `on_hand`, `reserved`, `allocated_quota` và không tạo outbox.
2. **Confirm kiểm tra lại cả hai phiên bản.** Confirm bắt buộc `Idempotency-Key`, khóa balance và allocation state, từ chối preview cũ nếu inventory version hoặc allocation revision đã đổi. Mỗi SKU chỉ có tối đa một plan `APPLYING`, được bảo vệ bằng row lock và partial unique index.
3. **Thực thi theo đúng thứ tự Decrease → Verify → Increase.** Mọi item giảm quota phải `VERIFIED` trước khi bất kỳ item tăng quota nào chạy. Timeout/không chắc chắn để item ở `RETRY_PENDING`/`UNCONFIRMED`, chặn toàn bộ increase và cuối cùng chặn plan; không bao giờ coi remote write chưa đọc lại là thành công.
4. **Outbox giao dịch + sync job bền vững.** Mỗi `INVENTORY_CHANGED` được fan-out thành một `sync_jobs` cho từng listing đủ điều kiện. Job dùng target tuyệt đối, claim bằng `FOR UPDATE SKIP LOCKED`, lease có thời hạn, retry lũy thừa có giới hạn, dead letter, và supersession khi target/revision đã thay đổi.
5. **Chỉ VERIFIED sau khi đọc lại.** Sync job ghi tồn, đọc lại độc lập, chỉ chuyển `VERIFIED` khi giá trị đọc lại khớp target; lệch ghi `DRIFT`, timeout ghi `UNCONFIRMED`, lỗi cấu hình/không có connector ghi `BLOCKED`.
6. **Reconciliation fail-closed.** Đối soát dùng simulator khi được bật rõ ràng; kênh thật chưa có connector trả `503 CHANNEL_DELIVERY_UNAVAILABLE`. Drift được ghi evidence và tự xếp một job hiệu chỉnh.
7. **Simulator adapter có trạng thái bền vững.** Simulator lưu quantity/version trong DB, hỗ trợ fault injection (`REFUSE`, `TIMEOUT`, `TIMEOUT_AFTER_WRITE`, `WRONG_READ`, `DELAY`, `DUPLICATE`). Không có lệnh ghi thật nào tới Shopify/WooCommerce/eBay.
8. **Evidence phân biệt rõ target / sent / acknowledged / verified.** Listing, job và plan item đều lưu đủ bốn loại số lượng, trạng thái sync, lỗi gần nhất, thời điểm xác minh và drift.
9. **SSE chỉ sau commit.** Mọi thông báo SSE được đăng ký sau commit và mang nghĩa "hãy đọc lại snapshot"; nhãn thành công chỉ xuất hiện sau read-back verification.
10. **Hardening F01–F06 (V9).** Bổ sung claim generation fencing cho lease, kiểm tra lại core version / allocation revision / ATS trước mỗi increase, khóa listing trước khi prepare sync, phân biệt external product/variant identity, chặn remap khi chưa an toàn, mở rộng reconciliation cho listing quota 0 và làm cho simulator idempotent theo reference.

**Kết quả kiểm chứng:** xem mục I.

## B. So sánh với bản gốc Go

Đối chiếu với module tham chiếu `apps/api/internal/modules/syncing` của repo Go:

| Tiêu chí | Bản gốc Go | Bản Java Phase 04 | Đánh giá |
|---|---|---|---|
| Preview phân bổ | Plan bất biến với revision; preview không ghi đè tồn kho | `allocation_plans` + `variant_allocation_states`; revision tăng khi preview, chỉ advance khi confirm | **Tương thích nghiệp vụ** |
| Thứ tự thực thi | Phase `decrease → verifying_decreases → increase → verifying_increases → final_verification` | Decrease bắt buộc `VERIFIED` trước increase; item `NONE` tự `VERIFIED`; plan chỉ `COMPLETED` khi mọi item `VERIFIED` | **Tương thích nghiệp vụ** |
| Lease | Plan/step lease + variant lease + listing lease advisory | Plan lease trong DB, allocation revision row lock, PostgreSQL advisory lock theo listing | **Tương đương, đơn giản hóa ở cấp plan** |
| Gửi tuyệt đối | Job target là số lượng tuyệt đối, retry an toàn | `sync_jobs.target_quantity` tuyệt đối; stale check theo quota + allocation revision | **Tương thích** |
| Chống gửi chồng | Step/job active được kiểm soát; job cũ bị supersede | Partial unique index active job/listing + supersession khi target đổi | **Tương thích** |
| Verify | Chỉ đánh dấu delivered sau read-back; lỗi để awaiting verification | `VERIFIED` chỉ khi read-back khớp; `DRIFT`/`UNCONFIRMED` là trạng thái riêng | **Tương thích, evidence rõ hơn** |
| Reconciliation | Reconciler đọc remote, ghi evidence, xử lý drift | Reconciler đọc remote ngoài transaction, ghi evidence, queue correction job | **Tương thích** |
| Simulator | Adapter simulator có state/fault phục vụ test | Simulator state + fault trong PostgreSQL; router chỉ mở khi flag bật và environment `simulated` | **Tương thích, fail-closed chặt hơn** |
| Connector thật | Có router Shopify/WooCommerce/eBay ở mức test/khung | Chưa triển khai; mọi kênh thật bị chặn 503 | **Có chủ đích hoãn** |
| UI Sync Center | Có API/flow đầy đủ | Chỉ backend API + SSE; frontend ngoài phạm vi | **Ngoài phạm vi Phase 04** |

## C. Quyết định kiến trúc

1. **Preview là dữ liệu bền vững, không phải phép tính tạm.** Plan `PROJECTED` lưu snapshot `on_hand/reserved/safety_buffer/available_to_sell` và tổng target. Nhờ vậy Confirm có thể kiểm tra lại chính xác preview đã được duyệt.
2. **Revision theo từng variant.** `variant_allocation_states` giữ `current_revision` và `next_revision`; mỗi preview nhận một revision mới. Confirm chỉ thành công khi `current_revision` vẫn bằng `base_allocation_revision`; khi thành công, `current_revision` tiến lên revision của plan.
3. **Một plan thực thi cho mỗi SKU.** Row lock trên allocation state tuần tự hóa confirm; partial unique index `uq_allocation_plan_active_variant` là hàng rào DB cuối cùng. Confirm thứ hai nhận `409 ALLOCATION_PLAN_BLOCKED`.
4. **Chỉ phân bổ thủ công.** Request phải liệt kê tường minh mọi listing đang giữ quota > 0; gửi quantity `0` để gỡ. Bỏ sót listing đang có quota làm plan không thể execute. `policy` trong schema dự phòng `EQUAL`/`WEIGHTED` nhưng Phase 04 chỉ dùng `MANUAL`.
5. **Một định nghĩa duy nhất cho listing giao được.** `ChannelDeliveryEligibility` yêu cầu: active, mapping `VERIFIED`, `mapping_verified_at` có giá trị, channel `CONNECTED`, và adapter có khả năng ghi. Allocation, sync job và reconciliation dùng chung định nghĩa này.
6. **Target tuyệt đối thay vì delta.** Mọi sync job gửi `allocated_quota` hiện tại. Retry cùng target là idempotent về mặt nghiệp vụ; job cũ bị supersede nếu quota/revision đã đổi.
7. **Outbox là ranh giới giao dịch.** Inventory mutation và outbox event commit cùng nhau. Worker fan-out đọc event, khóa listing theo `id ASC`, tạo job trong transaction riêng; lỗi fan-out được retry có giới hạn và cuối cùng thành dead letter.
8. **Adapter I/O nằm ngoài transaction DB.** `ListingLeaseService` giữ session-level PostgreSQL advisory lock trên một connection riêng trong lúc gọi adapter. `AllocationExecutionProcessor`, `SyncJobProcessor` và `ReconciliationRecorder` chỉ mở transaction để chuẩn bị hoặc ghi kết quả.
9. **Decrease là điều kiện tiên quyết của Increase.** Nếu còn bất kỳ decrease `PENDING`/`RETRY_PENDING`/`BLOCKED`, không increase nào được chạy. Timeout không được coi là đã giảm; plan bị chặn thay vì mạo hiểm tăng ở kênh khác.
10. **Fail-closed cho kênh thật.** `ChannelAdapterRouter` chỉ trả simulator khi `app.channels.simulator.enabled=true` **và** channel environment là `simulated`. Mọi trường hợp khác ném `CHANNEL_DELIVERY_UNAVAILABLE`; reconciliation API trả 503, sync job chuyển `BLOCKED`.
11. **Evidence append-only.** `channel_sync_evidence` ghi mọi lần thử giao, verify mapping và reconcile. Không có API sửa/xóa; job/listing chỉ giữ trạng thái mới nhất để đọc nhanh.
12. **SSE là tín hiệu làm mới, không phải nguồn sự thật.** Broadcaster đăng ký sau commit; success chỉ phát khi read-back khớp. Client phải đọc lại endpoint snapshot.
13. **Không sửa migration cũ.** Schema Phase 04 nằm trong `V8__phase_04_inventory_allocation_sync.sql`; hardening F01–F06 nằm trong `V9__phase_04_1_allocation_sync_safety.sql`. V1–V8 giữ nguyên.
14. **Ngân sách được kiểm tra lại trước từng increase.** `increaseBudgetIssue` đọc lại `inventory_balances.version`, `variant_allocation_states.current_revision` và ATS dưới row lock. Nếu bất kỳ giá trị nào lệch, toàn bộ increase còn `PENDING` bị `BLOCKED` với evidence `ALLOCATION_BUDGET_STALE`; decrease đã chọn vẫn tiếp tục chạy. Sau khi ghi increase, ATS được đọc lại; nếu đã tụt dưới tổng target thì các increase sau bị chặn với `ALLOCATION_ATS_STALE`.
15. **Lease có fencing generation.** Mỗi lần claim job/plan tăng `claim_generation`; completion, failure và release phải khớp cả `lease_owner` lẫn generation. Worker cũ không thể hoàn tất claim mới, và release của worker cũ không xóa lease của worker mới.
16. **Mapping identity có version.** `channel_listings.mapping_version` tăng mỗi khi external listing/variant/SKU thay đổi hoặc được điền trong lúc verify. Verify chụp identity + version trước khi gọi adapter, khóa lại và so sánh sau khi adapter trả về; kết quả cũ bị từ chối `CONCURRENT_MODIFICATION`. Remap bị chặn khi quota > 0, sync status `OUT_OF_SYNC`/`ERROR`, còn job chưa kết thúc hoặc listing đang trong allocation item active.

## D. Trạng thái và quy tắc nghiệp vụ

### D.1. Allocation plan

| Trạng thái | Ý nghĩa | Chuyển tiếp |
|---|---|---|
| `PROJECTED` | Preview đã lưu, chưa thực thi | `APPLYING`, `COMPLETED` (nếu mọi item `NONE`), `SUPERSEDED` |
| `APPLYING` | Đang chạy Decrease → Increase | `COMPLETED`, `BLOCKED` |
| `COMPLETED` | Mọi item `VERIFIED` | Terminal |
| `BLOCKED` | Có item lỗi/timeout/hết lượt hoặc preflight thất bại | Terminal trong Phase 04 |
| `SUPERSEDED` | Có preview/plan mới hơn cho cùng SKU | Terminal |

Quy tắc:

- Preview mới supersede mọi plan `PROJECTED` cũ của cùng variant.
- Confirm plan `APPLYING`/`COMPLETED` trả lại response hiện tại (idempotent theo trạng thái).
- Confirm plan `BLOCKED`/`SUPERSEDED` trả `ALLOCATION_PLAN_BLOCKED`.
- Confirm không có `Idempotency-Key` trả `400 IDEMPOTENCY_KEY_REQUIRED`.
- Tổng target > ATS trả `QUOTA_EXCEEDS_ATS`; ATS chỉ trừ safety buffer một lần.
- Confirm kiểm tra lại ATS hiện tại, không chỉ ATS tại thời điểm preview.
- Trước mỗi item `INCREASE`, execution kiểm tra lại core version, allocation revision và tổng target so với ATS. Nếu lệch, mọi increase còn `PENDING` bị chặn (`ALLOCATION_BUDGET_STALE`) và plan `BLOCKED`; item `DECREASE` không bị chặn cơ học bởi các kiểm tra này.
- Nếu ATS tụt sau khi một increase đã ghi và verify, item đó vẫn `VERIFIED` (remote đã nhận đúng target) nhưng các increase sau bị chặn (`ALLOCATION_ATS_STALE`) và listing được đánh `OUT_OF_SYNC` để đối soát.

### D.2. Allocation plan item

- `direction`: `NONE`, `DECREASE`, `INCREASE`.
- `status`: `PENDING`, `RETRY_PENDING`, `VERIFIED`, `BLOCKED`, `SUPERSEDED`.
- Item `NONE` được đánh `VERIFIED` ngay khi confirm (không gọi adapter).
- Item `DECREASE`/`INCREASE` gọi adapter, đọc lại, chỉ `VERIFIED` khi read-back khớp `proposed_quota`.
- Read-back lệch target bị coi là lỗi `PROTOCOL`: ghi evidence `ERROR`, retry/backoff và cuối cùng `BLOCKED` cùng plan. Item không bao giờ được đánh `VERIFIED` khi remote chưa khớp.
- `DRIFT` là trạng thái của sync job/reconciliation, không phải trạng thái thành công của allocation item.
- Item timeout hết lượt → `BLOCKED`; plan `BLOCKED`; mọi increase còn lại giữ `PENDING`.
- Item `UNAVAILABLE` → `BLOCKED` ngay, không retry vô hạn.
- Retry dùng backoff `min(base × 2^(attempt-1), max)`.

### D.3. Sync job

| Trạng thái | Ý nghĩa |
|---|---|
| `PENDING` | Chờ worker |
| `PROCESSING` | Đã claim, đang giữ lease |
| `RETRY_PENDING` | Lỗi tạm thời, chờ backoff |
| `VERIFIED` | Read-back khớp target |
| `DRIFT` | Read-back khác target |
| `UNCONFIRMED` | Timeout (kể cả timeout sau khi đã ghi); kết quả remote không xác định, cần reconciliation |
| `SUPERSEDED` | Target/revision đã đổi; job thay thế được xếp nếu cần |
| `BLOCKED` | Thiếu connector/listing không còn giao được/preflight lỗi |
| `DEAD_LETTER` | Hết lượt retry với lỗi xác định |

Quy tắc:

- Chỉ một job active (`PENDING`/`PROCESSING`/`RETRY_PENDING`) trên mỗi listing.
- Worker claim job tăng `claim_generation`; mọi completion/failure/release kiểm tra owner + generation. Lease hết hạn và bị claim lại thì worker cũ không thể ghi đè kết quả.
- Advisory lock theo listing được lấy **trước** `prepare`; prepare khóa listing rồi job, kiểm tra lại owner/generation, target, allocation revision và mapping identity. Stale job bị `SUPERSEDED` trước khi gọi adapter.
- Sau khi adapter trả về, completion khóa lại listing + job và kiểm tra target/revision/mapping một lần nữa. Nếu đã đổi, kết quả ghi evidence `UNCONFIRMED`/`STALE_AFTER_WRITE`, job `SUPERSEDED` và job thay thế được xếp; không bao giờ đánh `VERIFIED` cho identity/revision mới hơn.
- `TIMEOUT` (kể cả timeout sau khi đã ghi) → `UNCONFIRMED` ngay, không retry mù; reconciliation đọc lại, chuyển `VERIFIED` nếu khớp target hiện tại hoặc supersede và queue correction nếu khác.
- `REFUSE`/lỗi protocol hết lượt → `DEAD_LETTER`.
- `UNAVAILABLE` (không có connector) → `BLOCKED`, không tiêu tốn retry.
- Retry thủ công chỉ cho `RETRY_PENDING`, `DEAD_LETTER`, `DRIFT`, `BLOCKED`; `SUPERSEDED` và `UNCONFIRMED` bị từ chối `SYNC_RETRY_NOT_ALLOWED`.
- Retry kiểm tra lại mapping `VERIFIED`, `allocated_quota == target_quantity`, `target_allocation_revision == allocation_revision` và không có job active khác; sau đó mới reset `attempts=0` và về `PENDING`.

### D.4. Mapping và listing sync status

- `mapping_status`: `UNVERIFIED` → `REGISTERED` → `VERIFIED`.
- DB constraint buộc `(mapping_status = 'VERIFIED') = (mapping_verified_at IS NOT NULL)`.
- `mapping_version` tăng khi external listing id, external SKU hoặc external variant id thay đổi; verify chỉ áp dụng kết quả nếu version + identity vẫn khớp snapshot đã gửi adapter.
- Đăng ký mapping không gọi adapter; verify mapping gọi adapter đọc và ghi evidence `MAPPING_VERIFY` kèm external identity thực tế đã kiểm tra.
- Remap bị chặn `MAPPING_REMAP_BLOCKED` khi listing còn quota > 0, sync status `OUT_OF_SYNC`/`ERROR`, còn sync job chưa kết thúc, hoặc đang có allocation item `PENDING`/`RETRY_PENDING` trong plan `APPLYING`.
- External product identity (`external_listing_id`) và external variant identity (`external_variant_id`) là hai lớp khác nhau: một external product có thể chứa nhiều variant; hai internal SKU không thể cùng claim một external variant. Listing không khai báo variant vẫn giữ unique theo `(channel_id, external_listing_id)`.
- `sync_status`: `UNVERIFIED`, `SYNCED`, `OUT_OF_SYNC`, `ERROR`.
- Chỉ listing `active + VERIFIED + channel CONNECTED + adapter ghi được` mới nhận job/allocation/reconcile.

## E. Transaction, idempotency và concurrency

- **Preview** chạy trong một transaction: khóa allocation state, cấp revision, lưu plan/items, supersede preview cũ. Không có I/O adapter.
- **Confirm** chạy trong `IdempotencyService.execute` với scope `POST:/api/v1/inventory/allocations/{planId}/execute` và fingerprint `plan_id`. Cùng key trả response đã lưu; key khác trên cùng plan vẫn idempotent theo trạng thái plan.
- **Thứ tự khóa Confirm:** plan row → inventory balance (`FOR UPDATE`) → allocation state (`FOR UPDATE`) → từng listing (`FOR UPDATE`, sắp theo `listing_id`). Balance là điểm tuần tự hóa chính giữa các plan khác nhau của cùng variant.
- **Một APPLYING/variant:** kiểm tra trong transaction + partial unique index. Nếu hai confirm đua nhau, một bên nhận `409`.
- **Allocation execution:** plan lease + `claim_generation` trong DB; mỗi tick xử lý tối đa một item. `prepareNextAction` và `applySuccess`/`applyFailure` là transaction riêng. Adapter I/O nằm giữa hai transaction dưới advisory lock của listing. Trước mỗi increase, transaction prepare đọc lại balance/state dưới row lock; sau khi ghi, ATS được kiểm tra lại.
- **Outbox:** claim bằng native query `FOR UPDATE SKIP LOCKED` gồm cả event `PROCESSING` có lease hết hạn; ghi lease trong transaction claim. Fan-out khóa listing theo `id ASC` để tránh deadlock.
- **Sync job:** claim `FOR UPDATE SKIP LOCKED`, lease theo `lease-seconds`; job `PROCESSING` hết lease được recovery. Supervisor lấy advisory lock listing **trước** `prepare`; prepare khóa listing rồi job, kiểm tra owner/generation, target, revision và mapping snapshot. `completeSuccess`/`completeFailure` khóa lại listing rồi job, kiểm tra generation và identity/revision một lần nữa. Thứ tự khóa thống nhất: listing → job cho sync/reconciliation/outbox/retry; plan → item → listing cho allocation.
- **Retry:** backoff lũy thừa có trần; `max-attempts` mặc định 8 cho job/outbox, 5 cho allocation item. Mọi giá trị được kẹp tối thiểu 1. Retry thủ công chỉ hợp lệ sau khi mapping/target/revision được kiểm tra lại.
- **Idempotency reference:** job/item sinh reference ổn định (`sync-job:{id}:r{revision}:t{target}`, `alloc-item:{id}:plan:{revision}:target:{quota}`). Simulator coi cùng reference + cùng payload là no-op, cùng reference + payload khác là `REFUSED`; thay đổi tồn từ bên ngoài xóa reference đã lưu.
- **SSE:** `TransactionSynchronizationManager` đăng ký `afterCommit`; nếu transaction rollback, không có signal.

## F. Schema và migration V8/V9

Migration Phase 04: `V8__phase_04_inventory_allocation_sync.sql`. Hardening F01–F06: `V9__phase_04_1_allocation_sync_safety.sql`. Không sửa V1–V8.

### F.1. `channel_listings`

Bổ sung: `external_variant_id`, `mapping_status`, `mapping_verified_at`, `active`, `sent_quantity`, `acknowledged_quantity`, `verified_quantity`, `last_sync_error`, `last_verified_at`, `target_allocation_revision`.

Constraint/index:

- `chk_channel_listing_mapping_status`: `UNVERIFIED|REGISTERED|VERIFIED`.
- `chk_channel_listing_sync_status`: `UNVERIFIED|SYNCED|OUT_OF_SYNC|ERROR`.
- `chk_channel_listing_verified_mapping`: mapping `VERIFIED` ⇔ `mapping_verified_at` khác `NULL`.
- Unique partial index `(channel_id, external_listing_id)` cho mapping `REGISTERED|VERIFIED` khi `external_variant_id IS NULL` (V9 thay thế index product-level cũ bằng `uq_channel_external_listing_no_variant`), và `(channel_id, external_variant_id)` khi khác `NULL`.
- `mapping_version BIGINT NOT NULL DEFAULT 0` (V9), tăng khi identity thay đổi; CHECK không âm.
- Index `(variant_id, active, mapping_status)` phục vụ fan-out/reconcile; index reconcile `(active, mapping_status, last_verified_at, id)` (V9).

### F.2. `variant_allocation_states`

- PK `variant_id`; `current_revision`, `next_revision`; CHECK `next_revision > current_revision`.
- `ensureExists` insert-if-absent rồi `FOR UPDATE` để tuần tự hóa preview/confirm.

### F.3. `allocation_plans`

- Snapshot: `core_version`, `base_allocation_revision`, `allocation_revision`, `on_hand`, `reserved`, `safety_buffer`, `available_to_sell`, `total_target`, `policy`, `can_execute`, `issues`.
- `claim_generation BIGINT NOT NULL DEFAULT 0` (V9) làm fencing token cho plan lease.
- Trạng thái: `PROJECTED|APPLYING|COMPLETED|BLOCKED|SUPERSEDED`.
- CHECK `total_target <= available_to_sell`, revision order, số lượng không âm.
- Unique `(variant_id, allocation_revision)`; partial unique `(variant_id) WHERE status='APPLYING'`; index due theo `(status, lease_until)`.

### F.4. `allocation_plan_items`

- Snapshot quota hiện tại/đề xuất, `direction`, `status`, `issues`, `attempts`, `next_attempt_at`, bốn loại quantity, `remote_before/after`, `verified_at`.
- Unique `(plan_id, listing_id)`; index `(plan_id, direction, status, next_attempt_at)`.

### F.5. `sync_jobs`

- `job_kind`, `outbox_event_id`, `listing_id`, `channel_id`, `variant_id`, `target_quantity`, `core_version`, `allocation_revision`.
- `claim_generation BIGINT NOT NULL DEFAULT 0` (V9) làm fencing token cho lease.
- Trạng thái như D.3; CHECK số lượng không âm; `max_attempts > 0`.
- Unique `(outbox_event_id, listing_id)` chống fan-out trùng.
- Partial unique `(listing_id) WHERE status IN ('PENDING','PROCESSING','RETRY_PENDING')` chống hai job active.
- Index due `(status, next_attempt_at, id)` và index tra cứu theo listing/channel.

### F.6. `channel_sync_evidence`

- Append-only: listing/job/plan/plan item, `kind`, `adapter`, `status`, `target/sent/acknowledged/verified`, `remote_before/after`, `error_code/message`, `idempotency_reference`, `observed_at`.
- V9 bổ sung `external_listing_id`, `external_variant_id` để evidence ghi đúng identity đã kiểm tra.
- `kind`: `MAPPING_VERIFY|ALLOCATION_DECREASE|ALLOCATION_INCREASE|INVENTORY_SYNC|RECONCILE`.
- `status`: `VERIFIED|DRIFT|UNCONFIRMED|REFUSED|ERROR|OBSERVED`.
- Index `(listing_id, observed_at DESC, id DESC)`.

### F.7. `outbox_events`

- Thêm `lease_until`; index partial `(status, lease_until) WHERE status='PROCESSING'` cho crash recovery.

### F.8. Simulator

- `simulator_listing_states`: quantity/version bền vững theo listing; V9 thêm `last_idempotency_reference`, `last_write_quantity` để cùng reference + cùng payload là no-op, cùng reference + payload khác là conflict.
- `simulator_faults`: fault type, remaining count, delay 0..60000 ms.
- Fault types: `REFUSE`, `TIMEOUT`, `TIMEOUT_AFTER_WRITE`, `WRONG_READ`, `DELAY`, `DUPLICATE`.

### F.9. Tương thích migration

- Schema sạch: Flyway áp dụng đủ V1–V9.
- `FoundationPostgresIntegrationTest` assert đủ 9 migration và các bảng/cột/index Phase 04.
- V9 chỉ thêm cột/index/constraint và thay index product-level bằng partial index hẹp hơn; dữ liệu cũ vẫn hợp lệ.
- Không có migration sửa dữ liệu legacy; legacy listing giữ `UNVERIFIED`/`active=true`.

### F.10. V9 — hardening F01–F06

- `channel_listings.mapping_version` + CHECK không âm.
- `allocation_plans.claim_generation`, `sync_jobs.claim_generation` + CHECK không âm.
- `channel_sync_evidence.external_listing_id`, `external_variant_id`.
- Thay `uq_channel_external_listing_registered` bằng `uq_channel_external_listing_no_variant` (chỉ áp dụng khi `external_variant_id IS NULL`).
- Index reconcile `idx_channel_listing_reconcile_due` và index unresolved job `idx_sync_job_unresolved_listing`.
- `simulator_listing_states.last_idempotency_reference`, `last_write_quantity` + CHECK số lượng không âm.

## G. Thay đổi contract API

Giữ nguyên endpoint cũ; bổ sung endpoint mới.

| Method | Path | Quyền | Ghi chú |
|---|---|---|---|
| POST | `/api/v1/inventory/allocations/preview` | ADMIN | Lưu plan `PROJECTED`; không đổi tồn/quota |
| POST | `/api/v1/inventory/allocations/{planId}/execute` | ADMIN | Bắt buộc `Idempotency-Key`; confirm + bắt đầu thực thi |
| GET | `/api/v1/inventory/allocations/{planId}` | ADMIN, STAFF | Plan + item + evidence tóm tắt |
| GET | `/api/v1/inventory/allocations?sku=...` | ADMIN, STAFF | 20 plan gần nhất của SKU |
| POST | `/api/v1/channels/{channelId}/mappings` | ADMIN | Đăng ký external identity, trạng thái `REGISTERED` |
| POST | `/api/v1/channels/{channelId}/mappings/{listingId}/verify` | ADMIN | Verify qua adapter; fail-closed 503 |
| GET | `/api/v1/channels/{channelId}/mappings/{listingId}/sync-status` | ADMIN, STAFF | Target/sent/ack/verified + evidence |
| POST | `/api/v1/channels/{channelId}/inventory/{listingId}/reconcile` | ADMIN | Trả `ChannelSyncEvidenceResponse`; 503 nếu không có connector |
| GET | `/api/v1/sync/jobs?listingId=&status=&limit=` | ADMIN, STAFF | Danh sách job + evidence |
| GET | `/api/v1/sync/jobs/{jobId}` | ADMIN, STAFF | Chi tiết job + evidence |
| POST | `/api/v1/sync/jobs/{jobId}/retry` | ADMIN | Reset job lỗi/terminal về `PENDING` |
| GET | `/api/v1/sync/stream` | ADMIN, STAFF | SSE tín hiệu làm mới sau commit |
| GET | `/api/v1/channels/simulator/{channelId}/listings/{listingId}` | ADMIN | Đọc state simulator |
| PUT | `/api/v1/channels/simulator/{channelId}/listings/{listingId}/stock` | ADMIN | Ép tồn remote để tạo drift |
| POST | `/api/v1/channels/simulator/{channelId}/listings/{listingId}/fault` | ADMIN | Inject fault có giới hạn |
| DELETE | `/api/v1/channels/simulator/{channelId}/listings/{listingId}/fault` | ADMIN | Xóa fault |

`AllocationPlanResponse` gồm: `id`, `variant_id`, `sku`, `status`, `core_version`, `base_allocation_revision`, `allocation_revision`, `on_hand`, `reserved`, `safety_buffer`, `available_to_sell`, `total_target`, `policy`, `can_execute`, `issues`, `current_ats`, `current_allocated_total`, `risk_warnings`, `created_at`, `confirmed_at`, `completed_at`, `last_error`, `items`.

Mỗi item gồm: `item_id`, `listing_id`, `channel_id`, `channel_code`, `external_sku`, `current_quota`, `proposed_quota`, `direction`, `status`, `mapping_status`, `can_execute`, `issues`, `attempts`, `next_attempt_at`, `sent_quantity`, `acknowledged_quantity`, `verified_quantity`, `remote_before`, `remote_after`, `verified_at`, `last_error`.

`ListingSyncStatusResponse` gồm: thông tin listing/channel/variant, `mapping_status`, `mapping_verified_at`, `active`, `target_quantity`, `mapping_verified`, `sync_status`, `reported_stock`, `sent_quantity`, `acknowledged_quantity`, `verified_quantity`, `last_sync_error`, `last_verified_at`, `target_allocation_revision`, `evidence`.

`SyncJobResponse` gồm: job/channel/variant, `target_quantity`, `core_version`, `allocation_revision`, `status`, `attempts`, `max_attempts`, `next_attempt_at`, bốn loại quantity, `remote_before/after`, `adapter`, `idempotency_reference`, `last_error`, `created_at`, `last_attempt_at`, `verified_at`, `evidence`.

Mã lỗi mới:

| Mã | Trường hợp |
|---|---|
| `ALLOCATION_PLAN_NOT_FOUND` | Không tìm thấy plan |
| `SYNC_JOB_NOT_FOUND` | Không tìm thấy sync job |
| `SYNC_RETRY_NOT_ALLOWED` | Retry job đang active/không hợp lệ, `SUPERSEDED`/`UNCONFIRMED`, hoặc target/revision/mapping đã đổi |
| `MAPPING_REMAP_BLOCKED` | Đổi external identity khi quota > 0, sync chưa chắc chắn, còn job/allocation active |
| `SIMULATOR_NOT_AVAILABLE` | Gọi simulator admin trên kênh không phải simulator hoặc flag tắt |

Tái sử dụng: `ALLOCATION_PLAN_BLOCKED`, `ALLOCATION_PLAN_STALE`, `QUOTA_EXCEEDS_ATS`, `CHANNEL_DELIVERY_UNAVAILABLE`, `MAPPING_NOT_FOUND`, `CONCURRENT_MODIFICATION`, `IDEMPOTENCY_KEY_REQUIRED`.

## H. Danh sách tệp thay đổi Phase 04

### H.1. Migration

- `apps/api/src/main/resources/db/migration/V8__phase_04_inventory_allocation_sync.sql`
- `apps/api/src/main/resources/db/migration/V9__phase_04_1_allocation_sync_safety.sql` (hardening F01–F06)

### H.2. Adapter

- `apps/api/src/main/java/com/octoflow/api/adapter/ChannelInventoryAdapter.java`
- `apps/api/src/main/java/com/octoflow/api/adapter/ChannelAdapterRouter.java`
- `apps/api/src/main/java/com/octoflow/api/adapter/ChannelAdapterException.java`
- `apps/api/src/main/java/com/octoflow/api/adapter/SimulatorChannelAdapter.java`
- `apps/api/src/main/java/com/octoflow/api/adapter/SimulatorStateService.java`

### H.3. Entity & Repository

- Entity mới: `AllocationPlan`, `AllocationPlanItem`, `VariantAllocationState`, `SyncJob`, `ChannelSyncEvidence`, `SimulatorListingState`, `SimulatorFault`.
- Entity sửa: `ChannelListing`, `OutboxEvent`.
- Repository mới: `AllocationPlanRepository`, `AllocationPlanItemRepository`, `VariantAllocationStateRepository`, `SyncJobRepository`, `ChannelSyncEvidenceRepository`, `SimulatorListingStateRepository`, `SimulatorFaultRepository`.
- Repository sửa: `ChannelListingRepository`, `OutboxEventRepository`.

### H.4. DTO

- Request: `AllocationPreviewRequest`, `RegisterChannelMappingRequest`, `VerifyChannelMappingRequest`, `SimulatorStockRequest`, `SimulatorFaultRequest`.
- Response: `AllocationPlanResponse`, `ChannelSyncEvidenceResponse`, `ListingSyncStatusResponse`, `SyncJobResponse`, `SimulatorStateResponse`.
- Sửa: `ChannelListingResponse` (thêm mapping/sync evidence fields).

### H.5. Service, scheduler & controller

- `AllocationService` / `AllocationServiceImpl`
- `AllocationExecutionService` / `AllocationExecutionProcessor`
- `OutboxDispatchService` / `OutboxEventProcessor`
- `SyncJobDispatchService` / `SyncJobProcessor` / `SyncJobManagementService`
- `ReconciliationService` / `ReconciliationRecorder`
- `ChannelMappingRecorder`
- `ChannelEvidenceRecorder`
- `ChannelDeliveryEligibility`
- `ListingLeaseService`
- `SyncEventBroadcaster`
- `SimulatorAdminService`
- Sửa: `ChannelService` / `ChannelServiceImpl`
- Controller mới: `AllocationController`, `SyncJobController`, `SimulatorAdminController`
- Sửa: `ChannelController`, `SyncStreamController`
- Worker mới: `AllocationWorker`, `OutboxWorker`, `SyncJobWorker`, `ReconciliationWorker`
- Sửa: `ErrorCode`, `ChannelMapper`, `application.yml`

### H.6. Test

- `apps/api/src/test/java/com/octoflow/api/Phase04AllocationSyncIntegrationTest.java` (20 test)
- Sửa: `FoundationPostgresIntegrationTest.java` (assert migration V9)
- Sửa: `DevelopmentSeedIntegrationTest.java` (tắt worker khi test seed)

## I. Kiểm chứng

### I.1. Kết quả chạy test

- **Lệnh:** `mvn test` trong `apps/api`.
- **Môi trường:** Java 21.0.1, Maven 3.9.9, PostgreSQL 17-alpine qua Testcontainers.
- **Tổng số:** **90 test**.
- **Kết quả:** **90 / 90 PASSED**, 0 Failures, 0 Errors, 0 Skipped.
- **Build:** `BUILD SUCCESS`.
- **Phân bổ:**
  - `FoundationPostgresIntegrationTest`: 67 test (gồm assert migration V9 và regression Phase 01–03).
  - `Phase04AllocationSyncIntegrationTest`: 20 test.
  - `DevelopmentSeedIntegrationTest`: 1 test.
  - `OrderIdentityMigrationTest`: 1 test.
  - `OrderExpirySweepTest`: 1 test.

### I.2. Kịch bản A — Preview không đột biến và chặn vượt ATS

Test: `previewNeverMutatesInventoryOrQuotaAndRejectsOverAllocation`.

- Preview target 7 với `on_hand=10`, `reserved=1`, `safety_buffer=2`: `available_to_sell=7` (chỉ trừ buffer một lần), plan `PROJECTED`, `canExecute=true`, item `INCREASE`.
- `allocated_quota` vẫn 2; `on_hand/reserved/safety_buffer` không đổi; không có outbox event cho allocation.
- Preview bỏ sót listing đang giữ quota → plan không execute được, issue yêu cầu gửi tường minh.
- Preview target 8 > ATS → `QUOTA_EXCEEDS_ATS`; quota và balance vẫn nguyên.

### I.3. Kịch bản B — Confirm idempotency, stale preview và tranh chấp plan

Các test:

- `confirmRequiresIdempotencyKeyAndReplaysTheStoredResponse`
- `confirmRejectsStaleCoreVersionAndStaleAllocationRevision`
- `onlyOneApplyingPlanPerVariantIsAllowed`

Nội dung xác minh:

- Confirm thiếu `Idempotency-Key` → `400 IDEMPOTENCY_KEY_REQUIRED`.
- Confirm hợp lệ → plan `APPLYING`, đúng một outbox event, quota chưa đổi trước khi thực thi; retry cùng key trả đúng response cũ.
- Preview mới supersede preview cũ; confirm preview cũ → `ALLOCATION_PLAN_BLOCKED`.
- Thay đổi `inventory_balances.version` hoặc `variant_allocation_states.current_revision` sau preview → confirm `409 ALLOCATION_PLAN_STALE`.
- Khi một plan đang `APPLYING`, confirm plan thứ hai của cùng SKU → `409 ALLOCATION_PLAN_BLOCKED`.

### I.4. Kịch bản C — Decrease → Verify → Increase

Các test:

- `decreasesMustVerifyBeforeAnyIncreaseRuns`
- `timedOutDecreaseBlocksAllIncreasesAndThePlan`

Nội dung xác minh:

- Với hai kênh (giảm 3→1, tăng 0→2): lượt đầu chỉ giảm kênh nguồn về 1 và verify; kênh đích vẫn 0, plan còn `APPLYING`, chưa có evidence `ALLOCATION_INCREASE`.
- Lượt sau mới tăng kênh đích lên 2; plan `COMPLETED`; quota và simulator khớp; evidence chỉ gồm `ALLOCATION_DECREASE`, `ALLOCATION_INCREASE` theo đúng thứ tự, đều `VERIFIED` với `verified_quantity` 1 và 2.
- Timeout ở decrease: item `RETRY_PENDING`, evidence `UNCONFIRMED`/`TIMEOUT`; increase vẫn `PENDING`; lượt sau decrease `BLOCKED`, plan `BLOCKED`, quota nguồn giữ 5, kênh đích giữ 0, không có evidence increase.
- Timeout không bao giờ được coi là đã giảm; plan không thể tiếp tục.

### I.5. Kịch bản D — Outbox fan-out, supersession, retry và dead letter

Các test:

- `outboxFanOutCreatesOneActiveJobPerEligibleListingAndSupersedesStaleJobs`
- `syncJobRetriesBoundedlyThenDeadLettersAndCanRecoverAfterFaultClear`

Nội dung xác minh:

- `INVENTORY_CHANGED` tạo đúng một job cho mỗi listing active + mapping `VERIFIED` + channel `CONNECTED`; listing `UNVERIFIED` không nhận job.
- Target job là quota tuyệt đối của từng listing; outbox event chuyển `PUBLISHED`.
- Sự kiện mới supersede job active cũ và tạo job mới; luôn tối đa một job active/listing.
- Fault `REFUSE`: job `RETRY_PENDING` sau lần 1, có `last_error`; hết `max_attempts` (2 trong test) → `DEAD_LETTER`, listing `ERROR`, evidence `REFUSED`.
- Clear fault + retry thủ công: job về `PENDING`, `attempts=0`; lần chạy sau `VERIFIED`; simulator nhận đúng target; job lưu `sent/acknowledged/verified` khớp, `remote_before`, adapter `simulator`, `idempotency_reference`; evidence có bản ghi `VERIFIED` đủ bốn quantity.

### I.6. Kịch bản E — Reconciliation drift, correction và fail-closed

Các test:

- `reconciliationUsesSimulatorEvidenceAndQueuesACorrectionOnDrift`
- `realChannelsRemainFailClosedForVerificationReconciliationAndSimulatorAdmin`
- `mappingMustBeRegisteredAndVerifiedBeforeAllocationCanExecute`

Nội dung xác minh:

- Reconcile khớp: evidence `RECONCILE`/`VERIFIED`, adapter `simulator`, target/verified/remote đúng; listing `SYNCED`.
- Ép remote lệch 5→3: evidence `DRIFT`, `error_code=RECONCILIATION_DRIFT`, listing `OUT_OF_SYNC`, có `last_sync_error`; một job hiệu chỉnh `PENDING` target 5 được xếp.
- Chạy job hiệu chỉnh: remote về 5, job `VERIFIED`, listing `SYNCED`; sync-status trả đủ target/sent/ack/verified và cả evidence drift lẫn evidence giao thành công.
- Kênh `sandbox` (không phải simulator): reconcile và verify mapping trả `503 CHANNEL_DELIVERY_UNAVAILABLE`, không ghi evidence; simulator admin trả `503 SIMULATOR_NOT_AVAILABLE`.
- Mapping mới đăng ký ở `REGISTERED`, allocation bị chặn; verify qua simulator chuyển `VERIFIED`, ghi evidence `MAPPING_VERIFY`, sau đó allocation cho phép execute.

### I.7. Hồi quy Phase 01/02/03

- Toàn bộ test cũ vẫn chạy: idempotency, reservation expiry, order identity, price/stock safety, channel isolation, adjustment ledger, product lifecycle/variant audit, receiving nhiều batch, close-short, rollback đa SKU, POS payment/cancel/expiry/handover.
- `OrderIdentityMigrationTest` xác nhận nâng cấp legacy V3 → V9 thành công.
- `DevelopmentSeedIntegrationTest` xác nhận seed `dev` chạy được với V9.
- `FoundationPostgresIntegrationTest` xác nhận đủ 9 migration, các bảng/cột/index Phase 04 và JPA schema validation.
- Endpoint reconcile cũ trên kênh sandbox vẫn trả 503 như Phase 03; contract response được mở rộng có kiểm soát sang evidence JSON.

### I.8. Hardening F01–F06 (vòng 10/11/2026)

Các test mới:

- `increasesRecheckCoreVersionRevisionAndAtsBeforeEveryStep`
- `syncTimeoutBecomesUnconfirmedAndOnlyReconciliationResolvesIt`
- `staleSyncCompletionIsAlwaysUnconfirmedOrSuperseded`
- `quotaZeroDriftIsReconciledAndQueuesAZeroCorrection`
- `oneExternalProductMayHostSeveralVariantsButOneExternalVariantOnlyOnce`
- `staleVerificationIsRejectedAndUnsafeRemapsAreBlocked`
- `expiredWorkerCannotCompleteANewerClaimAndRetryRulesAreEnforced`
- `retryRejectsSupersededUnconfirmedAndStaleTargetJobs`
- `simulatorAppliesSameReferenceOnceAndRejectsADifferentPayload`

Nội dung xác minh:

- **F01:** sau confirm, thay đổi core version, allocation revision hoặc ATS đều khiến increase bị `BLOCKED` với evidence `ALLOCATION_BUDGET_STALE`; decrease đã chọn vẫn chạy và `VERIFIED`, quota nguồn giảm, quota đích không đổi.
- **F02/F06:** `TIMEOUT_AFTER_WRITE` đưa job về `UNCONFIRMED` (không `VERIFIED`), listing `ERROR`, job trở thành reconciliation candidate; retry bị `SYNC_RETRY_NOT_ALLOWED`; đọc lại khớp target chuyển job `VERIFIED` và listing `SYNCED`.
- **F02:** kết quả sync cho target/revision hoặc mapping identity đã đổi chỉ ghi `UNCONFIRMED`/`STALE_AFTER_WRITE`, job `SUPERSEDED`, job thay thế mang target hiện tại; không có evidence `VERIFIED`.
- **F03:** listing quota 0 nhưng remote 3 vẫn nằm trong candidate, reconcile ghi `DRIFT`, queue job correction target 0; chạy job đưa remote về 0 và listing `SYNCED`.
- **F04:** một `external_listing_id` dùng cho hai internal SKU/variant khác nhau được chấp nhận; dùng lại `external_variant_id` hoặc đăng ký product-level trùng bị `409 DATA_INTEGRITY_VIOLATION`.
- **F05:** verify với `mapping_version` cũ bị `409 CONCURRENT_MODIFICATION` và không thêm evidence; remap bị `MAPPING_REMAP_BLOCKED` khi quota > 0, sync `OUT_OF_SYNC`, hoặc còn job `PENDING`.
- **F06:** claim cũ hết lease không thể complete/release claim mới (generation fencing); retry từ chối `SUPERSEDED`, `UNCONFIRMED`, và job có target lệch quota hiện tại.
- **Simulator:** cùng reference + cùng payload là no-op; cùng reference + payload khác bị `REFUSED`; thay đổi tồn từ bên ngoài xóa reference cũ.

## J. Việc chưa làm / giới hạn đã biết

- **Connector thật:** chưa triển khai Shopify/WooCommerce/eBay. Mọi kênh thật bị chặn bằng `503 CHANNEL_DELIVERY_UNAVAILABLE`; Phase 04 chỉ chứng minh pipeline qua simulator.
- **Phân bổ tự động:** chỉ có policy `MANUAL`; `EQUAL`/`WEIGHTED` mới là giá trị schema dự phòng, chưa có thuật toán.
- **Worker dạng polling:** chạy theo `@Scheduled` trong từng instance, chưa có distributed scheduler/leader election. An toàn nhờ `SKIP LOCKED`, lease và advisory lock, nhưng độ trễ tối đa xấp xỉ chu kỳ poll và tải có thể tăng khi nhiều instance.
- **SSE trong bộ nhớ:** broadcaster chỉ phát tới các client đang kết nối cùng instance; không có replay/durable event stream. Client phải coi SSE là tín hiệu đọc lại snapshot.
- **Partial application:** nếu plan `BLOCKED` sau khi một số item đã `VERIFIED`, các quota đã giao vẫn giữ nguyên; Phase 04 không tự rollback/compensate. Decrease-first giảm rủi ro nhưng không loại bỏ hoàn toàn trạng thái dở dang; cần thao tác vận hành hoặc phase sau.
- **Read-back lệch trong allocation execution:** được xử lý như lỗi protocol (retry rồi `BLOCKED`), không phải `VERIFIED`; plan có thể dừng giữa chừng với một số item đã giao. `DRIFT` chỉ được ghi bởi sync job/reconciliation. Không có rollback tự động cho phần đã giao.
- **Evidence adapter name trong allocation:** processor allocation hiện ghi cứng `"simulator"` cho evidence. Khi thêm connector thật phải truyền tên adapter thực tế; nếu không evidence sẽ sai nguồn.
- **Không có auto-retry cho `BLOCKED`/`UNCONFIRMED`:** cần admin retry thủ công sau khi cấu hình/fault được xử lý.
- **Reconciliation batch có giới hạn:** candidate gồm listing quota 0 có remote/verified khác 0, listing `OUT_OF_SYNC`/`ERROR`, job `UNCONFIRMED`/`DRIFT`, và listing quota 0 chưa có bằng chứng đã về 0; batch vẫn bị giới hạn bởi `reconciliation-batch-size`. Không có per-channel rate limit.
- **Idempotency remote:** phụ thuộc adapter tôn trọng `idempotency_reference`. Simulator đã mô hình hóa same-reference/no-op, same-reference/different-payload/conflict và xóa reference khi tồn đổi từ ngoài; connector thật chưa được kiểm chứng.
- **Evidence append-only ở tầng ứng dụng:** chưa có trigger DB chặn UPDATE/DELETE trực tiếp; chưa có retention/archival.
- **Frontend, AI, CI/CD, đa kho, import/export:** ngoài phạm vi Phase 04.
- **Không sửa repo Go cũ:** mọi thay đổi chỉ nằm trong repo Java hiện tại.

## K. Trạng thái bàn giao

- Toàn bộ thay đổi nằm trên nhánh `feat/phase-04-inventory-allocation-sync`, dựa trên Phase 03.1 `b6ba73d`.
- `main` vẫn ở `4dc15ae`; Phase 04 chưa được merge.
- Không sửa migration cũ; Phase 04 dùng `V8__phase_04_inventory_allocation_sync.sql` và hardening F01–F06 dùng `V9__phase_04_1_allocation_sync_safety.sql`.
- Không có thay đổi ngoài phạm vi allocation, mapping, sync job/outbox, reconciliation, simulator và evidence/SSE.
