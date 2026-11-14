import { formatMinor } from '../../lib/money';
import type { Order as ApiOrder } from '../../api/orders';
import type { OrderFilters, OrderStatus } from './order.types';

/**
 * The ledger row a live order renders as.
 *
 * A separate shape from the prototype `Order` in order.types.ts, and the reason is not
 * tidiness. The prototype carries `marketplaceReference`, `customer.location`,
 * `inventoryStatus`, a `lifecycle` timeline and an `audit` trail — none of which the API has.
 * Filling them from the fixture would print invented facts beside live ones, which is the
 * single thing README's two-source rule exists to prevent. So the API row simply has fewer
 * fields, and the ledger drops the columns that had nothing behind them.
 *
 * `status` is the API's six-value enum, not the prototype's six-value union. They are
 * different sets with four names in common: the API has placed/confirmed/packed/shipped/
 * delivered/cancelled and the prototype has pending/reserved/confirmed/completed/cancelled/
 * returned. Confusing the two would let a "completed" row render as a delivered one.
 */
export type ApiOrderStatus =
  | 'placed'
  | 'confirmed'
  | 'packed'
  | 'shipped'
  | 'delivered'
  | 'cancelled';

/**
 * The statuses a transition may MOVE TO.
 *
 * `placed` is absent on purpose and it is the contract that says so: the PATCH body's status
 * enum has no 'placed'. A reader who wanted a 'placed' button would be asking the server to
 * un-place a placed order, which no edge list in any direction permits.
 */
export type ApiOrderTransitionTarget = Exclude<ApiOrderStatus, 'placed'>;

export type ApiFulfillmentStatus =
  | 'pending'
  | 'picking'
  | 'shipped'
  | 'delivered'
  | 'returned';

export interface OrderApiItem {
  id?: string;
  variantId: string;
  reservationId: string;
  productId?: string | null;
  sku: string;
  name: string;
  color?: string | null;
  size?: string | null;
  primaryMediaId?: string | null;
  quantity: number;
  unitPriceMinor: number;
  unitPriceFormatted: string;
  lineTotalMinor: number;
  lineTotalFormatted: string;
  returnedQuantity?: number;
}

export interface OrderApiRow {
  id: string;
  channelId: string;
  shopId: string;
  reference: string;
  /** The channel's own order id, when it supplied one. Empty is not the same as absent. */
  externalId: string;
  /** `channel_code`, exactly as the write recorded it. Never mapped through a channel table
   *  here: this screen has no channel lookup, and inventing a display name for a code it
   *  cannot verify is how a POS sale ends up captioned as a marketplace order. */
  channelCode: string;
  status: ApiOrderStatus;
  paymentStatus: string;
  fulfillmentStatus: ApiFulfillmentStatus;
  currency: string;
  itemCount: number;
  totalMinor: number;
  totalFormatted: string;
  subtotalMinor?: number;
  subtotalFormatted?: string;
  discountMinor?: number;
  discountFormatted?: string;
  posPayment?: ApiOrder['pos_payment'];
  manualPaymentConfirmation?: ApiOrder['manual_payment_confirmation'];
  customerName: string;
  customerPhone?: string | null;
  customerEmail?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
  deliveryMethod?: string | null;
  placedAt: string;
  updatedAt: string;
  cancelledReason: string;
  /** Empty on a LIST response, which is a summary by construction. Distinguishing "no lines"
   *  from "lines not requested" is what the ledger's missing-lines label exists for. */
  items: OrderApiItem[];
  externalSnapshot?: ApiOrder['external_snapshot'];
  externalLines: ApiOrder['external_lines'];
  paymentObservations: NonNullable<ApiOrder['payment_observations']>;
  unifiedShipping?: ApiOrder['unified_shipping'];
  cancellationGuard?: ApiOrder['cancellation_guard'];
}

