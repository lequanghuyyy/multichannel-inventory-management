import type { components } from './generated/openapi';
import { apiFetch, createApiClient } from './client';
import { ApiRequestError, parseApiError, responseApiError } from '../core/api-error';
import { pageOf, type Page } from './list';

/**
 * Product status as the seller app speaks it.
 *
 * The Spring Boot catalogue stores `DRAFT | PUBLISHED | ARCHIVED`; `active` is this app's word
 * for `PUBLISHED`. Keeping the server's spelling out of the UI avoids two names for one state in
 * every component that renders a badge or offers a lifecycle move.
 */
export type ProductStatus = 'draft' | 'active' | 'out_of_stock' | 'archived';

export interface ProductVariant {
  id: string;
  sku: string;
  title: string;
  priceMinor: number | null;
  currency: string;
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  availableToSell: number;
}

/**
 * A catalogue row.
 *
 * `ProductResponse` has no product-level aggregates, so the totals below are sums of the
 * server-owned per-variant numbers it does return. They are never derived from
 * `on_hand - reserved - safety_buffer`: `availableToSell` on each variant is read verbatim.
 */
export interface ProductSummary {
  id: string;
  name: string;
  description: string;
  category: string;
  status: ProductStatus;
  variantCount: number;
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  availableToSell: number;
  createdAt: string;
  updatedAt: string;
}

export interface ProductDetail extends ProductSummary {
  variants: ProductVariant[];
  product_version?: number;
  productVersion?: number;
}

export interface ProductQuery {
  limit?: number;
  cursor?: string;
  q?: string;
  status?: ProductStatus;
  category?: string;
}

export type CreateProductInput = {
  name: string;
  master_sku?: string;
  masterSku?: string;
  category?: string;
  brand?: string;
  description?: string;
  short_description?: string;
  shortDescription?: string;
  attributes?: Record<string, string>;
  weight_grams?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  condition?: 'new' | 'used' | 'refurbished' | 'for_parts' | string;
  currency?: string;
  variants: Array<{
    sku: string;
    title?: string;
    color?: string;
    size?: string;
    price?: number;
    price_minor?: number;
    priceMinor?: number;
    currency?: string;
    barcode?: string;
    initialStock?: number;
  }>;
};
export type CreateProductVariantInput = Omit<components['schemas']['AddProductVariantRequest'], 'title'> & {
  title?: string;
  color?: string;
  size?: string;
  price_minor?: number;
  barcode?: string;
};

export interface UpdateProductCatalogInput {
  name?: string;
  description?: string;
  category?: string;
  status?: ProductStatus;
  brand?: string;
  short_description?: string;
  attributes?: Record<string, string>;
  weight_grams?: number | null;
  length_mm?: number | null;
  width_mm?: number | null;
  height_mm?: number | null;
  condition?: 'new' | 'used' | 'refurbished' | 'for_parts' | '';
  expected_product_version?: number;
  reason?: string;
}

export interface UpdateVariantInput {
  sku?: string;
  title?: string;
  color?: string;
  size?: string;
  is_active?: boolean;
  priceMinor?: number | null;
  price_minor?: number | null;
  currency?: string;
  expected_product_version?: number;
  /** Mandatory when `sku` changes: it is the identifier humans read at receiving. */
  reason?: string;
}

type ServerProduct = components['schemas']['ProductResponse'];
type ServerVariant = NonNullable<ServerProduct['variants']>[number];

const SERVER_STATUS: Readonly<Record<string, ProductStatus>> = {
  DRAFT: 'draft',
  PUBLISHED: 'active',
  ARCHIVED: 'archived',
};

const UI_STATUS: Readonly<Record<ProductStatus, string>> = {
  draft: 'DRAFT',
  active: 'PUBLISHED',
  out_of_stock: 'PUBLISHED',
  archived: 'ARCHIVED',
};

