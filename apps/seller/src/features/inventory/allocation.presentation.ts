import type {
  AllocationDirection,
  AllocationExecutionPhase,
  AllocationPlanItem,
  AllocationPlanPreview,
  AllocationPlanStatus,
  AllocationStepStatus,
} from '../../api/allocations';

export type StatusTone = 'neutral' | 'success' | 'warning' | 'danger';

const planStatusLabels: Record<string, string> = {
  projected: 'Kế hoạch dự kiến',
  applying: 'Đang áp dụng',
  paused: 'Tạm dừng',
  blocked: 'Bị chặn',
  completed: 'Hoàn tất',
  superseded: 'Đã bị thay thế',
};

export function allocationPlanStatusLabel(status: AllocationPlanStatus): string {
  return planStatusLabels[status] ?? 'Đang cập nhật';
}

export function allocationPlanStatusTone(status: AllocationPlanStatus): StatusTone {
  if (status === 'completed') return 'success';
  if (status === 'blocked') return 'danger';
  if (status === 'paused' || status === 'applying' || status === 'projected') return 'warning';
  return 'neutral';
}

const phaseLabels: Record<string, string> = {
  checking_conditions: 'Đang đọc lại tồn từng kênh',
  decreasing: 'Đang giảm quota',
  verifying_decreases: 'Đang xác minh phần đã giảm',
  increasing: 'Đang tăng quota',
  verifying_increases: 'Đang xác minh phần đã tăng',
  final_verification: 'Đang xác minh lần cuối',
  completed: 'Đã hoàn tất',
  paused_data_changed: 'Tạm dừng vì dữ liệu đã thay đổi',
  blocked: 'Đã bị chặn',
};

export function allocationPhaseLabel(phase: AllocationExecutionPhase): string {
  return phaseLabels[phase] ?? 'Đang cập nhật tiến trình';
}

const stepStatusLabels: Record<string, string> = {
  pending: 'Chờ xử lý',
  in_progress: 'Đang ghi',
  awaiting_verification: 'Chờ đọc lại',
  verified: 'Đã xác minh',
  superseded: 'Đã bị thay thế',
};

export function allocationStepStatusLabel(status: AllocationStepStatus): string {
  return stepStatusLabels[status] ?? 'Đang cập nhật';
}

export function allocationStepStatusTone(status: AllocationStepStatus): StatusTone {
  if (status === 'verified') return 'success';
  if (status === 'superseded') return 'neutral';
  if (status === 'awaiting_verification') return 'warning';
  return 'warning';
}

const directionLabels: Record<string, string> = {
  decrease: 'Giảm',
  increase: 'Tăng',
  unchanged: 'Không đổi',
};

export function allocationDirectionLabel(direction: AllocationDirection): string {
  return directionLabels[direction] ?? 'Không đổi';
}

const issueMessages: Record<string, string> = {
  CORE_BALANCE_MISSING: 'Chưa có tồn kho Core cho SKU này.',
  CORE_BALANCE_INVALID: 'Số liệu tồn kho Core không hợp lệ.',
  CORE_VARIANT_INACTIVE: 'Sản phẩm hoặc biến thể đang ngừng bán.',
  CHANNEL_UNAVAILABLE: 'Kết nối kênh chưa sẵn sàng.',
  MAPPING_INVALID: 'Listing chưa có mapping hợp lệ và đã xác minh.',
  TRACKING_NOT_READY: 'Listing chưa bật theo dõi tồn kho.',
  PUBLICATION_NOT_READY: 'Listing chưa được đăng bán.',
  INVENTORY_WRITE_DISABLED: 'Kênh chưa cho phép ghi tồn từ Core.',
  LAZADA_SELLER_NOT_VERIFIED: 'Lazada chặn API đọc đơn (SellerNotVerified). Seller Center có thể vẫn hiện listing và tồn, nhưng API seller đang báo gian hàng ACTIVE và verified=false. Hoàn tất yêu cầu mở bán/xác minh trên trang chủ Seller Center rồi xem trước lại; OctoFlow tạm chặn tăng tồn khi chưa đối soát được đơn.',
  LAZADA_ORDER_POLL_NOT_READY: 'OctoFlow chưa đọc đơn Lazada thành công gần đây. Chờ kết nối đọc đơn hoạt động rồi xem trước lại.',
  LISTING_REMOVED: 'Một listing trong kế hoạch không còn tồn tại.',
  INVALID_PHASE: 'Kế hoạch có bước thực thi không hợp lệ.',
  EMPTY_PLAN: 'Kế hoạch không còn listing nào đủ điều kiện.',
  REMOTE_READ_UNVERIFIED: 'Chưa đọc lại được tồn kho từ kênh.',
  REMOTE_IDENTITY_MISMATCH: 'Kênh trả về tồn kho của một listing khác.',
  REMOTE_QUANTITY_INVALID: 'Kênh trả về số lượng tồn không hợp lệ.',
  REMOTE_CHANGED_AFTER_PREVIEW: 'Tồn trên kênh đã thay đổi sau khi xem trước. Hãy xem trước lại.',
  REMOTE_BASELINE_UNKNOWN: 'Listing chưa có số lượng nền đã xác minh. Hãy đối soát listing trước.',
  PLAN_STALE: 'Tồn Core hoặc phiên bản phân bổ đã thay đổi. Hãy tính kế hoạch mới.',
  LISTING_MAPPING_CHANGED: 'Mapping kênh hoặc SKU bên ngoài đã thay đổi sau khi xem trước.',
  LISTING_NOT_READY: 'Mapping, trạng thái đăng bán hoặc theo dõi tồn của một listing đã thay đổi.',
  CHANNEL_UNAVAILABLE_EXECUTION: 'Kết nối kênh không còn sẵn sàng.',
  INBOUND_ORDERS_PENDING: 'Đơn đang chờ có dòng hàng thuộc SKU này chưa được Core xử lý; kế hoạch chưa thể xác nhận.',
  PLAN_LISTING_SET_CHANGED: 'Danh sách listing trong kế hoạch không còn khớp với sản phẩm.',
  LISTINGS_MISSING: 'Kế hoạch không còn listing nào được mapping.',
  QUOTA_EXCEEDS_ATS: 'Tổng quota listing vượt ngân sách online sau khi dành quota POS. Máy chủ đã chặn kế hoạch.',
  POS_QUOTA_EXCEEDS_CORE_ATS: 'Quota POS mong muốn vượt Core ATS hiện tại. Kế hoạch bị chặn và quota POS chưa có hiệu lực.',
  REMOTE_CHANGED_DURING_PLAN: 'Tồn trên kênh thay đổi ngoài kế hoạch. Không tự động cấp lại.',
  INVALID_STEP_DIRECTION: 'Bước thực thi có hướng tăng/giảm không hợp lệ.',
  TARGET_WRITE_STALE: 'Phiên bản Core hoặc phiên bản phân bổ đã đổi trước khi ghi kênh.',
  REMOTE_WRITE_UNCERTAIN: 'Kênh đã đổi số lượng nhưng lần đọc lại không khớp mục tiêu.',
  CHANNEL_DEFERRED: 'Kênh tạm hoãn nhận thay đổi. Máy chủ sẽ thử lại.',
  CHANNEL_REFUSED: 'Kênh từ chối thay đổi tồn kho.',
  CHANNEL_SUPERSEDED: 'Yêu cầu đã bị một thay đổi mới hơn thay thế.',
  RETRY_LIMIT_REACHED: 'Đã hết số lần thử nhưng kênh chưa xác minh được số lượng mới.',
  CHANNEL_WRITE_UNVERIFIED: 'Kênh chưa xác nhận thay đổi bằng lần đọc lại.',
  RECLAIMED_STOCK_CHANGED: 'Phần tồn đã thu hồi lại thay đổi trước khi tăng quota.',
  FINAL_REMOTE_READ_UNVERIFIED: 'Chưa đọc lại được tồn kho trong lần xác minh cuối.',
  FINAL_QUANTITY_MISMATCH: 'Số lượng trên kênh không còn khớp mục tiêu sau khi áp dụng.',
  CORE_SYNC_NOT_EXECUTABLE: 'Kế hoạch đồng bộ tự động của Core không thể thực thi.',
};

