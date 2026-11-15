import type { components, operations } from './generated/openapi';
import { apiFetch, createApiClient } from './client';
import { ApiRequestError, parseApiError, responseApiError } from '../core/api-error';
import { pageOf, type Page } from './list';

export type Order = components['schemas']['Order'];
export type OrderItem = components['schemas']['OrderItem'];
export type OrderMetrics = components['schemas']['OrderMetrics'];
export type OrderCurrencyMetric = components['schemas']['OrderCurrencyMetric'];

/**
 * One status change.
 *
 * The Spring Boot history row has a nullable `from_status`: the first row of an order has no
 * previous state. The legacy `OrderStatusChange` declared it non-nullable, which would force
 * this adapter to invent a status for the creation event, so the history shape is local.
 */
export interface OrderHistoryEvent {
  id: number;
  from_status: string | null;
  to_status: string;
  reason?: string | null;
  actor_email?: string | null;
  changed_at: string;
}

export interface OrderHistory {
  history: OrderHistoryEvent[];
}

export interface OrderInternalNote {
  id: string;
  order_id: string;
  body: string;
  is_attention: boolean;
  created_by_user_id?: string;
  created_by_email: string;
  created_at: string;
}

export interface OrderAttachment {
  id: string;
  order_id: string;
  file_name: string;
  mime_type: 'application/pdf' | 'image/jpeg' | 'image/png';
  byte_size: number;
  sha256: string;
  description: string;
  uploaded_by_email: string;
  created_at: string;
}

export interface OrderAttachmentEvent {
  id: number;
  action: 'uploaded' | 'removed';
  file_name: string;
  actor_email: string;
  created_at: string;
}

export interface OrderAttachments {
  attachments: OrderAttachment[];
  events: OrderAttachmentEvent[];
}

type ServerOrder = components['schemas']['OrderResponse'];
type ServerOrderItem = NonNullable<ServerOrder['items']>[number];
type ServerOrderHistory = components['schemas']['OrderHistoryResponse'];

function requireId(value: unknown, entity: string): string {
  if (value === undefined || value === null) {
    throw new Error(`Phản hồi ${entity} không có mã hợp lệ.`);
  }
  const str = String(value).trim();
  if (!str) {
    throw new Error(`Phản hồi ${entity} không có mã hợp lệ.`);
  }
  return str;
}

function toOrderStatus(value: string | undefined): Order['status'] {
  const status = (value ?? '').toLowerCase();
  if (status === 'placed' || status === 'confirmed' || status === 'packed' || status === 'shipped' || status === 'delivered' || status === 'cancelled') {
    return status;
  }
  throw new Error(`Máy chủ trả về trạng thái đơn hàng không hợp lệ: ${value ?? '(trống)'}.`);
}

/**
 * The server separates an actual processor settlement (`PAID`) from a cashier recording money
 * (`RECORDED_MANUALLY`). The legacy screen has one "paid" state, so a recorded manual payment
 * maps there and the manual-confirmation evidence stays beside it on the row.
 */
function toPaymentStatus(value: string | undefined): Order['payment_status'] {
  switch ((value ?? '').toUpperCase()) {
    case 'PENDING':
      return 'pending';
    case 'RECORDED_MANUALLY':
    case 'PAID':
      return 'paid';
    case 'REFUNDED':
      return 'refunded';
    default:
      return 'failed';
  }
}

function fulfillmentFor(status: Order['status']): Order['fulfillment_status'] {
  switch (status) {
    case 'placed':
      return 'pending';
    case 'confirmed':
    case 'packed':
      return 'picking';
    case 'shipped':
      return 'shipped';
    case 'delivered':
      return 'delivered';
    case 'cancelled':
      return 'returned';
  }
}

