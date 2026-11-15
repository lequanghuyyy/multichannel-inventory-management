import type { components } from './generated/openapi';
import { createApiClient } from './client';
import type { Page } from './list';
import { responseApiError } from '../core/api-error';

type ServerReservation = components['schemas']['ReservationResponse'];

export type HoldStatus = 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED' | 'CANCELLED';

export interface Hold {
  id: string;
  variant_id: string;
  sku: string;
  quantity: number;
  status: HoldStatus;
  order_id?: string;
  order_reference?: string;
  expires_at: string;
  created_at: string;
  is_due: boolean;
  is_held: boolean;
  has_order: boolean;
}

export type Reservation = Hold;
export type ReservationView = Hold;

export type HoldPage = Page<Hold> & { activeCount?: number };

export interface HoldQuery {
  limit?: number;
  cursor?: string;
  status?: HoldStatus[];
  variant_id?: string;
  order_id?: string;
}

function normalizeStatus(value?: string): HoldStatus {
  switch ((value ?? '').toUpperCase()) {
    case 'ACTIVE':
      return 'ACTIVE';
    case 'CONFIRMED':
      return 'CONFIRMED';
    case 'RELEASED':
      return 'RELEASED';
    case 'EXPIRED':
      return 'EXPIRED';
    case 'CANCELLED':
      return 'CANCELLED';
    default:
      return 'ACTIVE';
  }
}

function toHold(raw: ServerReservation): Hold {
  const expiresAt = raw.expires_at ?? '';
  const isDue = Boolean(
    expiresAt &&
    !Number.isNaN(Date.parse(expiresAt)) &&
    Date.parse(expiresAt) <= Date.now() &&
    raw.status === 'ACTIVE'
  );
  const hasOrder = raw.order_id !== undefined && raw.order_id !== null;
  const isHeld = raw.status === 'ACTIVE' && !isDue;
  return {
    id: String(raw.id ?? ''),
    variant_id: String(raw.variant_id ?? ''),
    sku: raw.sku ?? '',
    quantity: raw.quantity ?? 0,
    status: normalizeStatus(raw.status),
    order_id: hasOrder ? String(raw.order_id) : undefined,
    order_reference: hasOrder ? `#${raw.order_id}` : undefined,
    expires_at: expiresAt,
    created_at: raw.created_at ?? '',
    is_due: isDue,
    is_held: isHeld,
    has_order: hasOrder,
  };
}

export async function getReservation(reservationId: string, signal?: AbortSignal): Promise<Hold> {
  const client = createApiClient();
  const numId = Number(reservationId);
  if (!Number.isSafeInteger(numId) || numId <= 0) {
    throw new Error('Mã giữ chỗ không hợp lệ.');
  }
  const { data, response } = await client.GET('/api/v1/reservations/{reservationId}', {
    params: { path: { reservationId: numId } },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response, 'Không tra được lần giữ này.');
  if (!data) throw new Error('Dữ liệu sổ giữ chỗ nhận về không hợp lệ.');
  return toHold(data);
}

export async function listReservations(query: HoldQuery = {}, signal?: AbortSignal): Promise<HoldPage> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/reservations', { signal, cache: 'no-store' });
  if (!response.ok) await responseApiError(response, 'Không kết nối được sổ giữ chỗ. Hãy thử lại sau.');
  if (!Array.isArray(data)) throw new Error('Dữ liệu sổ giữ chỗ nhận về không hợp lệ.');

  let items = data.map(toHold);
  if (query.variant_id) {
    items = items.filter((h) => h.variant_id === query.variant_id);
  }
  if (query.order_id) {
    items = items.filter((h) => h.order_id === query.order_id);
  }
  if (query.status && query.status.length > 0) {
    const statuses = new Set(query.status);
    items = items.filter((h) => statuses.has(h.status));
  }

  const activeCount = items.filter((h) => h.status === 'ACTIVE').length;
  const limit = query.limit;
  const pageItems = limit && limit > 0 ? items.slice(0, limit) : items;

  return {
    items: pageItems,
    nextCursor: null,
    totalCount: items.length,
    activeCount,
  };
}

export async function confirmHold(id: string, key: string, signal?: AbortSignal): Promise<void> {
  const client = createApiClient();
  const reservationId = Number(id);
  if (!Number.isSafeInteger(reservationId) || reservationId <= 0) {
    throw new Error('Mã giữ chỗ không hợp lệ.');
  }
  const { response } = await client.POST('/api/v1/inventory/sell', {
    params: {
      query: { reservationId },
      header: { 'Idempotency-Key': key },
    },
    signal,
  });
  if (!response.ok) await responseApiError(response);
}

export async function releaseHold(id: string, _key?: string, signal?: AbortSignal): Promise<void> {
  const client = createApiClient();
  const reservationId = Number(id);
  if (!Number.isSafeInteger(reservationId) || reservationId <= 0) {
    throw new Error('Mã giữ chỗ không hợp lệ.');
  }
  const { response } = await client.POST('/api/v1/inventory/release', {
    params: {
      query: { reservationId },
    },
    signal,
  });
  if (!response.ok) await responseApiError(response);
}

export async function cancelHold(id: string, _key?: string, signal?: AbortSignal): Promise<void> {
  const client = createApiClient();
  const reservationId = Number(id);
  if (!Number.isSafeInteger(reservationId) || reservationId <= 0) {
    throw new Error('Mã giữ chỗ không hợp lệ.');
  }
  const { response } = await client.POST('/api/v1/inventory/cancel', {
    params: {
      query: { reservationId },
    },
    signal,
  });
  if (!response.ok) await responseApiError(response);
}

export async function expireHold(_id?: string, _key?: string, signal?: AbortSignal): Promise<void> {
  const client = createApiClient();
  const { response } = await client.POST('/api/v1/inventory/expire', { signal });
  if (!response.ok) await responseApiError(response);
}

export type ReserveInput = {
  sku: string;
  order_id?: string;
  quantity: number;
  ttl_seconds?: number;
};

export async function reserveStock(input: ReserveInput, idempotencyKey: string, signal?: AbortSignal): Promise<Hold> {
  const client = createApiClient();
  const orderId = input.order_id ? Number(input.order_id) : undefined;
  const ttlMinutes = input.ttl_seconds ? Math.max(1, Math.ceil(input.ttl_seconds / 60)) : undefined;

  const { data, response } = await client.POST('/api/v1/inventory/reserve', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: {
      sku: input.sku,
      quantity: input.quantity,
      ...(orderId && Number.isSafeInteger(orderId) ? { orderId } : {}),
      ...(ttlMinutes ? { ttlMinutes } : {}),
    },
    signal,
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu giữ chỗ nhận về không hợp lệ.');
  return toHold(data);
}
