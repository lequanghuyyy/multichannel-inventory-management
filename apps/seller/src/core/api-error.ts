export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  request_id: string;
}

export interface ErrorPresentation {
  title: string;
  detail: string;
  requestId?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export class ApiRequestError extends Error {
  readonly code: string;
  readonly details?: Record<string, unknown>;
  readonly requestId: string;
  /**
   * The HTTP status the server answered with.
   *
   * It is the difference between "the server is down" and "the server answered, and the
   * answer is that this record does not exist". A screen that falls back to prototype data
   * must treat those two differently: a fallback after a 404 would put a DIFFERENT order on
   * screen under the id that was asked for, and nothing on that screen would say so.
   *
   * Zero when the error was constructed without a response — a hand-built one in a test, for
   * instance — and callers must treat zero as "unknown", never as success.
   */
  readonly status: number;

  constructor(error: ApiError, status = 0) {
    super(error.message);
    this.name = 'ApiRequestError';
    this.code = error.code;
    this.details = error.details;
    this.requestId = error.request_id;
    this.status = status;
  }

  /** True when the server answered and the answer was that the request cannot be served as asked. */
  get isClientError(): boolean {
    return this.status >= 400 && this.status < 500;
  }
}

export function parseApiError(value: unknown): ApiError {
  if (!record(value) || !record(value.error) || typeof value.error.code !== 'string' || typeof value.error.message !== 'string' || typeof value.error.request_id !== 'string' || (value.error.details !== undefined && !record(value.error.details))) {
    throw new Error('Phản hồi lỗi không đúng định dạng.');
  }
  return value.error as unknown as ApiError;
}

/**
 * Reads the error body straight from the transport response.
 *
 * Spring Boot operations in the generated contract declare no error responses, which makes
 * `openapi-fetch`'s `error` value `never`. The body is still there on the wire, so server-path
 * adapters parse `response` instead of narrowing a value the type system says cannot exist.
 */
export async function responseApiError(response: Response, fallback = 'Không kết nối được máy chủ. Hãy thử lại sau.'): Promise<never> {
  if (response.headers.get('content-type')?.includes('application/json')) {
    try {
      const body: unknown = await response.json();
      throw new ApiRequestError(parseApiError(body), response.status);
    } catch (error) {
      if (error instanceof ApiRequestError) throw error;
      throw new Error(fallback);
    }
  }
  throw new Error(fallback);
}

export function presentApiError(error: unknown): ErrorPresentation {
  if (!(error instanceof ApiRequestError)) {
    return { title: 'Không thể tải dữ liệu', detail: 'Không thể kết nối đến máy chủ. Hãy kiểm tra mạng rồi thử lại.' };
  }
  const presentations: Record<string, Omit<ErrorPresentation, 'requestId'>> = {
    UNAUTHORIZED: { title: 'Cần đăng nhập', detail: 'Phiên làm việc đã hết hạn hoặc chưa được xác thực.' },
    UNAUTHENTICATED: { title: 'Cần đăng nhập', detail: 'Phiên làm việc đã hết hạn hoặc chưa được xác thực.' },
    SESSION_EXPIRED: { title: 'Phiên đã hết hạn', detail: 'Đăng nhập lại để tiếp tục.' },
    AUTH_UNAVAILABLE: { title: 'Chưa thể đăng nhập lúc này', detail: 'Phiên của bạn chưa bị đăng xuất. Hãy kiểm tra kết nối và thử lại.' },
    INVALID_CREDENTIALS: { title: 'Đăng nhập không thành công', detail: 'Thông tin đăng nhập không hợp lệ.' },
    LOGIN_RATE_LIMITED: { title: 'Tạm thời chưa thể đăng nhập', detail: 'Bạn đã thử đăng nhập nhiều lần. Vui lòng đợi một phút rồi thử lại.' },
    FORBIDDEN: { title: 'Không có quyền thực hiện', detail: 'Tài khoản hiện tại không có quyền thực hiện thao tác này.' },
    CSRF_INVALID: { title: 'Yêu cầu bảo mật bị từ chối', detail: 'Phiên bảo mật không hợp lệ. Tải lại trang rồi thử lại.' },
    VALIDATION_ERROR: { title: 'Dữ liệu chưa hợp lệ', detail: 'Kiểm tra lại các trường đã nhập rồi thử lại.' },
    INVALID_SKU: { title: 'SKU chưa hợp lệ', detail: 'Mã SKU chỉ gồm chữ hoa, số, dấu chấm, gạch nối hoặc gạch dưới.' },
    SKU_NOT_FOUND: { title: 'Không tìm thấy SKU', detail: 'SKU không tồn tại. Kiểm tra lại mã rồi thử lại.' },
    ORDER_NOT_FOUND: { title: 'Không tìm thấy đơn hàng', detail: 'Đơn hàng không tồn tại hoặc không còn khả dụng.' },
    PRODUCT_NOT_FOUND: { title: 'Không tìm thấy sản phẩm', detail: 'Sản phẩm không tồn tại hoặc không còn khả dụng.' },
    STATE_CONFLICT: { title: 'Dữ liệu đã thay đổi', detail: 'Mã đã tồn tại hoặc trạng thái hiện tại không cho phép thao tác này. Hãy tải lại rồi thử lại.' },
    MARKETPLACE_CANCELLATION_BLOCKED: {
      title: 'Không thể hủy đơn sàn trực tiếp',
      detail: 'Thao tác hủy không được hỗ trợ ở trạng thái hiện tại.',
    },
    SHOPIFY_ORDER_PROGRESS_SYNC_PENDING: {
      title: 'OctoFlow đã xác nhận, Shopify đang chờ đồng bộ',
      detail: 'Đơn đã chuyển sang trạng thái xác nhận trong OctoFlow, nhưng Shopify chưa xác nhận “Đang thực hiện”. Thử đồng bộ lại trong phần Shopify fulfillment; thao tác dùng cùng mã idempotency và không tạo đơn mới.',
    },
    SHOPIFY_ORDER_ON_HOLD: {
      title: 'Đơn đang tạm dừng trên Shopify',
      detail: 'Gỡ trạng thái tạm dừng trong Shopify trước khi đồng bộ tiến độ xử lý.',
    },
    ORDER_PROGRESS_WRITE_DISABLED: {
      title: 'Đồng bộ trạng thái Shopify đang tắt',
      detail: 'Bật SHOPIFY_WRITE_ENABLED và cấp quyền fulfillment cho ứng dụng Shopify rồi thử lại.',
    },
    IDEMPOTENCY_CONFLICT: { title: 'Yêu cầu trùng khác nội dung', detail: 'Yêu cầu này trùng với một lần bán trước nhưng nội dung khác. Tải lại đơn cũ trước khi bán tiếp để không bán hai lần.' },
    // Distinct from IDEMPOTENCY_CONFLICT on purpose: here the KEY is fine and the RECEIPT NUMBER
    // is taken, so the fix is to mint a new reference, not to reload an order. Telling a cashier
    // to reload after a number collision sends them to a page that will not explain anything.
    DUPLICATE_REFERENCE: { title: 'Số hoá đơn đã tồn tại', detail: 'Số hoá đơn này đã thuộc về đơn khác. In lại với số mới rồi bán tiếp; đơn cũ không bị ảnh hưởng.' },
    INSUFFICIENT_BUFFER: { title: 'Không thể giảm tồn kho', detail: 'Mức giảm sẽ đưa tồn xuống dưới số đang giữ chỗ hoặc dưới ngưỡng an toàn.' },
    STALE_INVENTORY: { title: 'Tồn kho đã thay đổi', detail: 'Một thao tác khác đã cập nhật SKU này. Tải lại số tồn rồi kiểm đếm và xác nhận lại.' },
    PRODUCTS_UNAVAILABLE: { title: 'Danh mục tạm thời không khả dụng', detail: 'Chưa thể đọc danh mục. Hãy thử lại sau.' },
    PRODUCTS_INCONSISTENT: { title: 'Danh mục cần đối soát', detail: 'Dữ liệu danh mục không nhất quán, cần kiểm tra lại.' },
    ORDERS_UNAVAILABLE: { title: 'Đơn hàng tạm thời không khả dụng', detail: 'Chưa thể đọc đơn hàng. Hãy thử lại sau.' },
    ORDERS_INCONSISTENT: { title: 'Đơn hàng cần đối soát', detail: 'Dữ liệu đơn hàng không nhất quán, cần kiểm tra lại.' },
    INSUFFICIENT_STOCK: { title: 'Không đủ tồn kho', detail: 'Thao tác bị từ chối vì số lượng có thể bán không đủ. Hãy tải lại tồn kho.' },
    INVENTORY_UNAVAILABLE: { title: 'Kho tạm thời không khả dụng', detail: 'Chưa thể đọc tồn kho. Hãy thử lại sau.' },
    INVENTORY_INCONSISTENT: { title: 'Tồn kho cần đối soát', detail: 'Dữ liệu tồn kho không nhất quán nên không hiển thị số lượng.' },
    INTERNAL_ERROR: { title: 'Máy chủ gặp sự cố', detail: 'Hãy thử lại sau. Nếu lỗi tiếp diễn, gửi mã yêu cầu cho bộ phận hỗ trợ.' },
    SHOPIFY_PUBLICATION_READ_SCOPE_MISSING: { title: 'Chưa có quyền đọc kênh bán Shopify', detail: 'Shopify đã kết nối, nhưng OctoFlow chưa được cấp quyền read_publications để tải các nơi hiển thị sản phẩm. Bổ sung quyền này trong Shopify Dev Dashboard rồi cập nhật quyền của app.' },
    SHOPIFY_PUBLICATIONS_UNAVAILABLE: { title: 'Không tải được nơi hiển thị trên Shopify', detail: 'Shopify chưa trả về danh sách nơi khách có thể mua sản phẩm. Kiểm tra kết nối rồi thử lại.' },
    SHOPIFY_PUBLICATION_WRITE_DISABLED: { title: 'Thao tác đăng bán đang tắt', detail: 'Tính năng đăng sản phẩm lên kênh Shopify chưa được bật trong cấu hình OctoFlow.' },
    PUBLICATION_UNAVAILABLE: { title: 'Trạng thái kênh chưa khả dụng', detail: 'Chưa thể đọc dữ liệu đăng bán lúc này. Hãy tải lại trạng thái; nếu lỗi tiếp diễn, gửi mã yêu cầu cho bộ phận hỗ trợ.' },
    PUBLICATION_REQUEST_FAILED: { title: 'Không tải được trạng thái kênh', detail: 'Máy chủ chưa đọc được trạng thái đăng sản phẩm. Hãy thử tải lại; nếu lỗi tiếp diễn, gửi mã yêu cầu cho bộ phận hỗ trợ.' },
    PRODUCT_OR_CHANNEL_NOT_FOUND: { title: 'Không tìm thấy trạng thái đăng bán', detail: 'Sản phẩm hoặc kênh đã thay đổi. Tải lại trang sản phẩm rồi thử lại.' },
  };
  const presentation = presentations[error.code] ?? { title: 'Không thể tải dữ liệu', detail: 'Đã xảy ra lỗi không xác định.' };
  return { ...presentation, requestId: error.requestId };
}