function toOrderItem(item: ServerOrderItem): OrderItem {
  const unitPrice = item.unit_price ?? 0;
  const quantity = item.quantity ?? 0;
  return {
    id: item.id === undefined ? undefined : String(item.id),
    variant_id: requireId(item.variant_id, 'dòng đơn hàng'),
    // Spring Boot does not persist a hold id per line.
    reservation_id: '',
    product_id: null,
    sku: item.sku ?? '',
    // The server order line stores the SKU but no product name snapshot.
    name: item.sku ?? '',
    color: null,
    size: null,
    primary_media_id: null,
    quantity,
    // Unit prices are integer dong; line totals are the only derived number and stay integer.
    unit_price_minor: unitPrice,
    line_total_minor: unitPrice * quantity,
    returned_quantity: 0,
  };
}

function toOrder(order: ServerOrder): Order {
  const status = toOrderStatus(order.status);
  const paymentStatus = toPaymentStatus(order.payment_status);
  const currency = order.currency ?? 'VND';
  const items = (order.items ?? []).map(toOrderItem);
  const totalMinor = order.total_amount ?? 0;
  const payment = order.payment;
  const recordedAt = order.updated_at ?? order.created_at ?? '';
  const posPayment = payment
    ? {
      method: (payment.method ?? '').toUpperCase() === 'CASH' ? ('cash' as const) : ('bank_transfer' as const),
      currency: payment.currency ?? currency,
      amount_due_minor: payment.amount_due ?? totalMinor,
      cash_received_minor: payment.cash_received ?? null,
      change_minor: payment.change ?? null,
      recorded_by_email: payment.actor ?? null,
      created_at: payment.paid_at ?? recordedAt,
    }
    : null;
  const manualPaymentConfirmation = (order.payment_status ?? '').toUpperCase() === 'RECORDED_MANUALLY' && payment
    ? {
      note: payment.note ?? '',
      confirmed_by_email: payment.actor ?? null,
      confirmed_at: payment.paid_at ?? recordedAt,
    }
    : null;

  return {
    id: requireId(order.id, 'đơn hàng'),
    reference: order.order_number ?? '',
    external_id: order.external_order_id ?? null,
    shop_id: null,
    channel_id: order.channel_id === undefined ? null : String(order.channel_id),
    channel_code: (order.source ?? 'POS').toLowerCase(),
    status,
    payment_status: paymentStatus,
    fulfillment_status: fulfillmentFor(status),
    customer_name: null,
    customer_phone: null,
    customer_email: null,
    recipient_name: null,
    recipient_phone: null,
    delivery_address: null,
    delivery_note: null,
    delivery_method: null,
    currency,
    item_count: items.reduce((total, item) => total + item.quantity, 0),
    total_minor: totalMinor,
    subtotal_minor: totalMinor,
    discount_minor: 0,
    pos_payment: posPayment,
    manual_payment_confirmation: manualPaymentConfirmation,
    placed_at: order.created_at ?? '',
    updated_at: order.updated_at ?? '',
    cancelled_reason: null,
    items,
    external_snapshot: null,
    external_lines: [],
    // No processor evidence is fetched here; the legacy row shows an empty list rather than a guess.
    payment_observations: [],
    unified_shipping: null,
    cancellation_guard: null,
  };
}

async function throwOrderUtilityError(response: Response): Promise<never> {
  try {
    const error: unknown = await response.json();
    throw new ApiRequestError(parseApiError(error), response.status);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new Error(`Thao tác với đơn hàng thất bại (${response.status}).`);
  }
}

export async function listOrderInternalNotes(orderId: string, signal?: AbortSignal): Promise<OrderInternalNote[]> {
  const response = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/notes`, { signal, cache: 'no-store' });
  if (!response.ok) return throwOrderUtilityError(response);
  return await response.json() as OrderInternalNote[];
}

export async function createOrderInternalNote(
  orderId: string,
  input: { body: string; is_attention: boolean },
): Promise<OrderInternalNote> {
  const response = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/notes`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
    cache: 'no-store',
  });
  if (!response.ok) return throwOrderUtilityError(response);
  return await response.json() as OrderInternalNote;
}

