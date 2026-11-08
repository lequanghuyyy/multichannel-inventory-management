# Software Requirements Specification (SRS)

**Sản phẩm:** DATT — AI-driven Seller App  
**Phiên bản tài liệu:** 1.0  
**Ngày:** 31/10/2026  
**Trạng thái:** Baseline mô tả hệ thống và phạm vi triển khai hiện tại

## 1. Mục đích

Tài liệu này xác định mục tiêu, người dùng, yêu cầu chức năng, yêu cầu chất lượng và các giới hạn của DATT. SRS phục vụ thống nhất phạm vi giữa nhóm phát triển, người hướng dẫn và người đánh giá; đồng thời là cơ sở cho thiết kế, triển khai và nghiệm thu.

Trạng thái yêu cầu được ghi rõ để phân biệt khả năng đã có trong mã nguồn với phần chỉ được hỗ trợ khi cấu hình hoặc còn là định hướng. “Đã triển khai” không tự động có nghĩa là đã được nghiệm thu trên môi trường production hay đã được cấp quyền marketplace.

## 2. Phạm vi sản phẩm

DATT là ứng dụng dành cho người bán, cung cấp giao diện web responsive và có thể đóng gói Android/iOS bằng Capacitor. API Go xử lý quy tắc nghiệp vụ; PostgreSQL lưu danh mục, đơn hàng và số liệu tồn làm nguồn dữ liệu trung tâm.

Phạm vi nghiệp vụ gồm:

- Danh mục sản phẩm và biến thể có SKU.
- Tồn kho, điều chỉnh, nhập hàng, giữ hàng và lịch sử biến động.
- Đơn bán, thanh toán, giao hàng và luồng trả hàng theo API hỗ trợ.
- POS online, kênh bán, mapping listing và theo dõi đồng bộ.
- Báo cáo và các đề xuất AI có cấu hình provider.

Phạm vi nền hiện tại tập trung vào một cửa hàng và một kho logic. Hệ thống có connector cho một số nền tảng, nhưng kết nối thật phụ thuộc thông tin xác thực, quyền truy cập, cờ cấu hình và môi trường tương ứng. Simulator là công cụ phát triển/kiểm thử, không phải bằng chứng kết nối marketplace.

### 2.1 Ngoài phạm vi baseline

- Ứng dụng mua sắm riêng cho khách hàng cuối.
- Hỗ trợ nhiều tenant/cửa hàng độc lập với phân vùng dữ liệu hoàn chỉnh.
- POS offline có đồng bộ giao dịch sau khi mạng trở lại.
- Cổng thanh toán trực tuyến hoặc tự xử lý tiền thật.
- Cam kết marketplace API đã được cấp quyền production.
- AI tự động ghi thay đổi tồn, giá, listing hoặc trạng thái đơn.
- Triển khai production công khai, SLA và quy trình khôi phục thảm họa đã nghiệm thu.

## 3. Thuật ngữ

| Thuật ngữ | Ý nghĩa |
|---|---|
| Product | Sản phẩm cha trong danh mục |
| Variant | Mẫu/biến thể cụ thể của sản phẩm, ví dụ màu và kích cỡ |
| SKU | Mã định danh nội bộ của biến thể dùng trong vận hành |
| On-hand | Số lượng vật lý đang ghi nhận trong kho |
| Reserved | Số lượng đang được giữ cho giao dịch/đơn |
| Available to sell (ATS) | Số lượng API cho phép bán sau khi áp dụng giữ chỗ và quy tắc tồn |
| Listing / mapping | Liên kết biến thể nội bộ với sản phẩm/biến thể trên kênh ngoài |
| Outbox | Bản ghi sự kiện được lưu cùng transaction nghiệp vụ để xử lý đồng bộ bất đồng bộ |
| Simulator | Kênh giả lập dành cho phát triển và kiểm thử |
| SRS | Software Requirements Specification — đặc tả yêu cầu phần mềm |

## 4. Người dùng và quyền

