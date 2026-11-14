import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';

export type LoadMode = 'normal' | 'burst';

export interface LoadCatalogItem {
  external_listing_id: string;
  external_variant_id?: string;
  sku: string;
  on_hand: number;
  available_to_sell: number;
}

export interface LoadCatalog {
  shop_id: string;
  channel_id: string;
  items: LoadCatalogItem[];
}

export interface LoadConfig {
  mode: LoadMode;
  seed: number;
  rate: number;
  burst_rate?: number;
  burst_after_ms?: number;
  burst_duration_ms?: number;
  duration_ms: number;
  max_events: number;
  concurrency: number;
  start_at: string;
  shop_id: string;
  channel_id: string;
  catalog: { external_listing_id: string; external_variant_id?: string }[];
}

export interface LoadRun {
  id: string;
  config: LoadConfig;
  config_hash: string;
  input_hash: string;
  generator_version: string;
  status: 'pending' | 'running' | 'stopping' | 'completed' | 'failed' | 'cancelled';
  planned_events: number;
  sent_events: number;
  processed_events: number;
  quarantined_events: number;
  failed_events: number;
  cancelled_events: number;
  error_message?: string;
  simulator_only: boolean;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface LoadEvent {
  sequence: number;
  event_id: string;
  external_order_id: string;
  scheduled_offset_ms: number;
  payload: { lines?: { external_listing_id?: string; external_variant_id?: string; quantity: number }[] };
  processing_status: 'pending' | 'processed' | 'quarantined' | 'failed' | 'cancelled';
  sent_at?: string;
  received_at?: string;
  http_status?: number;
  latency_ms?: number;
  event_record_id?: string;
  order_id?: string;
  error_code?: string;
}

async function requestError(error: unknown, response: Response, fallback: string): Promise<never> {
  if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
  throw new Error(`${fallback}. Hãy thử lại sau.`);
}

export async function getOrderLoadCatalog(channelId: string, shopId?: string, signal?: AbortSignal): Promise<LoadCatalog> {
  const client = createApiClient();
  const query = shopId ? { shop_id: shopId, channel_id: channelId } : { channel_id: channelId };
  const { data, error, response } = await client.GET('/api/v1/dev/order-load-catalog', { params: { query }, signal, cache: 'no-store' });
  if (!response.ok) return requestError(error, response, 'Không đọc được danh mục sản phẩm giả lập');
  if (!data) throw new Error('Dữ liệu danh mục sản phẩm giả lập nhận về không hợp lệ.');
  return data as unknown as LoadCatalog;
}

export async function listOrderLoadRuns(signal?: AbortSignal): Promise<LoadRun[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/dev/order-load-runs', { params: { query: { limit: 50 } }, signal, cache: 'no-store' });
  if (!response.ok) return requestError(error, response, 'Không đọc được lịch sử mô phỏng');
  return (data as unknown as { items: LoadRun[] }).items ?? [];
}

export async function getOrderLoadRun(runId: string, signal?: AbortSignal): Promise<LoadRun> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/dev/order-load-runs/{runId}', { params: { path: { runId } }, signal, cache: 'no-store' });
  if (!response.ok) return requestError(error, response, 'Không đọc được phiên mô phỏng');
  if (!data) throw new Error('Dữ liệu phiên mô phỏng nhận về không hợp lệ.');
  return data as unknown as LoadRun;
}

export async function listOrderLoadEvents(runId: string, signal?: AbortSignal): Promise<LoadEvent[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/dev/order-load-runs/{runId}/events', { params: { path: { runId }, query: { limit: 120, offset: 0 } }, signal, cache: 'no-store' });
  if (!response.ok) return requestError(error, response, 'Không đọc được event của phiên');
  return (data as unknown as { items: LoadEvent[] }).items ?? [];
}

export async function startOrderLoadRun(request: LoadConfig): Promise<LoadRun> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/dev/order-load-runs', { body: request as never });
  if (!response.ok) return requestError(error, response, 'Không thể bắt đầu mô phỏng');
  if (!data) throw new Error('Dữ liệu bắt đầu mô phỏng nhận về không hợp lệ.');
  return data as unknown as LoadRun;
}

export async function stopOrderLoadRun(runId: string): Promise<LoadRun> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/dev/order-load-runs/{runId}/stop', { params: { path: { runId } } });
  if (!response.ok) return requestError(error, response, 'Không thể dừng mô phỏng');
  if (!data) throw new Error('Dữ liệu dừng mô phỏng nhận về không hợp lệ.');
  return data as unknown as LoadRun;
}

export function orderLoadDownloadURL(runId: string, kind: 'input' | 'results'): string {
  return `/api/v1/dev/order-load-runs/${encodeURIComponent(runId)}/${kind}`;
}
