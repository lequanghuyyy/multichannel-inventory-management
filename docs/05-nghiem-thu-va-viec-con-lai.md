# 05 — Nghiệm thu và việc còn lại

## 1. Định nghĩa “hoàn thành” ở góc nhìn BA/PM

Một năng lực chỉ được tính là hoàn thành khi **người đúng vai trò thực hiện được luồng chính**, trường hợp sai/không chắc kết quả được xử lý rõ, dữ liệu sau thao tác nhất quán và có bằng chứng từ đúng nguồn. Với kênh ngoài, phải phân biệt “sản phẩm có luồng thực hiện” với “cửa hàng thử nghiệm đã được cấp quyền và kênh đã xác nhận kết quả”. Với AI, phải phân biệt kết quả mô phỏng với kết quả trên dữ liệu cửa hàng.

Không dùng số liệu mẫu ở Tổng quan/Cài đặt, đơn giả lập, hoặc kiểm tra giao diện kích thước điện thoại để thay bằng chứng vận hành thật của các phạm vi tương ứng.

## 2. Bộ kịch bản nghiệm thu nghiệp vụ

Đây là các kịch bản agent tiếp nhận có thể biến thành checklist kiểm thử/bàn giao. Cột “hiện tại” chỉ cho biết mức bằng chứng đã thấy trong dự án, không thay một lần chạy nghiệm thu mới.

| ID | Kịch bản và kết quả phải thấy | Hiện tại |
|---|---|---|
| AC-01 | **Vai trò:** Staff đăng nhập và bán/nhập hàng được; không tạo sản phẩm, điều chỉnh tồn hay ghi kênh như Admin. Hết phiên phải quay về đăng nhập và không để thao tác ghi tiếp. | Luồng đã có. |
| AC-02 | **Danh mục:** Admin tạo sản phẩm hai biến thể khác SKU, giá và ảnh; sản phẩm là nháp, tồn 0. Nhập tệp có một dòng sai thì không có dòng nào được ghi. | Luồng đã có. |
| AC-03 | **Nhận hàng:** Phiếu dự kiến 10, nhận 6 đạt và 2 bị từ chối; chỉ 6 tăng tồn, 2 có lý do/xử lý riêng, 2 còn chờ. Nhận đợt sau hoặc kết thúc thiếu phải giữ lịch sử rõ. | Luồng đã có. |
| AC-04 | **Điều chỉnh:** Admin xem trước thay đổi nhiều SKU; một dòng không hợp lệ hoặc số tồn đã đổi thì không ghi một phần. Gửi lại cùng thao tác không cộng/trừ lần nữa. | Luồng đã có. |
| AC-05 | **Giữ hàng:** Tồn 10, giữ 2, đệm 1 → có thể bán 7. Xác nhận hàng đã giữ làm tồn 8, giữ 0, số bán được vẫn 7. Hủy/hết hạn giải phóng đúng một lần; hai người tranh đơn vị cuối chỉ một người thành công. | Quy tắc/đường xử lý đã có; màn tạo/quản lý giữ thủ công chưa hoàn chỉnh. Cần chốt có phải luồng người bán cần bàn giao hay chỉ phục vụ đơn và xử lý nền. |
| AC-06 | **POS:** Thu ngân thấy giá/tồn đổi trước xác nhận và phải duyệt lại giỏ; bán khi online, tạo đúng một đơn và chỉ báo đã trả tiền sau khi ghi nhận thành công. Mất phản hồi không tạo đơn thứ hai. Dữ liệu mẫu/offline không cho bán. | Luồng đã có; thanh toán là ghi nhận nội bộ. |
| AC-07 | **Đơn nội bộ:** Đơn đi đúng thứ tự đặt → xác nhận → đóng gói → gửi → giao; chỉ hủy trước gửi và lưu lý do. Bàn giao hàng loạt từ nhóm có một đơn sai trạng thái phải bị từ chối cả nhóm. Kết quả giao lô chỉ là trạng thái nội bộ, không được hiển thị như kênh đã xác nhận. | Luồng đã có; xác minh từ kênh là bước riêng. |
| AC-08 | **Trả hàng:** Đơn đã giao trả một phần; chỉ lượng thực nhận và được đánh giá bán được mới cộng kho. Hàng hỏng không cộng kho. Không xuất hiện thông báo đã hoàn tiền nếu chưa có bằng chứng hoàn tiền. | Luồng trả đã có; hoàn tiền tự động ngoài phạm vi. |
| AC-09 | **Ghép SKU và nhận đơn kênh:** Một dòng listing chưa ghép khiến cả sự kiện chờ xử lý và kho chưa đổi; sau khi ghép đúng, xử lý lại tạo một đơn. Sự kiện trùng/hủy đến sai thứ tự không trừ/cộng tồn hai lần. | Luồng đã có; nghiệm thu kênh thật còn phụ thuộc môi trường. |
| AC-10 | **Công bố sản phẩm:** Admin xem trước tình trạng sản phẩm/kênh, tạo bản nháp; chỉ gọi là “đang bán” khi kênh xác nhận. Trạng thái danh mục, công bố và đồng bộ tồn hiển thị tách biệt. Thiếu quyền/kết nối phải đưa lý do xử lý. | Luồng có điều kiện; chưa có bằng chứng hoàn tất trên mọi kênh. |
| AC-11 | **Phân bổ tồn:** Admin xem trước và xác nhận kế hoạch; tổng mục tiêu các kênh không vượt số có thể bán. Chuyển phần tồn A → B phải giảm/xác minh A trước khi tăng B; nếu có đơn chưa xử lý hoặc số kênh đổi ngoài hệ thống thì dừng và hiện ngoại lệ. | Quy tắc xử lý đã có; màn Admin chưa có luồng kế hoạch hoàn chỉnh, ghi/đọc lại trên kênh thật cần nghiệm thu. |
| AC-12 | **Đồng bộ/đối soát:** Người bán phân biệt mục tiêu, đã gửi, kênh báo lại và chênh lệch; thất bại được thử lại có lịch sử; mất xác nhận không bị trình bày là hoàn tất. | Luồng đã có; bằng chứng live tùy kênh. |
| AC-13 | **Báo cáo:** Kỳ 7/30/90 ngày và bộ lọc thay đổi số liệu đúng phạm vi. Giá trị đơn không được gọi là tiền đã thu; loại tiền ngoài không cộng mù vào VND. | Báo cáo dữ liệu thật đã có; xuất/hẹn gửi trên màn chưa có. |
| AC-14 | **AI:** Chưa cấu hình nguồn dự báo thì vẫn xem được nhu cầu đã ghi nhận và thông báo “không có dự báo”. Khi nguồn hoạt động, thấy kỳ, khoảng ước lượng, nguồn và SKU bị bỏ qua/từ chối. Khi nguồn đã cấu hình bị lỗi, không để thẻ minh họa bị hiểu là dự báo thật. Cảnh báo/gợi ý không tự sửa tồn. | Có luồng đọc thật; dự báo/giám sát có điều kiện. Khi lỗi có thể hiện thẻ mẫu; chưa đánh giá trên đơn/kênh thật. |
| AC-15 | **Tính trung thực của bản trình diễn:** Chỉ số Tổng quan, Cài đặt và thẻ đề xuất mẫu có nhãn minh họa hoặc được thay bằng dữ liệu thật theo phạm vi đã chốt. Không coi simulator là marketplace. | Các màn này hiện còn dữ liệu mẫu. |
| AC-16 | **Đa nền tảng nếu là tiêu chí đồ án:** Các luồng bán hàng thiết yếu được chạy trên thiết bị/môi trường Android và iOS tương ứng; kiểm tra trình duyệt điện thoại chỉ là bằng chứng giao diện. | Chưa có đủ bằng chứng native trong hồ sơ hiện có. |