export function allocationIssueMessage(code: string): string {
  return issueMessages[code] ?? 'Cần kiểm tra thêm trong nhật ký phân bổ.';
}

/** A server `last_error` has the form `CODE: human message`. Keep both halves. */
export function allocationRuntimeError(error?: string): { code: string; message: string; detail: string } | null {
  if (!error) return null;
  const separator = error.indexOf(':');
  const code = separator === -1 ? error.trim() : error.slice(0, separator).trim();
  const detail = separator === -1 ? '' : error.slice(separator + 1).trim();
  return { code, detail, message: allocationIssueMessage(code) };
}

const channelLabels: Record<string, string> = {
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  ebay: 'eBay',
  lazada: 'Lazada',
};

export function channelCodeLabel(code: string): string {
  return channelLabels[code.toLocaleLowerCase('en')] ?? (code || 'Kênh bán');
}

export function allocationQuantity(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('vi-VN');
}

export function allocationDateTime(value?: string): string {
  if (!value) return 'Chưa xác minh';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Chưa xác minh';
  return new Intl.DateTimeFormat('vi-VN', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Ho_Chi_Minh',
  }).format(date);
}

export interface AllocationChange {
  item: AllocationPlanItem;
  amount: number;
}

export interface AllocationPreviewSummary {
  decreases: AllocationChange[];
  increases: AllocationChange[];
  unchanged: AllocationPlanItem[];
  unquantified: AllocationPlanItem[];
  reclaimed: number;
  granted: number;
  projectedTotal: number;
  exceedsAts: boolean;
  blockedItems: AllocationPlanItem[];
}

export function summarizeAllocationPreview(preview: AllocationPlanPreview): AllocationPreviewSummary {
  const decreases: AllocationChange[] = [];
  const increases: AllocationChange[] = [];
  const unchanged: AllocationPlanItem[] = [];
  const unquantified: AllocationPlanItem[] = [];
  const blockedItems: AllocationPlanItem[] = [];
  let projectedTotal = 0;

  for (const item of preview.items) {
    if (item.will_participate) projectedTotal += item.proposed_quantity;
    if (item.delta === null) {
      unquantified.push(item);
    } else if (item.delta < 0) {
      decreases.push({ item, amount: Math.abs(item.delta) });
    } else if (item.delta > 0) {
      increases.push({ item, amount: item.delta });
    } else {
      unchanged.push(item);
    }
    if (!item.can_execute || item.issues.length > 0) blockedItems.push(item);
  }

  return {
    decreases,
    increases,
    unchanged,
    unquantified,
    reclaimed: decreases.reduce((total, change) => total + change.amount, 0),
    granted: increases.reduce((total, change) => total + change.amount, 0),
    projectedTotal,
    exceedsAts: projectedTotal > (preview.online_budget ?? preview.available_to_sell),
    blockedItems,
  };
}
