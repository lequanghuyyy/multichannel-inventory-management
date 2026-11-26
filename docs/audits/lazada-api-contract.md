# LZ-0 — Lazada API contract audit

**Ngày kiểm tra:** 2026-11-24
**Phạm vi:** audit baseline LZ-0 và cập nhật triển khai LZ-1 đến 2026-11-24.
**Trạng thái hiện tại:** LZ-0 hoàn tất; LZ-1 đã triển khai một phần, chưa có live evidence.

## 1. Kết luận nhanh

- LZ-0 đã khóa contract; các nhận xét “backend chưa có” trong phần baseline bên dưới mô tả đúng trạng thái tại thời điểm LZ-0, không phải trạng thái hiện tại.
- LZ-1 bổ sung OAuth/status/verify/disconnect, mã hóa token AES-GCM, state một lần, migration V13 và test mock; chưa làm catalog, mapping, inventory, publication hay orders.
- Backend hiện có các endpoint OAuth/vòng đời kết nối nêu tại §13. Export OpenAPI chưa được cập nhật vì môi trường hiện không có Docker hoặc PostgreSQL local.
- Test unit/backend compile và frontend Lazada có kết quả như §13; integration test bị chặn trước khi chạy test methods vì Testcontainers không tìm thấy Docker.
- **Chưa có live evidence**: `.env` vẫn không có Lazada credentials; không gọi Lazada thật và không tuyên bố kết nối seller thật.

> §§2–12 giữ nguyên snapshot và kết luận của LZ-0; dùng §13 để biết trạng thái LZ-1 hiện tại.

## 2. Nguồn đã đối chiếu

Frontend:

- `apps/seller/src/api/lazada.ts`
- `apps/seller/src/api/channel-operations.ts`
- `apps/seller/src/features/channels/ChannelsPage.tsx`
- `apps/seller/src/features/channels/ChannelDetailPage.tsx`
- `apps/seller/src/features/channels/components/LazadaPanel.tsx`
- `apps/seller/src/features/channels/components/LazadaCategoryPanel.tsx`
- `apps/seller/src/features/channels/components/LazadaProductPreflightPanel.tsx`
- `apps/seller/src/features/channels/components/LazadaPublicationPanel.tsx`
- `apps/seller/src/features/channels/components/LazadaOrdersPanel.tsx`
- `apps/seller/src/features/channels/components/lazada-publish.messages.ts`
- `apps/seller/src/features/channels/components/ChannelProductPublishingWizard.tsx`
- `apps/seller/src/features/channels/components/ChannelProductsWorkspace.tsx`
- `apps/seller/src/features/channels/components/ChannelOperations.tsx`
- `apps/seller/src/api/client.ts`, `apps/seller/src/core/api-error.ts`

Backend và tài liệu hiện có:

- `apps/api/src/main/java/com/octoflow/api/controller/ChannelController.java`
- `apps/api/src/main/java/com/octoflow/api/controller/WooCommerceChannelController.java`
- `apps/api/src/main/java/com/octoflow/api/service/WooCommerceChannelService.java`
- `apps/api/src/main/java/com/octoflow/api/adapter/WooCommerceApiClient.java`
- `apps/api/src/main/java/com/octoflow/api/adapter/WooCommerceChannelAdapter.java`
- `apps/api/src/main/java/com/octoflow/api/adapter/ChannelAdapterRouter.java`
- `apps/api/src/main/java/com/octoflow/api/service/WooCommerceConnectionRecorder.java`
- `apps/api/src/main/java/com/octoflow/api/service/ChannelMappingRecorder.java`
- `apps/api/src/main/java/com/octoflow/api/service/WooCommerceOrderTransaction.java`
- `apps/api/src/main/java/com/octoflow/api/entity/Channel.java`
- `apps/api/src/main/java/com/octoflow/api/entity/ChannelListing.java`
- `apps/api/src/main/java/com/octoflow/api/entity/Order.java`
- `apps/api/src/main/java/com/octoflow/api/exception/ErrorCode.java`
- `apps/api/src/main/java/com/octoflow/api/exception/ErrorResponse.java`
- `apps/api/src/main/java/com/octoflow/api/config/SecurityConfig.java`
- `apps/api/src/main/resources/application.yml`
- `apps/api/src/main/resources/application-dev.yml`
- `apps/api/src/main/resources/db/migration/`
- `apps/api/openapi.json`
- `apps/seller/src/api/generated/openapi.server.ts`
- `docs/audits/phase-07-task-02-woocommerce-orders.md`

## 3. Contract Lazada phía frontend

Quyền dự kiến theo quy ước phase: các GET đọc là `ADMIN/STAFF`; POST/PUT thao tác, cấu hình, verify, import, prepare, preflight, publish/retry là `ADMIN` và cần CSRF. OAuth callback là ngoại lệ `permitAll` có state một lần. Quyền này chưa được thực thi trong backend Lazada vì chưa có controller.

