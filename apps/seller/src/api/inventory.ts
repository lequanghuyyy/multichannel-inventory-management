import type { components } from './generated/openapi';
import { apiFetch, createApiClient } from './client';
import { ApiRequestError, parseApiError, responseApiError } from '../core/api-error';
import type { Page } from './list';

/**
 * One stock balance, in the shape the screens already read.
 *
 * `available_to_sell` is copied from the server and never recomputed. `price_minor` is the
 * server's integer minor-unit price carried under the name the money helpers expect.
 */
export interface InventorySnapshot {
  sku: string;
  variant_id: string;
  product_id: string;
  product_name?: string;
  variant_title?: string;
  price_minor: number | null;
  currency: string;
  on_hand: number;
  reserved: number;
  safety_buffer: number;
  available_to_sell: number;
  version: number;
  updated_at: string;
}

export type InventoryRow = InventorySnapshot;

export interface InventoryAdjustmentLedgerEntry {
  id: string;
  variant_id: string;
  sku: string;
  event: 'adjustment';
  delta: number;
  on_hand_before: number;
  on_hand_after: number;
  reserved: number;
  safety_buffer: number;
  available_to_sell: number;
  reason: string;
  created_at: string;
}

/**
 * The movement-timeline shape. The Spring Boot API serves the same facts through
 * `GET /inventory/{sku}/ledger`, so the adapter translates a ledger row rather than calling a
 * `/movements` route that does not exist.
 */
export interface InventoryMovement {
  id: string;
  variant_id: string;
  sku: string;
  operation: string;
  source: string;
  kind: 'physical' | 'reservation';
  on_hand_delta?: number;
  reserved_delta?: number;
  before?: { on_hand?: number; reserved?: number; safety_buffer?: number; available_to_sell?: number };
  after?: { on_hand?: number; reserved?: number; safety_buffer?: number; available_to_sell?: number };
  snapshot_state: 'complete' | 'partial' | 'missing';
  version?: number;
  correlation_id?: string;
  reason?: string;
  actor_email?: string;
  source_reference?: string;
  source_type?: 'receipt' | 'return' | 'order';
  source_href?: string;
  occurred_at: string;
}

export interface InventoryMovementPage {
  items: InventoryMovement[];
  next_cursor?: string;
}

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

type ServerSnapshot = components['schemas']['InventorySnapshotResponse'];
type ServerLedgerEntry = components['schemas']['LedgerEntryResponse'];

async function responseError(response: Response): Promise<never> {
  return responseApiError(response);
}

function requireId(value: number | undefined, entity: string): string {
  if (value === undefined || !Number.isSafeInteger(value)) {
    throw new Error(`Phản hồi ${entity} không có mã hợp lệ.`);
  }
  return String(value);
}

function toSnapshot(row: ServerSnapshot): InventorySnapshot {
  return {
    sku: row.sku ?? '',
    variant_id: requireId(row.variant_id, 'tồn kho'),
    product_id: requireId(row.product_id, 'tồn kho'),
    product_name: row.product_name,
    variant_title: row.variant_title,
    // The server stores VND in integer dong units; no 100x scaling is applied anywhere.
    price_minor: row.price ?? null,
    currency: row.currency ?? 'VND',
    on_hand: row.on_hand ?? 0,
    reserved: row.reserved ?? 0,
    safety_buffer: row.safety_buffer ?? 0,
    available_to_sell: row.available_to_sell ?? 0,
    version: row.version ?? 0,
    updated_at: row.updated_at ?? '',
  };
}

export async function getInventoryBySku(sku: string, signal?: AbortSignal): Promise<InventorySnapshot> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/inventory/{sku}', {
    params: { path: { sku } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);

  if (!data) throw new Error('Dữ liệu tồn kho nhận về không hợp lệ.');
  return toSnapshot(data);
}

export interface InventoryQuery {
  limit?: number;
  cursor?: string;
  q?: string;
}

/**
 * `GET /api/v1/inventory` returns a plain array and takes no parameters, so search and paging
 * are applied here. The cursor is always null; a fake cursor would make callers re-fetch the
 * same array forever.
 */