function toProductStatus(status: string | undefined): ProductStatus {
  const mapped = status ? SERVER_STATUS[status.toUpperCase()] : undefined;
  if (!mapped) throw new Error(`Máy chủ trả về trạng thái sản phẩm không hợp lệ: ${status ?? '(trống)'}.`);
  return mapped;
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

function toVariant(variant: ServerVariant): ProductVariant {
  return {
    id: requireId(variant.id, 'biến thể'),
    sku: variant.sku ?? '',
    title: variant.title ?? '',
    priceMinor: variant.price ?? null,
    currency: variant.currency ?? 'VND',
    onHand: variant.on_hand ?? 0,
    reserved: variant.reserved ?? 0,
    safetyBuffer: variant.safety_buffer ?? 0,
    availableToSell: variant.available_to_sell ?? 0,
  };
}

function toProduct(product: ServerProduct): ProductDetail {
  const variants = (product.variants ?? []).map(toVariant);
  return {
    id: requireId(product.id, 'sản phẩm'),
    name: product.name ?? '',
    description: product.description ?? '',
    category: product.category ?? '',
    status: toProductStatus(product.status),
    variantCount: variants.length,
    onHand: variants.reduce((total, variant) => total + variant.onHand, 0),
    reserved: variants.reduce((total, variant) => total + variant.reserved, 0),
    safetyBuffer: variants.reduce((total, variant) => total + variant.safetyBuffer, 0),
    availableToSell: variants.reduce((total, variant) => total + variant.availableToSell, 0),
    createdAt: product.created_at ?? '',
    updatedAt: product.updated_at ?? '',
    variants,
  };
}

function matchesQuery(product: ProductDetail, query: ProductQuery): boolean {
  if (query.status && product.status !== query.status) return false;
  if (query.category && product.category !== query.category) return false;
  const term = query.q?.trim().toLocaleLowerCase('vi-VN');
  if (!term) return true;
  return [
    product.name,
    product.category,
    ...product.variants.map((variant) => variant.sku),
    ...product.variants.map((variant) => variant.title),
  ].join(' ').toLocaleLowerCase('vi-VN').includes(term);
}

/**
 * `GET /api/v1/products` supports both bare arrays from Spring Boot and legacy envelope shapes.
 */
export async function listProducts(query: ProductQuery = {}, signal?: AbortSignal): Promise<Page<ProductSummary>> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/products', {
    params: { query: query as any },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu danh mục sản phẩm nhận về không hợp lệ.');

  if (Array.isArray(data)) {
    const items = data.map(toProduct).filter((product) => matchesQuery(product, query));
    return { items, nextCursor: null, totalCount: items.length };
  }

  return pageOf<ProductSummary>(data as unknown as Record<string, unknown>, 'products');
}

export async function getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetail> {
  const client = createApiClient();
  const { data, response } = await client.GET('/api/v1/products/{id}', {
    params: { path: { id: productId as any } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu chi tiết sản phẩm nhận về không hợp lệ.');
  if (typeof (data as any).id === 'number') {
    return toProduct(data);
  }
  return data as unknown as ProductDetail;
}

// ---------------------------------------------------------------------------------------------
// Legacy channel-connector surface. The Spring Boot API does not serve these routes yet, so the
// frozen contract keeps the not-yet-migrated screens compiling. No migrated core flow calls them.
// ---------------------------------------------------------------------------------------------

export type ProductChannelPublication = components['schemas']['ProductChannelPublication'];
export type ProductPublicationCollection = components['schemas']['ProductPublicationCollection'];
export type PublicationActionInput = components['schemas']['PublicationActionRequest'];
export type PublicationPreview = components['schemas']['PublicationPreview'];
export type PublicationRequestResult = components['schemas']['PublicationRequestResult'];
export type ProductPublicationHistory = components['schemas']['ProductPublicationHistory'];

export type ChannelVariantPrice = {
  channel_id: string; channel_code: string; variant_id: string; sku: string;
  core_price_minor?: number; core_currency: string; currency: string; override_amount?: string;
  desired_amount: string; last_pushed_amount?: string; last_verified_amount?: string;
  revision: number; sync_state: string; last_error_code?: string; last_pushed_at?: string; last_verified_at?: string;
  write_enabled: boolean;
};
export type ChannelPriceCollection = { product_id: string; prices: ChannelVariantPrice[] };
export type SetChannelPriceInput = { currency: string; amount: string; expected_revision: number; reason: string };

export async function getChannelPrices(productId: string, signal?: AbortSignal): Promise<ChannelPriceCollection> {
  const response = await apiFetch(`/api/v1/products/${encodeURIComponent(productId)}/prices`, { signal, cache: 'no-store' });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new ApiRequestError(body && typeof body === 'object' ? parseApiError(body) : { code: 'CHANNEL_PRICE_READ_FAILED', message: 'Không thể tải giá theo kênh.', request_id: '' }, response.status);
  }
  return response.json() as Promise<ChannelPriceCollection>;
}

export async function setChannelPrice(productId: string, channelId: string, variantId: string, input: SetChannelPriceInput, idempotencyKey: string): Promise<ChannelVariantPrice> {
  const response = await apiFetch(`/api/v1/products/${encodeURIComponent(productId)}/prices/${encodeURIComponent(channelId)}/${encodeURIComponent(variantId)}`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey }, body: JSON.stringify(input),
  });
  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new ApiRequestError(body && typeof body === 'object' ? parseApiError(body) : { code: 'CHANNEL_PRICE_WRITE_FAILED', message: 'Không thể lưu giá theo kênh.', request_id: '' }, response.status);
  }
  return response.json() as Promise<ChannelVariantPrice>;
}

