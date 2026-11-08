# 03 — Quy tắc nghiệp vụ và trạng thái

Các mã **BR** là nhãn tham chiếu trong bộ hồ sơ này để agent tiếp nhận liên kết yêu cầu với nghiệm thu. Chúng không tạo thêm cam kết ngoài phạm vi đã xác lập.

## A. Sản phẩm và nhận hàng

| Mã | Quy tắc |
|---|---|
| BR-01 | Một sản phẩm có thể có nhiều biến thể; biến thể bán được có SKU nội bộ. SKU không được phân tích chuỗi để suy màu/cỡ; thông tin đó là thuộc tính riêng. |
| BR-02 | Tạo sản phẩm hoặc nhập danh mục tạo thông tin bán hàng, **không** tạo tồn vật lý. Sản phẩm mới là nháp, tồn bằng 0. |
| BR-03 | Tệp nhập danh mục phải được kiểm tra trước. Có dòng không hợp lệ thì không ghi phần hợp lệ rồi bỏ phần lỗi. |
| BR-04 | Thay đổi giá, mô tả, ảnh hoặc trạng thái sản phẩm không được âm thầm cộng/trừ tồn. Mỗi kênh có trạng thái công bố và ghép listing riêng. |
| BR-05 | Phiếu nhập gồm số dự kiến, số đã nhận/chấp nhận, số từ chối và số còn lại theo SKU. Chỉ lượng được chấp nhận mới tăng tồn. Đơn giá nhập có thể chưa biết; 0 là một giá trị khác với để trống. |
| BR-06 | Phiếu nhập có thể là nháp, nhận một phần, hoàn tất, kết thúc sớm hoặc hủy. Không nhận vượt số dự kiến. Hàng bị từ chối cần được xử lý riêng, không tự biến thành hàng bán được. |

## B. Tồn kho trung tâm

Đối với một biến thể:

> **Số có thể bán = Tồn vật lý − Đang giữ − Tồn đệm an toàn.**

Ba số đầu không âm; tổng **đang giữ + đệm** không được lớn hơn tồn vật lý. Ví dụ tồn 10, giữ 2, đệm 1 thì còn bán được 7. Số có thể bán là kết quả tính từ trạng thái hiện hành, không phải một con số người dùng tự sửa độc lập.

| Mã | Quy tắc |
|---|---|
| BR-07 | Số tồn trung tâm chỉ đổi qua nghiệp vụ nhận hàng, điều chỉnh, bán, hủy trước giao hoặc nhập lại hàng trả đủ điều kiện. Số hiển thị trên một kênh không phải số tồn vật lý trung tâm. |
| BR-08 | Điều chỉnh tồn cần lý do. Điều chỉnh hàng loạt phải xem trước toàn bộ; nếu một dòng sai hoặc số tồn đã đổi, không ghi một phần. |
| BR-09 | Giữ hàng làm tăng số **đang giữ**, không giảm tồn vật lý. Xác nhận bán hàng đã giữ làm giảm đồng thời tồn vật lý và số đang giữ; không trừ số có thể bán lần thứ hai. |
| BR-10 | Giải phóng, hủy hoặc hết hạn một giữ hàng đang hiệu lực chỉ giảm số đang giữ. Giữ hàng đã xác nhận/hủy/hết hạn không quay về đang giữ. Tại đúng thời điểm hết hạn, quy tắc hết hạn thắng. |
| BR-11 | Một yêu cầu nghiệp vụ gửi lại với cùng mã nhận diện và cùng nội dung chỉ có một tác động; cùng mã mà đổi nội dung phải bị từ chối. Không tự tạo giao dịch mới khi kết quả trước chưa rõ. |
| BR-12 | Không cho bán lượng vượt số được phép. Một đơn nhiều dòng phải thành công toàn bộ hoặc không dòng nào tác động tồn. |

### Vòng đời giữ hàng

| Thao tác | Điều kiện chính | Tồn vật lý | Đang giữ | Hệ quả với số có thể bán |
|---|---|---:|---:|---|
| Giữ `q` | `q > 0`, còn ít nhất `q` có thể bán | Giữ nguyên | Tăng `q` | Giảm `q` |
| Xác nhận lượng đã giữ | Giữ hàng còn hiệu lực, chưa hết hạn | Giảm `q` | Giảm `q` | Không giảm lần hai |
| Giải phóng / hủy / hết hạn | Giữ hàng còn hiệu lực, đúng loại thao tác | Giữ nguyên | Giảm `q` | Tăng `q` |

Giữ hàng có hạn dùng; mặc định 15 phút trong đặc tả hiện hành, có giới hạn cấu hình. Giữ hàng cho một đơn khác với đề xuất “khóa mềm” cho cả phiên livestream. Khóa phiên chưa phải nghiệp vụ vận hành đã tích hợp.

## C. Ghép sản phẩm, công bố và phân bổ kênh

