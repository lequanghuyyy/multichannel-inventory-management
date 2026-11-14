import { ApiRequestError, presentApiError } from '../../core/api-error';

const messages: Record<string, string> = {
  CHANNEL_NOT_CONNECTED: 'Kênh chưa kết nối hoặc chưa được xác minh. Hãy kiểm tra cài đặt kết nối.',
  CHANNEL_CONNECTION_ERROR: 'Kết nối kênh đang gặp sự cố. Hãy kiểm tra kết nối rồi tải lại trạng thái.',
  FORBIDDEN: 'Tài khoản hiện tại không có quyền thực hiện thao tác này.',
  PRODUCT_NOT_FOUND: 'Không tìm thấy sản phẩm trong OctoFlow. Tải lại danh sách rồi thử lại.',
  PRODUCT_NOT_PUBLISHABLE: 'Sản phẩm đang ngừng kinh doanh trong OctoFlow. Hãy mở lại sản phẩm trước khi đăng.',
  PRODUCT_VARIANTS_REQUIRED: 'Sản phẩm cần có ít nhất một mẫu mã đang hoạt động.',
  PRODUCT_VARIANTS_INCOMPLETE: 'Một số mẫu mã còn thiếu SKU, thuộc tính hoặc giá bắt buộc.',
  PRODUCT_PUBLIC_IMAGE_URL_REQUIRED: 'Ảnh cần có đường dẫn HTTPS công khai mà eBay có thể truy cập.',
  MAPPING_CONFLICT: 'Liên kết sản phẩm hoặc SKU trên kênh đang có xung đột. Hãy kiểm tra liên kết trước khi gửi lại.',
  REMOTE_OWNERSHIP_CONFLICT: 'Không thể xác minh listing hiện có thuộc đúng sản phẩm này. Hãy đối soát liên kết trước khi gửi lại.',
  BUSINESS_POLICY_MISSING: 'Tài khoản thiếu chính sách thanh toán, giao hàng hoặc đổi trả cần thiết.',
  INVENTORY_LOCATION_MISSING: 'Chọn một địa điểm gửi hàng đang bật trong tài khoản eBay.',
  CATEGORY_ASPECTS_INVALID: 'Một số thuộc tính bắt buộc của danh mục eBay chưa hợp lệ. Kiểm tra lại thông tin danh mục.',
  EBAY_PRODUCT_WRITE_DISABLED: 'Tài khoản hiện chưa cho phép OctoFlow tạo hoặc cập nhật sản phẩm trên eBay.',
  WOOCOMMERCE_PRODUCT_WRITE_DISABLED: 'Tài khoản hiện chưa cho phép OctoFlow cập nhật sản phẩm WooCommerce.',
  STATE_CONFLICT: 'Trạng thái sản phẩm đã thay đổi. Tải lại danh sách và kiểm tra kết quả trước khi gửi lại.',
  PRODUCT_VERSION_STALE: 'Thông tin Core đã thay đổi trong lúc bạn cấu hình. Tải lại sản phẩm rồi kiểm tra lại.',
  IDEMPOTENCY_CONFLICT: 'Yêu cầu trước đó chưa được đối soát. Kiểm tra trạng thái trên kênh trước khi thử lại.',
};

export function productWriteErrorForCode(code?: string): string | undefined {
  return code ? messages[code] : undefined;
}

export function productWriteErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiRequestError) return messages[error.code] ?? presentApiError(error).detail;
  return fallback;
}