export type ProductMedia = components['schemas']['ProductMedia'];
export type ProductMediaCollection = components['schemas']['ProductMediaCollection'];
export type ProductMediaOrderInput = components['schemas']['ProductMediaOrderRequest'];

export async function listProductPublications(productId: string, signal?: AbortSignal): Promise<components['schemas']['ProductPublicationCollection']> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/products/{productId}/publications', {
    params: { path: { productId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể tải trạng thái đăng sản phẩm theo kênh.');
  }
  if (!data) throw new Error('Dữ liệu trạng thái đăng sản phẩm nhận về không hợp lệ.');
  return data;
}

export async function previewProductPublication(productId: string, input: PublicationActionInput, signal?: AbortSignal): Promise<PublicationPreview> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/products/{productId}/publications/preview', {
    params: { path: { productId } }, body: input, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể kiểm tra điều kiện đăng sản phẩm.');
  }
  if (!data) throw new Error('Dữ liệu kiểm tra điều kiện đăng sản phẩm không hợp lệ.');
  return data;
}

export async function createProductPublication(productId: string, input: PublicationActionInput, idempotencyKey: string): Promise<PublicationRequestResult> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/products/{productId}/publications', {
    params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } }, body: input,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể gửi yêu cầu đăng sản phẩm.');
  }
  if (!data) throw new Error('Phản hồi yêu cầu đăng sản phẩm không hợp lệ.');
  return data;
}

export async function getProductPublicationHistory(productId: string, channelId: string, signal?: AbortSignal): Promise<ProductPublicationHistory> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/products/{productId}/publications/{channelId}/history', {
    params: { path: { productId, channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể tải lịch sử đăng sản phẩm.');
  }
  if (!data) throw new Error('Dữ liệu lịch sử đăng sản phẩm không hợp lệ.');
  return data;
}

export async function retryProductPublication(productId: string, channelId: string, requestId: string, idempotencyKey: string): Promise<PublicationRequestResult> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/products/{productId}/publications/{channelId}/retry', {
    params: { path: { productId, channelId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { request_id: requestId, confirm: true },
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể gửi yêu cầu thử lại.');
  }
  if (!data) throw new Error('Phản hồi thử lại đăng sản phẩm không hợp lệ.');
  return data;
}

export async function listProductMedia(productId: string, signal?: AbortSignal): Promise<ProductMediaCollection> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/products/{productId}/media', {
    params: { path: { productId } },
    signal,
    cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không thể tải ảnh sản phẩm.');
  }
  if (!data) throw new Error('Dữ liệu ảnh sản phẩm nhận về không hợp lệ.');
  return data;
}

export async function getProductMediaContent(productId: string, mediaId: string, signal?: AbortSignal): Promise<Blob> {
  const response = await apiFetch(`/api/v1/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}/content`, { signal, cache: 'no-store' });
  if (!response.ok) throw new ApiRequestError({ code: 'PRODUCT_MEDIA_UNAVAILABLE', message: 'Không thể tải ảnh sản phẩm.', request_id: '' }, response.status);
  return response.blob();
}

