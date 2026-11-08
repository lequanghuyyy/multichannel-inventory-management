# 06 — Thuật ngữ và các quyết định còn mở

## 1. Từ điển nghiệp vụ

| Từ | Nghĩa trong OctoFlow |
|---|---|
| Cửa hàng | Đơn vị kinh doanh đang được quản lý; phạm vi cơ sở chỉ một cửa hàng. |
| Kho logic | Một tập số tồn chung cho cửa hàng; chưa phải mạng nhiều kho/chi nhánh. |
| Sản phẩm | Mặt hàng cha, mang tên, mô tả, nhóm, thương hiệu và thông tin chung. |
| Biến thể | Phiên bản bán cụ thể của sản phẩm, chẳng hạn một màu/cỡ. |
| SKU nội bộ | Mã kinh doanh nhận diện biến thể trong cửa hàng. |
| SKU ngoài | Mã mà một kênh sử dụng; không tự mặc định trùng SKU nội bộ. |
| Listing | Bản sản phẩm/biến thể được kênh bán quản lý hoặc hiển thị. |
| Ghép SKU / mapping | Xác nhận listing ngoài tương ứng biến thể nội bộ nào. |
| Nháp | Có thông tin sản phẩm nhưng chưa đồng nghĩa khách có thể mua trên kênh. |
| Đang bán trên kênh | Kênh đã xác nhận sản phẩm ở trạng thái bán theo quy tắc của kênh đó. |
| Tồn vật lý (on-hand) | Số hàng cửa hàng đang ghi nhận trong kho. |
| Đang giữ (reserved) | Hàng dành cho một giao dịch/đơn chưa xác nhận bán. |
| Tồn đệm an toàn | Phần hàng chủ động không đưa ra bán để giảm rủi ro. |
| Số có thể bán (ATS) | Tồn vật lý trừ đang giữ trừ tồn đệm an toàn. |
| Giữ hàng | Quyền dùng một số lượng của SKU trong thời gian hữu hạn; có thể xác nhận, giải phóng, hủy hoặc hết hạn. |
| Phiếu nhập | Chứng từ dự kiến và ghi nhận hàng từ nhà cung cấp. |
| Hàng bị từ chối khi nhận | Hàng nhận thấy không đạt; không tăng tồn bán được, cần xử lý với nhà cung cấp. |
| Điều chỉnh tồn | Sửa số tồn sau kiểm kê/sai lệch với lý do và lịch sử. |
| Phân bổ tồn | Chia số có thể bán chung thành phần dự kiến công bố cho từng listing/kênh. |
| Mục tiêu kênh | Số lượng dự định kênh sẽ thể hiện sau khi hoàn tất đồng bộ. |
| Đã gửi | Số lượng/yêu cầu đã chuyển tới kênh; chưa chứng minh kênh đang thể hiện đúng. |
| Kênh báo lại | Số quan sát được từ kênh sau khi đọc lại. |
| Đã xác minh | Kết quả được kiểm tra lại và khớp với mục tiêu trong phạm vi quan sát. |
| Sai lệch (drift) | Chênh lệch giữa số/trạng thái mong đợi với số/trạng thái kênh báo lại. |
| Đơn nội bộ | Đơn hình thành từ bán tại quầy hoặc thao tác trực tiếp trong cửa hàng. |
| Đơn kênh | Đơn phát sinh trên kênh ngoài, được nhận và đối chiếu với SKU nội bộ. |
| Sự kiện đơn đến | Thông tin kênh gửi hoặc hệ thống đọc được về việc tạo/hủy/cập nhật đơn. |
| Chờ xử lý (quarantine) | Sự kiện đơn chưa đủ điều kiện ghi thành đơn nội bộ; giữ lại để sửa nguyên nhân và xử lý lại. |
| Chống lặp | Một thao tác/sự kiện gửi lại cùng nội dung không tạo tác động kinh doanh lần hai. |
| Xác nhận thanh toán thủ công | Nhân viên ghi nhận đã kiểm chứng tiền bằng cách khác; không phải chứng từ quyết toán của cổng thanh toán. |
| Giao hàng | Tiến trình chuẩn bị, gửi và giao hàng; độc lập với trạng thái đã trả tiền. |
| Trả hàng | Tiến trình khách yêu cầu và cửa hàng nhận/kiểm tra hàng sau bán. |
| Hoàn tiền | Dòng tiền trả cho khách; không tự xảy ra chỉ vì đã nhận hàng trả. |
| Nhu cầu đã ghi nhận | Lượng bán trong lịch sử có trong cửa hàng. |
| Dự báo nhu cầu | Ước lượng lượng có thể bán trong một kỳ tương lai, kèm khoảng bất định. |
| Dữ liệu mẫu | Số liệu dựng để minh họa giao diện, không phải dữ liệu vận hành. |
| Giả lập | Công cụ tái tạo tình huống đơn/kênh để thử nghiệm; không phải tài khoản marketplace thật. |

