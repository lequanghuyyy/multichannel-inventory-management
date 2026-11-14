import type { components } from './generated/openapi';
import { createApiClient } from './client';
import { pageOf, type Page } from './list';
import { ApiRequestError, parseApiError } from '../core/api-error';

type ReservationView = components['schemas']['ReservationView'];
type Reservation = components['schemas']['Reservation'];

export type { Reservation, ReservationView };

/**
 * `is_due` and `is_held` are deliberately NOT on the write response.
 *
 * They describe the clock at the instant the row was read, not a property of the hold. A
 * replayed response would carry a stale value, and a caller that trusted it would conclude a
 * hold has expired while the sweeper has not run — which is exactly the confusion the audit
 * route exists to remove.
 */
export type Hold = Omit<ReservationView, never>;
export type HoldPage = Page<Hold> & { activeCount?: number };

export type HoldStatus = 'ACTIVE' | 'CONFIRMED' | 'RELEASED' | 'EXPIRED' | 'CANCELLED';

export interface HoldQuery {
  limit?: number;
  cursor?: string;
  /** The API takes a LIST here, so a caller can ask for ACTIVE and EXPIRED in one page. */
  status?: HoldStatus[];
  variant_id?: string;
  order_id?: string;
}

/**
 * Reads one hold by id.
 *
 * The ledger page already carries the row, so this exists for the operator who has an id from
 * somewhere else — a log line, a support ticket — and needs the full record rather than a
 * page of fifty. A 404 is surfaced as a 404; substituting a different hold under the id the
 * caller supplied would be the one thing an audit surface must never do.
 */
export async function getReservation(reservationId: string, signal?: AbortSignal): Promise<Hold> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/reservations/{reservationId}', {
    params: { path: { reservationId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được sổ giữ chỗ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu sổ giữ chỗ nhận về không hợp lệ.');
  return data as unknown as Hold;
}

export async function listReservations(query: HoldQuery = {}, signal?: AbortSignal): Promise<HoldPage> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/reservations', {
    params: { query: { ...query } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được sổ giữ chỗ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu sổ giữ chỗ nhận về không hợp lệ.');
  const record = data as unknown as Record<string, unknown>;
  const page = pageOf<Hold>(record, 'reservations');
  return { ...page, ...(typeof record.active_count === 'number' ? { activeCount: record.active_count } : {}) };
}

const command = async (
  path: '/api/v1/inventory/sell' | '/api/v1/inventory/release' | '/api/v1/inventory/cancel' | '/api/v1/inventory/expire',
  reservationId: string,
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<Reservation> => {
  const client = createApiClient();
  const { data, error, response } = await client.POST(path, {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: { reservation_id: reservationId },
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Phản hồi không đúng định dạng.');
  return data;
};

/**
 * The four terminal-ish moves of a hold.
 *
 * `expire` is exposed on purpose even though the sweeper is what normally runs it: an operator
 * holding a phone next to a stuck hold needs to be able to end it now, and the route refuses a
 * hold that is not actually due. A screen that only offers "wait for the worker" leaves the
 * one action available to a person unavailable.
 */
export const confirmHold = (id: string, key: string, signal?: AbortSignal) => command('/api/v1/inventory/sell', id, key, signal);
export const releaseHold = (id: string, key: string, signal?: AbortSignal) => command('/api/v1/inventory/release', id, key, signal);
export const cancelHold = (id: string, key: string, signal?: AbortSignal) => command('/api/v1/inventory/cancel', id, key, signal);
export const expireHold = (id: string, key: string, signal?: AbortSignal) => command('/api/v1/inventory/expire', id, key, signal);

export type ReserveInput = {
  sku: string;
  /** The order this hold backs. Required: a hold with no order is stock nobody will ever sell. */
  order_id: string;
  quantity: number;
  ttl_seconds?: number;
};

export async function reserveStock(input: ReserveInput, idempotencyKey: string, signal?: AbortSignal): Promise<Reservation> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/inventory/reserve', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Phản hồi không đúng định dạnh.');
  return data;
}
