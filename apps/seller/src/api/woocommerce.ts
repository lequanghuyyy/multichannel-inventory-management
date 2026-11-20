import { createApiClient } from './client';
import { responseApiError } from '../core/api-error';
import type { components } from './generated/openapi';

/**
 * Channel-scoped WooCommerce connector API.
 *
 * Phase 06 only ships connection verification and inventory mapping. Order ingestion,
 * webhooks and product publishing are intentionally absent; calling a legacy endpoint here
 * would 404 and show an operator a failure that is not evidence about the store.
 */
export type WooCommerceChannelStatus = components['schemas']['WooCommerceChannelStatusResponse'];

export async function getWooCommerceChannelStatus(channelId: string, signal?: AbortSignal): Promise<WooCommerceChannelStatus> {
  const { data, response } = await createApiClient().GET('/api/v1/channels/{channelId}/woocommerce/status', {
    params: { path: { channelId: Number(channelId) } }, signal, cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response, 'Không đọc được trạng thái kết nối WooCommerce.');
  if (!data) throw new Error('Trạng thái WooCommerce nhận về không hợp lệ.');
  return data;
}

export async function verifyWooCommerceChannel(channelId: string): Promise<WooCommerceChannelStatus> {
  const { data, response } = await createApiClient().POST('/api/v1/channels/{channelId}/woocommerce/verify', {
    params: { path: { channelId: Number(channelId) } }, cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response, 'Không xác minh được kết nối WooCommerce.');
  if (!data) throw new Error('Kết quả xác minh WooCommerce nhận về không hợp lệ.');
  return data;
}

export async function disconnectWooCommerceChannel(channelId: string): Promise<WooCommerceChannelStatus> {
  const { data, response } = await createApiClient().POST('/api/v1/channels/{channelId}/woocommerce/disconnect', {
    params: { path: { channelId: Number(channelId) } }, cache: 'no-store',
  });
  if (!response.ok) await responseApiError(response, 'Không ngắt được kết nối WooCommerce.');
  if (!data) throw new Error('Kết quả ngắt kết nối WooCommerce nhận về không hợp lệ.');
  return data;
}
