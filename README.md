# OctoFlow — Multi-channel Inventory Management System

Hệ thống quản lý sản phẩm, tồn kho trung tâm và đồng bộ đa kênh (POS, Shopify, WooCommerce, eBay) dành cho người bán lẻ (AI-driven Seller App).

## 🛠️ Ngăn xếp Công nghệ (Tech Stack)

Chi tiết đặc tả kiến trúc kỹ thuật được mô tả đầy đủ tại [**TECH_STACK.md**](TECH_STACK.md):
- **Backend Core:** **Java 21 LTS**, **Spring Boot 3.x** (Spring Security, Spring Data JPA, Flyway, HikariCP, SseEmitter, RestClient, Actuator, springdoc-openapi).
- **Frontend Web & Mobile:** **React 19**, **TypeScript ~5.9**, **Vite 7**, **Tailwind CSS v4**, **Capacitor 8** (Android / iOS).
- **Cơ sở dữ liệu:** **PostgreSQL 17** với kiểm soát tranh chấp bằng Pessimistic Row-level Locking (`SELECT FOR UPDATE`).
- **AI / ML Microservices:** **Python 3.11+**, **FastAPI**, **Uvicorn**, Scikit-learn, LightGBM, Statsmodels, PyTorch (Dự báo nhu cầu, giám sát sức khỏe đồng bộ đa kênh).

## 📖 Tài liệu dự án

Hồ sơ bàn giao nghiệp vụ và đặc tả yêu cầu phần mềm chi tiết được lưu trong thư mục [`docs/`](docs/):

| Tài liệu | Nội dung |
|---|---|
| [Hồ sơ bàn giao nghiệp vụ](docs/README.md) | Tổng quan mốc đối chiếu, quy tắc bàn giao và nguồn dữ liệu chuẩn. |
| [SRS — Software Requirements Specification](docs/SRS.md) | Đặc tả yêu cầu phần mềm, tác nhân, yêu cầu chức năng/phi chức năng. |
| [01 — Sản phẩm và phạm vi](docs/01-san-pham-va-pham-vi.md) | Bài toán, ranh giới sản phẩm và tiêu chí thành công. |
| [02 — Vai trò và hành trình](docs/02-vai-tro-va-hanh-trinh.md) | Phân quyền Admin/Staff và các hành trình nghiệp vụ chính. |
| [03 — Quy tắc nghiệp vụ](docs/03-quy-tac-nghiep-vu.md) | Quy tắc tồn kho ATS, giữ hàng (reservation), phân bổ kênh, đơn hàng và AI. |
| [04 — Danh mục chức năng](docs/04-danh-muc-chuc-nang.md) | Ma trận năng lực và hiện trạng triển khai theo từng phân hệ. |
| [05 — Nghiệm thu và việc còn lại](docs/05-nghiem-thu-va-viec-con-lai.md) | Bộ kịch bản kiểm thử nghiệm thu (AC-01..16) và các khoảng trống cần hoàn tất. |
| [06 — Thuật ngữ và quyết định](docs/06-thuat-ngu-va-quyet-dinh.md) | Từ điển nghiệp vụ và các quyết định chiến lược cần chốt. |
