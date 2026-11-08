# Phase 01 — Java Backend Foundation Review

Ngày audit: 08/11/2026
Repository triển khai: `multichannel-inventory-management`
Nhánh: `feat/java-core-foundation-hardening`
Java baseline: `aaa0f57f0878791d5ee55f635c5218c9c043d5c2`
Go reference baseline: `4f0a73d109d2badef622942aea5d6690fa2fc9f9`

## A. Executive Summary

Backend Java ban đầu đã có các route và service cho catalog, inventory, reservation, receiving, order và channel, nhưng chưa có test; việc tồn tại Controller/Service không chứng minh các luồng đó an toàn. Audit phát hiện thiếu idempotency lưu bền, không khóa dòng ở một số chuyển trạng thái, race khi tạo balance đầu tiên, dùng `Math.max(0, ...)` che tồn âm, tài khoản seed không giới hạn theo profile, và một endpoint channel tự đánh dấu đồng bộ thành công dù chưa gửi/đọc lại từ kênh.

Phase 01 đã chuẩn hóa những luồng được chọn trên một transaction boundary PostgreSQL: tạo sản phẩm, điều chỉnh tồn, giữ/bán, tạo/nhận phiếu nhập và tạo/xác nhận đơn. Tồn được khóa bằng `SELECT ... FOR UPDATE`, balance đầu tiên được tạo bằng `INSERT ... ON CONFLICT`, lệnh idempotent lưu fingerprint và response trong cùng transaction, còn ledger cùng outbox được ghi nguyên tử với thay đổi tồn. Ràng buộc database chặn số dư bất hợp lệ và bảo vệ lịch sử khỏi xóa dây chuyền.

Các capability không có bằng chứng thực thi đã được báo là unavailable. API reconcile listing hiện trả `503 CHANNEL_DELIVERY_UNAVAILABLE`; system status không còn báo marketplace, AI, simulator, SSE delivery hay báo cáo là sẵn sàng khi chúng chưa hoạt động.

**Kết quả:** `mvn verify` đạt 18/18 integration tests trên PostgreSQL 17 qua Testcontainers. Foundation thuộc Phase 01 được triển khai và kiểm chứng. Chưa xác minh migration trên bản sao database có dữ liệu triển khai thật; V2 phải được dry-run và đối chiếu dữ liệu trước rollout. Không chạy test trên repository Go và không sửa repository Go.

## B. Go vs Java Comparison

Source Go được đọc từ clone tạm của `origin/main` tại SHA nêu trên. Checkout Go có sẵn trong máy ở thời điểm audit cũ hơn remote main; không dùng checkout đó làm chuẩn. Repository Go gốc không bị thay đổi. Repository Go có 82 migration và implementation/test cho nhiều module hơn Java hiện tại; các chức năng dưới đây được mô tả theo code/doc, không suy ra trạng thái production.