| Actor | Mục tiêu | Quyền/giới hạn chính |
|---|---|---|
| Admin | Cấu hình hệ thống và thực hiện thao tác quản trị | Đọc dữ liệu; quản lý danh mục; điều chỉnh tồn; cấu hình/khởi chạy các thao tác được phép |
| Staff | Thực hiện công việc bán hàng và vận hành | Đọc dữ liệu nghiệp vụ; thao tác đơn, giữ/bán/nhập theo quyền route; không có quyền quản trị bị giới hạn cho Admin |
| Dịch vụ nền | Hết hạn reservation, phát sự kiện và chạy job đồng bộ | Chạy theo cấu hình backend; không phải người dùng tương tác |
| Marketplace/connector | Trao đổi listing, tồn, đơn hoặc webhook | Chỉ hoạt động khi endpoint và quyền tương ứng được bật, xác minh |

Backend kiểm tra session, role và CSRF đối với route ghi từ phiên web. API/mobile login có luồng phiên riêng. Quyền cụ thể được thực thi theo từng route; UI không phải ranh giới bảo mật.

## 5. Bối cảnh hệ thống

```text
Admin / Staff
      │
      ▼
Seller Web (React + TypeScript + Vite) ─── Capacitor WebView
      │ REST / SSE
      ▼
Go API (chi, modules nghiệp vụ, worker)
      │                         │
      ▼                         └── Connector marketplace / POS / AI provider
PostgreSQL                              (bật theo cấu hình và quyền)
```

Các giao diện ngoài chính:

- REST JSON dưới `/api/v1`; hợp đồng runtime được công bố tại `/api/v1/openapi.json`.
- SSE tại `/api/v1/sync/stream` cho thông báo thay đổi đồng bộ.
- PostgreSQL qua pgx; schema thay đổi bằng goose migrations, query được quản lý với sqlc.
- Shopify, eBay Sandbox, WooCommerce và simulator là các biên tích hợp riêng, có điều kiện kích hoạt độc lập.
- Provider AI tương thích giao thức đã cấu hình; không có provider thì hệ thống không được tạo dự báo thay thế.

## 6. Yêu cầu chức năng

Trạng thái trong bảng: **Đã triển khai** — có luồng API/UI trong repo; **Có điều kiện** — có khả năng nhưng phụ thuộc cấu hình/credential/quyền; **Chưa có/ngoài baseline** — chưa được xem là năng lực sử dụng được.

### 6.1 Tài khoản và truy cập

| ID | Yêu cầu | Ưu tiên | Trạng thái |
|---|---|---:|---|
| FR-AUTH-01 | Hệ thống phải cho Admin/Staff đăng nhập và trả session hiện hành cho client. | Cao | Đã triển khai |
| FR-AUTH-02 | Hệ thống phải từ chối yêu cầu không xác thực và giới hạn route theo role. | Cao | Đã triển khai |
| FR-AUTH-03 | Hệ thống phải hỗ trợ đăng xuất; route ghi từ phiên web phải kiểm tra CSRF. | Cao | Đã triển khai |

### 6.2 Danh mục sản phẩm

| ID | Yêu cầu | Ưu tiên | Trạng thái |
|---|---|---:|---|
| FR-CAT-01 | Người dùng được phép phải xem danh sách và chi tiết sản phẩm/biến thể, gồm SKU và trạng thái. | Cao | Đã triển khai |
| FR-CAT-02 | Admin có thể tạo/cập nhật sản phẩm, cập nhật biến thể và thêm biến thể theo quy tắc API. | Cao | Đã triển khai |
| FR-CAT-03 | Admin có thể nhập sản phẩm từ CSV; chế độ kiểm tra mặc định không ghi dữ liệu; lỗi một dòng phải ngăn ghi một phần. | Trung bình | Đã triển khai |
| FR-CAT-04 | Hệ thống phải từ chối thay đổi trạng thái/SKU trái quy tắc nghiệp vụ, không âm thầm sửa số dư tồn. | Cao | Đã triển khai |

