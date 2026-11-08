# Hồ sơ bàn giao nghiệp vụ OctoFlow

**Ngày chốt nội dung:** 08/11/2026  
**Phạm vi đối chiếu:** mã đã ghi nhận đến commit `18e0c9b` và tài liệu trong dự án. Các thay đổi chưa ghi nhận trong thư mục làm việc không được tính là năng lực đã bàn giao.

## Dành cho agent tiếp nhận

Đọc lần lượt sáu tài liệu dưới đây. Sau đó agent có thể trả lời: sản phẩm phục vụ ai, người bán thao tác từ lúc tạo hàng đến sau bán ra sao, những số liệu nào là nguồn chuẩn, chức năng nào dùng được, và điều kiện nào còn phải hoàn tất trước khi tuyên bố dự án xong.

| Tài liệu | Nội dung cần nắm |
|---|---|
| [01 — Sản phẩm và phạm vi](01-san-pham-va-pham-vi.md) | Bài toán, giá trị, ranh giới và kết quả mong đợi khi hoàn thành. |
| [02 — Vai trò và hành trình](02-vai-tro-va-hanh-trinh.md) | Ai làm gì; các luồng nghiệp vụ từ tạo hàng đến xử lý sau bán. |
| [03 — Quy tắc nghiệp vụ](03-quy-tac-nghiep-vu.md) | Sản phẩm, tồn, phân bổ kênh, đơn, thanh toán, trả hàng và AI. |
| [04 — Danh mục chức năng](04-danh-muc-chuc-nang.md) | Ma trận năng lực hiện tại và đích nghiệm thu theo từng khu vực. |
| [05 — Nghiệm thu và việc còn lại](05-nghiem-thu-va-viec-con-lai.md) | Kịch bản kiểm tra, khoảng trống và thứ tự ưu tiên bàn giao. |
| [06 — Thuật ngữ và quyết định](06-thuat-ngu-va-quyet-dinh.md) | Từ điển chung và các câu hỏi sản phẩm chưa được chốt. |

## Cách đọc trạng thái

- **Đã có:** nghiệp vụ đã có đường thực hiện trong sản phẩm tại mốc đối chiếu. Nhãn này không có nghĩa đã được kiểm chứng trên môi trường vận hành thật.
- **Một phần:** quy tắc hoặc bước xử lý đã có nhưng người bán chưa hoàn tất được toàn luồng từ giao diện hiện tại.
- **Có điều kiện:** có luồng trong sản phẩm nhưng chỉ dùng được khi kênh, quyền, dữ liệu hoặc dịch vụ liên quan đã sẵn sàng và được xác minh.
- **Minh họa:** màn hình hoặc số liệu mẫu, không được dùng để ra quyết định vận hành.
- **Chưa có:** chưa có luồng nghiệp vụ sử dụng được trong sản phẩm.
- **Cần quyết định:** ý tưởng hoặc phạm vi chưa có xác nhận của chủ dự án; không tự coi là cam kết triển khai.

**Quy tắc bàn giao:** luôn phân biệt ba việc: sản phẩm *có thể thực hiện*, môi trường hiện tại *đã bật và có quyền thực hiện*, và thao tác bên ngoài *đã được quan sát/xác minh*. Không suy từ giao diện mẫu hay dữ liệu giả lập ra kết quả kinh doanh thật.

## Nguồn đối chiếu chính

- [Mục tiêu và ranh giới dự án](../../README.md), [SRS ngày 31/10](../SRS.md).
- [Quy tắc vòng đời tồn](../specs/inventory-lifecycle.md), [phân bổ tồn đa kênh](../specs/baseline-polling-allocation.md), [sự kiện đơn từ kênh](../specs/inbound-order-events.md).
- [Đơn hàng và bán tại quầy](../audits/2026-10-26-orders-pos-inline-checkout.md), [nghiệm thu quản lý đơn](../audits/order-management-completion-acceptance.md), [luồng công bố sản phẩm](../audits/2026-10-31-channel-publication-workflow.md).
- [Hồ sơ Shopify](../integrations/shopify-integration.md), [WooCommerce](../integrations/woocommerce-integration.md), [eBay Sandbox](../integrations/ebay-sandbox-integration.md), [hồ sơ AI](../ai/MODEL_CARDS.md).
- [Bảng kế hoạch đồ án](../plan/Plan.xlsx): nguồn cho mốc dự kiến và phần thực nghiệm. Bảng này có snapshot trạng thái cũ nên không dùng số việc “đã xong” của nó thay cho ma trận hiện tại.

Một số hồ sơ cũ mô tả trạng thái tại ngày viết và đã lạc hậu so với sản phẩm ngày 08/11. Khi có mâu thuẫn, kiểm tra hành vi ở phiên bản đang bàn giao và cập nhật lại ma trận chức năng, không chép nguyên kết luận cũ.