| Thành phần | Go cũ — hiện trạng quan sát | Java baseline → hiện tại | Vấn đề và quyết định |
|---|---|---|---|
| Authentication | `auth/service.go:34-139` quản lý login/session; `auth/password.go:34-63` dùng Argon2id; ADR `docs/adr/0002-opaque-sessions-rbac.md` mô tả opaque session, cookie web, CSRF và bearer session riêng cho mobile. | `AuthController.java:31-47` dùng Spring session và đổi session ID sau login; `SecurityConfig.java:22-87` giữ CSRF, CORS và role checks. `DataInitializer` chỉ chạy profile `dev`; production không có tài khoản seed. | Giữ session cookie/CSRF phù hợp web. Mobile Java hiện dùng cùng session endpoint với web, chưa có opaque bearer token như ADR Go; chuyển sang mobile sau khi chốt contract native. |
| API contract | `platform/httpjson/httpjson.go:28-` chuẩn hóa JSON lỗi/status; Go công bố OpenAPI runtime theo SRS. | `GlobalExceptionHandler.java:23-` và `JsonSecurityErrorHandler.java:20-` trả `{error:{code,message,request_id}}`; validation, JSON lỗi, 409 integrity/concurrency và 422 business error có mã ổn định. Header idempotency được mô tả ở các controller. | Giữ envelope đang có, bổ sung lỗi bảo mật JSON và ngăn stack trace đi ra response. Đổi contract có chủ ý: product mới phải tồn 0; reconcile chưa có connector trả 503 thay vì thành công giả. |
| Transaction | `inventory/adjust.go:103-` và các service receiving/order/reservation claim command, ghi state, audit, outbox và response trước commit trong cùng pgx transaction. | `@Transactional` ở service; `IdempotencyService.execute` dùng `MANDATORY`; `InventoryMovementRecorder.record` cũng dùng `MANDATORY`. | Không gọi connector trong transaction. Business mutation, ledger, outbox và replay response cùng commit/rollback. |
| Idempotency | Go dùng inventory command + fingerprint + response; product create `products/create.go:106-` lưu zero balances và replay response trong một transaction. | `IdempotencyService.java:49-` phạm vi principal + operation, hash SHA-256 canonical request, khóa/claim PostgreSQL, replay response hoặc trả conflict; TTL 24h và worker dọn completed record hết hạn. Áp dụng cho product create, adjust, reserve/sell, order/payment, receipt create/receive. | Không coi filter đọc header là đủ. Cùng key khác payload bị 409; cùng key đồng thời chỉ có một tác động. Record `PROCESSING` cùng transaction nên lỗi command rollback cả claim. |
| Database migration | Go dùng goose, 82 migration trong `apps/api/db/migrations/`, bao gồm command/outbox/movement history; `00017_sync_outbox.sql` và `00077_inventory_movement_history.sql` là mốc liên quan. | Java baseline có Flyway V1; không sửa V1. V2 thêm idempotency, metadata outbox và snapshot ledger; V3 đổi FK ledger/reservation sang `RESTRICT`. Hibernate chạy `validate`, `baseline-on-migrate=false`. | Thay đổi schema chỉ bằng migration mới. PostgreSQL sạch đã chạy đủ ba migration và JPA validate. Chưa chạy upgrade trên snapshot dữ liệu triển khai thật. |
| Error handling | `httpjson.WriteError` cung cấp chung format lỗi ở tầng platform. | `GlobalExceptionHandler` xử lý validation, business/API, optimistic lock, integrity và unexpected error; security entry point/access denied có JSON handler riêng. | 400 cho input, 409 cho conflict/integrity, 422 cho business rule, 503 khi delivery channel chưa có. Nội bộ ghi request ID; response không chứa exception detail. |
| Concurrency control | `reservations/service.go:171-` quy định khóa balance trước reservation; `docs/specs/inventory-concurrency.md:66` yêu cầu lock balance theo thứ tự variant ID và có test PostgreSQL contention. | `InventoryBalanceRepository` dùng pessimistic write; adjustment/receiving tạo balance theo insert-on-conflict rồi khóa. Order khóa SKU/variant theo thứ tự ổn định; reservation confirm/release/expiry khóa balance trước hold. `InventoryBalance.@Version` giữ version. | Kế thừa lock order đã được tài liệu/test Go xác lập; không dùng `Math.max` để che lỗi. Database `CHECK` và service validate cùng bảo vệ ATS. |
| Audit & logging | Go ghi inventory adjustment, actor, request key, before/after và outbox; test concurrency kiểm tra rollback/audit. | `InventoryMovementRecorder.java:42-` ghi before/after, ATS, safety buffer, actor và correlation ID; `RequestIdFilter`, `LoggingFilter` và Logstash JSON tạo dấu vết kỹ thuật. | Ledger tồn là business audit cho các writer tồn đã chọn; log kỹ thuật không thay ledger. Lịch sử thay đổi catalog/order rộng hơn chưa được triển khai. |
| Outbox foundation | `platform/outbox/outbox.go:106-` ghi qua transaction handle; `syncing/dispatcher.go:257-326` claim/deliver/retry; SRS `FR-CH-03` yêu cầu ghi cùng transaction. | `OutboxEvent` có event ID, aggregate/version, correlation, payload, retry/lease/published metadata; inventory/order-create ghi cùng transaction. Không có Java dispatcher và SSE controller chỉ gửi heartbeat. | Foundation ghi bền và nguyên tử; không gửi kênh giả. Dispatcher, retry worker, SSE recovery và connector để Phase 04+. |
| Domain modules | Go có module riêng `auth`, `products`, `inventory`, `receiving`, `reservations`, `orders`, `channels`, `syncing`, `publications`, cộng adapter Shopify/WooCommerce/eBay. Connector phụ thuộc cấu hình/quyền; SRS phân biệt khả năng đã có với khả năng có điều kiện. | Java hiện có package theo tầng; Products, inventory, receiving, reservation và order là luồng đơn-store; channel chủ yếu đọc config/listing, không có connector thật. | Giữ modular monolith và package hiện tại; không chuyển Go wholesale, không tách microservice. Chỉ mở rộng connector khi có contract/credential và xác minh read-back. |

