import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';
import type { components } from './generated/openapi';

export type ShopifyPublicationOption = components['schemas']['ShopifyPublicationOption'];

export interface ShopifyStatus {
  enabled: boolean;
  connected: boolean;
  shop_domain?: string;
  shop_name?: string;
  shop_plan_name?: string;
  partner_development: boolean;
  api_version?: string;
  shop_currency?: string;
  core_currency?: string;
  currency_compatible: boolean;
  environment: string;
  channel_status: string;
  channel_id?: string;
  mapping_count: number;
  unmapped_count: number;
  conflict_count: number;
  stale_mapping_count: number;
  pushed_quantity: number;
  reported_quantity: number;
  drift_count: number;
  last_verified_at?: string;
  last_successful_sync?: string;
  last_error?: string;
  webhook_status: string;
  webhook_url_configured: boolean;
  write_enabled: boolean;
  product_write_enabled: boolean;
  connector_configured?: boolean;
  connector_connected?: boolean;
  product_sync_configured?: boolean;
  product_sync_available?: boolean;
  order_polling_configured?: boolean;
  order_polling_runtime_available?: boolean;
  inventory_write_configured?: boolean;
  inventory_delivery_verified?: boolean;
  fulfillment_supported?: boolean;
  fulfillment_permission_verified?: boolean;
  location_configured: boolean;
  order_polling_enabled: boolean;
  order_polling_last_success?: string;
  order_polling_last_error?: string;
  order_polling_imported: number;
  order_polling_quarantined: number;
  order_polling_failed: number;
}
export interface ShopifyProductPush {
	job_id: string;
	product_id: string;
	product_version: number;
	state: 'pending' | 'processing' | 'retrying' | 'succeeded' | 'failed' | 'conflict' | 'blocked' | 'superseded';
}
export interface ShopifyProductSyncJob {
	id: string;
	product_id: string;
	product_version: number;
	state: ShopifyProductPush['state'];
	attempt_count: number;
	safe_error_code?: string;
	remote_product_id?: string;
	created_at: string;
	started_at?: string;
	finished_at?: string;
	verified_at?: string;
	updated_at: string;
}
export interface ShopifyOrderReceipt {
  id: string;
  shopify_order_id: string;
  core_order_id?: string;
  channel_id: string;
  source: 'webhook' | 'polling';
  status: string;
  safe_error_code?: string;
  payment_status: string;
  fulfillment_status: string;
  attempt_count: number;
  processing_time_ms?: number;
  last_seen_at: string;
  created_at: string;
  processed_at?: string;
  reprocessable: boolean;
}
export interface ShopifyOrderReceiptPage {
  items: ShopifyOrderReceipt[];
  page: number;
  limit: number;
  total: number;
}
export interface ShopifyOrderReceiptFilters {
  shopify_order_id?: string;
  core_order_id?: string;
  channel_id?: string;
  status?: string;
  source?: 'webhook' | 'polling';
  payment_status?: string;
  fulfillment_status?: string;
  safe_error_code?: string;
  page?: number;
  limit?: number;
}
export interface ShopifyWebhookReconciliationEvidence {
  id: string;
  channel_id: string;
  topic: 'products/create' | 'products/update' | 'products/delete' | 'inventory_levels/update' | 'inventory_items/update';
  event_id: string;
  external_resource_id: string;
  state: 'observed' | 'verified' | 'conflict' | 'unmapped' | 'failed';
  safe_error_code?: string;
  evidence: {
    state?: string;
    safe_error_code?: string;
    observed_at?: string;
    core_version?: number;
    remote?: Record<string, unknown>;
    expected?: Record<string, unknown>;
  };
  checked_at: string;
}
export interface ShopifyWebhookReconciliationEvidencePage {
  items: ShopifyWebhookReconciliationEvidence[];
  page: number;
  limit: number;
  total: number;
}
export interface ShopifyFulfillmentView {
  order_id: string;
  shopify_order_id: string;
  core_status: string;
  core_fulfillment_status: string;
  shopify_fulfillment_status: string;
  shopify_delivery_status?: 'DELIVERED';
  shopify_shipment_status?: 'IN_TRANSIT';
  eligible: boolean;
  blocked_reason?: string;
  handover_eligible: boolean;
  handover_blocked_reason?: string;
  fulfillment_recovery_eligible: boolean;
  progress_eligible: boolean;
  progress_synchronized: boolean;
  progress_blocked_reason?: string;
  progress_state?: string;
  progress_attempt_count: number;
  progress_error_code?: string;
  progress_next_attempt_at?: string;
  progress_verified_at?: string;
  fulfillment_order_ids?: string[];
  sync_state: string;
  remote_read_error?: string;
  tracking_company?: string;
  tracking_number?: string;
  tracking_url?: string;
  record_state?: string;
  remote_fulfillment_id?: string;
  remote_fulfillment_status?: string;
  safe_error_code?: string;
  permission_verified: boolean;
  verified_at?: string;
}
export interface ShopifyMappingImport {
  remote_variants: number;
  mapped: number;
  unmapped: number;
  conflicts: number;
  stale: number;
  issues: Array<{
    sku?: string;
    product_title?: string;
    external_product_id?: string;
    external_variant_id?: string;
    reason: string;
  }>;
}