| # | Method + path | Quyền dự kiến | Request từ frontend | Response frontend đọc | Nguồn/caller |
|---|---|---|---|---|---|
| 1 | `GET /api/v1/integrations/lazada/status` | ADMIN/STAFF | Không có | `LazadaStatus`: `enabled`, `configured`, `country`, `write_enabled`, `product_write_enabled`, `inventory_write_enabled`, `order_write_enabled`; `connection` nullable với `channel_id`, `seller_id`, `country`, `status` (`connected/disconnected/reauthorization_required/error`), `access_token_expires_at`, `refresh_token_expires_at`, `last_verified_at`, `last_error_code`, `last_order_poll_at`, `order_poll_error`, `capabilities` (`products_read`, `orders_read`, `products_write`, `inventory_write`). Không có token. | `lazada.ts:4-16,101`; `ChannelsPage.tsx:60-69`; `LazadaPanel.tsx:20-25,40` |
| 2 | `POST /api/v1/integrations/lazada/connect` | ADMIN + CSRF | Không có body | `{ authorization_url: string }`; frontend chỉ nhận HTTPS `auth.lazada.com/oauth/authorize`. | `lazada.ts:102-107`; `ChannelsPage.tsx:88-93`; `LazadaPanel.tsx:33-38` |
| 3 | `GET /api/v1/integrations/lazada/callback` | `permitAll` + state | Redirect từ Lazada với `code`, `state`; không có lời gọi fetch trong frontend | Không có JSON contract; callback phải redirect về `/channels` kèm kết quả OAuth và `channel_id`, không đưa code/token vào URL. | OAuth return được đọc tại `ChannelsPage.tsx:42-43,80-86` |
| 4 | `POST /api/v1/channels/{channelId}/lazada/verify` | ADMIN + CSRF | Không có body | `{ status: string }` | `lazada.ts:108`; thao tác UI `LazadaPanel.tsx:33-42` |
| 5 | `POST /api/v1/channels/{channelId}/lazada/disconnect` | ADMIN + CSRF | Không có body | `{ status: string }` | `lazada.ts:109`; thao tác UI `LazadaPanel.tsx:33-42` |
| 6 | `GET /api/v1/channels/{channelId}/lazada/products?offset={n}&limit=50` | ADMIN/STAFF | `offset`, `limit=50` (mặc định) | `{ data: { products?: LazadaProduct[], total_products?: number }, offset, limit, source: "lazada_live" }`; product gồm `item_id`, `status`, `attributes.name`, `skus`; SKU có `SkuId`, `SellerSku`, `Status`, `price`, `quantity`, `Available`, `sellableQuantity`. | `lazada.ts:17-19,110`; `LazadaPanel.tsx:27-30,80-104` |
| 7 | `GET /api/v1/channels/{channelId}/lazada/categories` | ADMIN/STAFF | Không có | `{ data: LazadaCategory[], source: "lazada_live" }`; category có `category_id`, `name`, `leaf`, `children?`. | `lazada.ts:20,111`; `LazadaCategoryPanel.tsx:80-92` |
| 8 | `GET /api/v1/channels/{channelId}/lazada/categories/{categoryId}/attributes` | ADMIN/STAFF | `categoryId` trên path | `{ data: LazadaCategoryAttribute[], source: "lazada_live" }`; attributes có `name`, `label?`, `input_type`, `attribute_type`, `is_mandatory`, `is_sale_prop?`, `options?`. | `lazada.ts:21,112`; `LazadaCategoryPanel.tsx:94-118,129-148` |
| 9 | `GET /api/v1/channels/{channelId}/lazada/products/{productId}/category-suggestions` | ADMIN/STAFF | `productId` trên path | `{ data: { categorySuggestions?: [{ categoryId, categoryName?, categoryPath? }] }, source: "lazada_live" }` | `lazada.ts:113`; không thấy caller trong các component Lazada đã đối chiếu |
| 10 | `GET /api/v1/channels/{channelId}/lazada/brands?start_row={n}` | ADMIN/STAFF | `start_row` | `{ data: LazadaBrand[] \| { module?, brands?, brand_list?, total_record? }, source: "lazada_live" }`; brand có `brand_id`, `name`. | `lazada.ts:36,114`; `LazadaProductPreflightPanel.tsx:241-258` |
| 11 | `POST /api/v1/channels/{channelId}/lazada/mappings/preview` | ADMIN + CSRF | Không có body | `LazadaMappingReport`: fingerprint, products/skus/eligible/imported, `issues`, `candidates`. | `lazada.ts:22-23,140-142`; `LazadaPanel.tsx:44-52,107` |
| 12 | `POST /api/v1/channels/{channelId}/lazada/mappings/import` | ADMIN + CSRF | `{ fingerprint: string }` | `LazadaMappingReport` như preview. | `lazada.ts:143-149`; `LazadaPanel.tsx:44-52,107` |
| 13 | `GET /api/v1/channels/{channelId}/lazada/products/{productId}/specification` | ADMIN/STAFF | `productId` trên path | `LazadaSpecificationState`: `{ spec, core_version, stale, changed_fields? }`; spec có category/brand/attributes/version và danh sách SKU/package fields. | `lazada.ts:30-35,115`; `LazadaProductPreflightPanel.tsx:205-227` |
| 14 | `PUT /api/v1/channels/{channelId}/lazada/products/{productId}/specification` | ADMIN + CSRF | Toàn bộ `LazadaProductSpec` JSON | `LazadaSpecificationState` như trên. | `lazada.ts:116-122`; `LazadaProductPreflightPanel.tsx:394-412,414-437` |
| 15 | `GET /api/v1/channels/{channelId}/lazada/products/{productId}/images` | ADMIN/STAFF | `productId` trên path | `LazadaProductImageState`: readiness/counts, `items` với media identity/scope/status/url/error/attempt/verification và `issues`. | `lazada.ts:37-47,123`; `LazadaProductPreflightPanel.tsx:229-239,362-363` |
| 16 | `POST /api/v1/channels/{channelId}/lazada/products/{productId}/images/prepare` | ADMIN + CSRF | Không có body | `LazadaProductImageState` như trên. | `lazada.ts:124-130`; `LazadaProductPreflightPanel.tsx:440-453` |
| 17 | `POST /api/v1/channels/{channelId}/lazada/products/{productId}/preflight` | ADMIN + CSRF | Không có body | `LazadaProductPreflight`: product/version/category/SKU counts, readiness booleans, images/issues, optional prices/SKU details/publication state/remote item ID. | `lazada.ts:48-62,131-137`; `LazadaProductPreflightPanel.tsx:360-376,414-437` |
| 18 | `GET /api/v1/channels/{channelId}/lazada/products/{productId}/publication` | ADMIN/STAFF | `productId` trên path | `LazadaPublication`: publication state, remote item, mapping/price/QC, SKU rows, latest job/history, write flag và actions `can_create/can_retry/can_update`. | `lazada.ts:63-89,164-165`; `LazadaPublicationPanel.tsx:144-158` |
| 19 | `GET /api/v1/channels/{channelId}/lazada/products/{productId}/publication/history` | ADMIN/STAFF | `productId` trên path | `{ jobs: LazadaPublishJob[], events: LazadaPublishEvent[] }` | `lazada.ts:90,167-168`; `LazadaPublicationPanel.tsx:180-190,339-357` |
| 20 | `POST /api/v1/channels/{channelId}/lazada/products/{productId}/publish` | ADMIN + CSRF + `Idempotency-Key` | `{ operation?: "create" \| "update", expected_product_version?, expected_metadata_version? }` | `LazadaPublishResult`: `{ job, publication }`; UI xem đây là enqueue, không phải live. | `lazada.ts:170-178`; `LazadaProductPreflightPanel.tsx:371-377`; `LazadaPublicationPanel.tsx:192-204` |
| 21 | `POST /api/v1/channels/{channelId}/lazada/products/{productId}/publication/retry` | ADMIN + CSRF + `Idempotency-Key` | `{}` | `LazadaPublishResult` | `lazada.ts:180-184`; `LazadaPublicationPanel.tsx:192-204` |
| 22 | `GET /api/v1/channels/{channelId}/lazada/orders` | ADMIN/STAFF | Không có | `{ items: LazadaOrderReceipt[] }`; receipt chứa external/core order IDs, native/core status, ingestion status/error, last-seen time và items. | `lazada.ts:24-29,138`; `LazadaOrdersPanel.tsx:20-28,44-50` |
| 23 | `POST /api/v1/channels/{channelId}/lazada/orders/{orderId}/retry` | ADMIN + CSRF | `orderId` là external Lazada order ID | `{ status: string }` | `lazada.ts:139`; `LazadaOrdersPanel.tsx:38-42` |

