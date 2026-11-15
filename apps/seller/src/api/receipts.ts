import type { components } from './generated/openapi';
import { createApiClient } from './client';
import { ApiRequestError, parseApiError, responseApiError } from '../core/api-error';

type ServerReceipt = components['schemas']['ReceiptResponse'];
type ServerReceiptItem = NonNullable<ServerReceipt['items']>[number];
type ServerReceiptEvent = NonNullable<ServerReceipt['events']>[number];
type ServerPreview = components['schemas']['ReceiptPreviewResponse'];
type ServerPreviewLine = NonNullable<ServerPreview['items']>[number];

export interface ReceiptItem {
  id: string;
  receipt_id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  expected_quantity: number;
  unit_cost_minor: number | null;
  received_quantity: number;
  inspected_quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  remaining_quantity: number;
  replaced_quantity: number;
  short_quantity: number;
  created_at: string;
}

export interface ReceiptEventItem {
  id: string;
  receipt_item_id: string;
  variant_id: string;
  sku: string;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string;
  on_hand_before: number;
  on_hand_after: number;
}

export interface ReceiptEvent {
  id: string;
  receipt_id: string;
  batch_number: number;
  actor_user_id?: string;
  actor_email: string;
  note: string;
  created_at: string;
  items: ReceiptEventItem[];
}

export interface ReceiptRejectionAction {
  id: string;
  rejection_id: string;
  receipt_id: string;
  action_type: 'REQUEST_REPLACEMENT' | 'RECEIVE_REPLACEMENT' | 'RETURN_SUPPLIER' | 'CLOSE_WITHOUT_REPLACEMENT' | string;
  quantity: number;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string;
  note?: string;
  actor_user_id?: string;
  actor_email: string;
  created_at: string;
}

export interface ReceiptRejection {
  id: string;
  receipt_id: string;
  receipt_item_id: string;
  event_id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  rejected_quantity: number;
  rejection_reason: string;
  status: 'PENDING' | 'REPLACEMENT_REQUESTED' | 'PARTIALLY_REPLACED' | 'RESOLVED' | 'RETURNED' | 'CLOSED' | string;
  replacement_requested_quantity: number;
  replacement_accepted_quantity: number;
  replacement_rejected_quantity: number;
  returned_quantity: number;
  closed_quantity: number;
  unresolved_quantity: number;
  created_by_user_id?: string;
  created_by_email: string;
  created_at: string;
  updated_at: string;
  actions: ReceiptRejectionAction[];
}

export interface ReceiptAttachment {
  id: string;
  receipt_id: string;
  file_name: string;
  mime_type: string;
  byte_size: number;
  sha256: string;
  description?: string;
  uploaded_by_user_id?: string;
  uploaded_by_email: string;
  created_at: string;
}

export interface ReceiptSummary {
  id: string;
  receipt_number: string;
  supplier_name: string;
  reference_number?: string;
  status: 'DRAFT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED_SHORT' | 'CANCELLED' | string;
  note?: string;
  created_by_user_id?: string;
  created_by_email: string;
  cancelled_reason?: string;
  closed_short_reason?: string;
  closed_short_by_email?: string;
  closed_short_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  received_at?: string | null;
  item_count: number;
  total_expected: number;
  total_received: number;
  total_inspected: number;
  total_accepted: number;
  total_rejected: number;
  total_remaining: number;
  pending_rejection_count: number;
}

export interface Receipt {
  id: string;
  receipt_number: string;
  supplier_name: string;
  reference_number?: string;
  status: 'DRAFT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED_SHORT' | 'CANCELLED' | string;
  note?: string;
  created_by_user_id?: string;
  created_by_email: string;
  cancelled_reason?: string;
  closed_short_reason?: string;
  closed_short_by_user_id?: string;
  closed_short_by_email?: string;
  closed_short_at?: string | null;
  version: number;
  created_at: string;
  updated_at: string;
  received_at?: string | null;
  item_count: number;
  total_expected: number;
  total_received: number;
  total_inspected: number;
  total_accepted: number;
  total_rejected: number;
  total_remaining: number;
  items: ReceiptItem[];
  events: ReceiptEvent[];
  rejections: ReceiptRejection[];
  attachments: ReceiptAttachment[];
}

export interface CreateItemInput {
  sku: string;
  expected_quantity: number;
  unit_cost_minor?: number;
}