### 6.3 Tồn kho và nhập hàng

| ID | Yêu cầu | Ưu tiên | Trạng thái |
|---|---|---:|---|
| FR-INV-01 | Người dùng được phép xem tồn theo SKU và danh sách tồn; dữ liệu từ API phải phân biệt với fixture/mẫu. | Cao | Đã triển khai |
| FR-INV-02 | Hệ thống phải tính và trả số lượng khả dụng từ backend; client không được tự dùng số liệu cục bộ làm nguồn chuẩn. | Cao | Đã triển khai |
| FR-INV-03 | Admin có thể điều chỉnh tồn với lý do; thao tác lặp có idempotency để tránh ghi hai lần. | Cao | Đã triển khai |
| FR-INV-04 | Hệ thống phải hỗ trợ xem sổ biến động tồn theo SKU. | Cao | Đã triển khai |
| FR-INV-05 | Người dùng được phép tạo/nhận/hủy phiếu nhập theo các trạng thái được API cho phép. | Cao | Đã triển khai |
| FR-INV-06 | Hệ thống phải giữ và xác nhận số lượng trong transaction; xác nhận không được bán vượt lượng đã giữ; thao tác lặp cùng khóa không được trừ thêm tồn. | Cao | Đã triển khai |
| FR-INV-07 | Hệ thống phải giải phóng giữ chỗ khi release/cancel/expire; worker hết hạn phải dùng chung quy tắc cập nhật số dư với luồng API. | Cao | Đã triển khai |
| FR-INV-08 | Điều chỉnh hàng loạt phải có bước preview/kiểm tra và không commit một phần nếu dữ liệu đầu vào sai. | Trung bình | Đã triển khai |

### 6.4 Đơn hàng và POS

| ID | Yêu cầu | Ưu tiên | Trạng thái |
|---|---|---:|---|
| FR-ORD-01 | Người dùng được phép xem danh sách, chi tiết và lịch sử thay đổi đơn. | Cao | Đã triển khai |
| FR-ORD-02 | Hệ thống phải tạo đơn nhiều dòng trong một transaction và không chấp nhận lượng bán vượt tồn/giữ chỗ theo quy tắc. | Cao | Đã triển khai |
| FR-ORD-03 | Hệ thống phải cho phép chuyển trạng thái đơn theo state machine; chuyển trạng thái không hợp lệ phải trả lỗi có thể xử lý. | Cao | Đã triển khai |
| FR-ORD-04 | Người dùng được phép có thể ghi nhận trạng thái thanh toán nội bộ qua API xác nhận; client không tự đánh dấu đã thu tiền. Hệ thống hiện không tích hợp cổng thanh toán và trạng thái này không phải bằng chứng giao dịch tiền thật. | Cao | Đã triển khai (nội bộ) |
| FR-ORD-05 | Hệ thống phải hỗ trợ quy trình trả/nhận/kiểm tra/từ chối/hủy trả hàng theo trạng thái API. | Trung bình | Đã triển khai |
| FR-ORD-06 | POS online phải lấy giá và số có thể bán từ dữ liệu API; khi chỉ có fixture hoặc API lỗi, không cho xác nhận đơn thật. | Cao | Đã triển khai |
| FR-ORD-07 | Tạo đơn và xác nhận thao tác bán phải có thể retry an toàn bằng cùng idempotency key/payload. | Cao | Đã triển khai |

### 6.5 Kênh bán và đồng bộ