### 3.1 Generic endpoints được Channel UI cần

| # | Method + path | Quyền dự kiến | Request từ frontend | Response frontend đọc | Nguồn/caller |
|---|---|---|---|---|---|
| 24 | `GET /api/v1/channels/{channelId}/products` | ADMIN/STAFF | `state`, `q`, `limit`, `cursor` | `ChannelProductPage`: `products`, `next_cursor?`, `total_count`, `limit`, `state?`; product có state/mapping/sync status, phiên bản, số listing và `actions`. | `channel-operations.ts:6-18,83-85`; `ChannelProductsWorkspace.tsx:44-66`; `ChannelProductPublishingWizard.tsx:134-155`; `LazadaInventoryPanel.tsx:17-41` |
| 25 | `GET /api/v1/channels/{channelId}/products/{productId}/inventory` | ADMIN/STAFF | `productId` trên path | `{ items: ProductInventoryRow[] }`; gồm mapping, balance, quota/preview/version, evidence/job state và `write_enabled`/`ready`. | `channel-operations.ts:49-65,67-72`; `LazadaInventoryPanel.tsx:17-55` |
| 26 | `GET /api/v1/channels/{channelId}/settings` | ADMIN/STAFF | Không có | `ChannelSettings`: channel, currency, connection state, scopes, connector identity, capability matrix, mapping count, last verified time. | `channel-operations.ts:37-41,103-105`; `ChannelOperations.tsx:285-299`; `ChannelDetailPage.tsx:304-316` |
| 27 | `GET /api/v1/channels/{channelId}/activity` | ADMIN/STAFF | `domain`, `state`, `q`, `limit`, `cursor` | `{ activities, next_cursor?, limit }`; activity có operation/source/state, IDs, error, retryability và evidence. | `channel-operations.ts:30-36,95-97`; `ChannelOperations.tsx:264-276` |
| 28 | `GET /api/v1/channels/{channelId}/activity/{activityId}` | ADMIN/STAFF | `activityId` trên path | Một `ChannelActivity` cùng evidence; phải 404 nếu activity không thuộc channel. | `channel-operations.ts:99-101`; `ChannelOperations.tsx:278-283` |
| 29 | `GET /api/v1/channels/{channelId}/orders/ingestion` | ADMIN/STAFF | `state`, `limit`, `cursor` | `OrderIngestionPage`: summary counts, receipts, cursor/limit/state. | `channel-operations.ts:19-28,87-89`; `ChannelOperations.tsx:242-260`; hiện Lazada detail dùng `GET /lazada/orders` thay vì generic ingestion (`ChannelDetailPage.tsx:296-300`) |
| 30 | `POST /api/v1/channels/{channelId}/orders/poll` | ADMIN + CSRF + `Idempotency-Key` | Không có body | `OrderPollJob`: job/channel/connector/status, attempts/counts/error, repeated và timestamps. | `channel-operations.ts:29,91-93`; `LazadaOrdersPanel.tsx:30-36`; `ChannelOperations.tsx:251-254` |
| 31 | `POST /api/v1/channels/{channelId}/inventory/{listingId}/reconcile` | ADMIN + CSRF | Không có body; helper chuyển path IDs sang number | `InventoryReconciliation`: id/channel/listing/variant/canonical SKU/state/action/verification, Core/remote quantities, version, attempts/error/retryability/timestamps. | `channel-operations.ts:43-47,107-109`; `ProductInventorySync.tsx:201,228`; `InventoryChannelEvidence.tsx:128` |
| 32 | `POST /api/v1/channels/{channelId}/inventory/{listingId}/resync` | ADMIN + CSRF + `Idempotency-Key` | Body rỗng; header preview quantity/version tùy chọn | `InventoryResyncReceipt`: id/event/job/channel/listing/variant/core version/status/repeated/requested_at. | `channel-operations.ts:48,111-122`; `ProductInventorySync.tsx:240`; `InventoryChannelEvidence.tsx:142` |

### 3.2 Cách frontend xử lý lỗi và điểm lệch cần giải quyết