export async function listOrderAttachments(orderId: string, signal?: AbortSignal): Promise<OrderAttachments> {
  const response = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/attachments`, { signal, cache: 'no-store' });
  if (!response.ok) return throwOrderUtilityError(response);
  return await response.json() as OrderAttachments;
}

export async function uploadOrderAttachment(orderId: string, file: File, description: string): Promise<OrderAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  if (description.trim()) formData.append('description', description.trim());
  const response = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/attachments`, {
    method: 'POST',
    body: formData,
    cache: 'no-store',
  });
  if (!response.ok) return throwOrderUtilityError(response);
  return await response.json() as OrderAttachment;
}

export async function getOrderAttachmentBlob(orderId: string, attachmentId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    signal,
    cache: 'no-store',
  });
  if (!response.ok) return throwOrderUtilityError(response);
  return await response.blob();
}

export async function deleteOrderAttachment(orderId: string, attachmentId: string): Promise<void> {
  const response = await apiFetch(`/api/v1/orders/${encodeURIComponent(orderId)}/attachments/${encodeURIComponent(attachmentId)}`, {
    method: 'DELETE',
    cache: 'no-store',
  });
  if (!response.ok) return throwOrderUtilityError(response);
}

export interface OrderQuery {
  limit?: number;
  cursor?: string;
  status?: Order['status'];
  channel?: string;
  q?: string;
  fulfillment_status?: Order['fulfillment_status'];
  placed_from?: string;
  placed_to?: string;
}

export type OrderExportQuery = operations['exportOrdersCsv']['parameters']['query'];

/** Frozen legacy route: Spring Boot does not serve `/orders/export` yet. */
export async function exportOrdersCSV(query: OrderExportQuery, ids: string[] = []): Promise<Blob> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/orders/export', {
    params: { query: { ...query, ...(ids.length ? { ids } : {}) } },
    parseAs: 'blob',
    cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể xuất danh sách đơn hàng.');
  }
  if (!(data instanceof Blob)) throw new Error('Phản hồi CSV không hợp lệ.');
  return data;
}

function matchesQuery(order: Order, query: OrderQuery): boolean {
  if (query.status && order.status !== query.status) return false;
  if (query.channel && order.channel_code !== query.channel) return false;
  if (query.fulfillment_status && order.fulfillment_status !== query.fulfillment_status) return false;
  if (query.placed_from && order.placed_at < query.placed_from) return false;
  if (query.placed_to && order.placed_at >= query.placed_to) return false;
  const term = query.q?.trim().toLocaleLowerCase('vi-VN');
  if (!term) return true;
  return [
    order.reference,
    order.channel_code,
    ...(order.items ?? []).map((item) => `${item.sku} ${item.name}`),
  ].join(' ').toLocaleLowerCase('vi-VN').includes(term);
}

function computeMetrics(orders: readonly Order[]): OrderMetrics {
  const byCurrency = new Map<string, OrderCurrencyMetric>();
  let deliveredUnits = 0;
  let deliveredOrders = 0;
  let cancelledOrders = 0;

  for (const order of orders) {
    const currency = order.currency || 'VND';
    const metric = byCurrency.get(currency) ?? {
      currency,
      gross_order_value_minor: 0,
      non_cancelled_order_value_minor: 0,
      manually_paid_order_value_minor: 0,
      cancelled_order_value_minor: 0,
    };
    metric.gross_order_value_minor += order.total_minor;
    if (order.status === 'cancelled') {
      metric.cancelled_order_value_minor += order.total_minor;
      cancelledOrders += 1;
    } else {
      metric.non_cancelled_order_value_minor += order.total_minor;
    }
    if (order.payment_status === 'paid') metric.manually_paid_order_value_minor += order.total_minor;
    if (order.status === 'delivered') {
      deliveredOrders += 1;
      deliveredUnits += order.item_count;
    }
    byCurrency.set(currency, metric);
  }

  return {
    currency_values: [...byCurrency.values()],
    delivered_units: deliveredUnits,
    // Spring Boot exposes no returns endpoint, so nothing has been returned yet.
    returned_units: 0,
    net_delivered_units: deliveredUnits,
    cancelled_orders: cancelledOrders,
    delivered_orders: deliveredOrders,
  };
}