## 3. Khoảng trống và phụ thuộc còn lại

| Ưu tiên | Việc cần chốt/làm | Lý do và đầu ra mong đợi |
|---|---|---|
| **P0 — quyết định phạm vi** | Chốt số kênh ngoài bắt buộc để nghiệm thu và kênh nào là kênh trình diễn chính. | Tài liệu phạm vi cũ còn câu hỏi “một marketplace + POS có đủ không”; không thấy phản hồi chốt. Đầu ra: một câu phạm vi được chủ dự án/người đánh giá xác nhận. |
| **P0 — bằng chứng kênh** | Chạy một vòng sản phẩm → ghép SKU → tồn → đơn → hủy/giao → đối soát trên cửa hàng thử đã chọn. | Hiện có nhiều năng lực trong sản phẩm nhưng chưa có một bằng chứng đầu cuối được chốt cho mọi khâu. Ghi từng bước đã xác minh/đang chặn; không tự bật ghi trên môi trường ngoài khi chưa kiểm điều kiện. |
| **P0 — Shopify nếu chọn** | Giải quyết điều kiện nhận dữ liệu đơn được bảo vệ, tình trạng nháp/chưa theo dõi tồn của listing, sau đó kiểm lại quyền và luồng đơn/tồn. | Lần xác minh gần nhất có kết nối đọc nhưng chưa nghiệm thu ghi tồn/đơn thật. |
| **P0 — WooCommerce/eBay nếu chọn** | Với WooCommerce, nối và nghiệm thu import/checkout/thay đổi tồn trên cửa hàng phát triển; với eBay, nghiệm thu kết nối và thao tác trên Sandbox. | Có đường xử lý trong sản phẩm nhưng bằng chứng ghi/đơn thật tương ứng chưa đầy đủ. |
| **P0 — màn hình cam kết** | Chốt Tổng quan và Cài đặt có nằm trong phạm vi sử dụng thật không. Nếu có, cấp dữ liệu/quy trình thật và nghiệm thu; nếu không, ghi rõ là bản minh họa trong danh sách bàn giao. | Hiện hai khu vực là dữ liệu mẫu; không thể dùng làm bằng chứng quản trị cửa hàng. |
| **P0 — phân bổ kênh** | Nếu Admin phải tự điều chuyển phần tồn giữa kênh, hoàn thiện bước xem trước, xác nhận và theo dõi kế hoạch trong màn người bán. | Quy tắc xử lý đã có nhưng màn hiện tại chỉ thể hiện theo từng listing; AC-11 chưa thể được ký đạt từ giao diện. |
| **P1 — giữ hàng thủ công** | Chốt người bán có cần trực tiếp tạo/quản lý giữ chỗ hay chỉ cần hệ thống áp dụng trong luồng bán. Nếu cần, hoàn thiện màn thao tác và nghiệm thu AC-05 từ góc nhìn người bán. | Quy tắc giữ/hết hạn có nhưng màn hiện chỉ đọc tình trạng giữ. |
| **P1 — AI** | Chốt mức AI bắt buộc của đồ án, gồm việc người bán có phải chọn mô hình theo từng tính năng hay không; kiểm dự báo/cảnh báo với dữ liệu phù hợp, giữ nhãn nguồn, trạng thái lỗi và quyền quyết định của người bán. | Màn hiện xem được trạng thái mô hình nhưng chưa đổi mô hình. Nghiên cứu chủ yếu trên dữ liệu công khai/mô phỏng; khi nguồn dự báo lỗi, màn có thể chuyển sang thẻ mẫu mà không hiện nguyên nhân ngay tại khu dự báo. |
| **P1 — nền tảng di động** | Nếu Android/iOS là đầu ra bắt buộc, ghi bằng chứng cài/chạy luồng thiết yếu trên môi trường native tương ứng. | Bản dùng trên trình duyệt cỡ điện thoại chưa chứng minh ứng dụng native. |
| **P1 — thực nghiệm đồ án** | Chốt danh sách phép so sánh bắt buộc, tập dữ liệu, chỉ số và điều kiện chạy lại; đối chiếu từng EX01–EX08 với kết quả thật, kết quả chưa chạy và giới hạn. | Có hồ sơ nghiên cứu và mô phỏng, nhưng không thể suy toàn bộ chương trình thực nghiệm đã hoàn thành từ kế hoạch. |
| **P1 — số liệu/tiện ích** | Chốt việc xuất/hẹn gửi báo cáo, quản trị thành viên, thông báo và cấu hình kho/cửa hàng có là yêu cầu bàn giao không. | Nút hoặc màn minh họa hiện chưa tương ứng một quy trình sử dụng thật. |