export interface CreateReceiptRequest {
  supplier_name: string;
  /** Accepted for the frozen legacy contract; Spring Boot ignores it. */
  reference_number?: string;
  note?: string;
  items: CreateItemInput[];
}

export interface ReceiveItemInput {
  sku: string;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string;
  expected_inventory_version?: number;
}

export interface ReceiveRequest {
  note?: string;
  items: ReceiveItemInput[];
}

export interface CloseShortReceiptRequest {
  reason: string;
  expected_version?: number;
}

export interface RejectionActionRequest {
  action_type: 'REQUEST_REPLACEMENT' | 'RECEIVE_REPLACEMENT' | 'RETURN_SUPPLIER' | 'CLOSE_WITHOUT_REPLACEMENT';
  quantity?: number;
  accepted_quantity?: number;
  rejected_quantity?: number;
  rejection_reason?: string;
  note?: string;
  expected_inventory_version?: number;
}

export interface UpdateReceiptRequest {
  supplier_name: string;
  /** Accepted for the frozen legacy contract; Spring Boot ignores it. */
  reference_number?: string;
  note?: string;
  expected_version?: number;
  items: CreateItemInput[];
}

export interface ReceivePreviewItem {
  sku: string;
  product_name: string;
  variant_id: string;
  expected_quantity: number;
  received_quantity_before: number;
  accepted_quantity: number;
  rejected_quantity: number;
  rejection_reason?: string;
  remaining_before: number;
  remaining_after: number;
  current_on_hand: number;
  projected_on_hand: number;
  inventory_version: number;
  valid: boolean;
  errors: string[];
}

export interface ReceivePreviewResult {
  receipt_id: string;
  receipt_number: string;
  supplier_name: string;
  receipt_status: 'DRAFT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED_SHORT' | 'CANCELLED' | string;
  total_skus: number;
  total_accepted: number;
  total_rejected: number;
  total_remaining_after: number;
  items: ReceivePreviewItem[];
  valid: boolean;
  errors: string[];
}

export interface ReceiptAuditEntry {
  id: string;
  receipt_id: string;
  action: string;
  actor_user_id?: string;
  actor_email: string;
  changes: any;
  created_at: string;
}

export interface CancelReceiptRequest {
  reason: string;
  /** Required by Spring Boot: a cancellation must name the version it saw. */
  expected_version: number;
}

export interface ReceiptsQuery {
  limit?: number;
  cursor?: string;
  status?: 'DRAFT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED_SHORT' | 'CANCELLED' | 'all';
  query?: string;
}

function requireId(value: number | undefined, entity: string): string {
  if (value === undefined || !Number.isSafeInteger(value)) {
    throw new Error(`Phản hồi ${entity} không có mã hợp lệ.`);
  }
  return String(value);
}

function toReceiptItem(item: ServerReceiptItem, receiptId: string, createdAt: string): ReceiptItem {
  const accepted = item.accepted_qty ?? 0;
  const rejected = item.rejected_qty ?? 0;
  return {
    id: requireId(item.id, 'dòng phiếu nhập'),
    receipt_id: receiptId,
    variant_id: requireId(item.variant_id, 'dòng phiếu nhập'),
    sku: item.sku ?? '',
    // The server returns the variant title; there is no separate product-name snapshot.
    product_name: item.variant_title ?? item.sku ?? '',
    expected_quantity: item.expected_qty ?? 0,
    unit_cost_minor: item.unit_cost ?? null,
    received_quantity: item.processed_qty ?? accepted + rejected,
    inspected_quantity: accepted + rejected,
    accepted_quantity: accepted,
    rejected_quantity: rejected,
    remaining_quantity: item.remaining_qty ?? 0,
    // Spring Boot has no replacement workflow, so nothing can have been replaced.
    replaced_quantity: 0,
    short_quantity: 0,
    created_at: createdAt,
  };
}

function toReceiptEvent(event: ServerReceiptEvent, receiptId: string): ReceiptEvent {
  return {
    id: requireId(event.id, 'sự kiện phiếu nhập'),
    receipt_id: receiptId,
    batch_number: event.receipt_version ?? 0,
    actor_email: event.actor ?? '',
    note: event.note ?? '',
    created_at: event.created_at ?? '',
    items: [],
  };
}