| ID | Yêu cầu | Ưu tiên | Trạng thái |
|---|---|---:|---|
| FR-CH-01 | Người dùng được phép xem kênh, trạng thái và mapping listing–SKU. | Cao | Đã triển khai |
| FR-CH-02 | Mapping SKU ngoài phải được lưu/xác định rõ; không tự suy ra external SKU từ SKU nội bộ. | Cao | Đã triển khai |
| FR-CH-03 | Hệ thống phải ghi sự kiện đồng bộ cùng transaction của các writer tồn liên quan thông qua outbox. | Cao | Đã triển khai |
| FR-CH-04 | Người dùng được phép theo dõi event/job/metrics và lịch sử retry; UI có thể nhận tín hiệu cập nhật qua SSE rồi đọc lại dữ liệu chuẩn từ API. | Cao | Đã triển khai |
| FR-CH-05 | Hệ thống chỉ được gọi API marketplace khi connector, thông tin xác thực, quyền và môi trường đã được cấu hình hợp lệ. | Cao | Có điều kiện |
| FR-CH-06 | Simulator phải được nhận diện là dữ liệu giả lập và không được coi là kênh thật. | Cao | Đã triển khai |
| FR-CH-07 | Ghi tồn/sản phẩm/đơn lên nền tảng ngoài phải tắt mặc định hoặc bị chặn cho đến khi các cờ và điều kiện an toàn liên quan được bật. | Cao | Đã triển khai |

### 6.6 Báo cáo và AI

| ID | Yêu cầu | Ưu tiên | Trạng thái |
|---|---|---:|---|
| FR-REP-01 | Hệ thống phải trả báo cáo tổng hợp theo các khoảng thời gian được hỗ trợ, dựa trên dữ liệu nghiệp vụ đã lưu. | Trung bình | Đã triển khai |
| FR-AI-01 | Giao diện phải cho biết tính năng AI/provider/model nào được cấu hình; không hiển thị lựa chọn model không được backend hỗ trợ. | Trung bình | Đã triển khai |
| FR-AI-02 | Hệ thống chỉ trả dự báo khi provider trả kết quả hợp lệ; nếu chưa sẵn sàng, trả trạng thái chưa sẵn sàng thay vì dữ liệu giả. | Trung bình | Có điều kiện |
| FR-AI-03 | Đề xuất AI chỉ mang tính hỗ trợ; AI không được trực tiếp cập nhật số dư tồn hay trạng thái nghiệp vụ. | Cao | Đã triển khai theo ranh giới kiến trúc |

## 7. Quy tắc nghiệp vụ và dữ liệu

1. Mỗi biến thể bán được phải được định danh bằng SKU nội bộ; mapping sang kênh ngoài là dữ liệu riêng.
2. Số dư tồn trung tâm được thay đổi qua API nghiệp vụ và transaction backend. Không coi cache trình duyệt, fixture hoặc simulator là nguồn tồn chuẩn.
3. Reservation giữ chỗ làm thay đổi lượng reserved; confirm làm giảm on-hand và reserved theo cùng transaction. Release/cancel/expire giải phóng đúng lượng còn giữ.
4. Các lệnh ghi hỗ trợ idempotency phải được retry bằng đúng key và payload ban đầu. Cùng key nhưng nội dung khác phải bị từ chối.
5. Trạng thái hết hạn là quy tắc dựa trên thời gian DB; worker nền giải phóng lượng giữ hết hạn. Không được hiển thị “đã hoàn tất” khi API chưa xác nhận.
6. Mọi khoản tiền được trao đổi bằng đơn vị nguyên nhỏ nhất (minor units) ở backend, không dùng số dấu phẩy động làm giá trị chuẩn.
7. Event đồng bộ chỉ báo có thay đổi; client phải đọc lại resource từ API để render trạng thái hiện tại.
8. Lỗi API phải có mã lỗi phù hợp và request ID; UI cần giữ phân biệt giữa tải, rỗng, lỗi và dữ liệu mẫu.
9. Thay đổi schema phải dùng migration mới có version; migration đã áp dụng không được sửa ngược để tránh lệch giữa DB đã tồn tại và DB mới.

### 7.1 Thực thể chính

