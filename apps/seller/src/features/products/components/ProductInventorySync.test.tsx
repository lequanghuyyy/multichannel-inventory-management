import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ProductInventorySync } from './ProductInventorySync';

const api = vi.hoisted(() => ({
  getProductChannelInventory: vi.fn(),
  reconcileChannelListing: vi.fn(),
  resyncChannelListing: vi.fn(),
}));
vi.mock('../../../api/channel-operations', () => api);

const row = {
  listing_id: '40000000-0000-4000-8000-000000000001', sku: 'GYM-1', on_hand: 3, reserved: 0,
  safety_buffer: 0, available_to_sell: 3, has_balance: true, target_quantity: null, preview_quantity: 3,
  preview_delta: null, core_version: 1, reported_quantity: null, listed: true,
  has_baseline: false, ready: true, write_enabled: true,
};

async function confirmInventory() {
  fireEvent.click(await screen.findByRole('button', { name: 'Đồng bộ lại tồn Shopify' }));
  expect(await screen.findByRole('dialog', { name: 'Xem trước tồn Shopify' })).toHaveTextContent('Dự kiến Shopify: 3');
  expect(api.resyncChannelListing).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận gửi tồn' }));
}

beforeEach(() => {
  window.history.replaceState({}, '', '/channels/30000000-0000-4000-8000-000000000001?tab=products');
  api.getProductChannelInventory.mockResolvedValue([row]);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ProductInventorySync', () => {
  it('shows the summary evidence and keeps the detailed SKU table collapsible', async () => {
    api.getProductChannelInventory.mockResolvedValue([{ ...row, available_to_sell: 80, preview_quantity: 40, reported_quantity: 10, preview_delta: 30 }]);
    const onRowsChange = vi.fn();
    render(<ProductInventorySync channelId="channel-1" productId="product-1" canWrite onRowsChange={onRowsChange} />);
    expect(await screen.findByText('Tồn kho và phân bổ')).toBeInTheDocument();
    expect(screen.getByText('Core có thể bán')).toBeInTheDocument();
    expect(screen.getByText('Mục tiêu đã ghi')).toBeInTheDocument();
    expect(screen.getAllByText('Chưa ghi').length).toBeGreaterThan(0);
    expect(screen.getAllByText('+30').length).toBeGreaterThan(0);
    const details = screen.getByRole('button', { name: 'Xem chi tiết SKU' });
    expect(details).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('columnheader', { name: 'Dự kiến Shopify' })).not.toBeInTheDocument();
    fireEvent.click(details);
    expect(await screen.findByRole('columnheader', { name: 'Dự kiến Shopify' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ẩn chi tiết SKU' })).toHaveAttribute('aria-expanded', 'true');
    expect(onRowsChange).toHaveBeenCalledWith([expect.objectContaining({ sku: 'GYM-1' })]);
    expect(api.resyncChannelListing).not.toHaveBeenCalled();
  });

  it('explains why an unknown allocation cannot be sent', async () => {
    api.getProductChannelInventory.mockResolvedValue([{ ...row, listed: true, ready: false, preview_quantity: null, preview_issue: 'MAPPING_INVALID' }]);
    render(<ProductInventorySync channelId="channel-1" productId="product-1" canWrite />);
    expect(await screen.findByText('SKU chưa được ghép và xác minh.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Khắc phục chênh lệch tồn Shopify' })).toBeDisabled();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('explains a missing order poll and does not queue an unsafe inventory increase', async () => {
    api.reconcileChannelListing.mockResolvedValue({ error_code: 'ORDER_POLL_REQUIRED', remote_quantity: 0 });
    render(<ProductInventorySync channelId="channel-1" productId="product-1" canWrite />);
    await confirmInventory();
    await waitFor(() => expect(screen.getByText(/Chưa kiểm tra xong đơn Shopify gần đây/)).toBeInTheDocument());
    expect(api.resyncChannelListing).not.toHaveBeenCalled();
    expect(window.location.pathname).toBe('/channels/30000000-0000-4000-8000-000000000001');
  });

  it('explains the protected customer data blocker instead of a generic webhook error', async () => {
    api.reconcileChannelListing.mockResolvedValue({ error_code: 'ORDER_WEBHOOKS_PCD_REQUIRED', remote_quantity: 0 });
    render(<ProductInventorySync channelId="channel-1" productId="product-1" canWrite />);
    await confirmInventory();
    await waitFor(() => expect(screen.getByText(/Protected Customer Data/)).toBeInTheDocument());
    expect(api.resyncChannelListing).not.toHaveBeenCalled();
  });

  it('reads the baseline before queuing and shows a later worker block on the same screen', async () => {
    api.reconcileChannelListing.mockResolvedValue({ error_code: '', remote_quantity: 0 });
    api.resyncChannelListing.mockResolvedValue({ job_id: 'job-1', status: 'queued' });
    api.getProductChannelInventory.mockResolvedValueOnce([row]).mockResolvedValueOnce([row]).mockResolvedValue([{
      ...row, reported_quantity: 0, has_baseline: true, latest_sync_status: 'BLOCKED',
      latest_sync_error_code: 'WRITE_INVENTORY_SCOPE_REQUIRED', latest_sync_job_id: 'job-1',
      latest_job_id: 'job-1', latest_job_status: 'dead',
    }]);
    render(<ProductInventorySync channelId="channel-1" productId="product-1" canWrite />);
    await confirmInventory();
    await waitFor(() => expect(screen.getByText(/thiếu quyền ghi tồn/)).toBeInTheDocument());
    expect(api.reconcileChannelListing).toHaveBeenCalledWith('channel-1', row.listing_id);
    expect(api.resyncChannelListing).toHaveBeenCalledOnce();
    expect(api.resyncChannelListing).toHaveBeenCalledWith('channel-1', row.listing_id, expect.any(String), { quantity: 3, version: 1 });
    expect(window.location.pathname).toBe('/channels/30000000-0000-4000-8000-000000000001');
  });

  it('keeps WooCommerce draft SKU actions unavailable until the listing is published', async () => {
    api.getProductChannelInventory.mockResolvedValue([{ ...row, listed: false, ready: false }]);
    render(<ProductInventorySync channelId="woo-channel" productId="product-1" channelName="WooCommerce" requireListedForActions canWrite />);
    expect(await screen.findByText('Bản nháp chưa mở bán. Sau khi đăng bán, hệ thống sẽ tự đọc lại tồn.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Làm mới' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xem chi tiết SKU' }));
    expect(screen.getByRole('button', { name: 'Đọc và xác minh tồn' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Đồng bộ lại tồn WooCommerce' })).toBeDisabled();
    expect(api.reconcileChannelListing).not.toHaveBeenCalled();
  });
});
