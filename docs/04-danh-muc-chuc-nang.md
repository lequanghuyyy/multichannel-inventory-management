# 04 — Danh mục chức năng và trạng thái bàn giao

**Mốc trạng thái:** 08/11/2026, đến commit `18e0c9b`. Đây là ma trận chức năng ở góc nhìn người bán. “Đã có” không đồng nghĩa đã triển khai tại cửa hàng production hoặc đã nghiệm thu thao tác thật với mọi kênh.

## 1. Truy cập và danh mục

| Năng lực | Người bán làm/nhìn thấy gì | Hiện tại | Điều kiện hoặc giới hạn |
|---|---|---|---|
| Đăng nhập/đăng xuất, vai trò | Admin/Staff vào khu vực phù hợp; việc vượt quyền bị chặn | **Đã có** | Chưa có luồng tự đăng ký, mời thành viên, đổi vai trò hay quên mật khẩu trong màn người bán. |
| Danh sách sản phẩm | Tìm, lọc, xem chi tiết, biến thể, SKU, trạng thái, tồn; xuất danh mục | **Đã có** | Màn có chế độ minh họa riêng; phải nhận biết nguồn dữ liệu. |
| Tạo/sửa sản phẩm và biến thể | Admin quản lý tên, nhóm, mô tả, thuộc tính, màu/cỡ, SKU, giá, ảnh và vòng đời sản phẩm | **Đã có** | Sản phẩm mới là nháp và tồn 0; không tự đăng bán lên kênh. |
| Nhập danh mục từ tệp | Kiểm tra trước, xem lỗi rồi mới ghi toàn tệp | **Đã có** | Lỗi một dòng ngăn ghi một phần. |
| Giá/hiện diện riêng theo kênh | Admin xem và thao tác giá, trạng thái công bố theo kênh | **Có điều kiện** | Phụ thuộc kết nối, quyền và khả năng của kênh; kết quả phải được xác minh trên kênh. |

## 2. Kho và bán hàng

| Năng lực | Người bán làm/nhìn thấy gì | Hiện tại | Điều kiện hoặc giới hạn |
|---|---|---|---|
| Xem tồn theo SKU | Tồn vật lý, đang giữ, tồn đệm, số có thể bán, biến động và bằng chứng theo kênh | **Đã có** | Số từ kênh là quan sát riêng, không thay số tồn trung tâm. |
| Điều chỉnh kiểm kê | Admin điều chỉnh có lý do, xem trước thay đổi hàng loạt, xuất danh sách tồn | **Đã có** | Không chấp nhận trạng thái âm/vượt ngân sách tồn. |
| Phiếu nhập | Tạo/sửa nháp, nhận nhiều đợt, từ chối một phần, xử lý hàng bù, kết thúc sớm/hủy, xem lịch sử, đính kèm, in và xuất chứng từ | **Đã có** | Chỉ số lượng chấp nhận được nhập kho. |
| Giữ hàng và hết hạn | Hệ thống giữ cho giao dịch, xác nhận, giải phóng/hủy/hết hạn đúng trạng thái | **Một phần** | Quy tắc xử lý đã có, nhưng màn người bán chưa có luồng đầy đủ để tự tạo và quản lý giữ chỗ thủ công. Giữ hàng không phải khóa cả phiên livestream. |
| POS online | Tìm hàng, giỏ, kiểm lại giá/tồn, ghi tiền mặt hoặc xác nhận thanh toán ngoài, tạo đơn | **Đã có** | Chỉ bán khi dữ liệu hiện hành; không có bán offline hay cổng thanh toán tự động. |
| Đơn hàng nội bộ | Tìm/lọc, xem nhanh/chi tiết, lịch sử, ghi chú nội bộ, đính kèm/in chứng từ, chuyển trạng thái, xuất danh sách, bàn giao hàng loạt đủ điều kiện | **Đã có** | Bàn giao hàng loạt chỉ cho đơn đã đóng gói và ghi trạng thái nội bộ, chưa phải kênh đã xác nhận; xóa chứng từ cần Admin. |
| Trả hàng | Yêu cầu theo dòng hàng, nhận, kiểm tra, nhập lại hàng còn bán được | **Đã có** | Hoàn tiền tự động **chưa có**. |

## 3. Kênh bán và đồng bộ

