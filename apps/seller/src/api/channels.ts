import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';
import { pageOf, type Page } from './list';

export type Channel = {
  id: string;
  code: string;
  name: string;
  type: string;
  environment: string;
  status: string;
  last_error?: string;
  last_sync?: string;
  mapping_count: number;
};

export type ChannelMapping = {
  id: string;
  channel_id: string;
  variant_id: string;
  product_id?: string;
  product_name?: string;
  product_category?: string;
  product_brand?: string;
  product_code?: string | null;
  product_variant_count?: number;
  variant_color?: string;
  color_description?: string;
  variant_size?: string;
  barcode?: string | null;
  price_minor?: number | null;
  currency?: string;
  total_received?: number;
  pending_inbound?: number;
  awaiting_shipment?: number;
  in_transit?: number;
  units_sold_30d?: number;
  pending_return?: number;
  external_sku: string;
  external_product_id?: string;
  external_variant_id?: string;
  external_inventory_item_id?: string;
  external_location_id?: string;
  inventory_tracking_enabled: boolean;
  mapping_status: 'verified' | 'unverified' | 'needs_attention' | 'stale';
  issue_reason?: string;
  last_verified_at?: string;
  canonical_sku: string;
  listed: boolean;
  variant_is_active: boolean;
  pushed_version: number;
  target_quantity?: number | null;
  target_version: number;
  target_at?: string;
  pushed_on_hand?: number | null;
  reported_on_hand?: number | null;
  reported_at?: string;
  pushed_quantity?: number | null;
  reported_quantity?: number | null;
  quantity_basis: 'legacy' | 'ats';
  legacy_on_hand?: number | null;
  core_on_hand?: number | null;
  core_reserved?: number | null;
  core_safety_buffer?: number | null;
  core_version?: number | null;
  latest_sync_status?: 'VERIFIED' | 'MISMATCH' | 'UNVERIFIED' | 'DEFERRED' | 'SUPERSEDED' | 'BLOCKED';
  latest_sync_verified_at?: string;
  latest_sync_attempt_at?: string;
  latest_sync_error_code?: string;
  latest_sync_requested_available?: number | null;
  latest_sync_remote_after?: number | null;
  latest_sync_core_version?: number | null;
  latest_sync_target_version?: number | null;
  latest_sync_mutation_acknowledged?: boolean | null;
  woocommerce_remote_revision?: number | null;
  woocommerce_remote_observed_at?: string | null;
  sync_pending?: boolean;
  drifted: boolean;
  push_state: 'never' | 'unknown' | 'superseded' | 'current';
};

export type ChannelMappingIssue = {
  external_variant_id: string;
  external_product_id: string;
  sku?: string;
  product_title?: string;
  reason: string;
  last_seen_at: string;
};

export type ChannelMappingPage = Page<ChannelMapping> & {
  summary: ChannelProductSummary;
  issues: ChannelMappingIssue[];
  issueCount: number;
  nextIssueCursor: string | null;
};

export type ChannelProductSummary = {
  product_count: number;
  variant_count: number;
  missing_balance_count: number;
  total_on_hand: number | null;
  total_reserved: number | null;
  total_available_to_sell: number | null;
  total_received: number;
  pending_inbound: number;
  awaiting_shipment: number;
  in_transit: number;
  pending_return: number;
};

export type CapabilityStatus = 'NOT_CONFIGURED' | 'NOT_REQUESTED' | 'NOT_GRANTED' | 'GRANTED_UNTESTED'
  | 'VERIFIED' | 'DENIED' | 'FAILED' | 'NOT_SUPPORTED';

export type ShopifyCapabilityEvidence = {
  provider: string;
  shop_domain: string;
  environment: string;
  capability_key: string;
  api_version: string;
  endpoint: string;
  operation: string;
  required_scopes: string[];
  requested_scopes: string[];
  granted_scopes: string[];
  verification_status: CapabilityStatus;
  http_status?: number;
  graphql_errors: { code: string }[];
  request_id?: string;
  verified_at?: string;
  rate_limit: {
    source: 'runtime' | 'unknown';
    requested_query_cost?: number;
    actual_query_cost?: number;
    maximum_available?: number;
    currently_available?: number;
    restore_rate?: number;
  };
  retry_after?: string;
  evidence_reference: string;
  reason?: string;
};