/**
 * `GET /orders` supports both bare arrays from Spring Boot and legacy envelope shapes.
 */
export async function listOrders(query: OrderQuery = {}, signal?: AbortSignal): Promise<Page<Order> & { metrics: OrderMetrics }> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/orders', {
    params: { query: query as any },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu danh sách đơn hàng nhận về không hợp lệ.');

  if (Array.isArray(data)) {
    const items = data.map(toOrder).filter((order) => matchesQuery(order, query));
    const statusCounts: Record<string, number> = {};
    for (const order of items) statusCounts[order.status] = (statusCounts[order.status] ?? 0) + 1;
    return { items, nextCursor: null, totalCount: items.length, statusCounts, metrics: computeMetrics(items) };
  }

  const page = pageOf<Order>(data as unknown as Record<string, unknown>, 'orders');
  return {
    ...page,
    metrics: (data as any).metrics ?? computeMetrics(page.items),
  };
}

export async function getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/orders/{id}', {
    params: { path: { id: orderId as any } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu chi tiết đơn hàng nhận về không hợp lệ.');
  if (typeof (data as any).id === 'number' || 'order_number' in (data as any)) {
    return toOrder(data);
  }
  return data as unknown as Order;
}

export async function getOrderHistory(orderId: string, signal?: AbortSignal): Promise<OrderHistory> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/orders/{id}/history', {
    params: { path: { id: Number(orderId) } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);
  if (!Array.isArray(data)) throw new Error('Dữ liệu lịch sử đơn hàng nhận về không hợp lệ.');
  return {
    history: data.map((event: ServerOrderHistory, index: number) => ({
      id: event.id ?? index,
      from_status: event.from_status === undefined || event.from_status === null ? null : toOrderStatus(event.from_status),
      to_status: toOrderStatus(event.to_status),
      reason: event.reason ?? null,
      actor_email: event.actor ?? null,
      changed_at: event.changed_at ?? '',
    })),
  };
}

/**
 * A cashier's payment evidence, structurally compatible with `SalePaymentInstruction`.
 *
 * `external` is a transfer or another non-cash method; Spring Boot records both as
 * `BANK_TRANSFER`. `changeMinor` from the POS instruction is not sent: the server derives the
 * change from the order total and the cash received.
 */
export interface OrderPaymentInstruction {
  method: 'cash' | 'external';
  receivedMinor: number;
  note: string;
}

/**
 * Records money received. A string is the manual admin gesture used on the order screen and is
 * sent as a bank transfer with the text as its note.
 */
