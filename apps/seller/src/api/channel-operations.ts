import { ApiRequestError, parseApiError } from '../core/api-error';
import { runtimeCSRF } from '../features/auth/auth-runtime';
import { createApiClient } from './client';
import { apiFetch } from './client';

export type ChannelProductState = 'all' | 'not_published' | 'draft' | 'syncing' | 'active' | 'needs_attention' | 'stopped';
export type OrderIngestionState = 'all' | 'imported' | 'pending' | 'quarantined' | 'failed';
export type ActivityDomain = 'catalog' | 'price' | 'inventory' | 'order';

export type ChannelProduct = {
  product_id: string; name: string; category: string; brand: string; master_sku?: string; currency: string;
  core_status: string; product_version: number; variant_count: number; eligible_variant_count: number;
  listing_count: number; publication_state: string; listing_origin?: 'octoflow' | 'imported' | ''; state: string; mapping_state: string; catalog_sync_state: string;
  price_sync_state: string; inventory_sync_state: string; last_successful_sync_at?: string; last_error_code?: string;
  last_activity_at?: string;
  actions: { preflight: boolean; draft: boolean; publish: boolean; map_sku: boolean; catalog_sync: boolean; price_sync: boolean; inventory_sync: boolean; pause: boolean; retry: boolean; history: boolean };
};
export type ChannelProductPage = { products: ChannelProduct[]; next_cursor?: string; total_count: number; limit: number; state?: string };
export type OrderReceipt = {
  receipt_id: string; external_order_id: string; external_event_id?: string; core_order_id?: string;
  status: 'imported' | 'pending' | 'quarantined' | 'failed' | string; raw_status: string; source: string;
  attempt_count: number; error_code?: string; required_action?: string; first_seen_at: string;
  last_attempt_at?: string; retryable: boolean;
};
export type OrderIngestionPage = {
  summary: { imported: number; pending: number; quarantined: number; failed: number; other: number; total: number };
  receipts: OrderReceipt[]; next_cursor?: string; limit: number; state?: string;
};
export type OrderPollJob = { job_id: string; channel_id: string; connector: string; status: string; attempt_count: number; processed_count: number; error_code?: string; repeated: boolean; created_at: string; finished_at?: string };
export type ChannelActivity = {
  id: string; channel_id: string; domain: string; operation: string; source: string; state: string; attempt_count: number;
  error_code?: string; product_id?: string; variant_id?: string; order_id?: string; external_id?: string;
  created_at: string; updated_at: string; verified_at?: string; verification_state?: string; retryable: boolean;
  detail_ref: string; evidence?: Array<{ type: string; state?: string; error_code?: string; verification_status?: string; remote_identifier?: string; recorded_at: string; details?: Record<string, unknown> }>;
};
export type ChannelActivityPage = { activities: ChannelActivity[]; next_cursor?: string; limit: number };
export type ChannelSettings = {
  channel: import('./channels').Channel; shop_currency: string; connection_state: string; granted_scopes: string[];
  connector_identity: Record<string, unknown>;
  capabilities: Record<string, { supported_by_platform: boolean; implemented_in_connector: boolean; enabled_by_config: boolean; allowed_by_scope: boolean; connection_ready: boolean; live_verified: boolean; can_execute: boolean; reason_code?: string; reason_message?: string }>;
  mapping_count: number; last_verified_at?: string;
};
export type InventoryReconciliation = {
  id: string; channel_id: string; listing_id: string; variant_id: string; canonical_sku: string; state: string; action: string;
  verification_status: string; core_ats: number; expected_quantity: number; remote_quantity?: number; core_version: number;
  attempt_count: number; error_code?: string; retryable: boolean; started_at: string; completed_at: string;
};
export type InventoryResyncReceipt = { id: string; event_id: string; job_id: string; channel_id: string; listing_id: string; variant_id: string; core_version: number; status: string; repeated: boolean; requested_at: string };
export type ProductInventoryRow = {
  listing_id: string; sku: string; has_balance: boolean; on_hand: number; reserved: number; safety_buffer: number; available_to_sell: number;
  channel_code: string; channel_name: string; shop_name: string; channel_status: string;
  mapping_status: 'unmapped' | 'unverified' | 'verified' | 'needs_attention' | 'stale';
  issue_reason?: string;
  external_sku?: string; external_product_id?: string; external_variant_id?: string; external_inventory_item_id?: string; external_location_id?: string;
  listed: boolean; allocation_state: string; inventory_tracking_enabled: boolean; quantity_basis?: '' | 'ats' | 'legacy'; mapping_verified_at?: string; target_at?: string; reported_at?: string;
  target_quantity: number | null; preview_quantity: number | null; preview_issue?: string; preview_delta: number | null;
  target_version: number; target_allocation_revision: number; current_allocation_revision: number; allocation_core_version: number; core_version: number;
  reported_quantity: number | null; has_baseline: boolean;
  latest_sync_status?: string; latest_sync_verified_at?: string; latest_sync_attempt_at?: string; latest_sync_error_code?: string;
  blocking_order_reference?: string;
  latest_sync_job_id?: string; latest_job_id?: string; latest_job_status?: string;
  allocation_plan_status?: string;
  allocation_plan_id?: string;
  allocation_plan_error?: string;
  write_enabled: boolean; ready: boolean;
};
export async function getProductChannelInventory(channelId: string, productId: string, signal?: AbortSignal): Promise<ProductInventoryRow[]> {
  const response = await apiFetch(`/api/v1/channels/${encodeURIComponent(channelId)}/products/${encodeURIComponent(productId)}/inventory`, { signal, cache: 'no-store' });
  if (!response.ok) throw new Error('Không thể tải tồn kho theo SKU.');
  const body = await response.json() as { items: ProductInventoryRow[] };
  return body.items;
}

