import type { components } from './generated/openapi';
import { createApiClient } from './client';
import { ApiRequestError, parseApiError, responseApiError } from '../core/api-error';
import { pageOf, type Page } from './list';

type ServerChannel = components['schemas']['ChannelResponse'];
type ServerListing = components['schemas']['ChannelListingResponse'];

export type Channel = {
  id: string;
  code: string;
  name: string;
  /**
   * A display bucket, not a server field. Spring Boot stores the channel code; the UI filters
   * by a small vocabulary, so the code is translated here once instead of in every panel.
   */
  type: string;
  environment: string;
  status: string;
  last_error?: string;
  last_sync?: string;
  /**
   * Spring Boot does not aggregate listings on the channel row. The grid shows a dash rather
   * than inventing a count; the channel detail page loads the actual listings.
   */
  mapping_count?: number;
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
  acknowledged_quantity?: number | null;
  verified_quantity?: number | null;
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

function requireId(value: unknown, entity: string): string {
  if (value === undefined || value === null) {
    throw new Error(`Phản hồi ${entity} không có mã hợp lệ.`);
  }
  const str = String(value).trim();
  if (!str) {
    throw new Error(`Phản hồi ${entity} không có mã hợp lệ.`);
  }
  return str;
}

function channelType(code: string, environment: string): string {
  if (environment.toLowerCase() === 'simulated' || code.startsWith('simulator') || code.startsWith('load-')) return 'simulator';
  if (code === 'web' || code === 'website') return 'website';
  if (code === 'pos') return 'pos';
  return 'marketplace';
}

function toChannel(channel: ServerChannel): Channel {
  const code = channel.code ?? '';
  return {
    id: requireId(channel.id, 'kênh bán'),
    code,
    name: channel.name ?? code,
    type: channelType(code, channel.environment ?? ''),
    environment: channel.environment ?? '',
    status: (channel.status ?? 'DISCONNECTED').toLowerCase(),
  };
}

function mappingStatus(value: string | undefined): ChannelMapping['mapping_status'] {
  switch ((value ?? '').toUpperCase()) {
    case 'VERIFIED':
      return 'verified';
    default:
      return 'unverified';
  }
}

function syncStatus(value: string | undefined): ChannelMapping['latest_sync_status'] {
  switch ((value ?? '').toUpperCase()) {
    case 'SYNCED':
      return 'VERIFIED';
    case 'OUT_OF_SYNC':
      return 'MISMATCH';
    case 'ERROR':
      return 'BLOCKED';
    default:
      return 'UNVERIFIED';
  }
}

/**
 * Translates one Spring Boot listing into the row the channel screens render.
 *
 * The server owns the listing, its quota and its last verified quantity. Fields this app's
 * legacy ledger used to receive from a richer endpoint (product title, colour, size, barcode,
 * core balance) are left undefined: printing a fixture value beside live stock would make an
 * operator trust a number the server never sent.
 */
function toMapping(listing: ServerListing, channelId: string, sku?: string): ChannelMapping {
  const canonicalSku = listing.sku ?? sku ?? '';
  const revision = listing.target_allocation_revision ?? 0;
  const latestSync = syncStatus(listing.sync_status);
  const drifted = latestSync === 'MISMATCH' || latestSync === 'BLOCKED';
  return {
    id: requireId(listing.id, 'ánh xạ kênh'),
    channel_id: String(listing.channel_id ?? channelId),
    variant_id: requireId(listing.variant_id, 'ánh xạ kênh'),
    external_sku: listing.external_sku ?? listing.external_variant_id ?? '',
    external_product_id: listing.external_listing_id,
    external_variant_id: listing.external_variant_id,
    inventory_tracking_enabled: listing.active ?? true,
    mapping_status: mappingStatus(listing.mapping_status),
    issue_reason: listing.last_sync_error,
    last_verified_at: listing.mapping_verified_at,
    canonical_sku: canonicalSku,
    listed: listing.active ?? true,
    variant_is_active: listing.active ?? true,
    pushed_version: revision,
    target_quantity: listing.allocated_quota ?? null,
    target_version: revision,
    reported_on_hand: listing.reported_stock ?? null,
    pushed_quantity: listing.sent_quantity ?? null,
    acknowledged_quantity: listing.acknowledged_quantity ?? null,
    verified_quantity: listing.verified_quantity ?? null,
    reported_quantity: listing.reported_stock ?? null,
    quantity_basis: 'ats',
    latest_sync_status: latestSync,
    latest_sync_verified_at: listing.last_verified_at,
    latest_sync_attempt_at: listing.updated_at,
    latest_sync_error_code: listing.last_sync_error,
    latest_sync_requested_available: listing.sent_quantity ?? null,
    latest_sync_remote_after: listing.verified_quantity ?? null,
    latest_sync_target_version: revision,
    latest_sync_mutation_acknowledged: listing.acknowledged_quantity !== null && listing.acknowledged_quantity !== undefined,
    drifted,
    push_state: latestSync === 'VERIFIED' ? 'current' : drifted ? 'superseded' : 'unknown',
  };
}

function summarizeMappings(items: readonly ChannelMapping[]): ChannelProductSummary {
  const variants = new Set(items.map((item) => item.canonical_sku).filter(Boolean));
  return {
    // A listing names a variant, not its product. The server does not expose the relationship
    // here, so the product count is left at zero rather than guessed from SKUs.
    product_count: 0,
    variant_count: variants.size,
    missing_balance_count: 0,
    total_on_hand: null,
    total_reserved: null,
    total_available_to_sell: null,
    total_received: 0,
    pending_inbound: 0,
    awaiting_shipment: 0,
    in_transit: 0,
    pending_return: 0,
  };
}

/** `GET /channels` supports both bare arrays from Spring Boot and legacy envelope shapes. */
export async function listChannels(query: ChannelQuery = {}, signal?: AbortSignal): Promise<Page<Channel>> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/channels', {
    params: { query: query as any },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu danh sách kênh bán nhận về không hợp lệ.');
  if (Array.isArray(data)) {
    const items = data.map(toChannel);
    return { items, nextCursor: null, totalCount: items.length };
  }
  return pageOf<Channel>(data as unknown as Record<string, unknown>, 'channels');
}