async function throwRequestError(response: Response, error: unknown): Promise<never> {
  if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
  if (response.headers.get('content-type')?.includes('application/json')) {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      throw new Error(body.error);
    }
  }
  throw new Error('Không kết nối được máy chủ Shopify. Hãy thử lại sau.');
}

export async function getShopifyStatus(signal?: AbortSignal): Promise<ShopifyStatus> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/integrations/shopify/status', { signal, cache: 'no-store' });
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyStatus;
}

export async function listShopifyPublications(signal?: AbortSignal): Promise<ShopifyPublicationOption[]> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/integrations/shopify/publications', { signal, cache: 'no-store' });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể tải các kênh đăng bán Shopify.');
  }
  if (!data) throw new Error('Dữ liệu kênh đăng Shopify nhận về không hợp lệ.');
  return data.publications;
}

export async function connectShopifyStore(): Promise<ShopifyStatus> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/integrations/shopify/connect');
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyStatus;
}

export async function verifyShopifyStore(): Promise<ShopifyStatus> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/integrations/shopify/verify');
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyStatus;
}

export async function verifyShopifyCapabilities(signal?: AbortSignal): Promise<import('./channels').ShopifyCapabilityReport> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/integrations/shopify/verify-capabilities', { signal });
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as import('./channels').ShopifyCapabilityReport;
}

export async function importShopifyMappings(): Promise<ShopifyMappingImport> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/integrations/shopify/mappings/import');
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyMappingImport;
}

export async function pushShopifyProduct(productId: string): Promise<ShopifyProductPush> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/integrations/shopify/products/{productId}/push', {
    params: { path: { productId } },
  });
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as ShopifyProductPush;
}

export async function getShopifyProductSyncJobs(productId: string, signal?: AbortSignal): Promise<ShopifyProductSyncJob[]> {
	const client = createApiClient();
	const { data, error, response } = await client.GET('/api/v1/integrations/shopify/product-sync', {
		params: { query: { product_id: productId, limit: 20 } }, signal, cache: 'no-store',
	});
	if (!response.ok || !data) return throwRequestError(response, error);
	return (data as unknown as { jobs: ShopifyProductSyncJob[] }).jobs;
}

export async function retryShopifyProductSync(jobId: string): Promise<void> {
	const client = createApiClient();
	const { error, response } = await client.POST('/api/v1/integrations/shopify/product-sync/{jobId}/retry', {
		params: { path: { jobId } },
	});
	if (!response.ok) return throwRequestError(response, error);
}

export async function reconcileShopifyOrders(): Promise<{ scanned: number; status: string }> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/integrations/shopify/orders/reconcile');
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as { scanned: number; status: string };
}

export async function getShopifyOrderReceipts(filters: ShopifyOrderReceiptFilters = {}, signal?: AbortSignal): Promise<ShopifyOrderReceiptPage> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/integrations/shopify/orders/receipts', {
    params: { query: { ...filters } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyOrderReceiptPage;
}

export async function reprocessShopifyOrderReceipt(receiptId: string): Promise<void> {
  const client = createApiClient();
  const { error, response } = await client.POST('/api/v1/integrations/shopify/orders/receipts/{receiptId}/reprocess', {
    params: { path: { receiptId } },
  });
  if (!response.ok) return throwRequestError(response, error);
}

export async function getShopifyReconciliationEvidence(filters: { channel_id: string; topic?: ShopifyWebhookReconciliationEvidence['topic']; state?: ShopifyWebhookReconciliationEvidence['state']; page?: number; limit?: number }, signal?: AbortSignal): Promise<ShopifyWebhookReconciliationEvidencePage> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/integrations/shopify/reconciliation-evidence', {
    params: { query: { ...filters } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyWebhookReconciliationEvidencePage;
}

export async function getShopifyFulfillmentStatus(orderId: string, signal?: AbortSignal): Promise<ShopifyFulfillmentView> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/integrations/shopify/orders/{orderId}/fulfillment', {
    params: { path: { orderId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyFulfillmentView;
}

export async function reportShopifyOrderProgress(orderId: string): Promise<void> {
  const client = createApiClient();
  const { error, response } = await client.POST('/api/v1/integrations/shopify/orders/{orderId}/progress', {
    params: { path: { orderId } },
  });
  if (!response.ok) return throwRequestError(response, error);
}

export async function createShopifyFulfillment(orderId: string, input: { tracking_company?: string; tracking_number?: string; tracking_url?: string } = {}): Promise<ShopifyFulfillmentView> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/integrations/shopify/orders/{orderId}/fulfillment', {
    params: { path: { orderId } }, body: input,
  });
  if (!response.ok || !data) return throwRequestError(response, error);
  return data as unknown as ShopifyFulfillmentView;
}