### Trạng thái module Java tại baseline

- **Auth:** login/session, role và logout đã có; chưa có rate-limit Java cho login, mobile login chưa tách bearer session.
- **Products:** CRUD khung có; baseline tạo `PUBLISHED`, cho tồn khởi tạo dương và ép tồn âm về 0 (`ProductServiceImpl.java:72-83`). Sửa thành draft/tồn 0 theo BR-02; product create có idempotency.
- **Inventory:** đọc/điều chỉnh/ledger có; baseline chưa khóa và idempotency thực cho mọi writer. Phase 01 thêm balance lock, row creation không race, snapshots và outbox.
- **Reservations:** reserve/confirm/release/expiry có; baseline lock/order chưa nhất quán. Phase 01 khóa balance trước reservation và xác minh trạng thái sau lock.
- **Receiving:** create/receive có; phase 01 giữ receive transaction và ghi audit/outbox khi lượng được chấp nhận.
- **Orders:** create/confirm payment/ship có; create/payment idempotent và multi-SKU inventory lock được sắp thứ tự. Ship/return và lịch sử trạng thái đầy đủ còn thuộc phase sau.
- **Channels/sync/publications:** không có adapter Java; baseline có reconcile giả (`ChannelServiceImpl.java:55-64`) và status tĩnh. Phase 01 chặn reconcile giả và báo delivery/SSE unavailable.

## C. Findings

Severity mô tả rủi ro ở Java baseline. Trạng thái “đã xử lý” là bằng chứng trong branch này, không đồng nghĩa đã triển khai lên production.

