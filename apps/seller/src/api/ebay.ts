import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';
import { runtimeCSRF } from '../features/auth/auth-runtime';

export type EbayConnection = {
  channel_id: string;
  seller_user_id: string;
  seller_username?: string;
  display_name?: string;
  registration_marketplace_id?: string;
  marketplace_id: string;
  environment: 'sandbox';
  connection_status: 'connected' | 'reauthorization_required' | 'error';
  granted_scopes: string[];
  last_verified_at?: string;
  last_error_code?: string;
  access_token_expires_at?: string;
  refresh_token_expires_at?: string;
  mapping_count: number;
};

export type EbayStatus = {
  enabled: boolean;
  environment: 'sandbox';
  marketplace_id: string;
  inventory_write_enabled: boolean;
  product_publish_enabled: boolean;
  order_write_enabled: boolean;
  connections: EbayConnection[];
};

export type EbayCapabilityStatus = 'VERIFIED' | 'GRANTED_UNTESTED' | 'NOT_GRANTED' | 'NOT_REQUESTED'
  | 'NOT_CONFIGURED' | 'NOT_SUPPORTED' | 'FAILED' | 'DENIED';

export type EbayCapability = {
  capability_key: string;
  operation: string;
  required_scopes: string[];
  granted_scopes: string[];
  verification_status: EbayCapabilityStatus;
  http_status?: number;
  request_id?: string;
  safe_error_code?: string;
  evidence_reference: string;
  verified_at: string;
};

export type EbayVerificationRun = {
  id: string;
  channel_id: string;
  seller_user_id: string;
  marketplace_id: string;
  environment: 'sandbox';
  seller_registration_completed?: boolean;
  status: 'VERIFIED' | 'FAILED' | 'DENIED';
  safe_error_code?: string;
  verified_at: string;
};

