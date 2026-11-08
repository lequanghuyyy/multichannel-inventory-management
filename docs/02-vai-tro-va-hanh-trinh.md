# 02 — Vai trò và hành trình nghiệp vụ

## 1. Vai trò

| Công việc | Admin | Staff | Ghi chú nghiệp vụ |
|---|---:|---:|---|
| Xem danh mục, tồn, đơn, phiếu nhập, kênh, báo cáo | Có | Có | Phạm vi cơ sở hiện chỉ có một cửa hàng logic; chưa có phân vùng quyền theo từng cửa hàng. |
| Tạo/sửa sản phẩm, biến thể, giá, ảnh; nhập danh mục | Có | Không | Danh mục mới không tự sinh hàng vật lý. |
| Điều chỉnh số tồn sau kiểm kê | Có | Không | Phải có lý do; thay đổi hàng loạt cần xem trước. |
| Tạo, nhận, xử lý sai lệch và đóng phiếu nhập | Có | Có | Chỉ phần hàng được chấp nhận mới làm tăng tồn. |
| Bán tại quầy và xử lý đơn/trả hàng nội bộ | Có | Có | Theo trạng thái và điều kiện của từng đơn; lệnh bàn giao trên kênh ngoài có quyền riêng. |
| Giảm giá tại quầy | Có | Không | Cần lý do ghi nhận. |
| Xem số phân bổ tồn theo listing | Có | Có | Màn hiện tại chưa có bước xem trước một kế hoạch điều chuyển liên kênh hoàn chỉnh. |
| Quản lý ghép SKU/công bố và thử lại thao tác kênh | Có | Không | Còn phụ thuộc kết nối, quyền kênh và trạng thái đủ điều kiện. |
| Gửi xác nhận bàn giao lên Shopify | Có điều kiện | Không | Ngoài trạng thái đơn, cần quyền Admin và điều kiện của Shopify. |
| Thực hiện kế hoạch điều chuyển phân bổ liên kênh | Chưa có màn thao tác | Không | Quy tắc xử lý đã có; chưa là luồng người bán hoàn chỉnh. |
| Dùng công cụ giả lập đơn | Có | Không | Chỉ dành cho thử nghiệm, không phải vận hành kênh thật. |

**Vai trò khác:** kênh bán chuyển đơn và xác nhận trạng thái sản phẩm/tồn; công việc nền xử lý giữ hàng hết hạn, chuyển thay đổi sang kênh và đối soát. Chúng không phải người dùng đăng nhập. Màn Cài đặt đang hiển thị thành viên mẫu; chưa có quy trình mời nhân viên hoặc đổi vai trò trực tiếp từ màn đó.

## 2. Hành trình A — Chuẩn bị sản phẩm để bán

**Mục tiêu:** một biến thể bán được có thông tin rõ ràng và mã SKU nội bộ duy nhất.

1. Admin tạo sản phẩm với tên, nhóm, mô tả, thương hiệu và những thuộc tính cần dùng; thêm một hoặc nhiều biến thể (ví dụ màu, cỡ), SKU, giá và ảnh.
2. Sản phẩm được tạo ở dạng **nháp**, số tồn ban đầu bằng **0**. Nhập danh mục bằng tệp cũng cần bước kiểm tra trước; một dòng sai phải ngăn ghi toàn bộ tệp.
3. Admin sửa giá/thông tin biến thể trên danh mục trung tâm. Thay đổi mô tả hoặc giá không được tự làm tăng/giảm tồn vật lý.
4. Nếu muốn bán trên kênh ngoài, Admin chọn kênh, kiểm thông tin bắt buộc, xem trước và tạo bản nháp hoặc thực hiện thao tác kênh được phép. Trạng thái sản phẩm ở danh mục, trạng thái công bố trên kênh và trạng thái đồng bộ tồn phải được nhìn riêng.

**Ngoại lệ cần xử lý:** trùng SKU, giá thiếu/sai loại tiền, biến thể chưa đủ dữ liệu, ảnh chưa phù hợp, sản phẩm đã được ghép với listing khác, hoặc kênh chưa sẵn sàng. Khi đó sản phẩm vẫn tồn tại trong danh mục nhưng không được báo là đã đăng bán thành công.

## 3. Hành trình B — Nhận hàng và quản lý tồn