async function readProductMediaMutation(response: Response): Promise<ProductMediaCollection> {
  if (!response.ok) {
    let error: unknown;
    try { error = await response.json(); } catch { error = undefined; }
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error(`Không thể cập nhật ảnh sản phẩm (HTTP ${response.status}).`);
  }
  const result: unknown = await response.json();
  if (!result || typeof result !== 'object' || !('media' in result) || !('product_version' in result)) {
    throw new Error('Phản hồi cập nhật ảnh sản phẩm không hợp lệ.');
  }
  return result as ProductMediaCollection;
}

export async function uploadProductMedia(productId: string, file: File, expectedProductVersion: number, idempotencyKey: string, variantId?: string): Promise<ProductMediaCollection> {
  return readProductMediaMutation(await apiFetch(`/api/v1/products/${encodeURIComponent(productId)}/media`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type,
      'Idempotency-Key': idempotencyKey,
      'X-Expected-Product-Version': String(expectedProductVersion),
      ...(variantId ? { 'X-Product-Variant-ID': variantId } : {}),
    },
    body: file,
  }));
}

export async function reorderProductMedia(productId: string, input: ProductMediaOrderInput, idempotencyKey: string): Promise<ProductMediaCollection> {
  return readProductMediaMutation(await apiFetch(`/api/v1/products/${encodeURIComponent(productId)}/media/order`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify(input),
  }));
}

export async function deleteProductMedia(productId: string, mediaId: string, expectedProductVersion: number, idempotencyKey: string): Promise<ProductMediaCollection> {
  return readProductMediaMutation(await apiFetch(`/api/v1/products/${encodeURIComponent(productId)}/media/${encodeURIComponent(mediaId)}`, {
    method: 'DELETE',
    headers: { 'Idempotency-Key': idempotencyKey, 'X-Expected-Product-Version': String(expectedProductVersion) },
  }));
}

// ---------------------------------------------------------------------------------------------
// Catalogue writes served by Spring Boot.
// ---------------------------------------------------------------------------------------------