export type EbayInventoryItem = {
  sku: string;
  condition?: string;
  availability?: { shipToLocationAvailability?: { quantity?: number } };
  product?: { title?: string; description?: string; imageUrls?: string[] };
};
export type EbayInventoryItemsPage = { inventoryItems: EbayInventoryItem[]; total: number; limit: number; offset: number; next?: string };
export type EbayOffer = { offerId: string; sku: string; marketplaceId: string; format?: string; status?: string; categoryId?: string; merchantLocationKey?: string; listingDescription?: string; availableQuantity?: number; pricingSummary?: { price?: { value?: string; currency?: string } }; listingPolicies?: { fulfillmentPolicyId?: string; paymentPolicyId?: string; returnPolicyId?: string }; listing?: { listingId?: string; listingStatus?: string } };
export type EbayOffersPage = { offers: EbayOffer[]; total: number; limit: number; offset: number; next?: string };
export type EbayInventoryLocation = { merchantLocationKey: string; name: string; merchantLocationStatus?: 'ENABLED' | 'DISABLED'; location?: { address?: { city?: string; stateOrProvince?: string; postalCode?: string; country?: string } } };
export type EbayBusinessPolicy = { paymentPolicyId?: string; fulfillmentPolicyId?: string; returnPolicyId?: string; name: string };
export type EbayPolicies = { marketplace_id: string; payment_policies: EbayBusinessPolicy[]; fulfillment_policies: EbayBusinessPolicy[]; return_policies: EbayBusinessPolicy[]; policy_management_enabled: boolean; payment_error_code?: string; fulfillment_error_code?: string; return_error_code?: string; program_error_code?: string };
export type EbayProductSpec = {
  category_id?: string; condition?: string; condition_description?: string; aspects?: Record<string, string[]>; image_urls?: string[];
  merchant_location_key?: string; payment_policy_id?: string; fulfillment_policy_id?: string; return_policy_id?: string;
  price_currency?: string; prices?: Record<string, string>; variation_aspects?: Record<string, 'color' | 'size'>;
};
export type EbayProductAction = { operation: 'draft' | 'sync' | 'price_sync' | 'publish' | 'withdraw'; expected_product_version: number; confirm: true; spec?: EbayProductSpec };
export type EbayProductSyncJob = { id: string; channel_id: string; product_id: string; product_version: number; operation: EbayProductAction['operation']; state: 'pending' | 'processing' | 'retrying' | 'succeeded' | 'failed' | 'conflict' | 'blocked' | 'superseded'; attempt_count: number; safe_error_code?: string; remote_listing_id?: string; created_at: string; updated_at: string };
export type EbayProductPublicationState = {
  channel_id: string; product_id: string; product_version: number; marketplace_id: string; publication_state: string; mapping_state: string;
  catalog_sync_state: string; inventory_item_group_key?: string; remote_listing_id?: string; category_id?: string; merchant_location_key?: string;
  price_currency?: string; last_error_code?: string; configuration: EbayProductSpec; channel_connected: boolean; product_publish_enabled: boolean; inventory_write_enabled: boolean;
};
export type EbayTaxonomyCategory = { categoryId: string; categoryName: string };
export type EbayCategorySuggestion = { category: EbayTaxonomyCategory; categoryTreeNodeAncestors?: Array<{ category: EbayTaxonomyCategory }> };
export type EbayCategoryAspects = { categoryTreeId: string; categoryId: string; aspects: Array<{ localizedAspectName: string; aspectConstraint?: { aspectRequired?: boolean; itemToAspectCardinality?: 'SINGLE' | 'MULTI'; aspectMode?: string }; aspectValues?: Array<{ localizedValue: string }> }> };
export type EbayMappingCandidate = {
  external_sku: string; title?: string; canonical_sku?: string; core_variant_id?: string; marketplace_id?: string;
  offer_id?: string; listing_id?: string; offer_status?: string; merchant_location_key?: string;
  listed: boolean; status: 'eligible' | 'already_mapped' | 'imported' | 'issue'; reason?: string;
};
export type EbayMappingPlan = { items: EbayMappingCandidate[]; eligible: number; already_mapped: number; conflicts: number; unmapped: number; imported?: number };
export type EbayOrder = {
  orderId: string;
  creationDate?: string;
  lastModifiedDate?: string;
  orderFulfillmentStatus?: string;
  orderPaymentStatus?: string;
  cancelStatus?: { cancelState?: string; cancelRequests?: Array<{ cancelRequestState?: string; cancelReason?: string }> };
  core_import_status?: 'processing' | 'imported' | 'quarantined' | 'skipped' | 'failed';
  core_import_error?: string;
  core_order_id?: string;
  pricingSummary?: { total?: { value?: string; currency?: string } };
  lineItems?: Array<{ lineItemId?: string; sku?: string; quantity?: number; lineItemCost?: { value?: string; currency?: string } }>;
};
export type EbayOrderIngestionSummary = {
  imported: number; processing: number; quarantined: number; skipped: number; failed: number;
  last_successful_poll_at?: string; last_error_code?: string;
};
export type EbayOrdersPage = { orders: EbayOrder[]; total: number; limit: number; offset: number; next?: string; ingestion_summary?: EbayOrderIngestionSummary };
export type EbayOrderFailure = {
  id: string; channel_id: string; external_order_id?: string; fingerprint: string; safe_error_code: string;
  first_seen_at: string; last_seen_at: string; recovery_status: 'open' | 'retrying' | 'resolved' | 'blocked';
  retry_count: number; latest_result_code?: string; latest_attempt_state?: 'retrying' | 'recovered' | 'retryable' | 'blocked';
  latest_attempt_at?: string; resolved_at?: string; metadata?: Record<string, unknown>;
};
export type EbayOrderFailurePage = { failures: EbayOrderFailure[]; limit: number; offset: number };
export type EbayOperationalStatus = {
  orders_imported: number; orders_processing: number; orders_quarantined: number; orders_failed: number;
  malformed_failures_open: number; last_successful_order_poll?: string; last_order_poll_error?: string;
  pending_sync_jobs: number; blocked_sync_jobs: number; last_verified_readback?: string;
};