- `lazada.ts` parse mọi response lỗi thành `ApiRequestError` với HTTP status, error code, message và request ID (`lazada.ts:93-99`; `core/api-error.ts:18-48,50-74`). UI phần lớn đổi lỗi thành thông báo chung; một số luồng preflight/publication map code qua `lazada-publish.messages.ts`.
- Không có nhánh frontend tổng quát dựa trên HTTP status cụ thể cho các endpoint Lazada. Vì vậy backend phải trả đúng error envelope `{ error: { code, message, request_id } }`; status `400/401/403/409/501/502/503/504` chưa có xử lý riêng nhất quán ở UI.
- **OAuth callback mismatch:** prompt LZ-1 yêu cầu redirect `lazada_oauth=success`, nhưng `ChannelsPage.tsx:142` chỉ coi `lazada_oauth=connected` là thành công; giá trị `success` hiện bị hiển thị thành lỗi. UI xóa cả `lazada_oauth` và `channel_id`, refresh channel list, không đọc `channel_id` trực tiếp (`:80-86`). Cần chốt trước LZ-1: giữ contract UI (`connected`) hay cho phép sửa UI để nhận `success`.
- **Category suggestion mismatch:** `lazada.ts:113` khai báo GET suggestions nhưng không thấy caller trong các component đã đọc. Trong khi đó `LazadaCategoryPanel.tsx:19-23,65-73` tự xếp hạng cây category theo tên/category Core và hiển thị dưới nhãn “Gợi ý ngành hàng phù hợp”; đây là gợi ý cục bộ, không phải response Lazada. Cần ghi rõ trong UI đó là gợi ý OctoFlow, hoặc quyết định bỏ/đổi nhãn nếu yêu cầu “không sinh gợi ý” áp dụng cho frontend.
- **Inventory display:** `LazadaPanel.tsx:104` hiển thị `sellableQuantity ?? Available ?? quantity`; đây chỉ là UI display fallback. Adapter Lazada ở LZ-4 vẫn phải tuân thủ yêu cầu fail-closed: thiếu field tồn bán được thì protocol error, không dùng `quantity` để xác minh.
- `ChannelProductPublishingWizard.tsx:113-127,223-228` loại Lazada khỏi danh sách workflow đa kênh; Lazada hiện dùng luồng đăng riêng tại `:515-537,610-623`. Không nên coi workflow generic hiện tại là hỗ trợ publish Lazada.
- Các generic routes được prompt yêu cầu không đồng nghĩa tất cả đang được gọi trực tiếp từ tab Lazada: products/settings/activity và inventory helper có caller; generic order-ingestion hiện không được `ChannelDetailPage` dùng cho Lazada; reconcile/resync được dùng trong các luồng inventory dùng chung. Không được bỏ endpoint bắt buộc khỏi phạm vi phase chỉ vì UI hiện tại chọn component khác.
- `ChannelProductPreflightPanel` dùng các issue code từ `lazada-publish.messages.ts`; API có thể trả nhiều code chưa được map riêng, khi đó UI dùng thông báo fallback (`lazada-publish.messages.ts:133-136`).

## 4. Đối chiếu backend Java và OpenAPI tại thời điểm audit

### 4.1 Endpoint đã có

`ChannelController.java:18-94` có:

- `GET /api/v1/channels`
- `GET /api/v1/channels/{channelId}`
- `GET /api/v1/channels/{channelId}/mappings`
- `POST /api/v1/channels/{channelId}/mappings`
- `POST /api/v1/channels/{channelId}/mappings/{listingId}/verify`
- `GET /api/v1/channels/{channelId}/mappings/{listingId}/sync-status`
- `POST /api/v1/channels/{channelId}/inventory/{listingId}/reconcile`

`WooCommerceChannelController.java:17-59` có status/verify/disconnect riêng tại `/api/v1/channels/{channelId}/woocommerce/...`. Không có `/integrations/lazada`, callback hay `/lazada/*`.

### 4.2 Bảng generic gap và response lệch

| Endpoint | Backend Java | OpenAPI hiện tại | Kết luận |
|---|---|---|---|
| `GET /channels/{id}/products` | Không có | Không có | Thiếu |
| `GET /channels/{id}/products/{productId}/inventory` | Không có | Không có | Thiếu |
| `GET /channels/{id}/settings` | Không có | Không có | Thiếu |
| `GET /channels/{id}/activity` | Không có | Không có | Thiếu |
| `GET /channels/{id}/activity/{activityId}` | Không có | Không có | Thiếu |
| `GET /channels/{id}/orders/ingestion` | Không có | Không có | Thiếu |
| `POST /channels/{id}/orders/poll` | Không có | Không có | Thiếu |
| `POST /channels/{id}/inventory/{listingId}/reconcile` | Có | Có | Path/method khớp; response lệch |
| `POST /channels/{id}/inventory/{listingId}/resync` | Không có | Không có | Thiếu |
| Tất cả `/integrations/lazada/*`, `/channels/{id}/lazada/*` | Không có | Không có | Thiếu |

OpenAPI được kiểm tra trực tiếp từ `apps/api/openapi.json`; `apps/seller/src/api/generated/openapi.server.ts:521` hiện chỉ có operation cho reconcile trong nhóm này. OpenAPI hiện cũng không khai báo các error response Lazada.

**Lệch reconcile:** controller trả `ChannelSyncEvidenceResponse` (`ChannelController.java:80-93`), không phải `InventoryReconciliation`. Response hiện có `listing_id`, `job_id`, `plan_id`, `plan_item_id`, `kind`, `adapter`, `status`, các quantity/evidence và timestamps (`ChannelSyncEvidenceResponse.java:7-26`); thiếu `channel_id`, `variant_id`, `canonical_sku`, `state`, `action`, `verification_status`, `core_ats`, `expected_quantity`, `remote_quantity`, `core_version`, `attempt_count`, `retryable`, `started_at`, `completed_at`. LZ-4 phải trả superset để giữ caller/test cũ. Hiện `ChannelController.java:82-84` mô tả drift reconciliation có queue correction; LZ-4 cần bảo đảm Lazada drift không tự enqueue correction.