export type ShopifySandboxSKU = {
  canonical_sku: string;
  core_variant_id?: string;
  external_product_id?: string;
  external_variant_id?: string;
  external_inventory_item_id?: string;
  verification_status: CapabilityStatus | 'MISSING' | 'DUPLICATE' | 'CONFLICT';
  reason?: string;
};

export type ShopifyVerificationRun = {
  id: string;
  channel_id: string;
  provider: string;
  shop_domain: string;
  shop_gid?: string;
  shop_currency?: string;
  environment: string;
  api_version: string;
  shop_plan_name?: string;
  partner_development?: boolean;
  requested_scopes: string[];
  granted_scopes: string[];
  status: 'success' | 'partial' | 'failed';
  verified_at: string;
};

export type ShopifyVerificationHistoryRun = {
  id: string;
  shop_domain: string;
  environment: string;
  api_version: string;
  status: 'success' | 'partial' | 'failed';
  verified_at: string;
};

export type ShopifyCapabilityReport = {
  run?: ShopifyVerificationRun;
  capabilities: ShopifyCapabilityEvidence[];
  sandbox_skus: ShopifySandboxSKU[];
};

export interface ChannelQuery {
  limit?: number;
  cursor?: string;
}

export interface ChannelMappingQuery extends ChannelQuery {
  issue_cursor?: string;
}

export async function listChannels(query: ChannelQuery = {}, signal?: AbortSignal): Promise<Page<Channel>> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/channels', {
    params: { query }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu danh sách kênh bán nhận về không hợp lệ.');
  return pageOf<Channel>(data as unknown as Record<string, unknown>, 'channels');
}

export async function getChannel(channelId: string, signal?: AbortSignal): Promise<Channel> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/channels/{channelId}', {
    params: { path: { channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu chi tiết kênh bán nhận về không hợp lệ.');
  return data;
}

export async function listChannelMappings(
  channelId: string,
  query: ChannelMappingQuery = {},
  signal?: AbortSignal,
): Promise<ChannelMappingPage> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/channels/{channelId}/mappings', {
    params: { path: { channelId }, query }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu ánh xạ SKU nhận về không hợp lệ.');
  const record = data as unknown as Record<string, unknown>;
  const page = pageOf<ChannelMapping>(record, 'mappings');
  return {
    ...page,
    summary: record.summary && typeof record.summary === 'object'
      ? record.summary as ChannelProductSummary
      : { product_count: 0, variant_count: page.totalCount ?? 0, missing_balance_count: 0, total_on_hand: null, total_reserved: null, total_available_to_sell: null, total_received: 0, pending_inbound: 0, awaiting_shipment: 0, in_transit: 0, pending_return: 0 },
    issues: Array.isArray(record.issues) ? record.issues as ChannelMappingIssue[] : [],
    issueCount: typeof record.issue_count === 'number' ? record.issue_count : 0,
    nextIssueCursor: typeof record.next_issue_cursor === 'string' ? record.next_issue_cursor : null,
  };
}

export async function getChannelAPICapabilities(channelId: string, signal?: AbortSignal): Promise<ShopifyCapabilityReport> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/channels/{channelId}/api-capabilities', {
    params: { path: { channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không đọc được bảng quyền API Shopify.');
  }
  if (!data) throw new Error('Bảng quyền API Shopify nhận về không hợp lệ.');
  return data as unknown as ShopifyCapabilityReport;
}

export async function getChannelAPIVerifications(channelId: string, signal?: AbortSignal): Promise<{ verifications: ShopifyVerificationHistoryRun[] }> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/channels/{channelId}/api-verifications', {
    params: { path: { channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không đọc được lịch sử xác minh Shopify.');
  }
  if (!data) throw new Error('Lịch sử xác minh Shopify nhận về không hợp lệ.');
  return data as unknown as { verifications: ShopifyVerificationHistoryRun[] };
}
