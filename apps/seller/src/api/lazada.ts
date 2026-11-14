import { apiFetch } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';

export type LazadaConnection = {
  channel_id: string; seller_id: string; country: string;
  status: 'connected' | 'disconnected' | 'reauthorization_required' | 'error';
  access_token_expires_at?: string; refresh_token_expires_at?: string;
  last_verified_at?: string; last_error_code?: string;
  last_order_poll_at?: string; order_poll_error?: string;
  capabilities?: Record<string, boolean>;
};
export type LazadaStatus = {
  enabled: boolean; configured: boolean; country: string;
  write_enabled: boolean; product_write_enabled: boolean; inventory_write_enabled: boolean; order_write_enabled: boolean;
  connection: LazadaConnection | null;
};
export type LazadaSKU = { SkuId?: number | string; SellerSku?: string; Status?: string; price?: number | string; quantity?: number; Available?: number; sellableQuantity?: number };
export type LazadaProduct = { item_id: number | string; status?: string; attributes?: { name?: string }; skus?: LazadaSKU[] };
export type LazadaCatalog = { data: { products?: LazadaProduct[]; total_products?: number }; offset: number; limit: number; source: 'lazada_live' };
export type LazadaCategory = { category_id: number; name: string; leaf: boolean; children?: LazadaCategory[] };
export type LazadaCategoryAttribute = { name: string; label?: string; input_type: string; attribute_type: 'normal' | 'sku'; is_mandatory: number | string | boolean; is_sale_prop?: number | string | boolean; options?: Array<{ name?: string; en_name?: string }> };
export type LazadaMappingCandidate = { product_id: string; sku_id: string; seller_sku: string; core_product_id?: string; core_variant_id?: string; remote_status: string; status: string; reason?: string };
export type LazadaMappingReport = { fingerprint: string; products: number; skus: number; eligible: number; imported: number; issues: LazadaMappingCandidate[]; candidates: LazadaMappingCandidate[] };
export type LazadaOrderReceipt = {
  external_order_id: string; core_order_id: string; native_status: string;
  ingestion_status: string; safe_error_code: string; last_seen_at: string;
  core_status: string; core_fulfillment_status: string;
  items: Array<{ order_item_id: string; sku_id: string; seller_sku: string; native_status: string }>;
};
export type LazadaProductSpec = {
  category_id: string; category_path?: string; brand_id: string; brand_name?: string; attributes: Record<string, string>;
  expected_core_version?: number; metadata_version?: number;
  skus: Array<{ variant_id: string; attributes: Record<string, string>; package_length: string; package_width: string; package_height: string; package_weight: string; package_content: string; package_source?: 'manual' | 'core_confirmed' }>;
};
export type LazadaSpecificationState = { spec: LazadaProductSpec; core_version: number; stale: boolean; changed_fields?: string[] };
export type LazadaBrand = { brand_id: number | string; name: string };
export type LazadaImageAsset = {
  core_media_id: string; variant_id?: string; scope: 'product' | 'variant'; position: number; is_primary: boolean;
  mime_type: string; byte_size: number; status: 'missing' | 'ready' | 'stale' | 'failed' | 'invalid';
  lazada_url?: string; error_code?: string; attempt_count: number; verified_at?: string;
};
export type LazadaProductImageState = {
  product_id: string; product_version: number; ready: boolean; accepted: number; pending: number;
  product_images: number; variant_images: number; primary_ready: boolean;
  prepared: number; reused: number; failed: number;
  items: LazadaImageAsset[]; issues: Array<{ code: string; field: string; variant_id?: string }>;
};
export type LazadaPreflightPrice = { variant_id: string; sku: string; amount: string; currency: string; source: string };
export type LazadaPreflightSKU = {
  variant_id: string; sku: string; price: string; currency: string; price_source: string;
  package_source?: string; package_ready: boolean;
};
export type LazadaProductPreflight = {
  product_id: string; product_version: number; category_id: string; skus: number;
  data_ready: boolean; media_ready: boolean; connection_ready: boolean; product_write_enabled: boolean; publish_ready: boolean;
  images: { core_images: number; product_images: number; variant_images: number; accepted: number; primary_ready: boolean; items: LazadaImageAsset[] };
  issues: Array<{ code: string; field: string; variant_id?: string }>;
  prices?: LazadaPreflightPrice[];
  sku_details?: LazadaPreflightSKU[];
  publication_state?: string;
  remote_item_id?: string;
};
export type LazadaPublishJob = {
  id: string; channel_id: string; product_id: string; request_key: string; request_sha256: string;
  product_version: number; spec_fingerprint: string; operation: 'create' | 'update' | 'reconcile' | string;
  state: string; attempt_count: number; lease_until?: string; retry_after?: string; last_error_code?: string;
  remote_item_id?: string; correlation_id: string; submitted_at?: string; verified_at?: string;
  qc_checked_at?: string; created_at: string; updated_at: string;
};
export type LazadaPublishEvent = {
  id: number; job_id: string; state: string; event_code: string;
  detail: Record<string, unknown>; correlation_id: string; created_at: string;
};
export type LazadaPublicationSKU = {
  variant_id: string; sku: string; seller_sku: string; shop_sku?: string; remote_sku_id?: string;
  remote_status?: string; remote_qc_status?: string; remote_qc_reason_code?: string; remote_qc_reason?: string;
  listed: boolean; core_price_minor?: number; lazada_price?: string; verified_price?: string;
  price_sync_state?: string; remote_price?: string; price_verified: boolean; mapping_verified: boolean;
};
export type LazadaPublication = {
  product_id: string; product_version: number; state: string; remote_item_id?: string;
  remote_product_status?: string; mapping_state: string; price_state: string; qc_status?: string;
  qc_reason_code?: string; qc_reason?: string; last_error_code?: string;
  expected_sku_count: number; verified_sku_count: number;
  verified_at?: string; qc_checked_at?: string; live_at?: string; updated_at?: string;
  skus: LazadaPublicationSKU[]; latest_job?: LazadaPublishJob; history: LazadaPublishEvent[];
  product_write_enabled: boolean; seller_model: string;
  can_create: boolean; can_retry: boolean; can_update: boolean;
};
export type LazadaPublicationHistory = { jobs: LazadaPublishJob[]; events: LazadaPublishEvent[] };
export type LazadaPublishResult = { job: LazadaPublishJob; publication: LazadaPublication };