**Mục tiêu:** ghi đúng hàng vật lý đã nhận và biết vì sao số tồn thay đổi.

1. Admin hoặc Staff lập phiếu nhập: nhà cung cấp, số tham chiếu, SKU, số dự kiến, đơn giá nhập nếu biết. Phiếu mới ở trạng thái **bản nháp** và có thể chỉnh trước khi nhận.
2. Khi hàng đến, nhân viên ghi từng lần nhận: số chấp nhận, số từ chối và lý do. Xem trước số tồn sau nhận trước khi xác nhận.
3. Phần chấp nhận tăng tồn. Phần từ chối được theo dõi để yêu cầu bù, nhận hàng bù, trả nhà cung cấp hoặc đóng xử lý. Có thể nhận nhiều đợt; nếu nhà cung cấp không giao đủ, ghi lý do và kết thúc sớm. Phiếu có thể kèm chứng từ, in và xuất danh sách để đối chiếu.
4. Nếu kiểm kê thấy lệch, Admin điều chỉnh tồn với lý do. Điều chỉnh nhiều SKU phải xem trước và chỉ xác nhận khi toàn bộ hợp lệ.
5. Người bán xem được tồn hiện tại, số đang giữ, số đệm, số có thể bán và lịch sử biến động theo SKU.

**Ngoại lệ cần xử lý:** số nhận vượt số dự kiến, số lượng âm, phiếu đã kết thúc, số tồn thay đổi kể từ lúc xem trước hoặc thao tác gửi lại sau khi phản hồi bị mất. Hệ thống phải giữ kết quả nhất quán, không cộng hàng hai lần.

## 4. Hành trình C — Chuẩn bị và vận hành nhiều kênh

**Mục tiêu:** mỗi kênh nhận đúng sản phẩm và phần tồn được phép bán của nó.

1. Admin kiểm tra kênh đang kết nối, môi trường thử nghiệm, quyền đọc/ghi và điều kiện của từng thao tác.
2. Ghép listing/biến thể trên kênh với đúng biến thể nội bộ. Mã SKU ngoài và mã SKU nội bộ không được tự xem là một nếu chưa xác minh.
3. Xem trước thao tác sản phẩm trên kênh. Một **bản nháp trên kênh** khác với **đang bán công khai**; việc chuyển trạng thái phải có xác nhận từ kênh.
4. Xem phần tồn khả dụng của SKU và phần dự kiến công bố cho từng listing. Quy tắc điều chuyển đã có: khi chuyển từ kênh A sang B, giảm phần ở A và xác minh trước khi tăng ở B. **Màn người bán chưa có bước thực hiện một kế hoạch liên kênh hoàn chỉnh**; đây là khoảng trống cần đóng nếu coi phân bổ thủ công là đầu ra.
5. Theo dõi số muốn gửi, số đã gửi, số kênh báo lại, lần đối soát và ngoại lệ. Số gửi đi chưa đủ để kết luận kênh đã nhận đúng.

**Ngoại lệ cần xử lý:** kênh ngắt kết nối, thiếu quyền, ghép SKU sai, listing chưa hoạt động, đơn từ kênh chưa xử lý, số kênh thay đổi ngoài hệ thống hoặc kết quả gửi không rõ. Tạm dừng thao tác liên quan và đưa vào danh sách cần đối soát. Độ trễ giữa các kênh nghĩa là không thể hứa tuyệt đối không có đơn vượt số kênh đang thấy.

## 5. Hành trình D — Bán tại quầy

**Mục tiêu:** thu ngân bán bằng giá và số lượng hiện hành.

1. Staff/Admin tìm SKU, chọn số lượng vào giỏ. Chỉ sản phẩm có giá, còn số có thể bán và cùng loại tiền mới được xác nhận.
2. Ngay trước khi bán, sản phẩm đọc lại giá và tồn. Nếu có thay đổi, thu ngân phải xem và chấp nhận lại; số tiền khách đưa hoặc xác nhận thanh toán ngoài trước đó không còn giá trị cho giỏ đã đổi.
3. Chọn thu tiền mặt (ghi số tiền nhận và tiền thừa) hoặc xác nhận đã tự kiểm chứng một khoản thanh toán ở nơi khác. Admin có thể giảm giá với lý do.
4. Tạo đơn trước. Sau khi thông tin đơn/giá trả về được đối chiếu, xác nhận thanh toán **nội bộ**. Chỉ báo hoàn tất khi trạng thái thanh toán đã được ghi nhận.

