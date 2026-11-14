import type { StatusBadgeProps } from '../../../components/common/StatusBadge';

type Tone = NonNullable<StatusBadgeProps['tone']>;

const stateLabels: Record<string, string> = {
  not_exported: 'Chưa đăng Lazada',
  queued: 'Đã tiếp nhận yêu cầu',
  creating: 'Đang tạo sản phẩm trên Lazada',
  create_submitted: 'Đã gửi tạo sản phẩm',
  mapping_verification_pending: 'Đang xác minh SKU',
  qc_pending: 'Chờ Lazada duyệt',
  qc_approved: 'Lazada đã duyệt',
  qc_rejected: 'Lazada từ chối',
  live: 'Đang bán trên Lazada',
  inactive: 'Đã ngừng bán trên Lazada',
  failed: 'Tạo sản phẩm thất bại',
  blocked: 'Cần xử lý',
  needs_reconciliation: 'Cần đối soát',
  superseded: 'Đã được thay thế',
};

const stateTones: Record<string, Tone> = {
  live: 'success',
  // Approved is not the same as selling: the listing only succeeds once Lazada
  // reports the real product state as live.
  qc_approved: 'warning',
  inactive: 'neutral',
  not_exported: 'neutral',
  queued: 'warning',
  creating: 'warning',
  create_submitted: 'warning',
  mapping_verification_pending: 'warning',
  qc_pending: 'warning',
  qc_rejected: 'danger',
  failed: 'danger',
  blocked: 'danger',
  needs_reconciliation: 'danger',
  superseded: 'danger',
};

export function lazadaPublicationStateLabel(state: string): string {
  return stateLabels[state] ?? 'Đang cập nhật trạng thái';
}

export function lazadaPublicationTone(state: string): Tone {
  return stateTones[state] ?? 'neutral';
}

export function lazadaPublicationIsProcessing(state: string): boolean {
  // qc_approved still needs one more read: Lazada must report the listing as live.
  return ['queued', 'creating', 'create_submitted', 'mapping_verification_pending', 'qc_pending', 'qc_approved'].includes(state);
}

export function lazadaPublicationIsSettled(state: string): boolean {
  return ['live', 'inactive', 'qc_rejected', 'failed', 'blocked', 'needs_reconciliation', 'superseded'].includes(state);
}

