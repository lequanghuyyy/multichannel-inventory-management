import type { components, operations } from './generated/openapi';
import { apiFetch, createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';
import { pageOf, type Page } from './list';

export type ProductSummary = components['schemas']['ProductSummary'];
export type ProductDetail = components['schemas']['ProductDetail'];
export type ProductStatus = NonNullable<ProductSummary['status']>;
export type ProductVariant = NonNullable<ProductDetail['variants']>[number];
export type CreateProductInput = components['schemas']['CreateProductRequest'];
export type CreateProductVariantInput = components['schemas']['CreateProductVariantRequest'];
export type UpdateProductCatalogInput = components['schemas']['UpdateProductCatalogRequest'];
export type ProductMedia = components['schemas']['ProductMedia'];
export type ProductMediaCollection = components['schemas']['ProductMediaCollection'];
export type ProductMediaOrderInput = components['schemas']['ProductMediaOrderRequest'];
export type ProductPublicationCollection = components['schemas']['ProductPublicationCollection'];
export type ProductChannelPublication = components['schemas']['ProductChannelPublication'];
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

export type ProductQuery = NonNullable<operations['listProducts']['parameters']['query']>;

export async function listProducts(query: ProductQuery = {}, signal?: AbortSignal): Promise<Page<ProductSummary>> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/products', {
    params: { query },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu danh mục sản phẩm nhận về không hợp lệ.');
  // The list response is keyed `products`, not `items`. A client that assumed `items`
  // would silently show an empty catalogue rather than fail, so the key is explicit.
  return pageOf<ProductSummary>(data as unknown as Record<string, unknown>, 'products');
}

export async function getProduct(productId: string, signal?: AbortSignal): Promise<ProductDetail> {
  const client = createApiClient();
  const { data, error, response } = await client.GET('/api/v1/products/{productId}', {
    params: { path: { productId } },
    signal,
    cache: 'no-store',
  });

  if (!response.ok) {
    if (error && typeof error === 'object') {
      throw new ApiRequestError(parseApiError(error), response.status);
    }
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu chi tiết sản phẩm nhận về không hợp lệ.');
  return data;
}

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

export async function listProductPublications(productId: string, signal?: AbortSignal): Promise<ProductPublicationCollection> {
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

export async function createProduct(input: CreateProductInput, idempotencyKey: string, signal?: AbortSignal): Promise<ProductDetail> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/products', {
    params: { header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error(`Không kết nối được API (HTTP ${response.status}).`);
  }
  if (!data) throw new Error('Phản hồi tạo sản phẩm không đúng định dạng.');
  return data;
}

export async function updateProductCatalog(productId: string, input: UpdateProductCatalogInput, idempotencyKey: string, signal?: AbortSignal): Promise<ProductDetail> {
  const client = createApiClient();
  const { data, error, response } = await client.PATCH('/api/v1/products/{productId}/catalog', {
    params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu cập nhật sản phẩm nhận về không hợp lệ.');
  return data;
}

export async function createProductVariant(productId: string, input: CreateProductVariantInput, idempotencyKey: string, signal?: AbortSignal): Promise<ProductVariant> {
  const client = createApiClient();
  const { data, error, response } = await client.POST('/api/v1/products/{productId}/variants', {
    params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Phản hồi thêm biến thể không đúng định dạng.');
  return data;
}
/**
 * The lifecycle edge list, mirrored from the API's own description.
 *
 * It is duplicated rather than imported from the generated schema because the server enforces
 * the edges with one conditional UPDATE and answers 409 on an illegal move. Mirroring it lets
 * the control refuse before the request instead of rendering an error after it — and the test
 * that keeps the two in step is the contract test in the API, not this comment.
 */
export const PRODUCT_TRANSITIONS: Readonly<Record<ProductStatus, readonly ProductStatus[]>> = {
  draft: ['active'],
  active: ['archived', 'out_of_stock'],
  out_of_stock: ['active'],
  archived: [],
};

/**
 * Moves a product along its lifecycle. The only writer of products.is_active, which is what
 * makes a product unreservable — so this is the route that takes stock off the shelf.
 *
 * Disabled at APP_ENV=production on the server, and the caller is expected to surface that
 * rather than let the button fail on every press.
 */
export async function transitionProduct(productId: string, status: ProductStatus, idempotencyKey: string, signal?: AbortSignal): Promise<ProductSummary> {
  const client = createApiClient();
  const { data, error, response } = await client.PATCH('/api/v1/products/{productId}', {
    params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: { status },
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu cập nhật sản phẩm nhận về không hợp lệ.');
  return data;
}

export type UpdateVariantInput = {
  /** At least one field must be present. Omitted fields are left alone. */
  sku?: string;
  color?: string;
  size?: string;
  /** Omit to leave unchanged, null to clear, or a non-negative integer (zero is valid). */
  price_minor?: number | null;
  /** Current ProductDetail.product_version; required when price_minor is present. */
  expected_product_version?: number;
  is_active?: boolean;
  /** Mandatory when `sku` changes — it is the field a human reads aloud at the till. */
  reason?: string;
};

/**
 * The only writer of a variant's own attributes.
 *
 * It does not move stock, and the UI that calls it must not pretend otherwise: stock changes
 * only through the reservation engine or an adjustment, both of which write an outbox event in
 * the same transaction. A catalogue edit that changed on_hand would be a stock change with no
 * event, and the Sync Center would then describe a history that never happened.
 *
 * Deactivating a variant that has already been sold is refused with 409 by the API, because its
 * SKU stays on historical order lines. The caller surfaces that rather than retrying.
 */
export async function updateVariant(productId: string, variantId: string, input: UpdateVariantInput, idempotencyKey: string, signal?: AbortSignal): Promise<ProductVariant> {
  const client = createApiClient();
  const { data, error, response } = await client.PATCH('/api/v1/products/{productId}/variants/{variantId}', {
    params: { path: { productId, variantId }, header: { 'Idempotency-Key': idempotencyKey } },
    body: input,
    signal,
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được máy chủ. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu cập nhật biến thể nhận về không hợp lệ.');
  return data;
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
 * `dryRun` defaults to TRUE and should be sent first: it resolves every line against the live
 * catalogue and reports what it would do, writing nothing. Committing first and inspecting
 * afterwards would leave the reviewer looking at a catalogue that already changed.
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