async function fail(response: Response, error: unknown): Promise<never> {
  if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
  throw new Error('Không thể đọc dữ liệu eBay Sandbox. Hãy kiểm tra kết nối và thử lại.');
}

function arrayOrEmpty<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : [];
}

export async function getEbayStatus(signal?: AbortSignal): Promise<EbayStatus> {
  const { data, error, response } = await createApiClient().GET('/api/v1/integrations/ebay/status', { signal, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as EbayStatus;
}

export async function getEbayInventoryLocations(channelId: string, signal?: AbortSignal): Promise<EbayInventoryLocation[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/inventory-locations', { params: { path: { channelId } }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  const page = (data ?? {}) as unknown as { locations?: unknown };
  return arrayOrEmpty<EbayInventoryLocation>(page.locations);
}

export async function getEbayPolicies(channelId: string, signal?: AbortSignal): Promise<EbayPolicies> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/policies', { params: { path: { channelId } }, signal, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as EbayPolicies;
}

export async function getEbayCategoryTree(channelId: string, signal?: AbortSignal): Promise<{ categoryTreeId: string }> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/category-tree', { params: { path: { channelId } }, signal, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return (data as unknown as { data?: { categoryTreeId?: string } }).data as { categoryTreeId: string };
}

export async function getEbayCategorySuggestions(channelId: string, treeId: string, query: string, signal?: AbortSignal): Promise<EbayCategorySuggestion[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/category-suggestions', { params: { path: { channelId }, query: { tree_id: treeId, q: query } }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  const payload = (data as unknown as { data?: { categorySuggestions?: unknown } } | undefined)?.data;
  return arrayOrEmpty<EbayCategorySuggestion>(payload?.categorySuggestions);
}

export async function getEbayCategoryAspects(channelId: string, treeId: string, categoryId: string, signal?: AbortSignal): Promise<EbayCategoryAspects> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/category-aspects', { params: { path: { channelId }, query: { tree_id: treeId, category_id: categoryId } }, signal, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return (data as unknown as { data?: EbayCategoryAspects }).data as EbayCategoryAspects;
}

export async function createEbayInventoryLocation(channelId: string, input: { merchant_location_key: string; name: string; city: string; state_or_province: string; postal_code: string; country: string; confirm: true }): Promise<{ location: EbayInventoryLocation; created: boolean; reconciled: boolean }> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/inventory-locations', { params: { path: { channelId }, header: { 'X-CSRF-Token': runtimeCSRF() } }, body: input, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as { location: EbayInventoryLocation; created: boolean; reconciled: boolean };
}

export async function setEbayInventoryLocationEnabled(channelId: string, key: string, enabled: boolean): Promise<{ location: EbayInventoryLocation; enabled: boolean }> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/inventory-locations/{merchantLocationKey}/status', { params: { path: { channelId, merchantLocationKey: key }, header: { 'X-CSRF-Token': runtimeCSRF() } }, body: { enabled, confirm: true }, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as { location: EbayInventoryLocation; enabled: boolean };
}

export async function getEbayProductState(channelId: string, productId: string, signal?: AbortSignal): Promise<EbayProductPublicationState> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/products/{productId}/state', { params: { path: { channelId, productId } }, signal, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as EbayProductPublicationState;
}

export async function getEbayProductJobs(channelId: string, productId: string, signal?: AbortSignal): Promise<EbayProductSyncJob[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/products/{productId}/jobs', { params: { path: { channelId, productId } }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  return arrayOrEmpty<EbayProductSyncJob>((data as unknown as { jobs?: unknown } | undefined)?.jobs);
}

export async function queueEbayProductAction(channelId: string, productId: string, input: EbayProductAction, idempotencyKey: string): Promise<EbayProductSyncJob> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/products/{productId}/actions', { params: { path: { channelId, productId }, header: { 'X-CSRF-Token': runtimeCSRF(), 'Idempotency-Key': idempotencyKey } }, body: input, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as EbayProductSyncJob;
}

