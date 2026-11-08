# TECH STACK ARCHITECTURE SPECIFICATION
## Dự án: OctoFlow (Multi-channel Inventory Management System)

> Tài liệu đặc tả ngăn xếp công nghệ (Technology Stack) chuẩn hóa cho dự án **OctoFlow**, trong đó tầng **Backend được chuyển đổi sang Java (Spring Boot)**, kết hợp cùng toàn bộ kiến trúc Frontend, Mobile, AI/ML Microservices, Cơ sở dữ liệu và Tích hợp đa kênh kế thừa từ kiến trúc chuẩn của dự án `DATT-ai-driven-cross-platform`.

---

## 1. TỔNG QUAN KIẾN TRÚC TOÀN HỆ THỐNG

Hệ thống được thiết kế theo mô hình **Modular Monolith Core (Java Spring Boot) kết hợp Microservices Vệ tinh (Python AI)** và **Multi-channel Connectors**:

```text
┌────────────────────────────────────────────────────────────────────────────────┐
│                           CLIENT LAYER (CROSS-PLATFORM)                        │
│   Web Application (Desktop/Tablet)        Mobile Application (Android / iOS)   │
│   React 19 + TypeScript + Vite 7          Capacitor 8 Native WebView Shell     │
└──────────────────────────────────────┬─────────────────────────────────────────┘
                                       │ REST API (JSON) + SSE (/api/v1/sync/stream)
                                       ▼
┌────────────────────────────────────────────────────────────────────────────────┐
│                       BACKEND CORE (JAVA & SPRING BOOT 3)                      │
│                                                                                │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────┐ │
│  │   Auth & RBAC Module  │  │   Catalog & Pricing   │  │  Inventory Engine  │ │
│  │   Spring Security     │  │   Products, Variants  │  │  ATS, Reservation, │ │
│  │   Session / CSRF      │  │   CSV Import          │  │  Ledger, Locks     │ │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────┘ │
│  ┌───────────────────────┐  ┌───────────────────────┐  ┌────────────────────┐ │
│  │   Orders & POS Engine │  │ Multi-channel Router  │  │ Transaction Outbox │ │
│  │   State Transitions,  │  │ Allocation Engine,    │  │ Worker Scheduler,  │ │
│  │   Returns & Receipts  │  │ Drift Reconciler      │  │ SSE Event Stream   │ │
│  └───────────────────────┘  └───────────────────────┘  └────────────────────┘ │
│                                                                                │
│  ┌──────────────────────────────────────────────────────────────────────────┐ │
│  │  Integration Connectors (Spring RestClient / WebClient)                   │ │
│  │  - Shopify Admin API (REST/GraphQL + Webhooks HMAC)                      │ │
│  │  - WooCommerce REST API v3 (WordPress Dev Store)                         │ │
│  │  - eBay REST API (Fulfillment, Inventory, OAuth 2.0 RuName)              │ │
│  │  - Order Load / Livestream Traffic Simulator                             │ │
│  │  - AI Guardrail Enforcement (Bounds Checking, Read-Only Policy)          │ │
│  └──────────────────────────────────────────────────────────────────────────┘ │
└───────────────────────┬───────────────────────────────┬────────────────────────┘
                        │ JDBC / HikariCP               │ HTTP REST (FastAPI)
                        ▼                               ▼
┌─────────────────────────────────┐   ┌──────────────────────────────────────────┐
│   DATABASE LAYER (CENTRAL DB)   │   │     AI / ML MICROSERVICES (PYTHON)       │
│   PostgreSQL 17 (Relational)    │   │  FastAPI + Uvicorn (Port 8090 & 8091)    │
│   - Flyway Schema Migrations    │   │  - Demand Forecast (SES, TSB, LSTM)      │
│   - Row-level Pessimistic Lock  │   │  - Sync Health Monitor (Isolation Forest)│
│   - ACID Concurrency Control    │   │  - Dynamic Safety Buffer Advisor         │
└─────────────────────────────────┘   └──────────────────────────────────────────┘
```

