import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';

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
  receipt_number?: string;
  supplier_name: string;
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
}

export interface ReceiptsQuery {
  limit?: number;
  cursor?: string;
  status?: 'DRAFT' | 'PARTIALLY_RECEIVED' | 'RECEIVED' | 'CLOSED_SHORT' | 'CANCELLED' | 'all';
  query?: string;
}

export async function listReceipts(query: ReceiptsQuery = {}, signal?: AbortSignal): Promise<{ items: ReceiptSummary[]; nextCursor?: string }> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/receipts', {
    params: {
      query: {
        limit: query.limit,
        cursor: query.cursor,
        status: query.status === 'all' ? undefined : (query.status as any),
        query: query.query,
      },
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
  if (!data) throw new Error('Dữ liệu danh sách phiếu nhập nhận về không hợp lệ.');
  return {
    items: data.items as ReceiptSummary[],
    nextCursor: data.next_cursor,
  };
}

export async function getReceipt(receiptId: string, signal?: AbortSignal): Promise<Receipt> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/receipts/{receiptId}', {
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
  if (!data) throw new Error('Dữ liệu chi tiết phiếu nhập nhận về không hợp lệ.');
  return data as Receipt;
}

export async function createReceipt(input: CreateReceiptRequest, idempotencyKey: string, signal?: AbortSignal): Promise<Receipt> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/receipts', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu tạo phiếu nhập nhận về không hợp lệ.');
  return data as Receipt;
}

export async function receiveReceipt(receiptId: string, input: ReceiveRequest, idempotencyKey: string, signal?: AbortSignal): Promise<Receipt> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/receipts/{receiptId}/receive', {
    params: {
      path: { receiptId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: input,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu nhận hàng nhận về không hợp lệ.');
  return data as Receipt;
}

export async function cancelReceipt(receiptId: string, input: CancelReceiptRequest, idempotencyKey: string, signal?: AbortSignal): Promise<Receipt> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/receipts/{receiptId}/cancel', {
    params: {
      path: { receiptId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: input,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu hủy phiếu nhập nhận về không hợp lệ.');
  return data as Receipt;
}

export async function closeShortReceipt(
  receiptId: string,
  input: CloseShortReceiptRequest,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<Receipt> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/receipts/{receiptId}/close-short', {
    params: {
      path: { receiptId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: input,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu kết thúc sớm phiếu nhập nhận về không hợp lệ.');
  return data as Receipt;
}

export async function updateReceipt(
  receiptId: string,
  input: UpdateReceiptRequest,
  idempotencyKey: string,
  signal?: AbortSignal
): Promise<Receipt> {
  const client = createApiClient();
  const { data, error, response } = await client.PUT('/api/v1/receipts/{receiptId}', {
    params: {
      path: { receiptId },
      header: { 'Idempotency-Key': idempotencyKey },
    },
    body: input,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu cập nhật phiếu nhập nhận về không hợp lệ.');
  return data as Receipt;
}

export async function previewReceiveReceipt(
  receiptId: string,
  input: ReceiveRequest,
  signal?: AbortSignal
): Promise<ReceivePreviewResult> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/receipts/{receiptId}/receive/preview', {
    params: {
      path: { receiptId },
    },
    body: input,
    signal,
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu xem trước nhận hàng không hợp lệ.');
  return data as ReceivePreviewResult;
}

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

  // Get CSRF token from cookie if present
  const getCsrfToken = () => {
    const match = document.cookie.match(/(?:^|;\s*)datt_csrf=([^;]*)/);
    return match ? decodeURIComponent(match[1]!) : '';
  };

  const res = await fetch(`/api/v1/receipts/${encodeURIComponent(receiptId)}/attachments`, {
    method: 'POST',
    headers: {
      'X-CSRF-Token': getCsrfToken(),
    },
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
