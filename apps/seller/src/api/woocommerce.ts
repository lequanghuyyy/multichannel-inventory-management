import { createApiClient } from './client';
import type { components } from './generated/openapi';
import { ApiRequestError, parseApiError } from '../core/api-error';

export type WooCommerceStatus = components['schemas']['WooCommerceStatus'];
export type WooCommerceDiagnostics = components['schemas']['WooCommerceDiagnostic'];
export type WooCommerceMappingReport = components['schemas']['WooCommerceMappingReport'];
export type WooCommerceOrderReceipt = components['schemas']['WooCommerceOrderReceipt'];
export type WooCommerceWebhookReceipt = components['schemas']['WooCommerceWebhookReceipt'];
export type WooCommerceWebhookHealth = components['schemas']['WooCommerceWebhookHealth'];
export type WooCommerceRetryResult = components['schemas']['WooCommerceRetryResult'];
export type WooCommerceRetryAudit = components['schemas']['WooCommerceRetryAudit'];
export type WooCommerceReconciliationEvidence = components['schemas']['WooCommerceReconciliationEvidence'];
export type WooCommerceProductAction = components['schemas']['WooCommerceProductAction'];
export type WooCommerceProductSyncJob = components['schemas']['WooCommerceProductSyncJob'];
export type WooCommerceProductPublicationState = components['schemas']['WooCommerceProductPublicationState'];
export type WooCommerceOrderDetail = components['schemas']['WooCommerceOrderDetail'];
export type WooCommerceOrderLifecycle = components['schemas']['WooCommerceOrderLifecycleView'];

export class WooCommerceApiError extends ApiRequestError {
  constructor(value: unknown, status = 0) {
    super(parseApiError(value), status);
    this.name = 'WooCommerceApiError';
  }
}

async function requestError(response: Response, error: unknown): Promise<never> {
  try {
    throw new WooCommerceApiError(error, response.status);
  } catch (cause) {
    if (cause instanceof WooCommerceApiError) throw cause;
    throw new Error('Không thể kết nối WooCommerce OctoFlow. Hãy thử lại sau.');
  }
}

export async function getWooCommerceStatus(signal?: AbortSignal): Promise<WooCommerceStatus> {
  const { data, error, response } = await createApiClient().GET('/api/v1/integrations/woocommerce/status', { signal, cache: 'no-store' });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function getWooCommerceDiagnostics(signal?: AbortSignal): Promise<WooCommerceDiagnostics> {
  const { data, error, response } = await createApiClient().GET('/api/v1/integrations/woocommerce/diagnostics', { signal, cache: 'no-store' });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function connectWooCommerceStore(): Promise<WooCommerceStatus> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/woocommerce/connect');
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function verifyWooCommerceStore(): Promise<WooCommerceStatus> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/woocommerce/verify');
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function disconnectWooCommerceStore(): Promise<WooCommerceStatus> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/woocommerce/disconnect');
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function previewWooCommerceMappings(): Promise<WooCommerceMappingReport> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/woocommerce/mappings/preview');
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function importWooCommerceMappings(): Promise<WooCommerceMappingReport> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/woocommerce/mappings/import');
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function refreshWooCommerceMappings(): Promise<WooCommerceMappingReport> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/woocommerce/mappings/refresh');
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function getWooCommerceMappingIssues(signal?: AbortSignal): Promise<{ issues: components['schemas']['WooCommerceMappingIssue'][] }> {
  const { data, error, response } = await createApiClient().GET('/api/v1/integrations/woocommerce/mappings/issues', { signal, cache: 'no-store' });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function getWooCommerceOrders(channelId: string, signal?: AbortSignal): Promise<WooCommerceOrderReceipt[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/woocommerce/orders', {
    params: { path: { channelId }, query: { limit: 200 } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data.items;
}

export async function getWooCommerceOrderDetail(channelId: string, externalOrderId: string, signal?: AbortSignal): Promise<WooCommerceOrderDetail> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/woocommerce/orders/{externalOrderId}', {
    params: { path: { channelId, externalOrderId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function getWooCommerceOrderLifecycle(orderId: string, signal?: AbortSignal): Promise<WooCommerceOrderLifecycle> {
  const { data, error, response } = await createApiClient().GET('/api/v1/orders/{orderId}/woocommerce-lifecycle', {
    params: { path: { orderId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function retryWooCommerceOrderLifecycle(orderId: string): Promise<void> {
  const { error, response } = await createApiClient().POST('/api/v1/orders/{orderId}/woocommerce-lifecycle/retry', {
    params: { path: { orderId } }, cache: 'no-store',
  });
  if (!response.ok) return requestError(response, error);
}

export async function getWooCommerceProductState(productId: string, signal?: AbortSignal): Promise<WooCommerceProductPublicationState> {
  const { data, error, response } = await createApiClient().GET('/api/v1/products/{productId}/woocommerce', {
    params: { path: { productId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function getWooCommerceProductJobs(productId: string, signal?: AbortSignal): Promise<WooCommerceProductSyncJob[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/products/{productId}/woocommerce/jobs', {
    params: { path: { productId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data.items;
}

export async function queueWooCommerceProductAction(productId: string, input: WooCommerceProductAction, idempotencyKey: string): Promise<WooCommerceProductSyncJob> {
  const { data, error, response } = await createApiClient().POST('/api/v1/products/{productId}/woocommerce/actions', {
    params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } }, body: input, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function retryWooCommerceProductJob(jobId: string, idempotencyKey: string): Promise<WooCommerceProductSyncJob> {
  const { data, error, response } = await createApiClient().POST('/api/v1/integrations/woocommerce/product-sync/{jobId}/retry', {
    params: { path: { jobId }, header: { 'Idempotency-Key': idempotencyKey } }, body: { confirm: true }, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function getWooCommerceWebhookReceipts(channelId: string, signal?: AbortSignal): Promise<WooCommerceWebhookReceipt[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/woocommerce/webhook-receipts', {
    params: { path: { channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data.items;
}

export async function getWooCommerceRetryAudit(channelId: string, signal?: AbortSignal): Promise<WooCommerceRetryAudit[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/woocommerce/retry-audit', {
    params: { path: { channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data.items;
}

export async function getWooCommerceWebhookHealth(channelId: string, signal?: AbortSignal): Promise<WooCommerceWebhookHealth> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/woocommerce/webhook-health', {
    params: { path: { channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}

export async function getWooCommerceReconciliationEvidence(channelId: string, signal?: AbortSignal): Promise<WooCommerceReconciliationEvidence[]> {
  const { data, error, response } = await createApiClient().GET('/api/v1/channels/{channelId}/woocommerce/reconciliation', {
    params: { path: { channelId } }, signal, cache: 'no-store',
  });
  if (!response.ok || !data) return requestError(response, error);
  return data.items;
}

export async function retryWooCommerceOrder(channelId: string, externalOrderId: string): Promise<WooCommerceRetryResult> {
  const { data, error, response } = await createApiClient().POST('/api/v1/channels/{channelId}/woocommerce/orders/{externalOrderId}/retry', {
    params: { path: { channelId, externalOrderId } }, body: { confirm: true },
  });
  if (!response.ok || !data) return requestError(response, error);
  return data;
}