async function requestData<T>(result: { data?: unknown; error?: unknown; response: Response }, message: string): Promise<T> {
  if (!result.response.ok) {
    if (result.error && typeof result.error === 'object') throw new ApiRequestError(parseApiError(result.error), result.response.status);
    throw new Error(message);
  }
  if (!result.data) throw new Error(message);
  return result.data as T;
}

export async function listChannelProducts(channelId: string, query: { state?: ChannelProductState; q?: string; limit?: number; cursor?: string }, signal?: AbortSignal) {
  const client = createApiClient();
  return requestData<ChannelProductPage>(await client.GET('/api/v1/channels/{channelId}/products', { params: { path: { channelId }, query }, signal, cache: 'no-store' }), 'Không thể tải danh sách sản phẩm trên kênh.');
}
export async function listOrderIngestion(channelId: string, query: { state?: OrderIngestionState; limit?: number; cursor?: string }, signal?: AbortSignal) {
  const client = createApiClient();
  return requestData<OrderIngestionPage>(await client.GET('/api/v1/channels/{channelId}/orders/ingestion', { params: { path: { channelId }, query }, signal, cache: 'no-store' }), 'Không thể tải trạng thái nhập đơn hàng.');
}
export async function pollChannelOrders(channelId: string, key: string) {
  const client = createApiClient();
  return requestData<OrderPollJob>(await client.POST('/api/v1/channels/{channelId}/orders/poll', { params: { path: { channelId }, header: { 'Idempotency-Key': key, 'X-CSRF-Token': runtimeCSRF() ?? '' } }, cache: 'no-store' }), 'Không thể yêu cầu kiểm tra đơn mới.');
}
export async function listChannelActivity(channelId: string, query: { domain?: ActivityDomain; state?: string; q?: string; limit?: number; cursor?: string }, signal?: AbortSignal) {
  const client = createApiClient();
  return requestData<ChannelActivityPage>(await client.GET('/api/v1/channels/{channelId}/activity', { params: { path: { channelId }, query }, signal, cache: 'no-store' }), 'Không thể tải lịch sử kênh.');
}
export async function getChannelActivity(channelId: string, activityId: string, signal?: AbortSignal) {
  const client = createApiClient();
  return requestData<ChannelActivity>(await client.GET('/api/v1/channels/{channelId}/activity/{activityId}', { params: { path: { channelId, activityId } }, signal, cache: 'no-store' }), 'Không thể tải chi tiết hoạt động.');
}
export async function getChannelSettings(channelId: string, signal?: AbortSignal) {
  const client = createApiClient();
  return requestData<ChannelSettings>(await client.GET('/api/v1/channels/{channelId}/settings', { params: { path: { channelId } }, signal, cache: 'no-store' }), 'Không thể tải cấu hình và quyền của kênh.');
}
export async function reconcileChannelListing(channelId: string, listingId: string) {
  const client = createApiClient();
  return requestData<InventoryReconciliation>(await client.POST('/api/v1/channels/{channelId}/inventory/{listingId}/reconcile', { params: { path: { channelId: Number(channelId), listingId: Number(listingId) } }, cache: 'no-store' }), 'Không thể đối soát listing.');
}
export async function resyncChannelListing(channelId: string, listingId: string, key: string, expected?: { quantity: number; version: number }) {
  if (expected) {
    const response = await apiFetch(`/api/v1/channels/${encodeURIComponent(channelId)}/inventory/${encodeURIComponent(listingId)}/resync`, {
      method: 'POST', cache: 'no-store', headers: { 'Idempotency-Key': key, 'X-CSRF-Token': runtimeCSRF() ?? '', 'X-Preview-Quantity': String(expected.quantity), 'X-Preview-Version': String(expected.version) },
    });
    const body = await response.json() as InventoryResyncReceipt | { error?: unknown };
    if (!response.ok) throw new ApiRequestError(parseApiError(body), response.status);
    return body as InventoryResyncReceipt;
  }
  const client = createApiClient();
  return requestData<InventoryResyncReceipt>(await client.POST('/api/v1/channels/{channelId}/inventory/{listingId}/resync', { params: { path: { channelId, listingId }, header: { 'Idempotency-Key': key, 'X-CSRF-Token': runtimeCSRF() ?? '' } }, cache: 'no-store' }), 'Không thể yêu cầu đồng bộ lại tồn kho.');
}