export function toOrderApiRow(order: ApiOrder): OrderApiRow {
  const currency = order.currency;
  return {
    id: order.id,
    channelId: order.channel_id ?? '',
    shopId: order.shop_id ?? '',
    reference: order.reference,
    externalId: order.external_id ?? '',
    channelCode: order.channel_code,
    status: order.status,
    paymentStatus: order.payment_status,
    fulfillmentStatus: order.fulfillment_status,
    currency,
    itemCount: order.item_count,
    totalMinor: order.total_minor,
    // formatMinor is the ONLY place allowed to decide a currency's scale. VND has no
    // practical minor unit, so the amount is whole dong in an integer column, and summing or
    // formatting it in the browser is exactly the float rounding the contract forbids.
    totalFormatted: formatMinor(order.total_minor, currency),
    subtotalMinor: order.subtotal_minor,
    subtotalFormatted: order.subtotal_minor == null ? undefined : formatMinor(order.subtotal_minor, currency),
    discountMinor: order.discount_minor,
    discountFormatted: order.discount_minor == null ? undefined : formatMinor(order.discount_minor, currency),
    posPayment: order.pos_payment ?? null,
    manualPaymentConfirmation: order.manual_payment_confirmation ?? null,
    customerName: order.customer_name ?? '',
    customerPhone: order.customer_phone ?? null,
    customerEmail: order.customer_email ?? null,
    recipientName: order.recipient_name ?? null,
    recipientPhone: order.recipient_phone ?? null,
    deliveryAddress: order.delivery_address ?? null,
    deliveryNote: order.delivery_note ?? null,
    deliveryMethod: order.delivery_method ?? null,
    placedAt: order.placed_at,
    updatedAt: order.updated_at,
    cancelledReason: order.cancelled_reason ?? '',
    items: (order.items ?? []).map((item) => ({
      id: item.id,
      variantId: item.variant_id,
      reservationId: item.reservation_id,
      productId: item.product_id ?? null,
      sku: item.sku,
      name: item.name,
      color: item.color ?? null,
      size: item.size ?? null,
      primaryMediaId: item.primary_media_id ?? null,
      quantity: item.quantity,
      unitPriceMinor: item.unit_price_minor,
      unitPriceFormatted: formatMinor(item.unit_price_minor, currency),
      lineTotalMinor: item.line_total_minor,
      lineTotalFormatted: formatMinor(item.line_total_minor, currency),
      returnedQuantity: item.returned_quantity ?? 0,
    })),
    externalSnapshot: order.external_snapshot ?? undefined,
    externalLines: order.external_lines ?? [],
    paymentObservations: order.payment_observations ?? [],
    unifiedShipping: order.unified_shipping ?? undefined,
    cancellationGuard: order.cancellation_guard ?? undefined,
  };
}

/** The labels the live ledger uses for the API's own enum values. */
export const apiStatusPresentation: Record<ApiOrderStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  placed: { label: 'Mới đặt', tone: 'warning' },
  confirmed: { label: 'Đã xác nhận', tone: 'success' },
  packed: { label: 'Đã đóng gói', tone: 'neutral' },
  shipped: { label: 'Đang giao', tone: 'neutral' },
  delivered: { label: 'Đã giao', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'danger' },
};

export const apiFulfillmentLabels: Record<ApiFulfillmentStatus, string> = {
  pending: 'Chờ xử lý',
  picking: 'Đang lấy hàng',
  shipped: 'Đang giao',
  delivered: 'Đã giao',
  returned: 'Đã trả hàng',
};

export const unifiedShippingStatusLabels: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  pending_preparation: { label: 'Chờ chuẩn bị', tone: 'warning' },
  ready_for_handover: { label: 'Chờ bàn giao', tone: 'neutral' },
  handover_processing: { label: 'Đang bàn giao', tone: 'neutral' },
  in_transit: { label: 'Đang vận chuyển', tone: 'neutral' },
  delivered: { label: 'Đã giao hàng', tone: 'success' },
  failed: { label: 'Giao thất bại / Lỗi', tone: 'danger' },
  cancelled: { label: 'Đã hủy giao', tone: 'danger' },
  pos_completed: { label: 'Mua tại quầy', tone: 'success' },
};

export const verificationSourceLabels: Record<string, string> = {
  shopify_fulfillment: 'Shopify Fulfillment API',
  ebay_fulfillment: 'eBay Fulfillment API',
  woocommerce_channel: 'Kênh WooCommerce',
  core_lifecycle: 'Quy trình nội bộ Core',
  pos_direct: 'Bán trực tiếp tại quầy',
};