## 2. Các câu hỏi chưa được chốt

Không tự biến câu hỏi ở bảng thành yêu cầu đã được phê duyệt. Agent tiếp nhận có thể tiếp tục các phần độc lập, nhưng cần câu trả lời của chủ dự án trước khi đóng phạm vi nghiệm thu liên quan.

| ID | Câu hỏi cần quyết định | Vì sao ảnh hưởng bàn giao | Người xác nhận phù hợp |
|---|---|---|---|
| D-01 | Một marketplace thử nghiệm cộng POS đã đủ yêu cầu “đa kênh”, hay phải có từ hai marketplace trở lên? Kênh nào là kênh chính? | Quyết định số vòng nghiệm thu thật và mức hoàn thành đồ án. Tài liệu phạm vi tháng 9 đặt câu hỏi này nhưng không có phản hồi chốt trong hồ sơ đã đọc. | Chủ dự án/người hướng dẫn. |
| D-02 | Màn Tổng quan và Cài đặt phải hoạt động trên dữ liệu/quy trình thật, hay được bàn giao rõ là minh họa? | Hai màn hiện dùng dữ liệu mẫu; không thể vừa ghi “đã hoàn thành quản trị” vừa giữ trạng thái này. | Chủ dự án/PM. |
| D-03 | Mức AI nào bắt buộc: hiển thị dự báo có điều kiện, cho người bán chọn mô hình theo tính năng như kế hoạch cũ, và/hoặc đo chất lượng trên dữ liệu cửa hàng thật? Ngưỡng chấp nhận là gì? | Màn hiện chỉ xem trạng thái mô hình; tên đồ án gắn AI nhưng kết quả mô phỏng không thay thế nghiệm thu giá trị kinh doanh thực. | Chủ dự án/người hướng dẫn. |
| D-04 | Android và iOS đều phải được cài/chạy và ghi bằng chứng, hay chỉ cần khả năng đóng gói? | Ảnh giao diện trong trình duyệt cỡ điện thoại không xác nhận bản ứng dụng trên thiết bị. | Chủ dự án/người hướng dẫn. |
| D-05 | Xuất/hẹn gửi báo cáo, mời/đổi vai trò, thông báo và cấu hình cửa hàng/kho có nằm trong kết quả cuối không? | Hiện các điều khiển đó còn khóa hoặc minh họa; cần quyết định làm thật hoặc bỏ khỏi cam kết. | Chủ dự án/PM. |
| D-06 | KPI thành công đo bằng gì và trên tập dữ liệu nào: sai lệch tồn, thời gian xử lý đơn, tỷ lệ đơn phải đối soát, chất lượng dự báo? | Hồ sơ chưa có ngưỡng định lượng được phê duyệt, nên không thể kết luận “cải thiện X%”. | Chủ dự án/người hướng dẫn. |
| D-07 | Các mốc 29/11, 06/12, 13/12 và 24/12 trong kế hoạch cũ còn áp dụng không? | Phụ thuộc kênh, mobile và AI có thể làm thay đổi thứ tự ưu tiên hoặc nội dung bản nộp; không nên giao việc theo tiến độ snapshot cũ. | Chủ dự án/PM. |

## 3. Nguyên tắc cho agent nhận việc tiếp theo

1. Bắt đầu từ [phạm vi và đích](01-san-pham-va-pham-vi.md), sau đó đối chiếu [trạng thái](04-danh-muc-chuc-nang.md); đừng lấy một màn hình có nút làm bằng chứng chức năng đã chạy thật.
2. Mỗi yêu cầu mới cần ghi: vai trò, điều kiện bắt đầu, thao tác, kết quả mong đợi, ngoại lệ, ảnh hưởng tới tồn/đơn/tiền/kênh và bằng chứng hoàn tất.
3. Với việc liên quan kênh, tách **khả năng của sản phẩm**, **quyền/môi trường đang có**, **kết quả kênh đã xác nhận**. Tên Shopee/TikTok/Lazada trong mẫu hoặc đề xuất cũ không làm chúng thành connector hiện tại.
4. Với việc liên quan AI, chỉ dùng chữ **dự báo** cho kết quả tương lai có nguồn; số bán 28 ngày là lịch sử. Không đưa hành động tự đổi tồn/giá/đơn vào phạm vi nếu chưa có quyết định mới.
5. Khi dự án có thay đổi mới, cập nhật ngày chốt, ma trận chức năng, bộ nghiệm thu và câu hỏi còn mở cùng lúc. Tài liệu này mô tả mốc `18e0c9b`, không tự cập nhật theo nhánh làm việc.
