import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LazadaOrderReceipt } from '../../../api/lazada';
import { LazadaOrdersPanel } from './LazadaOrdersPanel';

const api = vi.hoisted(() => ({ getLazadaOrders: vi.fn(), retryLazadaOrder: vi.fn(), pollChannelOrders: vi.fn() }));
vi.mock('../../../api/lazada', () => ({ getLazadaOrders: api.getLazadaOrders, retryLazadaOrder: api.retryLazadaOrder }));
vi.mock('../../../api/channel-operations', () => ({ pollChannelOrders: api.pollChannelOrders }));

const receipt: LazadaOrderReceipt = {
  external_order_id: '100', core_order_id: '', core_status: '', core_fulfillment_status: '',
  native_status: 'pending', ingestion_status: 'quarantined', safe_error_code: 'mapping_missing',
  last_seen_at: '2026-11-11T03:00:00Z',
  items: [
    { order_item_id: '1', sku_id: '11', seller_sku: 'SKU-A', native_status: 'pending' },
    { order_item_id: '2', sku_id: '11', seller_sku: 'SKU-A', native_status: 'pending' },
  ],
};

beforeEach(() => {
  api.getLazadaOrders.mockResolvedValue({ items: [receipt] });
  api.retryLazadaOrder.mockResolvedValue({ status: 'refetched' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LazadaOrdersPanel', () => {
  it('keeps separate order items and retries a quarantined order after mapping', async () => {
    render(<LazadaOrdersPanel channelId="channel-1" canManage connected />);
    await screen.findByText('Lazada #100');
    expect(screen.getByText('mapping_missing')).toBeInTheDocument();
    expect(screen.getByText('#1')).toBeInTheDocument();
    expect(screen.getByText('#2')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải lại đơn' }));
    await waitFor(() => expect(api.retryLazadaOrder).toHaveBeenCalledWith('channel-1', '100'));
  });

  it('does not offer polling or retry to staff', async () => {
    render(<LazadaOrdersPanel channelId="channel-1" canManage={false} connected />);
    await screen.findByText('Lazada #100');
    expect(screen.queryByRole('button', { name: 'Tải lại đơn' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Kiểm tra đơn mới' })).not.toBeInTheDocument();
  });
});