**Generated client:** `openapi.server.ts` chỉ có reconcile route; generic client calls cho products/settings/activity/orders/resync hiện chưa được mô tả trong schema type sinh từ OpenAPI.

## 5. Entity, dữ liệu và vị trí lưu đề xuất

### Dữ liệu sẵn có để tái sử dụng

- `channels.code` unique; `Channel.Status` chỉ gồm `CONNECTED`, `DISCONNECTED`, `ERROR` (`Channel.java:16-27,72-74`; V1 lines 113-121). Mapper serialize status dạng uppercase (`ChannelMapper.java:16-28`). Trạng thái OAuth chi tiết như `reauthorization_required` nên nằm ở bản ghi kết nối Lazada; không mở rộng/đổi ý nghĩa channel status cho connector khác nếu không cần.
- Channel có `connector_name`, `connector_version`, `connection_verified_at`, `connection_products_read`, metadata lỗi (`Channel.java:29-63`; migration V10). V11 thêm `connection_target_fingerprint`, hiện dùng để ràng buộc WooCommerce. Không lưu token vào các cột này.
- `channel_listings` là mapping chung: external listing ID, external SKU, external variant ID, trạng thái mapping, active, allocation quota và trạng thái tồn (`ChannelListing.java:24-75,85-91`; V1/V8). Có unique `(channel_id, variant_id)` và partial unique external identity trên channel (V1:123-135; V8:37-48). LZ-3 dùng entity này; mapping import phải tạo `UNVERIFIED`, không được tự verify.
- `sync_jobs` đã có lease, target, version, retry, adapter và idempotency reference; `channel_sync_evidence` đã có bản ghi quan sát/verify (`V8:163-253`). Đây là nền tảng LZ-4, nhưng việc dùng phải không làm thay đổi luồng simulator/WooCommerce.
- `Order` hiện có channel ID và external order ID; unique marketplace identity được bảo vệ ở DB (V4:62-76). `Order.Source` hiện gồm `POS, SHOPIFY, WOOCOMMERCE, EBAY, SIMULATOR`, chưa có `LAZADA` (`Order.java:53-55`).

### Bảng mới đề xuất theo phase

| Phase | Dữ liệu đề xuất | Ghi chú |
|---|---|---|
| LZ-1 | `lazada_connections` theo `channel_id` PK/FK unique; seller/country/status/capabilities, access/refresh token ciphertext, key ID, expiries, verify/error/poll metadata. `lazada_oauth_states` lưu hash state, user, redirect URI đã cấu hình, created/expiry/consumed. | Token AES-GCM; tuyệt đối không plaintext/log/response. OAuth state 1 lần, 10 phút. Không ghi đè mapping khi tạo/cập nhật Channel code `lazada`. |
| LZ-3 | `lazada_mapping_previews`: channel, fingerprint, JSON report, created/expiry/consumed/imported report. | Không cần bảng mapping mới; dùng ChannelListing. |
| LZ-5 | `lazada_product_specs`, `lazada_product_spec_skus`, `lazada_image_assets`. | Spec metadata theo channel+product; image table chỉ metadata/hash/URL Lazada, không lưu bytes ảnh nếu Core media storage có. |
| LZ-6 | `lazada_publications`, `lazada_publication_skus`, `lazada_publish_jobs`, append-only `lazada_publish_events`. | Durable state, request hash, idempotency key, lease/retry; event cũ không update/delete. |
| LZ-7 | `lazada_order_receipts`, `lazada_order_receipt_items`, `lazada_order_poll_jobs`, `lazada_order_poll_state`, append-only `lazada_order_events`; thêm `LAZADA` vào `Order.Source`. | Không lưu raw payload/PII; unique `(channel_id, external_order_id)` và một transaction cho order/stock/evidence. Giữ check constraint V4 (mọi source khác POS cần channel + external ID khi có channel). |
| LZ-8 | `channel_activities` append-only nếu không thể project đủ từ evidence/job/events có sẵn. | Cursor bền vững; không tạo activity giả cho WooCommerce/simulator. |

**Media gate:** backend Java hiện không có product media controller/entity; `SystemController.java:42` báo `product_media_available=false`. LZ-5 phải chọn đúng một phương án của prompt: mở rộng read-only Core media model có migration/test, hoặc dừng PARTIAL/BLOCKED và không tuyên bố publish-ready. Không dùng placeholder/URL ngoài.

## 6. Package/class đề xuất (chưa tạo code)

- `config/LazadaProperties`
- `controller/LazadaIntegrationController` (status/connect/callback), `controller/LazadaChannelController` hoặc controller theo phase
- `service/LazadaConnectionService`, `service/LazadaConnectionRecorder`, `service/LazadaOAuthStateService`
- `service/LazadaTokenProvider`, `service/LazadaTokenCipher`
- `adapter/LazadaApiClient`, `adapter/LazadaRequestSigner`
- `adapter/LazadaChannelAdapter`
- `service/LazadaCatalogService`, `service/LazadaMappingService`, `service/LazadaSpecificationService`, `service/LazadaPreflightService`
- `service/LazadaPublicationService`, `service/LazadaPublishWorker`, `service/LazadaProductPayloadBuilder`
- `service/LazadaOrderPollService`, `service/LazadaOrderWorker`, `service/LazadaOrderTransaction`
- DTO record theo endpoint/response; recorder/transaction persistence riêng, remote I/O ngoài transaction DB dài.

## 7. Migration

