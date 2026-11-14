import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopifyIntegrationPanel } from './ShopifyIntegrationPanel';

const api = vi.hoisted(() => ({
  getShopifyStatus: vi.fn(),
  connectShopifyStore: vi.fn(),
  verifyShopifyStore: vi.fn(),
  importShopifyMappings: vi.fn(),
  reconcileShopifyOrders: vi.fn(),
}));

vi.mock('../../../api/shopify', () => api);

const connected = {
  enabled: true,
  connected: true,
  partner_development: true,
  api_version: '2026-10',
  shop_domain: 'octoflow-dev.myshopify.com',
  shop_name: 'OctoFlow Dev',
  shop_currency: 'VND',
  core_currency: 'VND',
  currency_compatible: true,
  environment: 'sandbox',
  channel_status: 'connected',
  channel_id: '00000000-0000-4000-8000-000000000001',
  mapping_count: 8,
  unmapped_count: 2,
  conflict_count: 1,
  stale_mapping_count: 1,
  pushed_quantity: 12,
  reported_quantity: 11,
  drift_count: 1,
  last_verified_at: '2026-10-27T08:00:00Z',
  last_successful_sync: '2026-10-27T08:15:00Z',
  webhook_status: 'configured',
  webhook_url_configured: true,
  write_enabled: false,
  product_write_enabled: false,
  location_configured: true,
  order_polling_enabled: true,
  order_polling_imported: 2,
  order_polling_quarantined: 1,
  order_polling_failed: 0,
};

beforeEach(() => {
  api.getShopifyStatus.mockResolvedValue(connected);
  api.importShopifyMappings.mockResolvedValue({ remote_variants: 10, mapped: 8, unmapped: 2, conflicts: 0, stale: 0, issues: [] });
  api.reconcileShopifyOrders.mockResolvedValue({ scanned: 3, status: 'completed' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ShopifyIntegrationPanel', () => {
  it('shows live connection, mapping and reconciliation status', async () => {
    render(<ShopifyIntegrationPanel canManage={false} />);
    await waitFor(() => expect(screen.getByText('octoflow-dev.myshopify.com')).toBeInTheDocument());
    expect(screen.getByText('sandbox · Development Store')).toBeInTheDocument();
    expect(screen.getByText('8 / 2')).toBeInTheDocument();
    expect(screen.getByText('12 / 11')).toBeInTheDocument();
    expect(screen.getByText('1', { selector: 'dd' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kiểm tra kết nối' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Đọc và ghép SKU' })).not.toBeInTheDocument();
  });

  it('allows administrators to recheck and import mappings without sending a secret', async () => {
    api.verifyShopifyStore.mockResolvedValue(connected);
    render(<ShopifyIntegrationPanel canManage />);
    await screen.findByText('octoflow-dev.myshopify.com');
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra kết nối' }));
    await waitFor(() => expect(api.verifyShopifyStore).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole('button', { name: 'Đọc và ghép SKU' }));
    await waitFor(() => expect(api.importShopifyMappings).toHaveBeenCalledOnce());
    expect(await screen.findByRole('status')).toHaveTextContent('Đọc 10 variant · đã ánh xạ 8');
    await waitFor(() => expect(api.getShopifyStatus).toHaveBeenCalledTimes(3));
    expect(screen.getByRole('status')).toHaveTextContent('Đọc 10 variant · đã ánh xạ 8');
    expect(screen.queryByText(/secret|access token/i)).not.toBeInTheDocument();
  });

  it('lets administrators reconcile Shopify orders and reports the scanned count', async () => {
    render(<ShopifyIntegrationPanel canManage />);
    await screen.findByText('octoflow-dev.myshopify.com');
    fireEvent.click(screen.getByRole('button', { name: 'Đối soát đơn Shopify' }));
    await waitFor(() => expect(api.reconcileShopifyOrders).toHaveBeenCalledOnce());
    expect(await screen.findByRole('status')).toHaveTextContent('đã kiểm tra 3 đơn');
  });

  it('reports a real empty Shopify snapshot without substituting demo mappings', async () => {
    api.importShopifyMappings.mockResolvedValue({ remote_variants: 0, mapped: 0, unmapped: 0, conflicts: 0, stale: 0, issues: [] });
    render(<ShopifyIntegrationPanel canManage />);
    await screen.findByText('octoflow-dev.myshopify.com');
    fireEvent.click(screen.getByRole('button', { name: 'Đọc và ghép SKU' }));
    expect(await screen.findByRole('status')).toHaveTextContent('Đọc 0 variant · đã ánh xạ 0 · 0 chưa ghép');
    expect(screen.queryByText('Đã ánh xạ 8 SKU')).not.toBeInTheDocument();
  });

  it('separates a previously verified Development Store from a current connection error', async () => {
    api.getShopifyStatus.mockResolvedValue({ ...connected, connected: false, channel_status: 'error', environment: 'unknown' });
    render(<ShopifyIntegrationPanel canManage={false} />);
    await screen.findByText('octoflow-dev.myshopify.com');
    expect(screen.getByText('Development Store đã xác minh')).toBeInTheDocument();
    expect(screen.getByText('sandbox đã xác minh trước đó · cần kiểm tra lại kết nối')).toBeInTheDocument();
    expect(screen.getByText('15:00:00 27/10/2026')).toBeInTheDocument();
  });

  it('keeps a permission error visible after refreshing status', async () => {
    api.importShopifyMappings.mockRejectedValue(new Error('Shopify chưa cấp quyền đọc dữ liệu cần thiết. Không có mapping nào được thay đổi.'));
    render(<ShopifyIntegrationPanel canManage />);
    await screen.findByText('octoflow-dev.myshopify.com');
    fireEvent.click(screen.getByRole('button', { name: 'Đọc và ghép SKU' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Không có mapping nào được thay đổi');
    await waitFor(() => expect(api.getShopifyStatus).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('alert')).toHaveTextContent('Không có mapping nào được thay đổi');
    expect(screen.queryByText(/access token|client secret/i)).not.toBeInTheDocument();
  });
});
