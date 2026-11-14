import { ApiRequestError, parseApiError } from './api-error';
import { apiBase, nativeApiBase } from '../config/env';
import { isNativeSession } from '../features/auth/native-session-storage';

export { apiBase } from '../config/env';

export interface Health {
  status: 'ok' | 'ready' | 'not_ready';
  service: string;
  version: string;
  database?: 'up' | 'unavailable';
  /**
   * State of the background expiry worker, present only when the API runs one.
   *
   * A stale sweeper is a warning, not an outage: the API still serves and the database is
   * still up, but abandoned holds are piling up. `never_run` means no pass has completed
   * yet, which is a configuration problem rather than a broken worker — the two need
   * different responses, so they are different values.
   */
  sweeper?: 'ok' | 'stale' | 'never_run';
}

export interface SystemInfo {
  service: string;
  version: string;
  stage: 'foundation';
  inventory_ready: boolean;
  inventory_read_available?: boolean;
  inventory_write_available?: boolean;
  catalog_available?: boolean;
  catalog_write_available?: boolean;
  marketplace_connected: boolean;
  ai_ready: boolean;
  /** The transaction outbox is wired, so stock changes are recorded. Not delivery. */
  outbox_available?: boolean;
  sync_events_available?: boolean;
  sync_stream_available?: boolean;
  sync_active_subscribers?: number;
  sync_stream_connections_total?: number;
  sync_dropped_frames_total?: number;
  /**
   * A REAL selling channel was told, by an adapter that can reach it. Stays false while no
   * marketplace credential exists — a wired stream is not delivery.
   */
  sync_delivery_available?: boolean;
  /** The simulated adapter is attached: delivery lands in this deployment's own database. */
  simulator_delivery_available?: boolean;
  simulator_available?: boolean;
}

export interface Snapshot { live: Health; ready: Health; system: SystemInfo }

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseHealth(value: unknown): Health {
  if (!record(value) || !['ok', 'ready', 'not_ready'].includes(String(value.status)) ||
      typeof value.service !== 'string' || typeof value.version !== 'string' ||
      (value.database !== undefined && value.database !== 'up' && value.database !== 'unavailable') ||
      (value.sweeper !== undefined && !['ok', 'stale', 'never_run'].includes(String(value.sweeper)))) {
    throw new Error('Dữ liệu kiểm tra hệ thống nhận về không hợp lệ.');
  }
  return value as unknown as Health;
}

export function parseSystem(value: unknown): SystemInfo {
  if (!record(value) || value.stage !== 'foundation' || typeof value.service !== 'string' ||
      typeof value.version !== 'string' || typeof value.inventory_ready !== 'boolean' ||
      (value.inventory_read_available !== undefined && typeof value.inventory_read_available !== 'boolean') ||
      (value.inventory_write_available !== undefined && typeof value.inventory_write_available !== 'boolean') ||
      (value.catalog_available !== undefined && typeof value.catalog_available !== 'boolean') ||
      (value.catalog_write_available !== undefined && typeof value.catalog_write_available !== 'boolean') ||
      typeof value.marketplace_connected !== 'boolean' || typeof value.ai_ready !== 'boolean') {
    throw new Error('Dữ liệu thông tin phiên bản nhận về không hợp lệ.');
  }
  return value as unknown as SystemInfo;
}

async function request(path: string, signal: AbortSignal, acceptUnavailable = false): Promise<unknown> {
  const base = isNativeSession() ? nativeApiBase() : apiBase();
  const response = await fetch(`${base}${path}`, {
    signal, headers: { Accept: 'application/json' }, cache: 'no-store',
  });
  if (!response.headers.get('content-type')?.includes('application/json')) {
    throw new Error('Máy chủ trả về trang web thay vì dữ liệu. Hãy kiểm tra lại địa chỉ kết nối.');
  }
  const body: unknown = await response.json();
  if (!response.ok && !(acceptUnavailable && response.status === 503)) {
    try {
      const error = parseApiError(body);
      throw new ApiRequestError(error, response.status);
    } catch (error) {
      if (error instanceof Error && error.message !== 'Phản hồi lỗi không đúng định dạng.') throw error;
      throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
    }
  }
  return body;
}

export async function loadSnapshot(signal: AbortSignal): Promise<Snapshot> {
  const [live, ready, system] = await Promise.all([
    request('/health/live', signal),
    request('/health/ready', signal, true),
    request('/api/v1/system', signal),
  ]);
  return { live: parseHealth(live), ready: parseHealth(ready), system: parseSystem(system) };
}
