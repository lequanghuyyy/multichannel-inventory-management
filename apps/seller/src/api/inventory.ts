import type { components } from './generated/openapi';
import { apiFetch, createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';
import { pageOf, type Page } from './list';

export type InventorySnapshot = components['schemas']['InventorySnapshot'];
// The list rows are inlined in the contract rather than named, so the type is derived from
// the container. Naming it here would be a copy that can drift from the generated spec
// without anything failing until a row field changed shape at runtime.
export type InventoryRow = components['schemas']['InventoryList']['items'][number];
// Derived from the generated contract rather than hand-written, so a change to a ledger
// row's shape in openapi.json fails typecheck here instead of at runtime.
export type InventoryAdjustmentLedgerEntry = components['schemas']['InventoryAdjustmentLedgerEntry'];
export type InventoryMovement = components['schemas']['InventoryMovement'];
export type InventoryMovementPage = components['schemas']['InventoryMovementPage'];
export interface InventoryMovementQuery {
  limit?: number;
  cursor?: string;
  kind?: 'physical' | 'reservation';
  operation_group?: 'receipt' | 'sale' | 'cancel_restore' | 'return' | 'adjustment' | 'reservation';
  from?: string;
  to?: string;
}
export type SKUReceiptPage = components['schemas']['SKUReceiptPage'];
export type SKUReceipt = components['schemas']['SKUReceipt'];

async function responseError(response: Response): Promise<never> {
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }

  const body: unknown = await response.json();
  try {
    throw new ApiRequestError(parseApiError(body), response.status);
  } catch (error) {
    if (error instanceof ApiRequestError) throw error;
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
}

export async function getInventoryBySku(sku: string, signal?: AbortSignal): Promise<InventorySnapshot> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/inventory/{sku}', {
    params: { path: { sku } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    return responseError(response);
  }

  if (!data) throw new Error('Dữ liệu tồn kho nhận về không hợp lệ.');
  return data;
}

export interface InventoryQuery {
  limit?: number;
  cursor?: string;
  q?: string;
}

/**
 * The variant page POS uses to cap cart quantities. A row missing its balance row fails
 * the WHOLE page with 503 rather than reading as zero stock (contract D9), so a resolved
 * page is always trustworthy for `available_to_sell`.
 */
export async function listInventory(query: InventoryQuery = {}, signal?: AbortSignal): Promise<Page<InventoryRow>> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/inventory', {
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
  if (!data) throw new Error('Dữ liệu danh sách tồn kho nhận về không hợp lệ.');
  return pageOf<InventoryRow>(data as unknown as Record<string, unknown>, 'items');
}

/**
 * Read the current price and available-to-sell value for a canonical SKU from one inventory
 * row. The single-SKU balance endpoint intentionally omits price, while the inventory list
 * exposes both values from the same server query. Search can match names as well as SKUs, so
 * return only an exact SKU match and walk the cursor when a broad search has many results.
 */
export async function getInventoryRowBySku(sku: string, signal?: AbortSignal): Promise<InventoryRow> {
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    const page = await listInventory({ limit: 100, q: sku, ...(cursor ? { cursor } : {}) }, signal);
    const match = page.items.find((item) => item.sku === sku);
    if (match) return match;
    const next = page.nextCursor;
    if (!next) break;
    if (seenCursors.has(next)) throw new Error('Danh sách tồn kho trả về con trỏ lặp khi đọc giá theo SKU.');
    seenCursors.add(next);
    cursor = next;
  } while (true);
  throw new Error(`Không còn tìm thấy SKU ${sku} trong danh sách tồn kho.`);
}

export interface AdjustInput {
  sku: string;
  delta: number;
  expected_version: number;
  /**
   * Required, and this is not optional for the sake of the type checker: an adjustment is the
   * only write in this API that can remove stock with nothing else explaining it, so the API
   * rejects a missing or blank reason with 400. The text is stored on the audit row — see
   * migration 00012 — which is why it cannot be left to a default.
   */
  reason: string;
}