---

## 2. CHI TIẾT TẦNG BACKEND (JAVA & SPRING BOOT)

### 2.1. Nền tảng cốt lõi (Core Runtime)
* **Ngôn ngữ:** **Java 21 LTS**
  * Tận dụng tính năng hiện đại: Virtual Threads (Project Loom) tối ưu hóa throughput I/O non-blocking, `record` classes cho DTO/Events, Pattern Matching, Sealed Classes.
* **Framework chính:** **Spring Boot 3.3.x / 3.4.x** (trên nền tảng **Spring Framework 6.x**).
* **Công cụ build:** **Gradle (Kotlin DSL / Groovy)** hoặc **Maven** (khuyến nghị Maven với wrapper `mvnw` hoặc Gradle wrapper `gradlew`).

### 2.2. Các Spring Starter & Thư viện bổ trợ

| Nhóm chức năng | Thư viện / Module | Mô tả vai trò kỹ thuật |
|---|---|---|
| **Web & RESTful API** | `spring-boot-starter-web` | Xử lý HTTP DispatcherServlet, Controller RESTful, serialization JSON qua Jackson JSR-310 (`java.time`). |
| **Hợp đồng API (OpenAPI)** | `springdoc-openapi-starter-webmvc-ui` | Tự động sinh đặc tả OpenAPI 3.0 tại `/api/v1/openapi.json` và giao diện Swagger UI để frontend sinh types. |
| **Realtime SSE** | `SseEmitter` (Spring WebMVC) | Xử lý Server-Sent Events tại endpoint `/api/v1/sync/stream`, duy trì kết nối pub/sub truyền tin tức thời tới client. |
| **Bảo mật & Phân quyền** | `spring-boot-starter-security` | - Xác thực phiên Session-based qua Cookie (`JSESSIONID`).<br>- Chống tấn công CSRF bằng `CookieCsrfTokenRepository.withHttpOnlyFalse()`.<br>- Phân quyền RBAC nghiêm ngặt: `ADMIN` và `STAFF` qua `@PreAuthorize` / SecurityFilterChain.<br>- Rate limiting bảo vệ đăng nhập qua **Bucket4j**. |
| **Truy cập dữ liệu & ORM** | `spring-boot-starter-data-jpa` (Hibernate 6) & `spring-boot-starter-jdbc` | - JPA/Hibernate cho mô hình thực thể ORM.<br>- `JdbcClient` / Native SQL cho các truy vấn báo cáo phức tạp.<br>- Hỗ trợ khóa bi quan **Pessimistic Locking** (`SELECT ... FOR UPDATE`) trên bảng tồn kho để loại bỏ race condition khi giữ hàng/bán hàng. |
| **Connection Pooling** | **HikariCP** (mặc định trong Spring Boot) | Quản lý connection pool tốc độ cao, cấu hình timeout và kích thước tối ưu kết nối DB. |
| **Database Migration** | **Flyway** (`flyway-core`, `flyway-database-postgresql`) | Quản lý vòng đời migration phiên bản SQL (thay thế Goose bên Go), đảm bảo DB schema nhất quán giữa dev và staging. |
| **Validation** | `spring-boot-starter-validation` | Kiểm tra ràng buộc dữ liệu đầu vào (JSR-380, Hibernate Validator): `@NotNull`, `@NotBlank`, `@Size`, `@Pattern`, `@Min`. |
| **HTTP Client ra kênh ngoài**| `RestClient` (Spring 6) / `WebClient` | Giao tiếp API ra bên ngoài: Shopify REST/GraphQL, WooCommerce REST, eBay APIs và gọi các service Python AI. |
| **Xử lý nền & Outbox** | `@EnableScheduling`, `@Async`, Spring Events | - Quét bảng `outbox` định kỳ để phát sự kiện đồng bộ.<br>- Worker xử lý tự động giải phóng Reservation hết hạn (`expire`).<br>- Retry cơ chế exponential backoff và Dead-letter queue khi sàn ngoài gặp sự cố. |
| **Giám sát & Vận hành** | `spring-boot-starter-actuator` | Cung cấp endpoint liveness/readiness (`/health/live`, `/health/ready`), đo lường metrics qua **Micrometer**. |
| **Kiểm thử (Testing)** | `spring-boot-starter-test`, **Testcontainers**, **WireMock** | - JUnit 5, Mockito, AssertJ cho Unit Tests.<br>- Testcontainers (PostgreSQL container) cho Integration Tests đảm bảo kiểm thử transaction thật.<br>- WireMock giả lập phản hồi của Shopify, WooCommerce và eBay. |