export const lazadaIssueText: Record<string, string> = {
  '1001': 'Lazada từ chối cấu trúc dữ liệu sản phẩm. Hãy tải lại trạng thái và kiểm tra thông tin Lazada trước khi thử lại.',
  CORE_PRODUCT_NOT_READY: 'Sản phẩm Core phải đang bán, có tên và dùng VND.',
  CORE_VARIANT_NOT_READY: 'SKU Core cần mã và đang hoạt động.',
  CATEGORY_REQUIRED: 'Chọn ngành hàng Lazada.',
  CATEGORY_NOT_LEAF: 'Chỉ được chọn ngành hàng cuối cùng.',
  CATEGORY_NOT_FOUND: 'Ngành hàng đã lưu không còn tồn tại trên Lazada.',
  BRAND_REQUIRED: 'Cần chọn thương hiệu Lazada trước khi gửi sản phẩm.',
  BRAND_INVALID: 'Thương hiệu Lazada đã lưu không hợp lệ; chọn lại thương hiệu.',
  CHANNEL_PRICE_REQUIRED: 'Cần đặt giá bán riêng cho kênh Lazada hoặc giá Core hợp lệ ở từng SKU.',
  CHANNEL_PRICE_CURRENCY: 'Giá kênh Lazada phải dùng VND.',
  CHANNEL_NOT_CONNECTED: 'Kênh Lazada chưa được kết nối hoặc cần ủy quyền lại.',
  CHANNEL_NOT_READY: 'Kênh Lazada chưa sẵn sàng để đăng sản phẩm.',
  CHANNEL_NOT_CONFIGURED: 'Connector Lazada chưa được cấu hình trên server.',
  CHANNEL_TOKEN_UNAVAILABLE: 'Không lấy được access token đã xác minh của Lazada.',
  LAZADA_PRODUCT_API_FORBIDDEN: 'Ứng dụng Lazada chưa được cấp quyền Product API cho gian hàng này.',
  LAZADA_PRODUCT_API_THROTTLED: 'Lazada đang giới hạn tần suất; thử lại sau.',
  ApiCallLimit: 'Lazada đang giới hạn tần suất kiểm tra QC; OctoFlow sẽ tự kiểm tra lại sau thời gian chờ.',
  LAZADA_PRODUCT_API_UNAVAILABLE: 'Tạm thời không đọc được ngành hàng hoặc thuộc tính từ Lazada.',
  LISTING_OWNERSHIP_CONFLICT: 'SKU đang thuộc một sản phẩm hoặc gian hàng khác trên Lazada.',
  LAZADA_LISTING_EXISTS: 'Sản phẩm đã có listing Lazada. Hãy quản lý hoặc cập nhật listing hiện có, không tạo mới.',
  LAZADA_IMAGE_NOT_PREPARED: 'Có ảnh Core chưa được tải lên Lazada; bấm Chuẩn bị ảnh Lazada.',
  LAZADA_IMAGE_NOT_READY: 'Ảnh sản phẩm chưa sẵn sàng trên Lazada; bấm Chuẩn bị ảnh Lazada.',
  LAZADA_IMAGE_STALE: 'Ảnh Core đã thay đổi sau lần tải lên Lazada.',
  LAZADA_IMAGE_UPLOAD_FAILED: 'Tải ảnh lên Lazada thất bại; kiểm tra ảnh Core và thử lại.',
  LAZADA_IMAGE_INVALID: 'Ảnh Core không đáp ứng định dạng hoặc kích thước Lazada.',
  CORE_IMAGE_REQUIRED: 'Sản phẩm Core chưa có ảnh sản phẩm.',
  LAZADA_IMAGE_LIMIT: 'Chỉ được dùng tối đa 8 ảnh sản phẩm cho Lazada.',
  LAZADA_SKU_IMAGE_NOT_PREPARED: 'Ảnh SKU chưa được tải lên Lazada.',
  LAZADA_SKU_IMAGE_STALE: 'Ảnh SKU đã thay đổi sau lần tải lên Lazada.',
  LAZADA_SKU_IMAGE_UPLOAD_FAILED: 'Tải ảnh SKU lên Lazada thất bại.',
  LAZADA_SKU_IMAGE_INVALID: 'Ảnh SKU không đáp ứng định dạng hoặc kích thước Lazada.',
  LAZADA_SKU_IMAGE_LIMIT: 'Mỗi SKU chỉ được dùng tối đa 8 ảnh Lazada.',
  LAZADA_PRIMARY_IMAGE_NOT_READY: 'Ảnh chính của sản phẩm chưa sẵn sàng trên Lazada.',
  IMAGE_PREPARE_LIMIT: 'Đã xử lý tối đa 24 ảnh mỗi lần; bấm chuẩn bị lại để tiếp tục.',
  SKU_SPEC_REQUIRED: 'Thiếu thông tin SKU.',
  SKU_SET_MISMATCH: 'Danh sách SKU đã thay đổi.',
  SALE_PROP_UNAVAILABLE: 'Ngành hàng chưa có thuộc tính biến thể phù hợp.',
  SALE_PROP_REQUIRED: 'SKU thiếu thuộc tính phân biệt.',
  SALE_PROP_DUPLICATE: 'Hai SKU có cùng tổ hợp biến thể.',
  PACKAGE_MEASURE_REQUIRED: 'Cần số đo kiện hàng dương, đúng độ chính xác Lazada.',
  CATEGORY_ATTRIBUTE_REQUIRED: 'Thiếu thuộc tính sản phẩm bắt buộc.',
  CATEGORY_ATTRIBUTE_INVALID: 'Thuộc tính sản phẩm không hợp lệ.',
  SKU_ATTRIBUTE_REQUIRED: 'Thiếu thuộc tính SKU bắt buộc.',
  SKU_ATTRIBUTE_INVALID: 'Thuộc tính SKU không hợp lệ.',
  CATEGORY_ATTRIBUTE_UNKNOWN: 'Thuộc tính không còn thuộc ngành hàng này.',
  SKU_ATTRIBUTE_UNKNOWN: 'Thuộc tính SKU không còn thuộc ngành hàng này.',
  CORE_SPEC_STALE: 'Core đã thay đổi; cần xem lại cấu hình Lazada.',
  LAZADA_PRODUCT_NOT_READY: 'Cấu hình Lazada chưa đủ điều kiện để gửi sản phẩm.',
  LAZADA_PRODUCT_VERSION_STALE: 'Core hoặc cấu hình Lazada đã thay đổi. Tải lại rồi kiểm tra lại.',
  LAZADA_PRODUCT_WRITES_DISABLED: 'Ghi sản phẩm Lazada đang tắt trong cấu hình server.',
  LAZADA_PUBLICATION_EXISTS: 'Sản phẩm đã có listing Lazada; không tạo thêm sản phẩm mới.',
  LAZADA_LISTING_CONFLICT: 'Listing Lazada hiện có thuộc liên kết khác. Cần đối soát trước khi gửi.',
  LAZADA_PUBLICATION_IN_PROGRESS: 'Một yêu cầu Lazada khác đang chạy. Chờ hoàn tất rồi thử lại.',
  LAZADA_PUBLISH_CONFLICT: 'Yêu cầu trùng khóa nhưng nội dung đã khác. Tải lại trạng thái trước khi gửi.',
  LAZADA_NOT_CONNECTED: 'Gian hàng Lazada chưa kết nối. Kết nối lại trước khi đăng.',
  LAZADA_PRODUCT_NOT_FOUND: 'Không tìm thấy sản phẩm hoặc kênh Lazada.',
  LAZADA_PUBLICATION_UNAVAILABLE: 'Tạm thời không đọc được trạng thái đăng Lazada.',
  LAZADA_PUBLISH_UNAVAILABLE: 'Tính năng đăng sản phẩm Lazada chưa khả dụng.',
  LAZADA_ADMIN_REQUIRED: 'Chỉ quản trị viên được đăng sản phẩm lên Lazada.',
  IDEMPOTENCY_KEY_REQUIRED: 'Thiếu mã chống gửi trùng. Tải lại trang rồi thử lại.',
  RETRY_EXHAUSTED: 'Lazada chưa phản hồi sau nhiều lần thử. Cần đối soát thủ công.',
  QC_UNAVAILABLE: 'Chưa đọc được kết quả duyệt của Lazada; hệ thống sẽ tự thử lại.',
  QC_PENDING: 'Lazada vẫn đang kiểm duyệt sản phẩm.',
  QC_REJECTED: 'Lazada từ chối sản phẩm. Kiểm tra lý do, sửa thông tin rồi gửi cập nhật.',
  PUBLICATION_UNAVAILABLE: 'Chưa đọc được dữ liệu đăng bán Lazada.',
  PRODUCT_STATE_UNAVAILABLE: 'Chưa đọc được dữ liệu sản phẩm Core. Hệ thống sẽ thử lại sau.',
  SELLER_SKU_REQUIRED: 'Sản phẩm chưa có SKU hợp lệ để gửi Lazada.',
  REMOTE_LISTING_NOT_FOUND: 'Chưa tìm thấy listing Lazada tương ứng để đối soát.',
  REMOTE_ITEM_MISSING: 'Lazada chưa trả mã sản phẩm cho listing này.',
  RECONCILE_UNAVAILABLE: 'Chưa đối soát được catalog Lazada. Hệ thống sẽ thử lại an toàn.',
  RECONCILE_CONFLICT: 'Listing Lazada tìm thấy đang thuộc liên kết khác. Cần kiểm tra thủ công.',
  REMOTE_OWNERSHIP_CONFLICT: 'SKU trên Lazada đang thuộc một sản phẩm khác. Cần đối soát trước khi gửi.',
};