| Mã | Quy tắc |
|---|---|
| BR-13 | Một listing ngoài phải liên kết với đúng biến thể nội bộ và đúng kênh/cửa hàng. Không tự lấy SKU ngoài thay SKU nội bộ hoặc tự ghép khi có nhiều khả năng. |
| BR-14 | **Nháp**, **đang bán**, **ngừng bán**, **lỗi/cần xử lý** trên kênh là trạng thái của kênh. Chúng độc lập với sản phẩm trong danh mục trung tâm và với tình trạng đồng bộ tồn. |
| BR-15 | Mỗi thao tác ghi lên kênh chỉ được thực hiện khi kênh đã kết nối, có quyền và thông tin sản phẩm/listing đủ điều kiện. Thao tác quản trị do người dùng khởi phát cần bước xem trước/xác nhận theo luồng tương ứng; đồng bộ tự động vẫn được phép chạy khi đã bật và vượt qua các kiểm tra. Có nút thao tác không có nghĩa thao tác được phép chạy. |
| BR-16 | Tổng số tồn **dự kiến công bố** trên các listing đủ điều kiện không vượt số có thể bán chung. Tồn đệm chỉ trừ một lần trước khi phân bổ. |
| BR-17 | Khi chuyển phần tồn từ kênh A sang B, giảm và xác minh phần ở A trước khi tăng B. Nếu thông tin đã thay đổi, đơn chưa xử lý hoặc kết quả kênh không rõ, dừng/đưa vào đối soát thay vì tiếp tục theo kế hoạch cũ. |
| BR-18 | Phân biệt: **mục tiêu** muốn gửi, **đã gửi**, **kênh báo lại**, và **đã xác minh**. Gửi thành công một yêu cầu chưa đủ để kết luận số trên kênh đã đúng; cần đọc lại hoặc bằng chứng tương đương. |
| BR-19 | Phân bổ làm giảm rủi ro nhưng không xóa hoàn toàn khoảng trễ. Kênh ngoài có thể bán theo số cũ trước khi nhận số mới; đơn và chênh lệch phát sinh phải có đường xử lý rõ. |

Ví dụ: tồn 20, giữ 3, đệm 2 → có thể bán 15. Có thể dự kiến 6 cho Shopify và 9 cho các kênh khác; không gửi 15 cho *mỗi* kênh. Số kênh đã báo lại có thể tạm khác 6/9, vì vậy trạng thái đồng bộ cần xuất hiện bên cạnh mục tiêu.

## D. Đơn, thanh toán và trả hàng

| Mã | Quy tắc |
|---|---|
| BR-20 | Đơn từ kênh chỉ được tạo khi **mọi** dòng hàng ghép đúng listing, biến thể còn hiệu lực và đủ điều kiện bán. Dòng lỗi giữ toàn sự kiện để xử lý lại; không trừ tồn một phần. |
| BR-21 | Nhận lại cùng sự kiện/đơn ngoài không tạo đơn hoặc cộng/trừ tồn lần hai. Sự kiện hủy đến trước tạo đơn được giữ chờ; hủy sau khi đã gửi/giao không tự chuyển thành hủy đơn nội bộ. |
| BR-22 | Luồng trạng thái cơ sở: **đã đặt → xác nhận → đóng gói → đã gửi → đã giao**. Hủy là nhánh trước khi gửi; trạng thái và lịch sử phải lưu được lý do/người thao tác khi có. |
| BR-23 | Trạng thái đơn, giao hàng và thanh toán độc lập. Xác nhận thanh toán thủ công chỉ là lời ghi nhận của nhân viên; không chứng minh cổng thanh toán đã chuyển tiền. Bàn giao hàng loạt chỉ áp dụng cho đơn đều đã đóng gói và chỉ xác nhận trạng thái **nội bộ**; không tự tạo vận đơn/tracking hoặc chứng minh kênh ngoài đã nhận. |
| BR-24 | Trả hàng là luồng riêng sau khi đã giao: yêu cầu → nhận thực tế → kiểm tra → hoàn tất hoặc từ chối; có thể hủy yêu cầu trước khi nhận. Chỉ phần được đánh giá còn bán được mới nhập lại tồn. |
| BR-25 | Hoàn tiền không tự xảy ra khi hủy/trả hàng. Nếu kênh có bằng chứng hoàn tiền, đó là trạng thái quan sát từ kênh, không phải lệnh chuyển tiền của OctoFlow. |

**Tiền và báo cáo:** giá trị tiền được giữ theo loại tiền của giao dịch. Không cộng các loại tiền khác nhau thành một tổng nếu chưa có quy tắc quy đổi được chốt. “Giá trị đơn” có thể gồm đơn chưa trả tiền; “đã xác nhận thanh toán thủ công” vẫn không đồng nghĩa tiền đã được ngân hàng quyết toán. Số bán ròng cần tính đến hàng trả đã nhận thật, không dựa riêng vào yêu cầu trả.

## E. Dữ liệu, báo cáo và AI

| Mã | Quy tắc |
|---|---|
| BR-26 | Dữ liệu thật, dữ liệu mẫu và dữ liệu giả lập phải được gắn nhãn riêng. Không đổi lỗi tải dữ liệu thành số 0 hay trạng thái thành công. |
| BR-27 | Báo cáo theo kỳ/kênh/nhóm phải nói rõ phạm vi của từng chỉ số. Chỉ số đồng bộ và độ lệch có thể tính trên toàn cửa hàng dù đang lọc báo cáo bán hàng. |
| BR-28 | Nhu cầu **đã ghi nhận** khác với **dự báo tương lai**. Khi chưa cấu hình nguồn dự báo, chỉ hiển thị nhu cầu đã ghi nhận và thông báo không có dự báo. Khi nguồn đã cấu hình gặp lỗi, phải giữ rõ trạng thái lỗi và không biến thẻ mẫu thành dự báo thật. |
| BR-29 | Dự báo phải cho biết kỳ, SKU, khoảng ước lượng, nguồn, các SKU thiếu dữ liệu/bị từ chối và giới hạn. Gợi ý tồn đệm hoặc cảnh báo đồng bộ chỉ là thông tin hỗ trợ; không tự sửa tồn, giá, listing hoặc đơn. |

Các nghiên cứu trên dữ liệu mô phỏng/công khai không chứng minh AI đã cải thiện doanh số hoặc giảm sai lệch trên cửa hàng thật. Điều đó cần phép đo riêng sau khi có dữ liệu thực và tiêu chí được chủ dự án chấp thuận.