| Mức | Finding | Trạng thái / bằng chứng |
|---|---|---|
| Critical | FK ban đầu cho phép xóa dây chuyền inventory ledger/reservation khi xóa biến thể, làm mất lịch sử. | Đã xử lý: V3 đổi FK sang `RESTRICT`; service trả `PRODUCT_HAS_INVENTORY_HISTORY`; test thử cả service và FK PostgreSQL. |
| High | Header idempotency được đọc nhưng không ghi fingerprint/response, nên retry có thể tạo tác dụng phụ lần hai; race cùng key chưa được ngăn. | Đã xử lý bằng unique `(scope,key)`, claim atomic, payload hash, replay response và cùng transaction. Test retry đồng thời và cùng key/khác payload. |
| High | Lock reservation/balance và balance row đầu tiên chưa được bảo vệ đầy đủ; có thể mất cập nhật/oversell khi hai request cùng tranh lượng cuối hoặc tạo balance đồng thời. | Đã xử lý bằng pessimistic lock, insert-on-conflict và thứ tự balance → reservation. Test tranh đơn vị cuối, tạo balance đồng thời, confirm/release đồng thời. |
| High | `Math.max(0, initialStock)` che tồn âm; sản phẩm baseline tạo Published và nhận tồn vật lý ngay, trái BR-02. | Đã xử lý: product mới là DRAFT, balance bằng 0; `initialStock` âm hoặc dương đều bị validation từ chối. Đây là thay đổi API có chủ ý; dùng receipt/adjust để đưa hàng vào kho. |
| High | Reconcile listing giả đặt `SYNCED`/reported stock theo quota dù không có connector/read-back; system status còn báo một số capability chưa chạy là available. | Đã xử lý: route trả 503; status flags cho marketplace, AI, simulator, sync stream/delivery và reports phản ánh unavailable. Test xác nhận không đổi trạng thái listing và không báo kết nối. |
| High | Tài khoản seed và cấu hình DB mặc định không phân biệt production/development. | Đã xử lý: DB credentials bắt buộc ở profile mặc định; seed và local defaults chỉ trong `dev`; default profile test xác nhận không có user, `dev` test xác nhận sample ledger/outbox. |
| Medium | Java mobile login trả session cookie cùng contract web, trong khi ADR Go xác định opaque bearer session riêng; chưa có Java login rate-limit. | Còn mở; mobile auth/rate limiting được chuyển backlog vì không có mobile client/secret/storage contract trong phase này. |
| Medium | Legacy ledger không có snapshot `reserved_before`/safety buffer; V2 backfill `on_hand_before` từ `on_hand_after - delta`, `reserved_before` bằng `reserved_after`, safety snapshot cũ để null. Không thể tái tạo sự kiện cũ chưa từng ghi. | Còn giới hạn dữ liệu lịch sử. Từ khi recorder chạy, các movement mới có snapshot đầy đủ. Phải dry-run/đối chiếu trên bản sao database thực trước rollout; không tự tạo history giả. |
| Medium | Business audit hiện tập trung vào inventory movement; không có history tổng quát cho catalog, payment/order status. | Còn mở; chuyển các audit trail không làm đổi tồn sang phase nghiệp vụ order/catalog. |
| Low | Package theo tầng thay vì domain/module; hiện chưa có evidence về vòng phụ thuộc cần refactor lớn. | Giữ cấu trúc, tránh refactor thư mục chỉ để đồng bộ với Go. Theo dõi khi thêm connector/AI module. |

## D. Implementation Decisions