export async function confirmOrderPayment(
  orderId: string,
  payment: OrderPaymentInstruction | string,
  idempotencyKey: string,
): Promise<Order> {
  const body = typeof payment === 'string'
    ? { method: 'BANK_TRANSFER', ...(payment.trim() ? { note: payment.trim() } : {}) }
    : {
      method: payment.method === 'cash' ? 'CASH' : 'BANK_TRANSFER',
      ...(payment.method === 'cash' ? { cash_received: payment.receivedMinor } : {}),
      ...(payment.note.trim() ? { note: payment.note.trim() } : {}),
    };
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/orders/{id}/payment/confirm', {
    params: { path: { id: Number(orderId) }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
    cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Phản hồi xác nhận thanh toán không hợp lệ.');
  return toOrder(data);
}

export async function confirmWooOrderPayment(
  orderId: string,
  input: { transaction_reference: string; note?: string },
  idempotencyKey: string,
): Promise<components['schemas']['WooCommerceOrderPaymentConfirmation']> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/orders/{orderId}/woocommerce-payment/confirm', {
    params: { path: { orderId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể xác nhận thanh toán WooCommerce.');
  }
  if (!data) throw new Error('Phản hồi xác nhận thanh toán WooCommerce không hợp lệ.');
  return data;
}

export type BulkShipResult = components['schemas']['BulkShipResult'];

/**
 * Spring Boot has no bulk route: each order is shipped on its own. The loop stops at the first
 * failure so the caller sees which order broke instead of a half-reported batch.
 */
export async function bulkShipOrders(orderIds: string[], _idempotencyKey?: string): Promise<BulkShipResult> {
  const client = createApiClient();
  const orders: Order[] = [];
  for (const orderId of orderIds) {
    const { data, response } = await client.POST('/api/v1/orders/{id}/ship', {
      params: { path: { id: Number(orderId) } },
      cache: 'no-store',
    });
    if (!response.ok) await responseApiError(response);
    if (!data) throw new Error('Phản hồi giao hàng không hợp lệ.');
    orders.push(toOrder(data));
  }
  return { orders };
}

export type ReturnsSummary = components['schemas']['ReturnsSummary'];
export type OrderReturn = components['schemas']['OrderReturn'];
export type ReturnCreateInput = components['schemas']['ReturnCreateRequest'];
export type ReturnInspectInput = components['schemas']['ReturnInspectRequest'];
export type ReturnReceiveInput = components['schemas']['ReturnReceiveRequest'];
export type ReturnCloseInput = components['schemas']['ReturnCloseRequest'];

export async function getOrderReturns(orderId: string, signal?: AbortSignal): Promise<ReturnsSummary> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/orders/{orderId}/returns', { params: { path: { orderId } }, signal, cache: 'no-store' });
  if (!response.ok) { if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error),response.status); throw new Error('Không tải được lịch sử trả hàng.'); }
  if (!data) throw new Error('Dữ liệu trả hàng không hợp lệ.'); return data;
}

export async function createOrderReturn(orderId: string, body: ReturnCreateInput, key: string): Promise<OrderReturn> {
  const client=createApiClient();const {data,error,response}=await client.POST('/api/v1/orders/{orderId}/returns',{params:{path:{orderId},header:{'Idempotency-Key':key}},body,cache:'no-store'});
  if(!response.ok){if(error&&typeof error==='object')throw new ApiRequestError(parseApiError(error),response.status);throw new Error('Không thể tạo yêu cầu trả hàng.')}if(!data)throw new Error('Phản hồi trả hàng không hợp lệ.');return data;
}

export async function receiveOrderReturn(returnId: string, body: ReturnReceiveInput, key: string): Promise<OrderReturn> {
  const client=createApiClient();const {data,error,response}=await client.POST('/api/v1/order-returns/{returnId}/receive',{params:{path:{returnId},header:{'Idempotency-Key':key}},body,cache:'no-store'});
  if(!response.ok){if(error&&typeof error==='object')throw new ApiRequestError(parseApiError(error),response.status);throw new Error('Không thể ghi nhận tiếp nhận hàng trả.')}if(!data)throw new Error('Phản hồi trả hàng không hợp lệ.');return data;
}

export async function inspectOrderReturn(returnId: string, body: ReturnInspectInput, key: string): Promise<OrderReturn> {
  const client=createApiClient();const {data,error,response}=await client.POST('/api/v1/order-returns/{returnId}/inspect',{params:{path:{returnId},header:{'Idempotency-Key':key}},body,cache:'no-store'});
  if(!response.ok){if(error&&typeof error==='object')throw new ApiRequestError(parseApiError(error),response.status);throw new Error('Không thể hoàn tất kiểm tra hàng trả.')}if(!data)throw new Error('Phản hồi trả hàng không hợp lệ.');return data;
}

export async function cancelOrderReturn(returnId: string, body: ReturnCloseInput, key: string): Promise<OrderReturn> {
  const client=createApiClient();const {data,error,response}=await client.POST('/api/v1/order-returns/{returnId}/cancel',{params:{path:{returnId},header:{'Idempotency-Key':key}},body,cache:'no-store'});
  if(!response.ok){if(error&&typeof error==='object')throw new ApiRequestError(parseApiError(error),response.status);throw new Error('Không thể hủy yêu cầu trả hàng.')}if(!data)throw new Error('Phản hồi trả hàng không hợp lệ.');return data;
}