**Ngoại lệ cần xử lý:** không có kết nối/dữ liệu chỉ là mẫu thì không bán thật; thiếu tồn hoặc giá đổi thì xem lại giỏ; phản hồi tạo đơn/thanh toán bị mất thì tra lại cùng giao dịch trước khi thử tiếp. Đơn có thể đã được tạo và trừ kho dù bước xác nhận thanh toán vẫn chờ; thu ngân không được bấm tạo đơn mới để chữa tình huống này.

## 6. Hành trình E — Nhận và xử lý đơn kênh

**Mục tiêu:** đơn từ kênh trở thành một đơn nội bộ đúng SKU và không trừ hàng lặp.

1. Kênh gửi sự kiện tạo đơn hoặc hệ thống đọc lại đơn còn thiếu; nhận diện theo cửa hàng, kênh và mã đơn ngoài.
2. Từng dòng hàng phải khớp listing đã ghép, biến thể còn hiệu lực và điều kiện bán. Nếu **một** dòng không khớp, giữ toàn bộ sự kiện để xử lý, chưa tạo đơn hay trừ tồn.
3. Sự kiện hợp lệ tạo đơn, ghi nhận số hàng đã bán và thông báo thay đổi tồn cho các kênh còn lại. Gửi lại cùng sự kiện không được tạo tác động thứ hai.
4. Staff/Admin xử lý đơn theo thứ tự **đã đặt → xác nhận → đóng gói → đã gửi → đã giao**. Hủy chỉ được phép trước khi gửi. Bàn giao hàng loạt chỉ áp dụng cho nhóm đơn đều đã đóng gói; kết quả này **ghi trạng thái bàn giao nội bộ**, không tạo vận đơn/tracking và chưa chứng minh kênh ngoài đã xác nhận. Nhân viên có thể thêm ghi chú nội bộ và chứng từ; quyền xóa chứng từ thuộc Admin.
5. Với lệnh bàn giao/giao hàng gửi riêng lên kênh ngoài, chỉ Admin có quyền gửi một số lệnh như xác nhận bàn giao Shopify. Cần theo dõi kết quả kênh riêng với trạng thái bàn giao nội bộ; việc xếp xử lý tiếp chưa phải kênh đã xác minh.

**Ngoại lệ cần xử lý:** thiếu ghép SKU, sự kiện hủy đến trước sự kiện tạo, hủy sau khi đã gửi, hoặc kênh đã đổi trạng thái nhưng hệ thống chưa biết. Trường hợp cần xử lý được giữ lại để sửa và chạy lại, không tự suy đoán số tồn.

## 7. Hành trình F — Thanh toán, trả hàng và báo cáo

1. Trạng thái **đơn**, **giao hàng** và **thanh toán** là ba trục riêng. Giao hàng xong không tự đồng nghĩa tiền đã thu. Ghi nhận thanh toán thủ công là lời xác nhận của nhân viên; với đơn kênh, bằng chứng thanh toán do kênh cung cấp cần được nhìn theo nguồn.
2. Sau khi đơn đã giao, nhân viên có thể tạo yêu cầu trả cho từng SKU/số lượng hợp lệ. Sau khi nhận hàng thật, kiểm tình trạng: chỉ lượng còn bán được mới nhập lại kho. Hủy yêu cầu trước khi nhận, từ chối sau khi nhận và hoàn tiền là các kết quả khác nhau.
3. Xem báo cáo theo kỳ, kênh và nhóm hàng; phân biệt giá trị đơn với tiền đã xác nhận. Theo dõi bán hàng, SKU, tồn, kênh và đồng bộ.
4. Xem nhu cầu đã ghi nhận và, khi có tính năng AI sẵn sàng, xem dự báo/cảnh báo. Con người quyết định hành động; dự báo không được tự đổi tồn.

**Ngoại lệ cần xử lý:** hàng trả hỏng không tăng tồn; bằng chứng hoàn tiền của kênh không đồng nghĩa OctoFlow đã thực hiện chuyển tiền; dự báo vắng mặt không được thay bằng con số giả. Màn Tổng quan và Cài đặt hiện là minh họa, vì vậy phải kiểm báo cáo vận hành tại khu vực Báo cáo và các chứng từ tương ứng.