function toReceipt(receipt: ServerReceipt): Receipt {
  const id = requireId(receipt.id, 'phiếu nhập');
  const createdAt = receipt.created_at ?? '';
  const items = (receipt.items ?? []).map((item) => toReceiptItem(item, id, createdAt));
  const acceptedTotal = receipt.accepted_total ?? items.reduce((total, item) => total + item.accepted_quantity, 0);
  const rejectedTotal = receipt.rejected_total ?? items.reduce((total, item) => total + item.rejected_quantity, 0);
  const remainingTotal = receipt.remaining_total ?? items.reduce((total, item) => total + item.remaining_quantity, 0);
  const expectedTotal = items.reduce((total, item) => total + item.expected_quantity, 0);
  const processedTotal = acceptedTotal + rejectedTotal;

  return {
    id,
    receipt_number: receipt.receipt_number ?? '',
    supplier_name: receipt.supplier_name ?? '',
    status: receipt.status ?? 'DRAFT',
    note: receipt.note,
    // Spring Boot does not store the creating or closing user on the receipt row.
    created_by_email: '',
    cancelled_reason: receipt.cancel_reason,
    closed_short_reason: receipt.close_short_reason,
    closed_short_at: receipt.closed_short_at ?? null,
    version: receipt.version ?? 0,
    created_at: createdAt,
    updated_at: receipt.updated_at ?? '',
    received_at: receipt.batches?.at(-1)?.received_at ?? null,
    item_count: items.length,
    total_expected: expectedTotal || processedTotal + remainingTotal,
    total_received: processedTotal,
    total_inspected: processedTotal,
    total_accepted: acceptedTotal,
    total_rejected: rejectedTotal,
    total_remaining: remainingTotal,
    items,
    events: (receipt.events ?? []).map((event) => toReceiptEvent(event, id)),
    // These belong to the legacy rejection/attachment routes Spring Boot does not serve.
    rejections: [],
    attachments: [],
  };
}

function toSummary(receipt: ServerReceipt): ReceiptSummary {
  const mapped = toReceipt(receipt);
  return {
    id: mapped.id,
    receipt_number: mapped.receipt_number,
    supplier_name: mapped.supplier_name,
    status: mapped.status,
    note: mapped.note,
    created_by_email: mapped.created_by_email,
    cancelled_reason: mapped.cancelled_reason,
    closed_short_reason: mapped.closed_short_reason,
    closed_short_at: mapped.closed_short_at,
    version: mapped.version,
    created_at: mapped.created_at,
    updated_at: mapped.updated_at,
    received_at: mapped.received_at,
    item_count: mapped.item_count,
    total_expected: mapped.total_expected,
    total_received: mapped.total_received,
    total_inspected: mapped.total_inspected,
    total_accepted: mapped.total_accepted,
    total_rejected: mapped.total_rejected,
    total_remaining: mapped.total_remaining,
    pending_rejection_count: mapped.items.filter((item) => item.rejected_quantity > 0).length,
  };
}

async function readServerReceipt(receiptId: string, signal?: AbortSignal): Promise<ServerReceipt> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/receipts/{id}', {
    params: { path: { id: Number(receiptId) } },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu chi tiết phiếu nhập nhận về không hợp lệ.');
  return data;
}

/** Maps the SKU-based receive form onto Spring Boot's item-id inspections. */
async function inspectionsFor(receiptId: string, input: ReceiveRequest, signal?: AbortSignal) {
  const receipt = await readServerReceipt(receiptId, signal);
  const bySku = new Map((receipt.items ?? []).map((item) => [item.sku ?? '', item.id]));
  return {
    receipt,
    body: {
      inspections: input.items.map((line) => {
        const itemId = bySku.get(line.sku);
        if (itemId === undefined) throw new Error(`SKU ${line.sku} không có trong phiếu nhập này.`);
        return {
          item_id: itemId,
          accepted_quantity: line.accepted_quantity,
          ...(line.rejected_quantity > 0 ? { rejected_quantity: line.rejected_quantity } : {}),
          ...(line.rejection_reason ? { rejection_reason: line.rejection_reason } : {}),
        };
      }),
      ...(receipt.version !== undefined ? { expected_receipt_version: receipt.version } : {}),
    },
  };
}

/**
 * `GET /receipts` returns a plain array and takes no parameters. Status and text filters are
 * applied here; there is no server cursor, so `nextCursor` stays undefined.
 */