export interface BulkAdjustLineInput { sku: string; delta: number; expected_version: number }
export interface BulkPreviewItem { sku: string; delta: number; current_on_hand: number; projected_on_hand: number; version: number; valid: boolean; errors: string[] }
export interface BulkPreviewResponse { items: BulkPreviewItem[]; valid: boolean }
export interface BulkAdjustResponse { batch_id: string; items: components['schemas']['Adjustment'][] }

async function checkedJSON<T>(response: Response, invalidMessage: string): Promise<T> {
  if (!response.ok) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body: unknown = await response.json();
      throw new ApiRequestError(parseApiError(body), response.status);
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  try { return await response.json() as T; } catch { throw new Error(invalidMessage); }
}

export async function exportInventory(scope: 'all' | 'selected', variantIds: string[] = [], signal?: AbortSignal): Promise<Blob> {
  const params = new URLSearchParams({ scope });
  if (scope === 'selected') variantIds.forEach((id) => params.append('variant_id', id));
  const response = await apiFetch(`/api/v1/inventory/export?${params.toString()}`, { signal });
  if (!response.ok) {
    if (response.headers.get('content-type')?.includes('application/json')) {
      const body: unknown = await response.json();
      throw new ApiRequestError(parseApiError(body), response.status);
    }
    const message = response.status === 413 ? 'Danh mục vượt quá giới hạn xuất 20.000 dòng.' : 'Không thể xuất tồn kho.';
    throw new Error(message);
  }
  if (!response.headers.get('content-type')?.includes('text/csv')) throw new Error('Tệp CSV nhận về không hợp lệ.');
  return response.blob();
}

export async function previewBulkInventoryAdjustment(input: { reason: string; items: BulkAdjustLineInput[] }, signal?: AbortSignal): Promise<BulkPreviewResponse> {
  const response = await apiFetch('/api/v1/inventory/adjust/bulk/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  return checkedJSON<BulkPreviewResponse>(response, 'Dữ liệu xem trước điều chỉnh không hợp lệ.');
}

export async function commitBulkInventoryAdjustment(input: { reason: string; items: BulkAdjustLineInput[] }, idempotencyKey: string, signal?: AbortSignal): Promise<BulkAdjustResponse> {
  const response = await apiFetch('/api/v1/inventory/adjust/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input), signal });
  return checkedJSON<BulkAdjustResponse>(response, 'Dữ liệu điều chỉnh hàng loạt không hợp lệ.');
}

/**
 * Development-only: the backend does not register this route at APP_ENV=production, so a
 * production build gets a 404 here. It exists so the demo can move stock without SQL.
 */
export async function adjustInventory(input: AdjustInput, idempotencyKey: string, signal?: AbortSignal): Promise<components['schemas']['Adjustment']> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/inventory/adjust', {
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
  if (!data) throw new Error('Dữ liệu điều chỉnh tồn kho nhận về không hợp lệ.');
  return data;
}

export async function getInventoryAdjustmentLedger(sku: string, signal?: AbortSignal): Promise<InventoryAdjustmentLedgerEntry[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/inventory/{sku}/ledger', {
    params: { path: { sku }, query: { limit: 100 } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error));
    }
    return responseError(response);
  }
  if (!data) throw new Error('Dữ liệu nhật ký tồn kho nhận về không hợp lệ.');
  return data.items;
}

export async function getInventoryMovements(sku: string, query: InventoryMovementQuery = {}, signal?: AbortSignal): Promise<InventoryMovementPage> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/inventory/{sku}/movements', {
    params: { path: { sku }, query },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    return responseError(response);
  }
  if (!data) throw new Error('Dữ liệu lịch sử biến động tồn kho nhận về không hợp lệ.');
  return data;
}

export async function getInventoryReceipts(sku: string, query: { limit?: number; cursor?: string; status?: 'all' | 'open' | 'history' } = {}, signal?: AbortSignal): Promise<SKUReceiptPage> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/inventory/{sku}/receipts', {
    params: { path: { sku }, query },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    return responseError(response);
  }
  if (!data) throw new Error('Dữ liệu phiếu nhập theo SKU nhận về không hợp lệ.');
  return data;
}