| Năng lực | Người bán làm/nhìn thấy gì | Hiện tại | Điều kiện hoặc giới hạn |
|---|---|---|---|
| Danh sách và tình trạng kênh | Xem kênh, kết nối, quyền, mapping, lịch sử và việc cần xử lý | **Đã có** | Một kênh xuất hiện trong danh sách không có nghĩa đã kết nối thật. |
| Ghép listing với SKU | Đối chiếu biến thể kênh với biến thể nội bộ; thấy mục không khớp | **Đã có / có điều kiện khi đọc kênh thật** | Không đoán ghép khi thiếu/trùng SKU; phải xác minh từng kênh. |
| Công bố sản phẩm | Xem trước; tạo/sửa bản nháp; đăng/ngừng bán hoặc đồng bộ giá khi kênh cho phép | **Có điều kiện** | Các thao tác đã có theo phạm vi từng kênh nhưng ghi lên kênh mặc định tắt, cần kết nối/quyền và bằng chứng đọc lại. |
| Phân bổ tồn đa kênh | Xem số phân bổ từng listing; kế hoạch điều chuyển cần bước xem trước và xác nhận | **Một phần** | Quy tắc và xử lý kế hoạch đã có, nhưng màn người bán chưa cho xem trước/thực hiện toàn kế hoạch. Ghi kênh vẫn có điều kiện; khi điều chuyển phải giảm kênh cũ trước khi tăng kênh mới. |
| Theo dõi đồng bộ | Xem sự kiện, việc đang chạy, kết quả, thử lại và sai lệch; đối soát định kỳ | **Đã có** | Mức độ xác minh thực tế phụ thuộc từng connector. |
| Nhận đơn kênh | Nhận sự kiện/đọc lại đơn, chống lặp, giữ sự kiện lỗi mapping và xử lý lại | **Có điều kiện** | Cần kênh, quyền nhận đơn và xác minh môi trường. Giả lập chỉ là thử nghiệm. |
| Công cụ giả lập | Tạo tải/sự kiện đơn và tình huống đồng bộ để kiểm chứng | **Đã có cho thử nghiệm** | Không phải bằng chứng tích hợp Shopee, TikTok, Lazada hoặc marketplace khác. |

### Trạng thái từng kênh tại mốc bàn giao

| Kênh | Năng lực hiện diện trong sản phẩm | Bằng chứng môi trường hiện có | Kết luận nghiệp vụ |
|---|---|---|---|
| **Shopify Development Store** | Đọc/ghép SKU; tạo nháp và đồng bộ danh mục; luồng đăng/ngừng bán, kích hoạt theo dõi tồn, gửi tồn, nhận đơn và cập nhật giao hàng có các điều kiện bảo vệ | Đã có kiểm tra kết nối/đọc danh mục ở cửa hàng thử. Bốn SKU đọc được nhưng việc ghép/đẩy tồn còn bị chặn bởi trạng thái nháp, chưa theo dõi tồn và quyền nhận dữ liệu đơn được bảo vệ. Chưa có nghiệm thu trọn vòng đơn và ghi tồn thật. | **Có điều kiện; chưa xác nhận hoàn tất đầu cuối.** |
| **WooCommerce Development Store** | Đọc sản phẩm/biến thể, ghép SKU; luồng nháp/đăng bán/đồng bộ sản phẩm và tồn; nhận đơn, thử lại và đối soát | Kiểm tra đọc trên cửa hàng phát triển đã đạt; lần nghiệm thu được ghi nhận chưa chạy kết nối/nhập đơn/checkout/webhook/ghi tồn trên kênh thật. | **Có điều kiện; chưa xác nhận hoàn tất đầu cuối.** |
| **eBay Sandbox** | Luồng nháp/đồng bộ/đăng/rút sản phẩm và giá, đọc tồn/đơn; luồng bàn giao hàng có yêu cầu xác nhận và thông tin vận chuyển | Có đường xử lý trong sản phẩm; chưa có bằng chứng kết nối và ghi trên tài khoản Sandbox thật trong hồ sơ hiện có. | **Có điều kiện; cần nghiệm thu Sandbox.** |

Các hồ sơ tích hợp viết trong tháng 10 có câu “chưa triển khai” đối với vài thao tác eBay/WooCommerce. Mã tại mốc 08/11 đã có thêm các luồng này, vì vậy kết luận đúng là **có luồng, còn phụ thuộc điều kiện và chưa có nghiệm thu live tương ứng**. Không chuyển thành nhãn “đã vận hành thật” chỉ vì có thao tác trong sản phẩm.

## 4. Báo cáo, AI và các màn hỗ trợ