- Danh sách đã chạy: `V1` đến `V12`; file cuối là `V12__phase_07_woocommerce_order_ingestion.sql`.
- **Số kế tiếp quan sát được: V13.** Đây là dự kiến cho LZ-1 nếu không có migration nào được thêm trước lúc implement. Prompt ghi Phase 07 Task 03 có thể chiếm V13; phải chạy lại lệnh list migration theo Phụ lục B ngay trước khi tạo migration.
- Các phase có migration khác tiếp tục lấy số mới nhất + 1 tại thời điểm từng phase; không cố định trước số cho mọi phase.
- LZ-0 không tạo/sửa migration.

## 8. Câu hỏi mở cần quyết định

1. Có cho phép bất kỳ ghi dữ liệu production nào không? Mặc định an toàn theo prompt: cả product/inventory/order write flags đều `false`; chỉ bật từng flag với phê duyệt vận hành cụ thể.
2. Ai cấp và quản lý Lazada app key/secret, callback URI, AES-256-GCM key và rotation? Không có credential trong repo; không lưu các giá trị này vào audit.
3. Chỉ hỗ trợ gian hàng Lazada Việt Nam (`VN`) hay cần quốc gia khác? UI hiện đặt ngữ cảnh “Lazada VN”; cấu hình mặc định trong prompt là `VN`.
4. Tài khoản/app Lazada đã được duyệt cho Seller In-house APP và có quyền Product/Order API nào? Chưa có bằng chứng scopes/live access.
5. OAuth result: **đã giải quyết ở LZ-1** — callback dùng `lazada_oauth=success` theo prompt; frontend cũng chấp nhận giá trị cũ `connected`.
6. Gợi ý ngành hàng local trong `LazadaCategoryPanel` có được giữ nhưng ghi rõ là gợi ý OctoFlow không? Nó không thể được báo cáo như category suggestion do Lazada trả về.
7. LZ-5 có cho phép mở rộng scope để triển khai Core media read model tối thiểu không? Nếu không, phase phải dừng PARTIAL/BLOCKED theo prompt.
8. Trạng thái đơn Lazada nào được xem là paid/đủ điều kiện ingest phải chốt theo tài liệu Lazada hiện hành và tài khoản thực tế; status lạ/currency không phải VND phải quarantine.
9. Với capability/scopes không có trong token response, giữ `allowed_by_scope=false` và yêu cầu xác minh thủ công; không suy đoán scope.

## 9. Rủi ro bảo mật và dữ liệu

- Token/refresh token/app secret/state/code có thể lộ qua log, URL, exception hoặc trace nếu client không redacts; chỉ lưu token ciphertext, state hash, error code an toàn.
- OAuth callback phải kiểm state constant-time, single-use, hết hạn; chỉ redirect về frontend origin cấu hình, không nhận redirect target từ query.
- `SecurityConfig.java:47-83` dùng CSRF cookie/header `X-CSRF-Token` và mặc định mọi `/api/v1/**` cần ADMIN/STAFF. Callback cần một matcher `permitAll` rất cụ thể; mọi POST/PUT Lazada còn lại vẫn cần CSRF và quyền method-level.
- `ChannelAdapterRouter.java:10-17,19-77` hiện chỉ route simulator và WooCommerce; mọi connector khác fail-closed. Không thêm Lazada theo cách đổi thứ tự/behavior adapter hiện có.
- Reconcile hiện queue correction khi drift (mô tả ở `ChannelController.java:82-84`); nếu dùng generic path cho Lazada phải cô lập để drift chỉ ghi evidence/needs attention, không tự ghi tồn.
- V4 marketplace identity là `(channel_id, external_order_id)` và `Order.Source` chưa có Lazada. Migration enum/constraint phải có test bảo toàn POS/WooCommerce và không tạo order trùng/trừ tồn hai lần.
- Bằng chứng đơn WooCommerce trong `phase-07-task-02-woocommerce-orders.md` phụ thuộc `_reduced_stock`; prompt Lazada cấm sao chép quy tắc này. Không tái sử dụng giả định WooCommerce cho Lazada.
- Chưa có Java media model; preflight/upload ảnh không thể hoàn tất an toàn cho đến khi có bytes media Core thật.
- Mọi write cần idempotency key + request hash + job bền vững + lease/retry giới hạn + read-back độc lập. Timeout write là trạng thái chưa chắc chắn; không retry create mù.
- Không có live evidence, không có credential và chưa có môi trường/seller test được xác nhận.

## 10. Tiêu chí nghiệm thu LZ-1..LZ-9

