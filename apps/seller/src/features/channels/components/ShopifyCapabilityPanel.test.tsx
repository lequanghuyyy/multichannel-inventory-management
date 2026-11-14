import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopifyCapabilityPanel } from './ShopifyCapabilityPanel';

const api = vi.hoisted(() => ({
  getChannelAPICapabilities: vi.fn(),
  verifyShopifyCapabilities: vi.fn(),
}));

vi.mock('../../../api/channels', () => api);
vi.mock('../../../api/shopify', () => ({ verifyShopifyCapabilities: api.verifyShopifyCapabilities }));

const noEvidence = { capabilities: [], sandbox_skus: [] };
const verifiedReport = {
  run: {
    id: 'verification-1', channel_id: 'channel-1', provider: 'shopify',
    shop_domain: 'octoflow-store.myshopify.com', shop_currency: 'VND', environment: 'sandbox',
    api_version: '2026-10', partner_development: true, requested_scopes: ['read_products'],
    granted_scopes: ['read_products'], status: 'partial', verified_at: '2026-10-27T08:00:00Z',
  },
  capabilities: [
    { capability_key: 'shop_identity', operation: 'query OctoFlowShop', shop_domain: 'octoflow-store.myshopify.com', environment: 'sandbox', api_version: '2026-10', required_scopes: [], requested_scopes: ['read_products'], granted_scopes: ['read_products'], verification_status: 'VERIFIED', graphql_errors: [], rate_limit: { source: 'unknown' }, evidence_reference: 'run-1/shop_identity' },
    { capability_key: 'location_read', operation: 'query OctoFlowInventoryLocation', shop_domain: 'octoflow-store.myshopify.com', environment: 'sandbox', api_version: '2026-10', required_scopes: ['read_locations'], requested_scopes: ['read_locations'], granted_scopes: ['read_locations'], verification_status: 'VERIFIED', graphql_errors: [], rate_limit: { source: 'unknown' }, evidence_reference: 'run-1/location_read' },
    { capability_key: 'product_write', operation: 'mutation productSet', shop_domain: 'octoflow-store.myshopify.com', environment: 'sandbox', api_version: '2026-10', required_scopes: ['write_products'], requested_scopes: ['read_products'], granted_scopes: ['read_products'], verification_status: 'NOT_GRANTED', graphql_errors: [], rate_limit: { source: 'unknown' }, evidence_reference: 'run-1/product_write', reason: 'Scope missing' },
    { capability_key: 'inventory_write', operation: 'mutation inventorySetQuantities', shop_domain: 'octoflow-store.myshopify.com', environment: 'sandbox', api_version: '2026-10', required_scopes: ['write_inventory'], requested_scopes: ['read_products'], granted_scopes: ['read_products'], verification_status: 'GRANTED_UNTESTED', graphql_errors: [], rate_limit: { source: 'unknown' }, evidence_reference: 'run-1/inventory_write', reason: 'Operation not run' },
  ],
  sandbox_skus: [],
};

beforeEach(() => {
  api.getChannelAPICapabilities.mockResolvedValue(noEvidence);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ShopifyCapabilityPanel', () => {
  it('does not show mock permissions as real before an API verification run', async () => {
    render(<ShopifyCapabilityPanel channelId="channel-1" canManage />);
    expect(await screen.findByText('Chưa có báo cáo capability run cho channel này. Trạng thái được giữ là chưa kiểm chứng.')).toBeInTheDocument();
    expect(screen.getByLabelText('Tổng quan quyền API')).toHaveTextContent('Đã kiểm chứng0');
    expect(screen.getByRole('button', { name: 'Xác minh quyền (chỉ đọc)' })).toBeInTheDocument();
  });

  it('shows granted-untested and denied operations distinctly, then refreshes after verification', async () => {
    api.verifyShopifyCapabilities.mockResolvedValue(verifiedReport);
    api.getChannelAPICapabilities.mockResolvedValueOnce(noEvidence).mockResolvedValue(verifiedReport);
    render(<ShopifyCapabilityPanel channelId="channel-1" canManage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Xác minh quyền (chỉ đọc)' }));
    expect(await screen.findByText('octoflow-store.myshopify.com')).toBeInTheDocument();
    await waitFor(() => expect(api.getChannelAPICapabilities).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Tổng quan quyền API')).toHaveTextContent('Được cấp · chưa kiểm chứng1');
    expect(screen.getByText('Chưa được cấp')).toBeInTheDocument();
    expect(screen.getByText('Đọc vị trí tồn kho')).toBeInTheDocument();
    expect(screen.queryByText('Chưa có kết quả đọc SKU từ Shopify.')).not.toBeInTheDocument();
    expect(api.verifyShopifyCapabilities).toHaveBeenCalledOnce();
  });

  it('surfaces API read failures instead of falling back to fixture evidence', async () => {
    api.getChannelAPICapabilities.mockRejectedValue(new Error('API unavailable'));
    render(<ShopifyCapabilityPanel channelId="channel-1" canManage={false} />);
    expect(await screen.findByText('Không thể kết nối đến máy chủ. Hãy kiểm tra mạng rồi thử lại.')).toBeInTheDocument();
    expect(screen.queryByText('Đã kiểm chứng')).not.toBeInTheDocument();
  });
});