| Năng lực | Người bán làm/nhìn thấy gì | Hiện tại | Điều kiện hoặc giới hạn |
|---|---|---|---|
| Báo cáo vận hành | Xem kỳ 7/30/90 ngày, lọc kênh/nhóm, bán theo ngày, SKU, tồn, kênh, đồng bộ và lệch | **Đã có** | Giá trị đơn không phải tiền đã thu; các nút xuất/hẹn gửi báo cáo trên màn này chưa hoạt động. |
| Tổng quan đầu trang | Thẻ chỉ số, biểu đồ, cảnh báo và hoạt động gần đây | **Minh họa** | Các chỉ số hiện là dữ liệu cố định, không dùng để đánh giá cửa hàng thật. |
| Trợ lý AI — nhu cầu đã ghi nhận | Xem lượng bán 28 ngày gần đây theo SKU, nhóm, tồn và số có thể bán | **Đã có** | Đây là lịch sử, không phải dự báo. |
| Trợ lý AI — dự báo | Chọn kỳ 7/14/30 ngày; xem dự báo, khoảng ước lượng, nguồn, SKU thiếu dữ liệu/bị từ chối | **Có điều kiện** | Khi chưa cấu hình nguồn dự báo, màn hiện “không có dự báo”. Nếu nguồn đã cấu hình nhưng bị lỗi, màn hiện tại có thể chuyển sang các thẻ minh họa; chưa phải dự báo thật. |
| Chọn mô hình AI theo từng tính năng | Xem mô hình đang được cấu hình cho từng tính năng | **Một phần** | Màn hiện cho xem trạng thái/cấu hình, chưa cho người bán đổi mô hình. Kế hoạch đồ án có mục chọn mô hình; cần xác nhận có còn là yêu cầu đầu ra. |
| Gợi ý tồn đệm và cảnh báo đồng bộ | Xem lời khuyên/cảnh báo khi có dữ liệu và dịch vụ phù hợp | **Có điều kiện** | Chỉ đọc; gợi ý tồn đệm mặc định tắt/0, không tự áp dụng. Chưa đánh giá trên kênh/đơn thật của shop. |
| Thẻ đề xuất AI chung, nút áp dụng | Xem các thẻ và chi tiết gợi ý kiểu minh họa | **Minh họa** | Nội dung mẫu; thao tác áp dụng chưa sử dụng được. Phát hiện sóng đơn/khóa phiên mới ở mức nghiên cứu mô phỏng. |
| Cài đặt cửa hàng/kho/thành viên/thông báo | Xem giao diện cài đặt | **Minh họa** | Thông tin là dữ liệu mẫu; chưa lưu cấu hình cửa hàng, chưa mời/đổi vai trò; công tắc thông báo bị khóa. |
| Web và điện thoại | Giao diện dùng được ở kích thước màn hình khác nhau; có bộ vỏ ứng dụng di động | **Có đường triển khai** | Kiểm tra trình duyệt cỡ điện thoại không thay thế bằng chứng chạy trên thiết bị Android/iOS thật. |

## 5. Cách dùng ma trận khi giao việc

1. Chọn một năng lực và xác định đó là **đã có**, **một phần**, **có điều kiện**, **minh họa** hay **chưa có**.
2. Nếu là **có điều kiện**, ghi rõ kênh, quyền, dữ liệu và bước xác minh cần thiết; không đặt tên công việc đơn giản là “bật tính năng”.
3. Nếu là **minh họa**, quyết định hoặc biến thành chức năng dùng dữ liệu thật, hoặc rút khỏi cam kết bàn giao; không dùng ảnh màn hình mẫu làm bằng chứng nghiệm thu.
4. Dùng [kịch bản nghiệm thu](05-nghiem-thu-va-viec-con-lai.md) để đóng công việc theo kết quả quan sát, không theo số nút/màn hình đã vẽ.

## 6. Dấu vết đối chiếu cho trạng thái dễ nhầm

Các liên kết sau chỉ giúp kiểm lại trạng thái; nội dung nghiệp vụ của hồ sơ vẫn nằm trong các bảng phía trên.

- [Màn Tổng quan](../../apps/seller/src/features/dashboard/DashboardPage.tsx), [màn Cài đặt](../../apps/seller/src/features/settings/SettingsPage.tsx), [màn Báo cáo](../../apps/seller/src/features/reports/ReportsPage.tsx): phân biệt dữ liệu mẫu với báo cáo thật.
- [Màn Trợ lý AI](../../apps/seller/src/features/ai/AIPage.tsx), [hồ sơ mô hình](../ai/MODEL_CARDS.md): phân biệt nhu cầu đã ghi nhận, dự báo có điều kiện và thẻ đề xuất mẫu.
- [Công bố Shopify](../../apps/api/internal/modules/publications/service.go), [thao tác WooCommerce](../../apps/api/internal/modules/woocommerce/product_lifecycle.go), [thao tác eBay](../../apps/api/internal/modules/ebay/product_lifecycle.go): các luồng ghi kênh được thêm sau nhiều hồ sơ tích hợp cũ.
- [Phân bổ tồn](../../apps/api/internal/modules/syncing/allocation_plan.go), [thực hiện điều chuyển](../../apps/api/internal/modules/syncing/allocation_orchestrator.go): xem trước và thực hiện kế hoạch ở mốc 08/11.
- [Bằng chứng Shopify](../integrations/shopify-acceptance.md), [bằng chứng WooCommerce](../integrations/woocommerce-acceptance.md), [hướng dẫn kiểm chứng di động](../mobile/README.md): giới hạn xác minh trên môi trường ngoài.