export async function listReceipts(query: ReceiptsQuery = {}, signal?: AbortSignal): Promise<{ items: ReceiptSummary[]; nextCursor?: string }> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/receipts', { signal, cache: 'no-store' });

  if (!response.ok) await responseApiError(response);
  if (!Array.isArray(data)) throw new Error('Dữ liệu danh sách phiếu nhập nhận về không hợp lệ.');
  const term = query.query?.trim().toLocaleLowerCase('vi-VN');
  const items = data
    .map(toSummary)
    .filter((receipt) => query.status === undefined || query.status === 'all' || receipt.status === query.status)
    .filter((receipt) => !term || [receipt.receipt_number, receipt.supplier_name, receipt.note ?? '']
      .join(' ').toLocaleLowerCase('vi-VN').includes(term));
  return { items };
}

export async function getReceipt(receiptId: string, signal?: AbortSignal): Promise<Receipt> {
  return toReceipt(await readServerReceipt(receiptId, signal));
}

export async function createReceipt(input: CreateReceiptRequest, idempotencyKey: string, signal?: AbortSignal): Promise<Receipt> {
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/receipts', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: {
      supplier_name: input.supplier_name,
      ...(input.note ? { note: input.note } : {}),
      items: input.items.map((item) => ({
        sku: item.sku,
        expected_quantity: item.expected_quantity,
        ...(item.unit_cost_minor !== undefined ? { unit_cost_minor: item.unit_cost_minor } : {}),
      })),
    },
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu tạo phiếu nhập nhận về không hợp lệ.');
  return toReceipt(data);
}

export async function receiveReceipt(receiptId: string, input: ReceiveRequest, idempotencyKey: string, signal?: AbortSignal): Promise<Receipt> {
  const { body } = await inspectionsFor(receiptId, input, signal);
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/receipts/{id}/receive', {
    params: { path: { id: Number(receiptId) }, header: { 'Idempotency-Key': idempotencyKey } },
    body,
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu nhận hàng nhận về không hợp lệ.');
  return toReceipt(data);
}