### 2.3. Quy chuẩn Mã nguồn Backend (Package Structure)
```text
com.octoflow.api/
├── config/                 # SecurityConfig, WebMvcConfig, OpenApiConfig, RestClientConfig
├── common/                 # BaseEntity, ApiResponse, ErrorEnvelope, IdempotencyFilter, RequestIdFilter
├── modules/
│   ├── auth/               # User, Session, AuthController, AuthService, UserRole
│   ├── products/           # Product, Variant, Media, CatalogService, CSVImporter
│   ├── pricing/            # ChannelPrice, PricingService, PricingController
│   ├── inventory/          # Balance, Ledger, Movement, InventoryService, LockManager
│   ├── reservations/       # Reservation, HoldService, ExpirationWorker
│   ├── receiving/          # Receipt, ReceiptItem, ReceivingService, AuditLog
│   ├── orders/             # Order, OrderItem, StateMachine, POSService, ReturnService
│   ├── channels/           # Channel, ListingMapping, ChannelRouter
│   ├── publications/       # PublicationState, PublicationWorker, SyncOrchestrator
│   ├── syncing/            # OutboxEvent, SyncJob, SyncDispatcher, SseHub, Reconciler
│   ├── shopify/            # ShopifyConnector, ShopifyWebhookHandler, GraphQLClient
│   ├── woocommerce/        # WooCommerceConnector, WebhookHandler, RestApiClient
│   ├── ebay/               # EbayConnector, OAuthHandler, TaxonomyService
│   ├── orderload/          # LoadGeneratorService, BurstSimulatorWorker
│   ├── ai/                 # AiGatewayClient, GuardrailService, SyncHealthAnalyzer
│   └── reports/            # ReportAggregationService, MetricsCalculator
└── Application.java
```

---

## 3. CHI TIẾT TẦNG FRONTEND & MOBILE (SELLER APP)

Toàn bộ ứng dụng giao diện được kế thừa từ `apps/seller` của `DATT-ai-driven-cross-platform`:

### 3.1. Web Application (Desktop & Tablet)
* **Ngôn ngữ:** **TypeScript ~5.9.3**
* **Runtime & Package Manager:** **Node.js >= 24**, **npm**
* **UI Library:** **React 19.2.0** + **React DOM 19.2.0**
* **Build Tool:** **Vite 7.3.1** (`@vitejs/plugin-react` 5.1.2) - Khởi động cực nhanh, Hot Module Replacement (HMR).
* **Styling & CSS:**
  * **Tailwind CSS v4** (`tailwindcss` 4.3.3, `@tailwindcss/vite` 4.3.3).
  * Tiện ích hợp nhất class: `clsx` (2.1.1), `tailwind-merge` (3.7.0).
  * Tông màu Material You hiện đại (Surface container, primary tint, status badges).
* **Quản lý hợp đồng API (Contract-driven API Client):**
  * `openapi-typescript` 7.13.0: Tự động dịch `/api/v1/openapi.json` từ Spring Boot thành TypeScript Types.
  * `openapi-fetch` 0.17.0: HTTP Client siêu nhẹ, type-safe 100% theo schema backend.