| What | Why | How | Impact | Priority |
|---|---|---|---|---|
| Chặn invariant tồn ở cả DB và service. | UI/service validation riêng không chặn SQL writer hoặc race. | Giữ `CHECK` của `inventory_balances`; pessimistic lock cho mutation; `Math.addExact`; insert balance bằng `ON CONFLICT DO NOTHING`, sau đó khóa; không clamp số âm. | Inventory, receiving, reservation, order, product. | P0 |
| Chuẩn hóa thứ tự khóa balance → reservation; khóa nhiều SKU theo thứ tự ổn định. | Go có tài liệu contention giải thích reservation-first tạo deadlock cycle. | Đọc variant ID không lock, khóa balance, rồi khóa reservation; expiry lấy projection candidate không khóa và xử lý theo `(variant_id,id)`. | Reservation worker và các transition liên quan. | P0 |
| Thêm idempotency dùng PostgreSQL, không dùng cache ngoài. | Cần atomicity/replay qua restart và hai request đồng thời. | Unique `(principal-hash + operation, key)`, SHA-256 canonical request, response JSON, PROCESSING/COMPLETED, TTL 24h; lệnh/record/replay cùng `@Transactional`. Thay thế Redis/Kafka vì chưa cần. | Product create, inventory adjust, reserve/sell, order/payment, receipt create/receive. | P0 |
| Tạo sản phẩm là draft/tồn 0 và dùng idempotency. | BR-02 và Go `products/create.go` xác định catalog không tạo stock vật lý. | Giữ `initialStock` để contract không mất field nhưng chỉ chấp nhận null/0; positive/negative trả 400; nhập sau bằng receipt hoặc adjustment có lý do. | API product create, frontend/API callers. | P0 |
| Ghi ledger/outbox trong transaction inventory. | Balance không được commit mà thiếu đối chiếu/sự kiện. | `InventoryMovementRecorder` ghi before/after/actor/reference/correlation và outbox payload có event UUID/version; recorder yêu cầu transaction đang tồn tại. | Inventory writer, order reserve/payment, receipt acceptance, reservation lifecycle và dev seed. | P0 |
| Chặn xóa history và giữ migration bất biến. | Cascade delete có thể xóa audit; migration V1 đã là baseline. | Migration V3 đổi FK ledger/reservation sang RESTRICT; service trả 409 có mã; V1/V2 không bị sửa. | Product delete và schema rollout. | P0 |
| Không trả sync success khi chưa có bằng chứng. | HTTP request gửi đi chưa chứng minh kênh đã nhận/đọc lại; Java chưa có adapter. | Reconcile trả 503; system status báo false cho delivery/connectivity/SSE/AI/simulator/report chưa hoạt động; giữ outbox recording true. | Channel API, system capability consumers. | P0 |
| Tách dev bootstrap khỏi production và chuẩn hóa lỗi/log. | Seed password/CORS cookie/db defaults production không an toàn; lỗi mặc định không đủ contract. | `DataInitializer @Profile("dev")`, transaction seed, env bắt buộc mặc định, Secure cookie mặc định, exact-origin CORS, JSON 401/403, `request_id`, structured Logstash JSON. | Startup, auth, observability, local development. | P0 |
| Giữ package theo tầng và monolith. | Không có lợi ích rõ ràng từ di chuyển nhiều file ngay; không cần microservice/Redis/Kafka. | Bổ sung service/repository/schema từng phần, đặt transaction ở service. | Toàn backend; hạn chế churn. | P1 |

## E. Changes Made

- **Migrations:** `apps/api/src/main/resources/db/migration/V2__idempotency_and_outbox_foundation.sql`, `V3__preserve_inventory_history_on_product_delete.sql`; không sửa V1.
- **Auth/config:** `config/SecurityConfig.java`, `CorsConfig.java`, `DataInitializer.java`, `JsonSecurityErrorHandler.java`, `controller/AuthController.java`, `application.yml`, `application-dev.yml`.
- **Idempotency:** `entity/IdempotencyRecord.java`, `repository/IdempotencyRecordRepository.java`, `service/IdempotencyService.java`, `scheduler/IdempotencyRetentionWorker.java`, `middleware/IdempotencyFilter.java`; controllers Product, Inventory, Order, Receipt, Reservation nhận header và ghi vào OpenAPI.
- **Inventory/transaction:** `entity/InventoryBalance.java`, `InventoryLedger.java`, `OutboxEvent.java`; repositories InventoryBalance, InventoryLedger, Order, OutboxEvent, ProductVariant, Receipt, Reservation; `service/InventoryMovementRecorder.java`; services Inventory, Order, Product, Receipt, Reservation.
- **API/contracts:** request DTO `CreateOrderRequest`, `CreateProductRequest`, `CreateReceiptRequest`, `InventoryAdjustRequest`, `ReceiveItemsRequest`, `ReserveStockRequest`; `GlobalExceptionHandler`, `ErrorCode`; `ChannelServiceImpl`, `ChannelController`, `SystemController`; `ProductMapper`, `ProductService`, `OrderService`, `ReceiptService`.
- **Tests:** `apps/api/src/test/java/com/octoflow/api/FoundationPostgresIntegrationTest.java`, `DevelopmentSeedIntegrationTest.java`.
- **Handover/local setup:** `README.md`, tài liệu này.