| Thực thể | Mô tả |
|---|---|
| User / Session | Người dùng và phiên xác thực, role Admin/Staff |
| Product / Variant | Danh mục và biến thể, gồm trạng thái, SKU và thuộc tính |
| Inventory balance / ledger | Số dư tồn hiện tại và các biến động được ghi nhận |
| Reservation | Lượng tồn được giữ, trạng thái vòng đời và thời hạn |
| Order / Order item / history | Đơn bán, dòng hàng và lịch sử chuyển trạng thái |
| Return | Yêu cầu trả hàng và các bước nhận/kiểm tra/quyết định |
| Receipt | Phiếu nhập và trạng thái nhận/hủy |
| Channel / Listing mapping | Kênh bán và liên kết listing ngoài với biến thể nội bộ |
| Sync event / Job | Sự kiện, trạng thái xử lý, retry và kết quả đồng bộ |
| AI feature / recommendation | Cấu hình tính năng và nội dung gợi ý nếu provider khả dụng |

## 8. Yêu cầu phi chức năng

| ID | Yêu cầu | Tiêu chí/ghi chú |
|---|---|---|
| NFR-SEC-01 | Mọi route nghiệp vụ riêng tư phải xác thực và áp dụng phân quyền ở backend. | API route middleware là lớp thực thi; không dựa riêng vào ẩn nút ở UI. |
| NFR-SEC-02 | Bí mật tích hợp không được đưa vào frontend bundle hoặc commit vào repository. | Lưu trong `.env` local không commit hoặc secret manager phù hợp. |
| NFR-SEC-03 | Route ghi qua phiên web phải kiểm tra CSRF; login cần giới hạn thử lặp. | Cấu hình cookie/HTTPS phải phù hợp môi trường triển khai. |
| NFR-DATA-01 | Thay đổi tồn/đơn cần tính nguyên tử, ràng buộc dữ liệu và xử lý cạnh tranh. | Dùng PostgreSQL transaction/locking/constraints; các flow quan trọng cần test tích hợp DB. |
| NFR-DATA-02 | Retry của lệnh hỗ trợ idempotency không được tạo tác động nghiệp vụ thứ hai. | Phạm vi hiện tại là shop đơn; không diễn giải thành idempotency đa tenant. |
| NFR-REL-01 | API phải cung cấp health liveness/readiness; lỗi phụ thuộc không được trả thành dữ liệu thành công giả. | Có `/health/live` và `/health/ready`. |
| NFR-REL-02 | Outbox/job phải hỗ trợ xử lý nền, retry và dead-letter theo cấu hình. | Lỗi worker cần thể hiện trong trạng thái vận hành. |
| NFR-OBS-01 | Request cần request ID để liên hệ phản hồi API với log. | ID trả trong header và error envelope. |
| NFR-UX-01 | Web UI phải đáp ứng desktop và mobile viewport, có trạng thái loading/empty/error phù hợp. | Native app là Capacitor WebView; browser test không đồng nghĩa nghiệm thu native. |
| NFR-UX-02 | Giao diện phải phân biệt rõ dữ liệu thật, dữ liệu mẫu và simulator. | Không biểu diễn fixture là đã đồng bộ hoặc kết nối thật. |
| NFR-MNT-01 | API contract runtime, generated client, migrations và tài liệu cần đồng bộ với thay đổi. | Không quảng bá endpoint proposed như endpoint đang chạy. |
| NFR-DEP-01 | Local development có thể khởi chạy bằng Docker Compose và script setup. | Mặc định bind các port vào loopback. |

## 9. Yêu cầu giao diện

Seller Web cung cấp các khu vực Tổng quan, Sản phẩm, Kho, Nhập hàng, Đơn hàng, Bán tại quầy, Kênh bán, Đồng bộ, Báo cáo, Trợ lý AI và Cài đặt; một số trang chi tiết được mở theo resource ID. Navigation ẩn mục chỉ dành cho Admin theo role được tải từ session.

Các bảng nghiệp vụ cần ưu tiên dữ liệu phục vụ quyết định của người bán: mã/tên sản phẩm, biến thể/SKU, trạng thái, số lượng liên quan và hành động khả dụng. Thông tin kỹ thuật chỉ xuất hiện trong màn vận hành/tích hợp khi cần khắc phục sự cố; không thay thế nội dung nghiệp vụ chính.