export function getChannelSyncState(order: OrderApiRow): {
  status: 'pending' | 'processing' | 'confirmed' | 'failed' | 'reconcile' | 'not_applicable';
  label: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  detail: string;
} {
  if (order.channelCode === 'pos') {
    return {
      status: 'not_applicable',
      label: 'Không áp dụng',
      tone: 'neutral',
      detail: 'Đơn bán tại quầy POS, không cần đồng bộ sàn thương mại điện tử.',
    };
  }

  // Check if diagnostic errors exist on fulfillment
  if (order.unifiedShipping?.diagnostic_error) {
    return {
      status: 'failed',
      label: 'Lỗi đồng bộ',
      tone: 'danger',
      detail: `Mã lỗi: ${order.unifiedShipping.diagnostic_error}`,
    };
  }

  if (order.unifiedShipping?.remote_state === 'processing') {
    return {
      status: 'processing',
      label: 'Đang xử lý',
      tone: 'warning',
      detail: 'Yêu cầu đang được sàn xử lý xác thực.',
    };
  }

  if (order.unifiedShipping?.remote_state === 'conflict' || order.unifiedShipping?.remote_state === 'blocked') {
    return {
      status: 'reconcile',
      label: 'Cần đối soát',
      tone: 'danger',
      detail: 'Xung đột trạng thái giữa Core và sàn, cần đối soát.',
    };
  }

  if (order.externalSnapshot) {
    if (order.externalSnapshot.amount_observation === 'observed') {
      return {
        status: 'confirmed',
        label: 'Đã xác nhận',
        tone: 'success',
        detail: 'Dữ liệu đơn và thương mại đã được xác thực từ sàn.',
      };
    }
    if (order.externalSnapshot.amount_observation === 'partial') {
      return {
        status: 'reconcile',
        label: 'Cần đối soát',
        tone: 'warning',
        detail: 'Đã quan sát một phần dữ liệu sàn, cần đối soát thêm.',
      };
    }
  }

  return {
    status: 'pending',
    label: 'Chờ đồng bộ',
    tone: 'neutral',
    detail: 'Đang chờ webhook hoặc đợt đồng bộ tiếp theo từ sàn.',
  };
}

const paymentLabels: Record<string, string> = {
  pending: 'Chờ thanh toán',
  paid: 'Đã thanh toán',
  refunded: 'Đã hoàn tiền',
  failed: 'Thanh toán lỗi',
};

/** Vietnamese name for a stored payment status; an unknown value is shown as stored. */
export function paymentLabel(status: string): string {
  return paymentLabels[status] ?? status;
}

const channelNames: Record<string, string> = {
  pos: 'Bán tại quầy',
  shopify: 'Shopify',
  woocommerce: 'WooCommerce',
  ebay: 'eBay',
  shopee: 'Shopee',
  tiktok: 'TikTok Shop',
  lazada: 'Lazada',
  web: 'Website',
};

/** Vietnamese name for a stored channel code; an unknown code is shown as stored. */
export function channelName(code: string): string {
  return channelNames[code] ?? code;
}

/**
 * Filters live order rows.
 *
 * Client-side, on purpose, and for the same reason the inventory and product ledgers filter
 * client-side: the page holds at most 50 rows and a server round trip per keystroke would be
 * strictly worse. The backend CAN filter by status and channel, and the caller passes those
 * to the query as well — this is the second pass over the page, not a replacement for it.
 */
export function filterOrderApiRows(
  rows: OrderApiRow[],
  filters: OrderFilters,
  status: 'all' | ApiOrderStatus,
): OrderApiRow[] {
  const query = filters.query.trim().toLocaleLowerCase('vi');
  return rows.filter((order) => {
    const matchesQuery =
      !query ||
      [order.reference, order.externalId, order.customerName, order.channelCode, order.cancelledReason]
        .some((value) => value.toLocaleLowerCase('vi').includes(query));
    const matchesStatus = status === 'all' || order.status === status;
    const matchesChannel = filters.channel === 'all' || order.channelCode === filters.channel;
    // The API's fulfillment enum shares no name with the prototype's, so a prototype filter
    // value can never equal an API one. Rather than silently returning everything, the two
    // filters the API cannot honour are reported as inactive — the panel does not offer them.
    const matchesFulfillment = filters.fulfillment === 'all';
    const matchesDate = filters.date === 'all';
    return matchesQuery && matchesStatus && matchesChannel && matchesFulfillment && matchesDate;
  });
}

/** Whether a prototype filter can narrow a live list at all. */
export function apiIgnores(filters: OrderFilters): string[] {
  const ignored: string[] = [];
  if (filters.fulfillment !== 'all') ignored.push('fulfillment');
  if (filters.date !== 'all') ignored.push('date');
  return ignored;
}

export type OrderStatusTabApi = 'all' | OrderStatus | ApiOrderStatus;

export function isApiStatus(value: string): value is ApiOrderStatus {
  return value in apiStatusPresentation;
}