export async function listInventory(query: InventoryQuery = {}, signal?: AbortSignal): Promise<Page<InventoryRow>> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/inventory', { signal, cache: 'no-store' });

  if (!response.ok) await responseApiError(response);
  if (!Array.isArray(data)) throw new Error('Dữ liệu danh sách tồn kho nhận về không hợp lệ.');
  const term = query.q?.trim().toLocaleLowerCase('vi-VN');
  const items = data.map(toSnapshot).filter((row) => !term || [row.sku, row.product_name ?? '', row.variant_title ?? '']
    .join(' ').toLocaleLowerCase('vi-VN').includes(term));
  return { items, nextCursor: null };
}

/** Reads one exact SKU from the full balance list; the list is the only route carrying price. */
export async function getInventoryRowBySku(sku: string, signal?: AbortSignal): Promise<InventoryRow> {
  const page = await listInventory({ q: sku }, signal);
  const match = page.items.find((item) => item.sku === sku);
  if (!match) {
    throw new ApiRequestError({ code: 'SKU_NOT_FOUND', message: `Không tìm thấy tồn kho của SKU ${sku}.`, request_id: '' }, 404);
  }
  return match;
}

export interface AdjustInput {
  sku: string;
  delta: number;
  expected_version: number;
  /** Stored on the ledger row; the API rejects a missing or blank reason with 400. */
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

/**
 * Legacy bulk export. Spring Boot does not serve this route yet; the button surfaces the 404
 * rather than exporting fixture stock.
 */
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

/**
 * Legacy bulk adjustment against routes Spring Boot does not serve. Real Mode surfaces the
 * failure; it never falls back to fixture stock.
 */
export async function previewBulkInventoryAdjustment(input: { reason: string; items: BulkAdjustLineInput[] }, signal?: AbortSignal): Promise<BulkPreviewResponse> {
  const response = await apiFetch('/api/v1/inventory/adjust/bulk/preview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input), signal });
  return checkedJSON<BulkPreviewResponse>(response, 'Dữ liệu xem trước điều chỉnh không hợp lệ.');
}

export async function commitBulkInventoryAdjustment(input: { reason: string; items: BulkAdjustLineInput[] }, idempotencyKey: string, signal?: AbortSignal): Promise<BulkAdjustResponse> {
  const response = await apiFetch('/api/v1/inventory/adjust/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input), signal });
  return checkedJSON<BulkAdjustResponse>(response, 'Dữ liệu điều chỉnh hàng loạt không hợp lệ.');
}

export async function adjustInventory(input: AdjustInput, idempotencyKey: string, signal?: AbortSignal): Promise<InventorySnapshot> {
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/inventory/adjust', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: {
      sku: input.sku,
      delta: input.delta,
      reason: input.reason,
      expected_version: input.expected_version,
    },
    signal,
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu điều chỉnh tồn kho nhận về không hợp lệ.');
  return toSnapshot(data);
}

async function readLedger(sku: string, signal?: AbortSignal): Promise<ServerLedgerEntry[]> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/inventory/{sku}/ledger', {
    params: { path: { sku } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);
  if (!Array.isArray(data)) throw new Error('Dữ liệu nhật ký tồn kho nhận về không hợp lệ.');
  return data;
}

export async function getInventoryAdjustmentLedger(sku: string, signal?: AbortSignal): Promise<InventoryAdjustmentLedgerEntry[]> {
  const rows = await readLedger(sku, signal);
  return rows.map((row) => ({
    id: String(row.id ?? ''),
    variant_id: String(row.variant_id ?? ''),
    sku,
    event: 'adjustment' as const,
    delta: row.delta ?? 0,
    on_hand_before: row.on_hand_before ?? 0,
    on_hand_after: row.on_hand_after ?? 0,
    reserved: row.reserved_after ?? 0,
    safety_buffer: row.safety_buffer_after ?? 0,
    available_to_sell: (row.on_hand_after ?? 0) - (row.reserved_after ?? 0) - (row.safety_buffer_after ?? 0),
    reason: row.reason ?? '',
    created_at: row.created_at ?? '',
  }));
}

const OPERATION_LABELS: Readonly<Record<string, string>> = {
  ORDER_RESERVED: 'reserved',
  RESERVATION_CREATED: 'reserved',
  ORDER_SALE_CONFIRMED: 'sold',
  SALE_CONFIRMED: 'sold',
  RESERVATION_RELEASED: 'released',
  ORDER_CANCELLED: 'cancelled',
  ORDER_EXPIRED: 'expired',
  RESERVATION_EXPIRED: 'expired',
  ADJUSTMENT: 'adjusted',
  RECEIPT_ACCEPTED: 'received',
  OPENING_BALANCE: 'restored',
};

function movementSource(operation: string): string {
  if (operation.startsWith('ORDER_') || operation === 'SALE_CONFIRMED') return 'orders';
  if (operation.startsWith('RESERVATION_')) return 'reservation';
  if (operation === 'RECEIPT_ACCEPTED') return 'receiving';
  if (operation === 'ADJUSTMENT' || operation === 'OPENING_BALANCE') return 'adjust';
  return 'admin';
}

function movementKind(operation: string): 'physical' | 'reservation' {
  return operation.includes('RESERVATION') || operation === 'ORDER_RESERVED' ? 'reservation' : 'physical';
}

function sourceTypeOf(reference: string | undefined): InventoryMovement['source_type'] {
  const value = reference?.toUpperCase() ?? '';
  if (value.startsWith('RECEIPT') || value.startsWith('GRN')) return 'receipt';
  if (value.startsWith('ORDER') || value.startsWith('POS')) return 'order';
  return undefined;
}

function operationGroupOf(operation: string): InventoryMovementQuery['operation_group'] {
  if (operation === 'RECEIPT_ACCEPTED') return 'receipt';
  if (operation.startsWith('ORDER_SALE') || operation === 'SALE_CONFIRMED') return 'sale';
  if (operation === 'ORDER_CANCELLED' || operation === 'ORDER_EXPIRED') return 'cancel_restore';
  if (operation === 'ADJUSTMENT' || operation === 'OPENING_BALANCE') return 'adjustment';
  if (operation.startsWith('ORDER_RESERVED') || operation.startsWith('RESERVATION')) return 'reservation';
  return undefined;
}

/**
 * Reads the ledger and translates each row into the movement timeline the screen renders.
 *
 * Filtering happens client-side because the ledger route accepts no query parameters. That is
 * honest for the volume this screen shows and avoids inventing cursor semantics the server
 * does not have.
 */
export async function getInventoryMovements(sku: string, query: InventoryMovementQuery = {}, signal?: AbortSignal): Promise<InventoryMovementPage> {
  const rows = await readLedger(sku, signal);
  const from = query.from ? Date.parse(query.from) : undefined;
  const to = query.to ? Date.parse(query.to) : undefined;
  const items = rows
    .map((row): InventoryMovement => {
      const operation = row.operation ?? '';
      const before = {
        on_hand: row.on_hand_before ?? 0,
        reserved: row.reserved_before ?? 0,
        safety_buffer: row.safety_buffer_before ?? 0,
      };
      const after = {
        on_hand: row.on_hand_after ?? 0,
        reserved: row.reserved_after ?? 0,
        safety_buffer: row.safety_buffer_after ?? 0,
      };
      return {
        id: String(row.id ?? ''),
        variant_id: String(row.variant_id ?? ''),
        sku,
        operation: OPERATION_LABELS[operation] ?? operation.toLocaleLowerCase('vi-VN'),
        source: movementSource(operation),
        kind: movementKind(operation),
        on_hand_delta: after.on_hand - before.on_hand,
        reserved_delta: after.reserved - before.reserved,
        before: { ...before, available_to_sell: before.on_hand - before.reserved - before.safety_buffer },
        after: { ...after, available_to_sell: after.on_hand - after.reserved - after.safety_buffer },
        snapshot_state: 'complete',
        reason: row.reason,
        actor_email: row.actor_name,
        source_reference: row.reference_id,
        source_type: sourceTypeOf(row.reference_id),
        occurred_at: row.created_at ?? '',
      };
    })
    .filter((entry) => {
      if (query.kind && entry.kind !== query.kind) return false;
      if (query.operation_group && operationGroupOf(rows.find((row) => String(row.id ?? '') === entry.id)?.operation ?? '') !== query.operation_group) return false;
      const at = Date.parse(entry.occurred_at);
      if (from !== undefined && !Number.isNaN(at) && at < from) return false;
      if (to !== undefined && !Number.isNaN(at) && at > to) return false;
      return true;
    });
  return { items };
}

/**
 * Legacy per-SKU receipt list. Spring Boot exposes receipts through `/receipts/{id}`, not this
 * route, so the inventory-detail tab surfaces the failure instead of showing fixture receipts.
 */
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
