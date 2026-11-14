import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';
import { realtimeManager } from '../features/realtime/manager';
import { pageOf, type Page } from './list';

export type SyncEvent = {
  id: number;
  event_id: string;
  channel_code?: string;
  variant_id: string;
  sku: string;
  operation: string;
  source: string;
  before: { on_hand: number; reserved: number; safety_buffer: number; available_to_sell: number };
  after: { on_hand: number; reserved: number; safety_buffer: number; available_to_sell: number };
  version: number;
  correlation_id?: string;
  occurred_at: string;
  state: 'pending' | 'delivered' | 'failed' | 'dead';
  attempts: number;
  last_error?: string;
  delivered_at?: string;
  delivered_channels: string[];
};

export type SyncJob = {
  id: string;
  channel_id: string;
  channel_code: string;
  sku?: string;
  operation?: string;
  retry_requested_by?: string;
  event_id?: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'dead';
  attempts: number;
  last_error?: string;
  latency_ms?: number | null;
  queued_at: string;
  started_at?: string;
  finished_at?: string;
  last_attempt_at?: string;
  next_attempt_at?: string;
};

export type SyncMetrics = {
  events_by_state: Record<string, number>;
  jobs_by_status?: Record<string, number>;
  delivered: number;
  sync_latency_p50_ms: number;
  sync_latency_p95_ms: number;
  sync_latency_max_ms: number;
  channel_id?: string;
};

export interface SyncQuery {
  limit?: number;
  cursor?: string;
  state?: SyncEvent['state'];
  status?: SyncJob['status'] | 'failed,dead';
  channel_id?: string;
  errors_only?: boolean;
}

export async function listSyncEvents(query: SyncQuery = {}, signal?: AbortSignal): Promise<Page<SyncEvent>> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/sync-events', {
    params: { query }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu nhật ký sự kiện nhận về không hợp lệ.');
  return pageOf<SyncEvent>(data as unknown as Record<string, unknown>, 'events');
}

export async function listSyncJobs(query: SyncQuery = {}, signal?: AbortSignal): Promise<Page<SyncJob>> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/sync-jobs', {
    params: { query }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu danh sách giao hàng nhận về không hợp lệ.');
  return pageOf<SyncJob>(data as unknown as Record<string, unknown>, 'jobs');
}

export type SyncRetryReceipt = {
  id: string;
  event_id: string;
  status: 'queued' | 'running' | 'recovered' | 'failed' | 'dead';
  repeated: boolean;
  requested_at: string;
};

export type SyncRetryHistoryEntry = {
  kind: 'attempt' | 'manual_request';
  id: string;
  job_id?: string;
  channel_code?: string;
  requested_by?: string;
  reason?: string;
  correlation_id?: string;
  status: string;
  error?: string;
  attempt: number;
  started_at: string;
  finished_at?: string;
};

export async function getSyncRetryHistory(eventId: string, signal?: AbortSignal): Promise<SyncRetryHistoryEntry[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/sync-events/{eventId}/retry-history', {
    params: { path: { eventId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không đọc được lịch sử thử lại.');
  }
  if (!data) throw new Error('Dữ liệu lịch sử thử lại không hợp lệ.');
  return data.attempts as SyncRetryHistoryEntry[];
}

export async function retrySyncEvent(eventId: string, reason: string, idempotencyKey: string, signal?: AbortSignal): Promise<SyncRetryReceipt> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/sync-events/{eventId}/retry', {
    params: { path: { eventId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { reason }, signal,
  });
  if (response.status !== 202) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không nhận được xác nhận xếp hàng từ máy chủ.');
  }
  if (!data || !['queued', 'running', 'recovered', 'failed', 'dead'].includes(data.status)) throw new Error('Máy chủ trả biên nhận thử lại không hợp lệ.');
  return data as SyncRetryReceipt;
}

export async function getSyncMetrics(channelId: string | undefined, signal?: AbortSignal): Promise<SyncMetrics> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/sync/metrics', {
    params: { query: channelId ? { channel_id: channelId } : {} }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu số đo đồng bộ nhận về không hợp lệ.');
  return data;
}

/**
 * Subscribes to the shared authenticated realtime stream.
 *
 * The stream itself belongs to `RealtimeManager`, not this call: one connection is shared by
 * every screen, and closing the last subscription does not tear it down while another page is
 * still listening. A push never carries a row to render — it says that committed data changed,
 * and the caller re-reads through the same API it already trusts.
 */
export function openSyncStream(onEvent: () => void): { close: () => void } {
  const unsubscribe = realtimeManager.subscribeChange((signal) => {
    if (signal.type === 'change' || signal.type === 'resync') onEvent();
  });
  realtimeManager.start();
  return { close: unsubscribe };
}

/**
 * Reads one recorded stock change.
 *
 * Used when the ledger row the reader is looking at has scrolled off the page: the list is a
 * page of 50, and a Sync Center whose detail view is limited to what is currently on screen
 * answers "which order?" only until the reader scrolls.
 */
export async function getSyncEvent(eventId: string, signal?: AbortSignal): Promise<SyncEvent> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/sync-events/{eventId}', {
    params: { path: { eventId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được sự kiện. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu sự kiện nhận về không hợp lệ.');
  return data as unknown as SyncEvent;
}