export async function startEbayOAuth(): Promise<{ authorization_url: string; expires_in_seconds: number; environment: 'sandbox' }> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/ebay/oauth/start', { params: { header: { 'X-CSRF-Token': runtimeCSRF() } } });
  if (!response.ok || !data?.authorization_url) return fail(response, error);
  const url = new URL(data.authorization_url);
  if (url.protocol !== 'https:' || url.hostname !== 'auth.sandbox.ebay.com') throw new Error('Máy chủ trả về địa chỉ ủy quyền eBay không hợp lệ.');
  return data as unknown as { authorization_url: string; expires_in_seconds: number; environment: 'sandbox' };
}

export async function verifyEbayChannel(channelId: string): Promise<EbayVerificationRun> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/verify', { params: { path: { channelId }, header: { 'X-CSRF-Token': runtimeCSRF() } } });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as EbayVerificationRun;
}

export async function getEbayCapabilities(channelId: string, signal?: AbortSignal): Promise<EbayCapability[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/capabilities', { params: { path: { channelId } }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  return arrayOrEmpty<EbayCapability>(data);
}

export async function getEbayVerifications(channelId: string, signal?: AbortSignal): Promise<{ verifications: EbayVerificationRun[] }> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/verifications', { params: { path: { channelId } }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  const payload = (data ?? {}) as unknown as { verifications?: unknown };
  return { verifications: arrayOrEmpty<EbayVerificationRun>(payload.verifications) };
}

export async function getEbayInventoryItems(channelId: string, query: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<EbayInventoryItemsPage> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/inventory-items', { params: { path: { channelId }, query }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  const page = (data ?? {}) as unknown as Partial<EbayInventoryItemsPage>;
  return {
    inventoryItems: arrayOrEmpty<EbayInventoryItem>(page.inventoryItems),
    total: typeof page.total === 'number' ? page.total : 0,
    limit: typeof page.limit === 'number' ? page.limit : query.limit ?? 25,
    offset: typeof page.offset === 'number' ? page.offset : query.offset ?? 0,
    ...(typeof page.next === 'string' && page.next ? { next: page.next } : {}),
  };
}

export async function getEbayOffers(channelId: string, sku: string, query: { limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<EbayOffersPage> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/offers', { params: { path: { channelId }, query: { sku, ...query } }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  const page = (data ?? {}) as unknown as Partial<EbayOffersPage>;
  return {
    offers: arrayOrEmpty<EbayOffer>(page.offers),
    total: typeof page.total === 'number' ? page.total : 0,
    limit: typeof page.limit === 'number' ? page.limit : query.limit ?? 25,
    offset: typeof page.offset === 'number' ? page.offset : query.offset ?? 0,
    ...(typeof page.next === 'string' && page.next ? { next: page.next } : {}),
  };
}

export async function getEbayOffer(channelId: string, offerId: string, signal?: AbortSignal): Promise<EbayOffer> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/offers/{offerId}', { params: { path: { channelId, offerId } }, signal, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as EbayOffer;
}

export async function previewEbayMappings(channelId: string, skus: string[], signal?: AbortSignal): Promise<EbayMappingPlan> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/mappings/preview', {
    params: { path: { channelId }, header: { 'X-CSRF-Token': runtimeCSRF() } }, body: { skus }, signal, cache: 'no-store',
  });
  if (!response.ok) return fail(response, error);
  const plan = (data ?? {}) as unknown as Partial<EbayMappingPlan>;
  return { ...plan, items: arrayOrEmpty<EbayMappingCandidate>(plan.items), eligible: plan.eligible ?? 0, already_mapped: plan.already_mapped ?? 0, conflicts: plan.conflicts ?? 0, unmapped: plan.unmapped ?? 0 };
}

