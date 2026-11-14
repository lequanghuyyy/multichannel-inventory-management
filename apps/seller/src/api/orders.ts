import type { components, operations } from './generated/openapi';
import { apiFetch, createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';
import { pageOf, type Page } from './list';

export type Order = components['schemas']['Order'];
export type OrderItem = components['schemas']['OrderItem'];
export type OrderHistory = components['schemas']['OrderHistory'];
export type OrderMetrics = components['schemas']['OrderMetrics'];

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

export async function listOrders(query: OrderQuery = {}, signal?: AbortSignal): Promise<Page<Order> & { metrics: OrderMetrics }> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/orders', {
    params: { query },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu danh sách đơn hàng nhận về không hợp lệ.');
  return { ...pageOf<Order>(data as unknown as Record<string, unknown>, 'orders'), metrics: data.metrics };
}

export async function getOrder(orderId: string, signal?: AbortSignal): Promise<Order> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/orders/{orderId}', {
    params: { path: { orderId } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu chi tiết đơn hàng nhận về không hợp lệ.');
  return data;
}

export async function getOrderHistory(orderId: string, signal?: AbortSignal): Promise<OrderHistory> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/orders/{orderId}/history', {
    params: { path: { orderId } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    throw new Error('Không tải được lịch sử trạng thái đơn hàng.');
  }
  if (!data) throw new Error('Dữ liệu lịch sử đơn hàng nhận về không hợp lệ.');
  return data;
}

export async function confirmOrderPayment(orderId: string, note: string, idempotencyKey: string): Promise<Order> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/orders/{orderId}/payment/confirm', {
    params: { path: { orderId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { note },
    cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể ghi nhận xác nhận thanh toán.');
  }
  if (!data) throw new Error('Phản hồi xác nhận thanh toán không hợp lệ.');
  return data;
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

export async function bulkShipOrders(orderIds: string[], idempotencyKey: string): Promise<BulkShipResult> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/orders/bulk/ship', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: { order_ids: orderIds },
    cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể giao hàng loạt.');
  }
  if (!data) throw new Error('Phản hồi giao hàng loạt không hợp lệ.');
  return data;
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

export type TransitionOrderInput = operations['transitionOrder']['requestBody']['content']['application/json'];

/**
 * Move an order along its lifecycle, or cancel it.
 *
 * Cancelling is the only operation here that puts physical stock back on the shelf, so the
 * idempotency key is not optional bookkeeping: a retry that re-applied the cancellation
 * would invent inventory. Retrying with the SAME key replays the first answer without
 * restocking; reusing a key against a different order or status is a 409.
 *
 * `reason` is required by the API for a cancellation and ignored for a fulfilment step.
 * Pass it whenever you cancel — it is the only record of why the goods went back.
 */
export async function transitionOrder(
  orderId: string,
  input: TransitionOrderInput,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Order> {
  const client = createApiClient();
  const { data, error, response } = await client.PATCH('/api/v1/orders/{orderId}', {
    params: {
      path: { orderId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: input,
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu cập nhật đơn hàng nhận về không hợp lệ.');
  return data;
}

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
 * Sell a cart. `idempotencyKey` MUST be stable per attempt at one basket: retrying the
 * SAME key replays the original order instead of selling a second time, while reusing a
 * key with a different cart is a 409 IDEMPOTENCY_CONFLICT rather than a silent double
 * sale. A key generated per click defeats both guarantees, so callers derive it from
 * the cart, not from the render.
 */
export async function createOrder(input: CreateOrderInput, idempotencyKey: string, signal?: AbortSignal): Promise<Order> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/orders', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu tạo đơn hàng nhận về không hợp lệ.');
  return data;
}