| Phase | Tiêu chí nghiệm thu tối thiểu |
|---|---|
| LZ-1 — Connection/OAuth | Config disabled-by-default; status đúng shape; OAuth state hash, single-use/expiry; token AES-GCM; callback đổi token theo tài liệu chính thức; live read mới đánh dấu connected/read capability; verify lỗi không connected; disconnect idempotent và xóa token cục bộ; không lộ secret/token. Test OAuth/token cipher. Không tuyên bố live nếu không có response Lazada thật. |
| LZ-2 — Catalog | Đối chiếu tài liệu Lazada chính thức và ghi endpoint/params/signature/test vector; 5 GET có data live, pagination bounded, mapping field đúng; retry GET giới hạn; 401/403/429/5xx/timeout/protocol lỗi map safe; channel chưa verified không gọi API; category suggestions chỉ live hoặc 501, không bịa. |
| LZ-3 — Mapping | Preview bounded toàn catalog; exact SKU matching; phân loại duplicate/conflict/inactive/already-mapped; fingerprint canonical ổn định; import refetch/revalidate, lock, idempotent; listing mới UNVERIFIED, không auto-verify/allocation. |
| LZ-4 — Inventory | Lazada adapter chỉ đọc khi connection verified; SKU ID + SellerSku khớp; thiếu field sellable quantity là protocol error; write flag riêng mặc định off; request idempotent và engine read-back mới VERIFIED; reconcile trả superset response nhưng không auto-correct; resync chỉ enqueue job bền vững và bảo vệ preview/version. |
| LZ-5 — Spec/image/preflight | Spec default/save/version/fingerprint đúng; category/brand/attributes/package/SKU được live validate; image source là Core media thật, upload giới hạn + idempotent + read-back; preflight không write publication/inventory; nếu chưa có media thật thì PARTIAL/BLOCKED, không publish-ready. |
| LZ-6 — Publication | Publish/retry tạo job durable với key/hash; server preflight/version checks; worker lease/retry bounded; remote create timeout chuyển needs_reconciliation, không create mù lần nữa; SKU/price/QC/live đọc lại độc lập; chỉ `live` sau khi remote báo live; event append-only. |
| LZ-7 — Orders | Poll bounded theo cửa sổ/page, durable job/lease/key; receipts/items chuẩn hóa và PII tối thiểu; chỉ status được tài liệu cho phép mới ingest; mapping exact/verified; tạo order + stock movement + receipt trong một transaction; replay không trừ lần hai; cancel/return không tự restock; status/currency/mapping không rõ quarantine. |
| LZ-8 — Generic read models | Products/inventory/settings/activity/orders/poll/resync có đúng contract và quyền; cursor ổn định, limits bounded, dữ liệu từ DB/evidence chứ không bịa; reconcile response tương thích cũ; sync path frontend sửa đúng nếu còn lệch; export OpenAPI, regenerate client, `api:check` và frontend tests pass. |
| LZ-9 — Hardening/live acceptance | Security/migration/query/retry/PII review; runbook/observability; automated test suite pass; live checklist có evidence thực cho môi trường/seller/operation. Thiếu credential/quyền/seller test hoặc phê duyệt production thì kết luận BLOCKED/PARTIAL, không lấy mock làm live evidence. |

## 11. Bằng chứng phase LZ-0

- `git status --short --untracked-files=all` trước khi tạo audit: chỉ có `?? docs/prompts/lazada-connector-prompts.md` (file prompt do người dùng cung cấp).
- Migration được liệt kê trước khi audit: V1–V12; cuối danh sách `V12__phase_07_woocommerce_order_ingestion.sql`.
- Không chạy test backend: LZ-0 chỉ tạo audit, không sửa code/migration/OpenAPI/frontend.
- Live evidence: **chưa có**. Chưa có credential/API call thật; chưa kiểm tra tài liệu Lazada chính thức trong phase recon này.

## 12. Xác nhận

- LZ-0 chỉ tạo tài liệu audit; không sửa Java, SQL, OpenAPI hay frontend.
- Chưa tạo connector giả, chưa kết luận Lazada đã kết nối.
- Fail-closed, write flags mặc định false, token/evidence safety và yêu cầu live evidence được giữ nguyên cho các phase triển khai.

## 13. LZ-1 — Kết quả triển khai

**Trạng thái:** PARTIAL. Code LZ-1 và mock/unit tests đã được thêm, nhưng chưa thể chạy PostgreSQL/Testcontainers integration suite hoặc kiểm tra kết nối Lazada thật.

### Contract Lazada được đối chiếu

- OAuth seller authorization: `https://open.lazada.com/apps/doc/doc?docId=108260&nodeId=10777`; authorization host/path là `https://auth.lazada.com/oauth/authorize`, query gồm `response_type=code`, `force_auth=true`, `redirect_uri`, `client_id` (app key), và state một lần.
- Token exchange/refresh: `/auth/token/create` và `/auth/token/refresh` tại service root `https://auth.lazada.com/rest`; code hoặc refresh token được ký như tham số API.
- Ký request: `https://open.lazada.com/apps/doc/doc?docId=108068&nodeId=10450`. Sắp xếp tên tham số ASCII, loại `sign`, nối `api path + key + value` không có dấu phân cách, HMAC-SHA256 với app secret và xuất hex chữ hoa. Test vector tài liệu `/order/get`, secret `helloworld`, params `app_key=123456`, `access_token=test`, `order_id=1234`, `sign_method=sha256`, `timestamp=1517820392000` cho kết quả `4190D32361CFB9581350222F345CB77F3B19F0E31D162316848A2C1FFD5FAB4A`.
- Product verification read: `GET /products/get`, `filter=all`, `limit=1`, `offset=0`; tài liệu liệt kê `limit` tối đa 50 và `offset` đã deprecated cho paging sâu.
- Order verification read: `GET /orders/get`, `created_after` bắt buộc hoặc `update_after`, `created_before`, `sort_by=created_at`, `sort_direction=DESC`, `limit=1`, `offset=0`; tài liệu công bố limit tối đa 100.
- Khu vực API allowlist: `api.lazada.vn`, `.sg`, `.com.ph`, `.com.my`, `.co.th`, `.co.id` tương ứng VN/SG/PH/MY/TH/ID. Test chỉ được dùng loopback mock; các URL production khác bị từ chối.
- Chưa thấy revoke-token endpoint được tài liệu chính thức xác nhận trong lần kiểm tra này; disconnect xóa/clear token local và giữ channel. Không gọi endpoint revoke suy đoán.

### Thay đổi LZ-1

- Config `app.channels.lazada` disabled-by-default; credentials/key trống mặc định; product/inventory/order write flags độc lập và false mặc định.
- `GET /api/v1/integrations/lazada/status` trả đúng shape contract; `write_enabled` là OR của ba cờ config. Capability write trong connection luôn false vì LZ-1 chưa có thao tác ghi/read-back.
- OAuth state 256-bit lưu SHA-256, gắn user/redirect URI, hết hạn 10 phút, consume bằng conditional update; callback redirect chỉ tới frontend origin/path cấu hình, không trả code/token.
- Access/refresh token mã hóa AES-256-GCM với IV ngẫu nhiên và key ID; plaintext không được ghi vào DB, response hay log. Token refresh dùng conditional database lease.
- Chỉ product read thành công đánh dấu connection `connected`; order read permission/error giữ `orders_read=false` và trả warning. Expired refresh token được trình bày là `reauthorization_required`; disconnect local clear idempotent.
- Frontend chấp nhận `lazada_oauth=success` và legacy `connected`, dùng `channel_id` trả về để mở channel; Lazada settings cho phép verify sau OAuth khi token đã lưu nhưng chưa được live-verified.