export async function importEbayMappings(channelId: string, skus: string[], signal?: AbortSignal): Promise<EbayMappingPlan> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/mappings/import', {
    params: { path: { channelId }, header: { 'X-CSRF-Token': runtimeCSRF() } }, body: { skus }, signal, cache: 'no-store',
  });
  if (!response.ok) return fail(response, error);
  const plan = (data ?? {}) as unknown as Partial<EbayMappingPlan>;
  return { ...plan, items: arrayOrEmpty<EbayMappingCandidate>(plan.items), eligible: plan.eligible ?? 0, already_mapped: plan.already_mapped ?? 0, conflicts: plan.conflicts ?? 0, unmapped: plan.unmapped ?? 0 };
}

export async function getEbayOrders(channelId: string, query: { modified_from?: string; modified_to?: string; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<EbayOrdersPage> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/orders', { params: { path: { channelId }, query }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  const page = (data ?? {}) as unknown as Partial<EbayOrdersPage>;
  return { ...page, orders: arrayOrEmpty<EbayOrder>(page.orders), total: page.total ?? 0, limit: page.limit ?? query.limit ?? 25, offset: page.offset ?? query.offset ?? 0 };
}

export async function getEbayOrderFailures(channelId: string, query: { status?: EbayOrderFailure['recovery_status']; limit?: number; offset?: number } = {}, signal?: AbortSignal): Promise<EbayOrderFailurePage> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/order-failures', { params: { path: { channelId }, query }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response, error);
  const page = (data ?? {}) as unknown as Partial<EbayOrderFailurePage>;
  return { failures: arrayOrEmpty<EbayOrderFailure>(page.failures), limit: page.limit ?? query.limit ?? 50, offset: page.offset ?? query.offset ?? 0 };
}

export async function getEbayOperationalStatus(channelId: string, signal?: AbortSignal): Promise<EbayOperationalStatus> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/operational-status', { params: { path: { channelId } }, signal, cache: 'no-store' });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as EbayOperationalStatus;
}

export type EbayShippingFulfillment = { fulfillmentId?: string; orderId?: string; shippedDate?: string; shippingCarrierCode?: string; trackingNumber?: string; lineItems: { lineItemId: string; quantity: number }[] };
export type EbayFulfillmentAction = { external_order_id: string; core_order_id: string; core_order_status: string; state: string; shipping_carrier_code: string; tracking_number: string; line_items: { line_item_id: string; quantity: number }[]; remote_fulfillment_id?: string; remote_shipped_date?: string; verified_at?: string; reconciled: boolean };

export async function getEbayShippingFulfillments(channelId: string, externalOrderId: string, signal?: AbortSignal): Promise<EbayShippingFulfillment[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/ebay/orders/{orderId}/fulfillments', { params: { path: { channelId, orderId: externalOrderId } }, signal, cache: 'no-store' });
  if (!response.ok) return fail(response,error);
  return arrayOrEmpty<EbayShippingFulfillment>((data as { fulfillments?: unknown } | undefined)?.fulfillments);
}

export async function createEbayShippingFulfillment(channelId: string, externalOrderId: string, input: { confirm: true; shipping_carrier_code: string; tracking_number: string; line_items: { line_item_id: string; quantity: number }[] }, idempotencyKey: string): Promise<EbayFulfillmentAction> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/orders/{orderId}/fulfillments', { params: { path: { channelId, orderId: externalOrderId }, header: { 'Idempotency-Key': idempotencyKey, 'X-CSRF-Token': runtimeCSRF() } }, body: input, cache: 'no-store' });
  if (!response.ok || !data) return fail(response,error);
  return data as unknown as EbayFulfillmentAction;
}

export async function retryEbayOrderFailure(channelId: string, failureId: string): Promise<{ failure: EbayOrderFailure; recovered: boolean }> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/ebay/order-failures/{failureId}/retry', {
    params: { path: { channelId, failureId }, header: { 'X-CSRF-Token': runtimeCSRF() } }, cache: 'no-store',
  });
  if (!response.ok || !data) return fail(response, error);
  return data as unknown as { failure: EbayOrderFailure; recovered: boolean };
}