export async function getChannel(channelId: string, signal?: AbortSignal): Promise<Channel> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/channels/{channelId}', {
    params: { path: { channelId: channelId as any } }, signal, cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu chi tiết kênh bán nhận về không hợp lệ.');
  if (typeof (data as any).id === 'number') {
    return toChannel(data);
  }
  return data as unknown as Channel;
}

/** `GET /channels/{channelId}/mappings` supports both bare arrays and legacy envelope shapes. */
export async function listChannelMappings(
  channelId: string,
  query: ChannelMappingQuery = {},
  signal?: AbortSignal,
): Promise<ChannelMappingPage> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/channels/{channelId}/mappings', {
    params: { path: { channelId: channelId as any }, query: query as any }, signal, cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu ánh xạ SKU nhận về không hợp lệ.');
  if (Array.isArray(data)) {
    const items = data.map((listing) => toMapping(listing, channelId));
    return {
      items,
      nextCursor: null,
      totalCount: items.length,
      summary: summarizeMappings(items),
      // Spring Boot returns every listing on the channel; it has no separate issue feed.
      issues: [],
      issueCount: 0,
      nextIssueCursor: null,
    };
  }
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

export type RegisterChannelMappingInput = {
  /** Core SKU. The server requires it to exist and be unique. */
  sku: string;
  /** WooCommerce parent product ID for a variation, or the product ID for a simple product. */
  external_listing_id: string;
  /** Exact external SKU read from WooCommerce. Never derived from the Core SKU. */
  external_sku: string;
  /** WooCommerce variation ID. Omit for a simple product. */
  external_variant_id?: string;
};

/**
 * Registers an external identity but does not verify it.
 *
 * A mapping is only usable for inventory writes after the connector proves the product or
 * variation exists, the IDs/SKU match and WooCommerce stock management is enabled.
 */
export async function registerChannelMapping(
  channelId: string,
  input: RegisterChannelMappingInput,
  signal?: AbortSignal,
): Promise<ChannelMapping> {
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/channels/{channelId}/mappings', {
    params: { path: { channelId: Number(channelId) } }, body: input, signal, cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response, 'Không đăng ký được mapping SKU.');
  if (!data) throw new Error('Mapping SKU nhận về không hợp lệ.');
  return toMapping(data, channelId, input.sku);
}

export async function verifyChannelMapping(
  channelId: string,
  listingId: string,
  signal?: AbortSignal,
): Promise<ChannelMapping> {
  const client = createApiClient();
  const { data, response } = await client.POST('/api/v1/channels/{channelId}/mappings/{listingId}/verify', {
    params: { path: { channelId: Number(channelId), listingId: Number(listingId) } }, signal, cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response, 'Không xác minh được mapping SKU.');
  if (!data) throw new Error('Kết quả xác minh mapping nhận về không hợp lệ.');
  return toMapping(data, channelId);
}