## F. Verification

| Kiểm tra | Kết quả |
|---|---|
| `mvn -q -f apps/api/pom.xml verify` (Maven 3.9.9, Java 21) | Exit 0. Foundation: 17/17; dev seed: 1/1; tổng 18/18, không failure/error/skip. |
| Flyway từ PostgreSQL trống | V1, V2, V3 áp dụng thành công; Hibernate `ddl-auto=validate` khởi động thành công trên PostgreSQL 17. |
| Concurrency/idempotency | Cùng key đồng thời chỉ tạo một movement; cùng payload replay; khác payload conflict; tranh unit cuối chỉ một reservation; cạnh tranh tạo balance ban đầu giữ đủ hai movement; confirm/release cùng reservation chỉ commit một transition. |
| Rollback/outbox | Lỗi ở order nhiều dòng rollback order, reserve, ledger, outbox; receipt retry không nhận hàng hai lần; product initial stock validation và ledger retention được kiểm tra. |
| Auth/API/sync | Staff bị từ chối inventory admin route với JSON 403; validation envelope ổn định; reconcile trả 503 và không đổi listing; system flags báo unavailable. |
| Seed profiles | Default profile không tạo user seed; `dev` profile tạo sample users/catalog và hai opening ledger + outbox event trong transaction. |
| `git diff --check` | Không có whitespace error; Git chỉ cảnh báo line ending LF→CRLF trên working tree Windows. |
| Go repository | Chỉ đọc clone `origin/main`; không chạy Go test suite và không sửa repo Go. |

**Chưa thể xác minh:** migration upgrade trên snapshot database triển khai thật, login/logout qua trình duyệt thật, thời hạn session trên reverse proxy, hoặc kết nối/read-back thật từ marketplace. Không có credential môi trường nên không giả lập xác nhận các phần đó.

## G. Deferred Work

| Ưu tiên | Công việc | Lý do / phụ thuộc |
|---|---|---|
| P0 trước rollout | Dry-run V2/V3 trên bản sao PostgreSQL đích, kiểm tra số dòng ledger hiện có và đối chiếu tồn/ledger trước khi apply. | V2 phải suy ra snapshot cũ từ trường V1; không thể phục hồi sự kiện quá khứ chưa từng ghi. |
| P1 — Phase 02/03 | Hoàn thiện order lifecycle/return, catalog change audit, lịch sử payment/order status và test auth login/session/logout/rate-limit. | Là nghiệp vụ ngoài luồng inventory core đã khóa trong Phase 01. |
| P1 — Phase 04 | Outbox dispatcher với `SKIP LOCKED`, retry/backoff/dead-letter, consumer idempotency, SSE replay/recovery. | Phase 01 chỉ lưu sự kiện atomically; Java hiện không deliver outbox. |
| P1 — Phase 04+ | Connector Shopify/WooCommerce/eBay, verify webhook signature riêng, read-back trước khi đánh dấu synced; bỏ 503 reconcile khi có connector có bằng chứng. | Cần credential/scope/webhook secret của môi trường và contract xác minh. |
| P1 — Mobile | Chốt auth contract riêng cho Capacitor (opaque bearer/session, secure storage, logout/revocation). | Java `/auth/mobile/login` hiện cùng servlet-session contract với web; Go ADR khác. |
| P2 — kiến trúc | Tách dần theo domain khi module/channel/AI tăng và có dependency thực tế; không chuyển toàn bộ module Go. | Package hiện tại còn nhỏ; refactor lớn chưa có lợi ích chứng minh. |
| P2 — triển khai | Thêm kiểm thử PostgreSQL cho upgrade dữ liệu đại diện, stress lặp concurrency trong CI và contract test với frontend. | Phase 01 dùng Testcontainers sạch; chưa có DB snapshot/frontend test harness trong phạm vi này. |