export async function createProduct(input: CreateProductInput, idempotencyKey: string, signal?: AbortSignal): Promise<ProductDetail> {
  const client = createApiClient();
  const body = {
    ...input,
    name: input.name,
    category: input.category,
    description: input.description,
    variants: input.variants.map((v) => ({
      ...v,
      sku: v.sku,
      title: v.title || [v.color, v.size].filter(Boolean).join(' / ') || v.sku || 'Mặc định',
      price: v.price !== undefined ? v.price : (v.price_minor !== undefined ? v.price_minor : (v.priceMinor !== undefined ? v.priceMinor : undefined)),
      currency: v.currency ?? input.currency ?? 'VND',
    })),
  };
  const { data, response } = await client.POST('/api/v1/products', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: body as any,
    signal,
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Phản hồi tạo sản phẩm không đúng định dạng.');
  return toProduct(data);
}

/** `PATCH /products/{id}` takes no `Idempotency-Key`; only the two create routes do. */
export async function updateProductCatalog(productId: string, input: UpdateProductCatalogInput, idempotencyKey?: string, signal?: AbortSignal): Promise<ProductDetail> {
  const client = createApiClient();
  const { data, response } = await client.PATCH('/api/v1/products/{id}', {
    params: {
      path: { id: Number(productId) },
      ...(idempotencyKey ? { header: { 'Idempotency-Key': idempotencyKey } } : {}),
    } as any,
    body: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.description !== undefined ? { description: input.description } : {}),
      ...(input.category !== undefined ? { category: input.category } : {}),
      ...(input.status !== undefined ? { status: UI_STATUS[input.status] } : {}),
    },
    signal,
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu cập nhật sản phẩm nhận về không hợp lệ.');
  return toProduct(data);
}

export async function createProductVariant(productId: string, input: CreateProductVariantInput, idempotencyKey: string, signal?: AbortSignal): Promise<ProductVariant> {
  const client = createApiClient();
  const title = input.title || [input.color, input.size].filter(Boolean).join(' / ') || 'Một biến thể';
  const price = input.price !== undefined ? input.price : (input.price_minor !== undefined ? input.price_minor : undefined);
  const { data, response } = await client.POST('/api/v1/products/{id}/variants', {
    params: { path: { id: Number(productId) }, header: { 'Idempotency-Key': idempotencyKey } },
    body: {
      sku: input.sku,
      title,
      currency: input.currency ?? 'VND',
      ...(price !== undefined ? { price } : {}),
      ...(input.initialStock !== undefined ? { initialStock: input.initialStock } : {}),
    },
    signal,
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Phản hồi thêm biến thể không đúng định dạng.');
  return toVariant(data);
}

/**
 * The lifecycle edge list, mirrored from `ProductServiceImpl.ALLOWED_TRANSITIONS`.
 *
 * The server refuses an illegal move with 409, so mirroring the edges lets the control refuse
 * before the request instead of rendering an error after it.
 */
export const PRODUCT_TRANSITIONS: Readonly<Record<ProductStatus, readonly ProductStatus[]>> = {
  draft: ['active', 'archived'],
  active: ['out_of_stock', 'archived'],
  out_of_stock: ['active', 'archived'],
  archived: [],
};

export async function transitionProduct(productId: string, status: ProductStatus, idempotencyKey?: string, signal?: AbortSignal): Promise<ProductDetail> {
  return updateProductCatalog(productId, { status }, idempotencyKey, signal);
}

/**
 * Updates a variant's server-supported fields. Stock never moves here: it changes only through a
 * receipt or a reasoned inventory adjustment, both of which write a ledger entry.
 *
 * `PATCH /products/{id}/variants/{variantId}` takes no `Idempotency-Key`.
 */
export async function updateVariant(productId: string, variantId: string, input: UpdateVariantInput, idempotencyKey?: string, signal?: AbortSignal): Promise<ProductVariant> {
  const client = createApiClient();
  const price = input.priceMinor !== undefined ? input.priceMinor : input.price_minor;
  const { data, response } = await client.PATCH('/api/v1/products/{id}/variants/{variantId}', {
    params: {
      path: { id: Number(productId), variantId: Number(variantId) },
      ...(idempotencyKey ? { header: { 'Idempotency-Key': idempotencyKey } } : {}),
    } as any,
    body: {
      ...(input.sku !== undefined ? { sku: input.sku } : {}),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(price !== undefined ? { price: price === null ? undefined : price } : {}),
      ...(input.currency !== undefined ? { currency: input.currency } : {}),
      ...(input.reason !== undefined ? { reason: input.reason } : {}),
    },
    signal,
  });
  if (!response.ok) await responseApiError(response);
  if (!data) throw new Error('Dữ liệu cập nhật biến thể nhận về không hợp lệ.');
  return toVariant(data);
}

export type ProductImportProblem = {
  /** 1-based, counting the header as line 1. */
  row_number: number;
  sku?: string;
  field?: string;
  message: string;
};

export type ProductImportResult = {
  batch_id: string;
  dry_run: boolean;
  created: number;
  /** A colourway added to a product that already existed. */
  attached: number;
  unchanged: number;
  rejected: number;
  /** Present on a dry run. A real import rejects the whole file instead. */
  problems: ProductImportProblem[];
  imported_at: string;
};

/**
 * Imports catalogue rows from a CSV file. The body IS the file.
 *
 * This route belongs to the frozen legacy contract: Spring Boot does not serve it yet. The
 * export/import panel surfaces the failure rather than falling back to fixtures.
 */
export async function importProducts(file: string, dryRun: boolean, idempotencyKey?: string, signal?: AbortSignal): Promise<ProductImportResult> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/products/import', {
    params: { query: { dry_run: dryRun }, ...(idempotencyKey ? { header: { 'Idempotency-Key': idempotencyKey } } : {}) },
    body: file,
    bodySerializer: () => file,
    headers: { 'Content-Type': 'text/csv' },
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu nhập danh mục nhận về không hợp lệ.');
  return data as unknown as ProductImportResult;
}
