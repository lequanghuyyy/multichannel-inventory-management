import type { components, operations } from './generated/openapi';
import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';

export type PublicationWorkflowChannelSelection = components['schemas']['PublicationWorkflowChannelSelection'];
export type PublicationWorkflowPreviewInput = components['schemas']['PublicationWorkflowPreviewRequest'];
export type PublicationWorkflowCreateInput = components['schemas']['PublicationWorkflowCreateRequest'];
export type PublicationWorkflowPreview = components['schemas']['PublicationWorkflowPreview'];
export type PublicationWorkflowDetail = components['schemas']['PublicationWorkflowDetail'];
export type PublicationWorkflowChannelState = components['schemas']['PublicationWorkflowChannelState'];
export type PublicationWorkflowAllocation = components['schemas']['PublicationWorkflowAllocation'];

type PreviewResult = NonNullable<operations['previewProductPublicationWorkflow']['responses'][200]['content']['application/json']>;

async function checked<T>(response: Response, error: unknown, data: T | undefined, message: string): Promise<T> {
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error(message);
  }
  if (!data) throw new Error('Phản hồi quy trình đăng đa kênh không hợp lệ.');
  return data;
}

export async function previewPublicationWorkflow(productId: string, input: PublicationWorkflowPreviewInput, signal?: AbortSignal): Promise<PreviewResult> {
  const { data, error, response } = await createApiClient().POST('/api/v1/products/{productId}/publication-workflows/preview', {
    params: { path: { productId } }, body: input, signal, cache: 'no-store',
  });
  return checked(response, error, data, 'Không thể xem trước phân bổ đa kênh.');
}

export async function createPublicationWorkflow(productId: string, input: PublicationWorkflowCreateInput, idempotencyKey: string): Promise<PublicationWorkflowDetail> {
  const { data, error, response } = await createApiClient().POST('/api/v1/products/{productId}/publication-workflows', {
    params: { path: { productId }, header: { 'Idempotency-Key': idempotencyKey } }, body: input, cache: 'no-store',
  });
  return checked(response, error, data, 'Không thể bắt đầu quy trình đăng đa kênh.');
}

export async function getPublicationWorkflow(productId: string, workflowId: string, signal?: AbortSignal): Promise<PublicationWorkflowDetail> {
  const { data, error, response } = await createApiClient().GET('/api/v1/products/{productId}/publication-workflows/{workflowId}', {
    params: { path: { productId, workflowId } }, signal, cache: 'no-store',
  });
  return checked(response, error, data, 'Không thể tải tiến trình đăng đa kênh.');
}

export async function listPublicationWorkflows(productId: string, signal?: AbortSignal): Promise<components['schemas']['PublicationWorkflowList']> {
  const { data, error, response } = await createApiClient().GET('/api/v1/products/{productId}/publication-workflows', {
    params: { path: { productId } }, signal, cache: 'no-store',
  });
  return checked(response, error, data, 'Không thể tải lịch sử đăng đa kênh.');
}

export async function retryPublicationWorkflowChannel(productId: string, workflowId: string, channelId: string, idempotencyKey: string): Promise<PublicationWorkflowDetail> {
  const { data, error, response } = await createApiClient().POST('/api/v1/products/{productId}/publication-workflows/{workflowId}/channels/{channelId}/retry', {
    params: { path: { productId, workflowId, channelId }, header: { 'Idempotency-Key': idempotencyKey } }, body: { confirm: true }, cache: 'no-store',
  });
  return checked(response, error, data, 'Không thể thử lại kênh lỗi.');
}