P0/P1 ở đây là **thứ tự đề xuất để đóng đồ án**, không phải kế hoạch thời gian hoặc cam kết thêm chức năng đã được phê duyệt. Những việc ngoài phạm vi trong [tài liệu sản phẩm](01-san-pham-va-pham-vi.md) không tự đưa vào backlog.

## 4. Trình tự bàn giao đề xuất

1. **Chốt phạm vi và kịch bản trình diễn:** số kênh, vai trò, dữ liệu thật được phép dùng, mức AI và yêu cầu Android/iOS.
2. **Chốt chuỗi dữ liệu trung tâm:** danh mục → nhận hàng/điều chỉnh → POS/đơn → trả hàng → báo cáo. Ghi kết quả từng AC và ngoại lệ.
3. **Chốt kênh được chọn:** kết nối/ghép SKU, công bố, phân bổ, đơn, trạng thái thanh toán/giao hàng và đối soát. Lưu bằng chứng kênh xác nhận riêng với kết quả nội bộ.
4. **Chốt phần hiển thị:** mọi số liệu mẫu có nhãn; báo cáo và AI có nguồn/phạm vi/giới hạn rõ; thử các tình huống không có dữ liệu, thiếu quyền và mất kết nối.
5. **Ký nghiệm thu:** đánh dấu từng AC là đạt, đạt có điều kiện, chưa đạt hoặc ngoài phạm vi đã chốt. Ghi rõ ngày/môi trường và điểm chưa kiểm chứng.


## 6. Những rủi ro cần nói đúng khi báo cáo

- Đồng bộ nhiều kênh có độ trễ. Phân bổ và đối soát giảm rủi ro nhưng không chứng minh tuyệt đối không có đơn vượt số bên ngoài.
- Xác nhận thanh toán thủ công và bằng chứng kênh không phải xác nhận quyết toán tiền từ ngân hàng.
- Trả hàng có thể nhập lại tồn, nhưng hoàn tiền là việc riêng và chưa được OctoFlow tự thực hiện.
- Kết quả thử nghiệm AI trên dữ liệu công khai/mô phỏng không đại diện cho chất lượng trên cửa hàng thật.
- Các thay đổi đang nằm trong thư mục làm việc nhưng chưa ghi nhận chưa thuộc baseline nghiệm thu 08/11; kiểm lại trạng thái khi lập bản bàn giao sau.