async function request<T>(path: string, method = 'GET', signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(path, { method, signal, cache: 'no-store' });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    throw new ApiRequestError(parseApiError(body), response.status);
  }
  return response.json() as Promise<T>;
}
export const getLazadaStatus = (signal?: AbortSignal) => request<LazadaStatus>('/api/v1/integrations/lazada/status', 'GET', signal);
export async function startLazadaOAuth(): Promise<string> {
  const result = await request<{ authorization_url: string }>('/api/v1/integrations/lazada/connect', 'POST');
  const url = new URL(result.authorization_url);
  if (url.protocol !== 'https:' || url.hostname !== 'auth.lazada.com' || url.pathname !== '/oauth/authorize') throw new Error('Địa chỉ ủy quyền Lazada không hợp lệ.');
  return url.toString();
}
export const verifyLazada = (channelId: string) => request<{ status: string }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/verify`, 'POST');
export const disconnectLazada = (channelId: string) => request<{ status: string }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/disconnect`, 'POST');
export const getLazadaCatalog = (channelId: string, offset = 0, signal?: AbortSignal) => request<LazadaCatalog>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products?offset=${offset}&limit=50`, 'GET', signal);
export const getLazadaCategories = (channelId: string, signal?: AbortSignal) => request<{ data: LazadaCategory[]; source: 'lazada_live' }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/categories`, 'GET', signal);
export const getLazadaCategoryAttributes = (channelId: string, categoryId: number, signal?: AbortSignal) => request<{ data: LazadaCategoryAttribute[]; source: 'lazada_live' }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/categories/${categoryId}/attributes`, 'GET', signal);
export const getLazadaCategorySuggestions = (channelId: string, productId: string) => request<{ data: { categorySuggestions?: Array<{ categoryId: number; categoryName?: string; categoryPath?: string }> }; source: 'lazada_live' }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/category-suggestions`);
export const getLazadaBrands = (channelId: string, startRow: number) => request<{ data: LazadaBrand[] | { module?: LazadaBrand[]; brands?: LazadaBrand[]; brand_list?: LazadaBrand[]; total_record?: number }; source: 'lazada_live' }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/brands?start_row=${startRow}`);
export const getLazadaSpecification = (channelId: string, productId: string) => request<LazadaSpecificationState>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/specification`);
export async function saveLazadaSpecification(channelId: string, productId: string, spec: LazadaProductSpec): Promise<LazadaSpecificationState> {
  const response = await apiFetch(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/specification`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(spec), cache: 'no-store',
  });
  if (!response.ok) { const body: unknown = await response.json().catch(() => null); throw new ApiRequestError(parseApiError(body), response.status); }
  return response.json() as Promise<LazadaSpecificationState>;
}
export const getLazadaProductImages = (channelId: string, productId: string) => request<LazadaProductImageState>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/images`);
export async function prepareLazadaProductImages(channelId: string, productId: string): Promise<LazadaProductImageState> {
  const response = await apiFetch(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/images/prepare`, {
    method: 'POST', cache: 'no-store',
  });
  if (!response.ok) { const body: unknown = await response.json().catch(() => null); throw new ApiRequestError(parseApiError(body), response.status); }
  return response.json() as Promise<LazadaProductImageState>;
}
export async function preflightLazadaProduct(channelId: string, productId: string): Promise<LazadaProductPreflight> {
  const response = await apiFetch(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/preflight`, {
    method: 'POST', cache: 'no-store',
  });
  if (!response.ok) { const body: unknown = await response.json().catch(() => null); throw new ApiRequestError(parseApiError(body), response.status); }
  return response.json() as Promise<LazadaProductPreflight>;
}
export const getLazadaOrders = (channelId: string, signal?: AbortSignal) => request<{ items: LazadaOrderReceipt[] }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/orders`, 'GET', signal);
export const retryLazadaOrder = (channelId: string, orderId: string) => request<{ status: string }>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/orders/${encodeURIComponent(orderId)}/retry`, 'POST');
export async function previewLazadaMappings(channelId: string): Promise<LazadaMappingReport> {
  return request<LazadaMappingReport>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/mappings/preview`, 'POST');
}
export async function importLazadaMappings(channelId: string, fingerprint: string): Promise<LazadaMappingReport> {
  const response = await apiFetch(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/mappings/import`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ fingerprint }), cache: 'no-store',
  });
  if (!response.ok) { const body: unknown = await response.json().catch(() => null); throw new ApiRequestError(parseApiError(body), response.status); }
  return response.json() as Promise<LazadaMappingReport>;
}