* **Kiểm thử giao diện:**
  * Unit/Component Test: **Vitest 4.1.12**, **@testing-library/react 16.3.3**, `jsdom 29.1.1`.
  * End-to-End Test (E2E): **Playwright 1.58.0** chạy tự động kịch bản POS, duyệt đơn, phân bổ tồn.

### 3.2. Mobile Application (Android / iOS)
* **Giải pháp di động:** **Capacitor 8.0.0** (`@capacitor/core`, `@capacitor/android`, `@capacitor/ios`, `@capacitor/app`).
* **Kiến trúc:** Đóng gói bản build SPA React vào Native WebView.
* **Lưu trữ bảo mật:** `@aparajita/capacitor-secure-storage` 8.0.1 để lưu session/token an toàn trên thiết bị.
* **Xác thực môi trường Mobile:** Endpoint `/api/v1/auth/mobile/login` trả token phiên thích hợp, hỗ trợ `capacitor://localhost`.

---

## 4. CHI TIẾT TẦNG AI & MACHINE LEARNING (PYTHON MICROSERVICES)

Toàn bộ logic huấn luyện, đánh giá và mô hình AI được kế thừa từ `apps/ai` và `ml-forecasting`:

### 4.1. Công nghệ AI Runtime
* **Ngôn ngữ:** **Python 3.11+**
* **API Framework:** **FastAPI >= 0.110**, chạy trên máy chủ ASGI **Uvicorn >= 0.29**.
* **Thư viện Khoa học dữ liệu & ML:**
  * Xử lý dữ liệu: `numpy >= 2.0`, `pandas >= 2.2`.
  * Học máy truyền thống: `scikit-learn >= 1.5`, `scipy >= 1.13`, `lightgbm >= 4.3`, `joblib >= 1.4`.
  * Chuỗi thời gian: `statsmodels >= 0.14` (SES, TSB, Moving Average).
  * Học sâu (Deep Learning): `PyTorch` (mô hình LSTM cho dự báo chuỗi thời gian bán hàng).

### 4.2. Danh mục Dịch vụ AI Độc lập
1. **Demand Forecasting Service (Port 8090 - `apps/ai/forecast`):**
   * Dự báo nhu cầu 7, 14, 30 ngày cho từng SKU.
   * Cổng chọn mô hình thông minh (Model Gate): Tự động chọn mô hình tối ưu (SES, Chronos, TSB hoặc LSTM) tùy theo độ dài lịch sử bán của biến thể.
   * Gợi ý mức tồn đệm an toàn động (**Dynamic Safety Buffer**).
2. **Sync Health Monitor Service (Port 8091 - `apps/ai/sync_health`):**
   * Sử dụng thuật toán **Isolation Forest** và **Local Outlier Factor (LOF)**.
   * Đọc nhật ký đồng bộ theo các cửa sổ trượt 60 giây, trích xuất 10 đặc trưng: `fail_rate`, `lat_mean_ms`, `lat_p95_ms`, `mismatch_rate`, `staleness_s`, `fail_streak`, `pending_depth`,...
   * Phân loại trạng thái kênh: `ok`, `watch`, `alarm`, `idle`.

### 4.3. Nguyên tắc AI Guardrail tại Backend Java
* **Quyền tối cao thuộc về Backend:** Dịch vụ Python chỉ đóng vai trò tư vấn (Advisory).
* **Kiểm duyệt đầu ra nghiêm ngặt:** Spring Boot kiểm tra tính hợp lệ của dự báo trước khi lưu vào `ai_forecast_runs` hoặc hiển thị lên UI. Từ chối ngay nếu dự báo bị âm, cận trên < cận dưới, hoặc cao đột biến so với lịch sử bán.
* **Tuyệt đối không tự động sửa dữ liệu:** AI không bao giờ được phép trực tiếp ghi/sửa số dư tồn kho, giá hay trạng thái đơn hàng.