export async function cancelReceipt(receiptId: string, input: CancelReceiptRequest, idempotencyKey: string, signal?: AbortSignal): Promise<Receipt> {
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/receipts/{id}/cancel', {
    params: { path: { id: Number(receiptId) }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { reason: input.reason, expected_version: input.expected_version },
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu hủy phiếu nhập nhận về không hợp lệ.');
  return toReceipt(data);
}

export async function closeShortReceipt(
  receiptId: string,
  input: CloseShortReceiptRequest,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<Receipt> {
  const version = input.expected_version ?? (await readServerReceipt(receiptId, signal)).version;
  if (version === undefined) throw new Error('Phiếu nhập không có phiên bản để kết thúc sớm.');
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/receipts/{id}/close-short', {
    params: { path: { id: Number(receiptId) }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { reason: input.reason, expected_version: version },
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu kết thúc sớm phiếu nhập nhận về không hợp lệ.');
  return toReceipt(data);
}

export async function updateReceipt(
  receiptId: string,
  input: UpdateReceiptRequest,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<Receipt> {
  if (input.expected_version === undefined) throw new Error('Cập nhật phiếu nhập cần phiên bản hiện tại.');
  const client = createApiClient();
  const { data, response } = await client.PATCH('/api/v1/receipts/{id}', {
    params: { path: { id: Number(receiptId) }, header: { 'Idempotency-Key': idempotencyKey } },
    body: {
      supplier_name: input.supplier_name,
      ...(input.note ? { note: input.note } : {}),
      expected_version: input.expected_version,
      items: input.items.map((item) => ({
        sku: item.sku,
        expected_quantity: item.expected_quantity,
        ...(item.unit_cost_minor !== undefined ? { unit_cost_minor: item.unit_cost_minor } : {}),
      })),
    },
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu cập nhật phiếu nhập nhận về không hợp lệ.');
  return toReceipt(data);
}

function toPreviewLine(line: ServerPreviewLine): ReceivePreviewItem {
  return {
    sku: line.sku ?? '',
    product_name: line.variant_title ?? line.sku ?? '',
    variant_id: requireId(line.variant_id, 'xem trước nhận hàng'),
    expected_quantity: line.expected_qty ?? 0,
    received_quantity_before: (line.already_accepted_qty ?? 0) + (line.already_rejected_qty ?? 0),
    accepted_quantity: line.accepted_qty ?? 0,
    rejected_quantity: line.rejected_qty ?? 0,
    rejection_reason: line.rejection_reason,
    remaining_before: line.remaining_before_qty ?? 0,
    remaining_after: line.remaining_after_qty ?? 0,
    current_on_hand: line.on_hand ?? 0,
    projected_on_hand: line.projected_on_hand ?? 0,
    inventory_version: line.balance_version ?? 0,
    valid: line.valid ?? true,
    errors: line.errors ?? [],
  };
}

export async function previewReceiveReceipt(
  receiptId: string,
  input: ReceiveRequest,
  signal?: AbortSignal
): Promise<ReceivePreviewResult> {
  const { receipt, body } = await inspectionsFor(receiptId, input, signal);
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/receipts/{id}/preview', {
    params: { path: { id: Number(receiptId) } },
    body,
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu xem trước nhận hàng không hợp lệ.');
  const items = (data.items ?? []).map(toPreviewLine);
  return {
    receipt_id: requireId(data.receipt_id ?? receipt.id, 'xem trước nhận hàng'),
    receipt_number: receipt.receipt_number ?? '',
    supplier_name: receipt.supplier_name ?? '',
    receipt_status: data.status ?? receipt.status ?? 'DRAFT',
    total_skus: items.length,
    total_accepted: data.accepted_total ?? 0,
    total_rejected: data.rejected_total ?? 0,
    total_remaining_after: data.remaining_total ?? 0,
    items,
    valid: data.valid ?? true,
    errors: data.errors ?? [],
  };
}

// ---------------------------------------------------------------------------------------------
// Frozen legacy surface. Spring Boot does not serve these routes yet; they fail honestly instead
// of falling back to fixtures. The receipt detail screen renders the empty lists beside them.
// ---------------------------------------------------------------------------------------------

export async function listReceiptAudit(
  receiptId: string,
  signal?: AbortSignal
): Promise<ReceiptAuditEntry[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/receipts/{receiptId}/audit', {
    params: {
      path: { receiptId },
    },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu nhật ký chỉnh sửa không hợp lệ.');
  return data as ReceiptAuditEntry[];
}

export async function exportReceiptCsv(receiptId: string, signal?: AbortSignal): Promise<Blob> {
  const res = await fetch(`/api/v1/receipts/${encodeURIComponent(receiptId)}/export.csv`, {
    method: 'GET',
    headers: {
      Accept: 'text/csv',
    },
    signal,
  });

  if (!res.ok) {
    throw new Error(`Xuất file CSV thất bại (${res.status}).`);
  }
  return await res.blob();
}

export async function listReceiptRejections(
  receiptId: string,
  signal?: AbortSignal
): Promise<ReceiptRejection[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/receipts/{receiptId}/rejections', {
    params: { path: { receiptId } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  return (data || []) as ReceiptRejection[];
}

export async function handleRejectionAction(
  receiptId: string,
  rejectionId: string,
  input: RejectionActionRequest,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<ReceiptRejection> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/receipts/{receiptId}/rejections/{rejectionId}/actions', {
    params: {
      path: { receiptId, rejectionId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: input as any,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu xử lý chênh lệch không hợp lệ.');
  return data as ReceiptRejection;
}

export async function listReceiptAttachments(
  receiptId: string,
  signal?: AbortSignal
): Promise<ReceiptAttachment[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/receipts/{receiptId}/attachments', {
    params: { path: { receiptId } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  return (data || []) as ReceiptAttachment[];
}

export async function uploadReceiptAttachment(
  receiptId: string,
  file: File,
  description?: string,
  signal?: AbortSignal
): Promise<ReceiptAttachment> {
  const formData = new FormData();
  formData.append('file', file);
  if (description) {
    formData.append('description', description);
  }

  const res = await fetch(`/api/v1/receipts/${encodeURIComponent(receiptId)}/attachments`, {
    method: 'POST',
    body: formData,
    signal,
  });

  if (!res.ok) {
    let msg = 'Tải lên tài liệu thất bại.';
    try {
      const errJson = await res.json();
      if (errJson?.error?.message) {
        msg = errJson.error.message;
      }
    } catch {
      // ignore
    }
    throw new Error(msg);
  }

  return await res.json();
}

export async function deleteReceiptAttachment(
  receiptId: string,
  attachmentId: string,
  signal?: AbortSignal
): Promise<void> {
  const client = createApiClient();
  const { error, response } = await client.DELETE('/api/v1/receipts/{receiptId}/attachments/{attachmentId}', {
    params: {
      path: { receiptId, attachmentId },
    },
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Xóa chứng từ đính kèm thất bại.');
  }
}

export function getAttachmentDownloadUrl(receiptId: string, attachmentId: string): string {
  return `/api/v1/receipts/${encodeURIComponent(receiptId)}/attachments/${encodeURIComponent(attachmentId)}`;
}