async function publishRequest<T>(path: string, method: 'POST', idempotencyKey: string, body?: unknown): Promise<T> {
  const headers: Record<string, string> = { 'Idempotency-Key': idempotencyKey };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  const response = await apiFetch(path, {
    method, headers, cache: 'no-store', ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    const payload: unknown = await response.json().catch(() => null);
    throw new ApiRequestError(parseApiError(payload), response.status);
  }
  return response.json() as Promise<T>;
}

export const getLazadaPublication = (channelId: string, productId: string, signal?: AbortSignal) =>
  request<LazadaPublication>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/publication`, 'GET', signal);

export const getLazadaPublicationHistory = (channelId: string, productId: string, signal?: AbortSignal) =>
  request<LazadaPublicationHistory>(`/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/publication/history`, 'GET', signal);

export const publishLazadaProduct = (
  channelId: string,
  productId: string,
  input: { operation?: 'create' | 'update'; expected_product_version?: number; expected_metadata_version?: number } = {},
  idempotencyKey: string,
) => publishRequest<LazadaPublishResult>(
  `/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/publish`,
  'POST', idempotencyKey, input,
);

export const retryLazadaPublication = (channelId: string, productId: string, idempotencyKey: string) =>
  publishRequest<LazadaPublishResult>(
    `/api/v1/channels/${encodeURIComponent(channelId)}/lazada/products/${encodeURIComponent(productId)}/publication/retry`,
    'POST', idempotencyKey, {},
  );