export function lazadaErrorText(code?: string): string {
  if (!code) return 'Lazada chưa xác minh được sản phẩm. Hãy thử lại hoặc mở trang kênh để đối soát.';
  return lazadaIssueText[code] ?? 'Lazada chưa xác minh được sản phẩm. Hãy tải lại trạng thái trước khi gửi lại.';
}

const eventLabels: Record<string, string> = {
  publish_requested: 'Đã ghi nhận yêu cầu đăng',
  remote_listing_adopted: 'Đã ghép listing Lazada có sẵn',
  remote_item_created: 'Lazada đã tạo sản phẩm',
  remote_skus_observed: 'Đã đọc SKU từ Lazada',
  sku_mapping_verified: 'Đã xác minh SKU',
  remote_state_observed: 'Đã đọc trạng thái thật từ Lazada',
};

/** Turns connector event codes into seller-facing progress text. */
export function lazadaEventText(code?: string): string {
  if (!code) return 'Cập nhật xác minh Lazada';
  return eventLabels[code] ?? lazadaIssueText[code] ?? 'Cập nhật xác minh Lazada';
}

/** Formats a decimal amount returned by Lazada without treating it as minor units. */
export function lazadaPriceText(amount?: string, currency = 'VND'): string {
  if (!amount) return '—';
  const value = Number(amount);
  if (!Number.isFinite(value)) return '—';
  try {
    return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: currency || 'VND' }).format(value);
  } catch {
    return `${value.toLocaleString('vi-VN')} ${currency}`;
  }
}

/** Maps a remote QC reason to the field a seller should review, without exposing raw JSON. */
export function lazadaQCHint(reason?: string, code?: string): string {
  const value = `${reason ?? ''} ${code ?? ''}`.toLocaleLowerCase('vi');
  if (/image|photo|ảnh|hình/.test(value)) return 'Kiểm tra ảnh chính, định dạng và số lượng ảnh rồi gửi cập nhật.';
  if (/brand|thương hiệu/.test(value)) return 'Chọn lại thương hiệu Lazada đã được xác minh.';
  if (/categor|ngành hàng/.test(value)) return 'Kiểm tra ngành hàng cuối và thuộc tính bắt buộc của ngành hàng.';
  if (/price|giá/.test(value)) return 'Kiểm tra giá Lazada của từng SKU và đơn vị tiền tệ.';
  if (/package|weight|dimension|kiện|cân|kích thước/.test(value)) return 'Kiểm tra số đo kiện hàng và trọng lượng của SKU bị ảnh hưởng.';
  if (/sku|variant|biến thể/.test(value)) return 'Kiểm tra mã SKU và thuộc tính biến thể của từng SKU.';
  if (/attribute|thuộc tính/.test(value)) return 'Bổ sung thuộc tính ngành hàng còn thiếu rồi gửi cập nhật.';
  return 'Mở phần thông tin Lazada nâng cao để kiểm tra trường bị từ chối rồi gửi cập nhật.';
}