export async function rejectOrderReturn(returnId: string, body: ReturnCloseInput, key: string): Promise<OrderReturn> {
  const client=createApiClient();const {data,error,response}=await client.POST('/api/v1/order-returns/{returnId}/reject',{params:{path:{returnId},header:{'Idempotency-Key':key}},body,cache:'no-store'});
  if(!response.ok){if(error&&typeof error==='object')throw new ApiRequestError(parseApiError(error),response.status);throw new Error('Không thể từ chối hàng trả.')}if(!data)throw new Error('Phản hồi trả hàng không hợp lệ.');return data;
}

/** Transition targets the Spring Boot lifecycle accepts on `/transition`. */
export type TransitionOrderInput = {
  status: 'confirmed' | 'packed' | 'shipped' | 'delivered' | 'cancelled';
  reason?: string;
};

const SERVER_TARGET: Readonly<Record<Exclude<TransitionOrderInput['status'], 'cancelled'>, string>> = {
  confirmed: 'CONFIRMED',
  packed: 'PACKED',
  shipped: 'SHIPPED',
  delivered: 'DELIVERED',
};

/**
 * Move an order along its lifecycle, or cancel it.
 *
 * Cancelling is the only operation here that puts physical stock back on the shelf, so the
 * idempotency key is not optional bookkeeping: a retry that re-applied the cancellation
 * would invent inventory. Spring Boot gives cancellation its own route, which is why the
 * target is translated instead of sent to `/transition`.
 */
export async function transitionOrder(
  orderId: string,
  input: TransitionOrderInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Order> {
  const client = createApiClient();
  if (input.status === 'cancelled') {
    const { data, response } = await client.POST('/api/v1/orders/{id}/cancel', {
      params: { path: { id: Number(orderId) }, header: { 'Idempotency-Key': idempotencyKey } },
      body: { reason: input.reason?.trim() ?? '' },
      signal,
      cache: 'no-store',
    });
    if (!response.ok) await responseApiError(response);
    if (!data) throw new Error('Dữ liệu hủy đơn hàng nhận về không hợp lệ.');
    return toOrder(data);
  }

  const { data, response } = await client.POST('/api/v1/orders/{id}/transition', {
    params: { path: { id: Number(orderId) }, header: { 'Idempotency-Key': idempotencyKey } },
    body: {
      status: SERVER_TARGET[input.status],
      ...(input.reason?.trim() ? { reason: input.reason.trim() } : {}),
    },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu cập nhật đơn hàng nhận về không hợp lệ.');
  return toOrder(data);
}

/** The cart shape the POS screen has always built; the adapter sends only what the server takes. */
export interface CreateOrderInput {
  reference: string;
  external_id?: string;
  channel_code?: string;
  customer_name?: string;
  customer_phone?: string;
  discount_minor?: number;
  discount_reason?: string;
  payment_method?: 'cash' | 'bank_transfer' | 'cod';
  cash_received_minor?: number;
  lines: { sku: string; quantity: number }[];
}

/**
 * Sell a cart.
 *
 * The server owns the price and the idempotency guarantee. `reference`, discounts and the
 * payment method are POS-side facts and are deliberately not forwarded: Spring Boot accepts
 * only `{ source, items }`, and a discount it does not store would make the printed receipt
 * disagree with the order it describes.
 */
export async function createOrder(input: CreateOrderInput, idempotencyKey: string, signal?: AbortSignal): Promise<Order> {
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/orders', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input as any,
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu tạo đơn hàng nhận về không hợp lệ.');
  if (typeof (data as any).id === 'number' || 'order_number' in (data as any)) {
    return toOrder(data);
  }
  return data as unknown as Order;
}