### Files, migration và routes

- Config/security/errors: `apps/api/src/main/resources/application.yml`, `apps/api/src/main/resources/application-dev.yml`, `apps/api/src/main/java/com/octoflow/api/config/LazadaProperties.java`, `apps/api/src/main/java/com/octoflow/api/config/SecurityConfig.java`, `apps/api/src/main/java/com/octoflow/api/exception/ErrorCode.java`.
- Migration: `apps/api/src/main/resources/db/migration/V13__phase_08_lazada_connection.sql` — bảng `lazada_connections` và `lazada_oauth_states`; không sửa migration cũ.
- Backend: `apps/api/src/main/java/com/octoflow/api/adapter/LazadaApiException.java`, `apps/api/src/main/java/com/octoflow/api/adapter/LazadaOpenPlatformClient.java`, `apps/api/src/main/java/com/octoflow/api/adapter/LazadaRequestSigner.java`, `apps/api/src/main/java/com/octoflow/api/controller/LazadaIntegrationController.java`, `apps/api/src/main/java/com/octoflow/api/controller/LazadaChannelController.java`, `apps/api/src/main/java/com/octoflow/api/dto/response/LazadaAuthorizationResponse.java`, `apps/api/src/main/java/com/octoflow/api/dto/response/LazadaStatusResponse.java`, `apps/api/src/main/java/com/octoflow/api/dto/response/LazadaVerifyResponse.java`, `apps/api/src/main/java/com/octoflow/api/service/LazadaConnectionRecorder.java`, `apps/api/src/main/java/com/octoflow/api/service/LazadaConnectionService.java`, `apps/api/src/main/java/com/octoflow/api/service/LazadaOAuthStateRecorder.java`, `apps/api/src/main/java/com/octoflow/api/service/LazadaTokenCipher.java`, `apps/api/src/main/java/com/octoflow/api/service/LazadaTokenPayloadParser.java`, `apps/api/src/main/java/com/octoflow/api/service/LazadaTokenProvider.java`.
- Test: `apps/api/src/test/java/com/octoflow/api/Phase08LazadaConnectionIntegrationTest.java`, `apps/api/src/test/java/com/octoflow/api/support/LazadaMockServer.java`, `apps/api/src/test/java/com/octoflow/api/adapter/LazadaRequestSignerTest.java`, `apps/api/src/test/java/com/octoflow/api/config/LazadaPropertiesTest.java`, `apps/api/src/test/java/com/octoflow/api/service/LazadaTokenCipherTest.java`.
- Frontend: `apps/seller/src/api/lazada.ts`, `apps/seller/src/features/channels/ChannelsPage.tsx`, `apps/seller/src/features/channels/ChannelsPage.test.tsx`, `apps/seller/src/features/channels/components/LazadaPanel.tsx`, `apps/seller/src/features/channels/components/LazadaPanel.test.tsx`.
- Audit: `docs/audits/lazada-api-contract.md`. Local ignored config: `.env` (Lazada remains disabled; credentials/encryption key blank).
- Routes: `GET /api/v1/integrations/lazada/status` (ADMIN/STAFF); `POST /api/v1/integrations/lazada/connect` (ADMIN + CSRF); `GET /api/v1/integrations/lazada/callback` (permitAll, single-use state); `POST /api/v1/channels/{channelId}/lazada/verify` và `/disconnect` (ADMIN + CSRF).

### Test và bằng chứng

- `mvn -f apps/api/pom.xml -Dtest=LazadaPropertiesTest,LazadaRequestSignerTest,LazadaTokenCipherTest test` — PASS, 4 tests, 0 failures/errors.
- `mvn -f apps/api/pom.xml -DskipTests test` — PASS; main/test source compile thành công, test execution được skip.
- `mvn -f apps/api/pom.xml -Dtest=Phase08LazadaConnectionIntegrationTest test` — BLOCKED trước test methods: Testcontainers `Could not find a valid Docker environment`; máy cũng không có PostgreSQL local tại `127.0.0.1:5433`.
- `.\node_modules\.bin\vitest.cmd run --pool=threads --maxWorkers=1 src/features/channels/ChannelsPage.test.tsx src/features/channels/components/LazadaPanel.test.tsx` — PASS, 2 files / 18 tests.
- `npm run typecheck` — PASS. `npm run validate:contracts` — PASS. Toàn bộ Vitest suite đã timeout sau 240s; không có kết quả suite đầy đủ.
- `.\node_modules\.bin\vitest.cmd run --pool=threads --maxWorkers=1` — TIMEOUT sau 240s; không có kết quả suite đầy đủ. `npm run check:secrets` — PASS.
- `npm run api:check` chưa chạy: `apps/api/openapi.json` chưa được export từ server Java đang chạy; không sửa schema/client sinh tay.
- Live verification: **CHƯA CÓ**. Không có app key/secret, redirect/key cấu hình; mọi bằng chứng test là mock/unit, không đại diện kết nối Lazada thật.

### Rollback / việc còn lại

- Không có rollback tự động. Nếu migration đã áp dụng và cần rollback một môi trường sạch, có thể drop `lazada_oauth_states` rồi `lazada_connections`; nếu có bản ghi Lazada thì giữ dữ liệu và không rollback phá hủy.
- Chạy lại integration suite khi Docker/PostgreSQL khả dụng; export `apps/api/openapi.json` từ app chạy thật, regenerate client và `api:check`.
- Chỉ kết luận LZ-1 DONE sau khi có credentials/seller test được cấp phép, integration tests pass, và live read thực được lưu làm evidence. Không bắt đầu LZ-2 trong phần cập nhật này.