---

## 5. CƠ SỞ DỮ LIỆU & QUẢN TRỊ DỮ LIỆU (DATABASE LAYER)

### 5.1. Cơ sở dữ liệu chính (Core Database)
* **Hệ quản trị CSDL:** **PostgreSQL 17** (hình ảnh Docker `postgres:17-alpine`).
* **Đặc tả Schema & Ràng buộc:**
  * Ràng buộc chặt chẽ: `CHECK (on_hand >= 0)`, `CHECK (reserved >= 0)`, `CHECK (safety_buffer >= 0)`.
  * Ràng buộc logic cốt lõi: `CHECK (reserved + safety_buffer <= on_hand)`.
  * Công thức tính khả dụng: `available_to_sell = on_hand - reserved - safety_buffer`.
  * Tiền tệ: Lưu trữ dưới dạng số nguyên nhỏ nhất (**minor units** / cents), ví dụ: `100000` VND thay vì float.
* **Cơ chế kiểm soát tranh chấp (Concurrency Control):**
  * Sử dụng khóa dòng bi quan:
    ```sql
    SELECT on_hand, reserved, safety_buffer, version 
    FROM inventory_balances 
    WHERE variant_id = :variantId 
    FOR UPDATE;
    ```
  * Optimistic Locking qua cột `version` cho các thao tác kiểm kê điều chỉnh tồn hàng loạt.

### 5.2. Môi trường kiểm thử Kênh bán (WooCommerce Development Store)
* **MariaDB 11.4** + **WordPress 6.x (PHP 8.3 Apache)** tích hợp sẵn plugin WooCommerce trong Docker Compose, phục vụ việc phát triển và test API webhook nội bộ.

---

## 6. DANH MỤC TÍCH HỢP ĐA KÊNH (CHANNELS & CONNECTORS)

| Kênh bán | Giao thức kỹ thuật | Luồng nghiệp vụ hỗ trợ | Cơ chế bảo mật & kiểm soát |
|---|---|---|---|
| **POS tại quầy** | REST API nội bộ | Bán tại quầy, kiểm tra giá/tồn online tức thời, ghi nhận tiền mặt/chuyển khoản | Xác thực nhân viên + CSRF, không hỗ trợ bán offline |
| **Shopify** | REST Admin API & GraphQL (2026-10) | Đọc danh mục, ghép SKU, tạo bản nháp, đẩy tồn Quota, nhận đơn qua Webhook, gửi trạng thái Fulfillment | Xác thực HMAC SHA256 Webhook, quản lý Scopes, cơ chế xử lý dữ liệu khách hàng được bảo vệ (PCD) |
| **WooCommerce** | REST API v3 (JSON) | Đồng bộ 2 chiều sản phẩm/tồn kho, nhận webhook `order.created`, đối soát đơn hàng | HTTP Basic Auth qua Consumer Key/Secret, Webhook Secret Signature |
| **eBay Sandbox** | REST APIs (Inventory & Fulfillment) | Quản lý Inventory Item, Offer, cập nhật thông tin vận chuyển, xử lý đơn | OAuth 2.0 RuName Authorization Code Flow, token mã hóa trong DB |
| **Simulator** | Backend Engine nội bộ | Sinh tải bão đơn (Burst traffic), tái hiện xung đột đơn hàng và phân tích độ trễ đồng bộ | Route chỉ mở cho `ADMIN` trên môi trường dev/staging |

---

## 7. MÔI TRƯỜNG PHÁT TRIỂN & DEVOPS (INFRASTRUCTURE & ORCHESTRATION)

### 7.1. Điều kiện môi trường (Prerequisites)
* **Git**
* **Java Development Kit (JDK):** Version 21 (Eclipse Temurin, OpenJDK, hoặc GraalVM)
* **Node.js:** Version 24.x & npm
* **Python:** Version 3.11+
* **Docker Desktop:** Hỗ trợ Docker Compose v2 (WSL2 trên Windows)