Khi tải lỗi, giao diện phải báo lỗi và cho thử lại phù hợp; không đổi lỗi API thành số 0 hoặc trạng thái thành công. Khi danh sách rỗng, giao diện cần giải thích ngắn gọn bước tiếp theo nếu có.

## 10. Tích hợp và giả định

| Tích hợp | Vai trò | Điều kiện / trạng thái |
|---|---|---|
| PostgreSQL | Nguồn dữ liệu nghiệp vụ trung tâm | Bắt buộc; migration và seed là tác vụ riêng |
| Shopify | Đọc/ghi sản phẩm, tồn, đơn và xác minh theo module tích hợp | Tắt mặc định; cần shop, app credentials, scopes và cờ an toàn phù hợp |
| eBay | OAuth và một số thao tác inventory/orders trong Sandbox | Tắt mặc định; Sandbox được cấu hình; không tuyên bố publish sản phẩm/fulfillment write đã có |
| WooCommerce | Connector REST API, webhook, mapping và xử lý đơn | Tắt mặc định; cần REST keys/webhook secret; quyền ghi riêng và cấu hình dev store |
| Simulator | Tạo tình huống kênh/sync giả lập để phát triển | Chỉ môi trường được phép; không phải marketplace thật |
| AI provider | Sinh forecast/recommendation theo cấu hình | Không cấu hình thì tính năng liên quan chưa sẵn sàng |

Các credential, scopes, URL webhook, giới hạn rate và bằng chứng quyền truy cập là thông tin theo môi trường, không được ghi cứng vào SRS hoặc source code.

## 11. Tiêu chí nghiệm thu tổng quát

1. Người dùng có session hợp lệ và role phù hợp mới truy cập được dữ liệu/route nghiệp vụ.
2. Danh mục, tồn, đơn, phiếu nhập và kênh hiển thị được trạng thái API chính xác; dữ liệu mẫu được nhận diện riêng.
3. Thao tác tồn/đơn bị từ chối nếu vi phạm quy tắc; retry cùng idempotency key không lặp tác động.
4. Kiểm thử tích hợp PostgreSQL chứng minh transaction rollback và xử lý tranh chấp trên các luồng tồn quan trọng.
5. Sự kiện đồng bộ chỉ được phát sau khi thay đổi nghiệp vụ commit; retry/dead-letter có thể quan sát.
6. Connector ngoài chỉ thực hiện yêu cầu khi đủ cấu hình/quyền; bật cờ ghi không làm lộ secret ra client.
7. Khi provider AI không khả dụng, UI/API biểu thị chưa sẵn sàng và không dựng dự báo giả.
8. Các trang chính có trạng thái loading, empty, error và responsive navigation; keyboard/focus và nhãn điều khiển cơ bản có thể sử dụng.
9. API runtime OpenAPI khớp với endpoint đang triển khai; endpoint phát triển/simulator không được trình bày như chức năng người bán thông thường.

## 12. Traceability và tài liệu liên quan

| Chủ đề | Tài liệu nguồn trong repository |
|---|---|
| Tổng quan và chạy hệ thống | [README](../README.md) |
| Quy ước phát triển/an toàn dữ liệu | [DEVELOPMENT](DEVELOPMENT.md) |
| Tồn kho và schema | [Inventory lifecycle](specs/inventory-lifecycle.md), [schema](specs/inventory-schema.md) |
| Reserve/confirm | [Reserve-confirm](specs/reserve-confirm.md), [inventory concurrency](specs/inventory-concurrency.md) |
| Connector WooCommerce | [WooCommerce development store](integrations/woocommerce-development-store.md) |
| Đóng gói mobile | [Mobile guide](mobile/README.md) |

---

**Ghi chú baseline:** Đây là đặc tả cấp sản phẩm cho repository tại ngày ghi trên. Khi phạm vi đồ án hoặc quyền marketplace được xác nhận thay đổi, cập nhật SRS và ma trận trạng thái cùng với API/UI tương ứng.