### 7.2. Cấu hình Cổng Mạng Mặc Định (Port Mapping)

| Dịch vụ | Cổng mặc định | Công nghệ | Địa chỉ truy cập |
|---|:---:|---|---|
| **Seller Web App** | `5173` | React 19 / Vite | `http://localhost:5173` |
| **Backend API Core** | `8080` | Java Spring Boot | `http://localhost:8080` |
| **PostgreSQL Database** | `5432` | PostgreSQL 17 | `localhost:5432` |
| **AI Demand Forecast** | `8090` | FastAPI / Python | `http://localhost:8090` |
| **AI Sync Health Monitor**| `8091` | FastAPI / Python | `http://localhost:8091` |
| **WooCommerce Dev Store** | `8090` (hoặc cấu hình lại) | WordPress / Apache | `http://localhost:8090` |
| **WooCommerce MariaDB** | `3306` (nội bộ Docker) | MariaDB 11.4 | `woocommerce-db:3306` |

---

## 8. BẢNG ÁNH XẠ CHUYỂN ĐỔI: GO $\longrightarrow$ JAVA SPRING BOOT

Bảng tra cứu kỹ thuật tương đương khi chuyển đổi mã nguồn từ Go sang Java:

| Thành phần trong Go (`apps/api`) | Tương đương trong Java Spring Boot (`com.octoflow.api`) | Ghi chú & Lợi thế của Java Spring Boot |
|---|---|---|
| **Router:** `chi` router (`chi.NewRouter()`) | **Spring Web MVC:** `@RestController`, `@RequestMapping` | Cấu trúc phân lớp chuẩn mực, declarative mapping, dễ bảo trì |
| **Middleware Auth/CSRF:** Go custom middleware | **Spring Security Filter Chain:** `SecurityFilterChain` | Hệ sinh thái bảo mật hoàn chỉnh, chuẩn hóa kiểm tra CSRF và RBAC |
| **Queries & Schema:** `sqlc` + `goose` | **Spring Data JPA** + **Flyway Migration** | Type-safe repository interfaces, tự động hóa quản lý version migration |
| **Driver DB & Pool:** `jackc/pgx/v5` pool | **HikariCP** + **PostgreSQL JDBC Driver** | Connection pool tiêu chuẩn công nghiệp hiệu năng cao hàng đầu |
| **Concurrency Lock:** `SELECT FOR UPDATE` | `@Lock(LockModeType.PESSIMISTIC_WRITE)` | Khóa dòng cấp CSDL chống overselling khi xác nhận bán và phân bổ |
| **Event Stream:** SSE qua `http.ResponseWriter` | `SseEmitter` / Spring WebFlux SSE stream | Quản lý kết nối SSE ổn định, tự động xử lý timeout và disconnect |
| **Background Jobs:** Go goroutines + ticker | `@EnableScheduling`, `@Scheduled`, `@Async` | Thread pool quản trị tập trung (tận dụng Virtual Threads Java 21) |
| **OpenAPI Contract:** `openapi.json` nhúng tĩnh | `springdoc-openapi-starter-webmvc-ui` | Tự động sinh OpenAPI 3.0 từ Code & Annotations, luôn đồng bộ |
| **HTTP Client:** Go `net/http` client | Spring `RestClient` hoặc `WebClient` | Cú pháp fluent API trực quan, tự động deserialize JSON, timeout an toàn |
| **Health Check:** `health.Handler` (`/health/live`) | **Spring Boot Actuator** (`HealthIndicator`) | Chuẩn hóa liveness/readiness tương thích Kubernetes/Docker |
| **Testing:** Go `testing` + Docker container | **JUnit 5** + **Testcontainers PostgreSQL** | Kiểm thử tích hợp chạy trực tiếp DB container tự hủy sau test |
