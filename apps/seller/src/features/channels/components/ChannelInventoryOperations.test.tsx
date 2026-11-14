import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel, ChannelMapping } from '../../../api/channels';
import { ChannelInventoryOperations } from './ChannelOperations';

const { getChannelSettings, listChannelMappings } = vi.hoisted(() => ({
  getChannelSettings: vi.fn(),
  listChannelMappings: vi.fn(),
}));
vi.mock('../../../api/channel-operations', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/channel-operations')>()),
  getChannelSettings,
}));
vi.mock('../../../api/channels', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/channels')>()),
  listChannelMappings,
}));

const channel: Channel = {
  id: '30000000-0000-4000-8000-000000000001',
  code: 'shopify',
  name: 'Shopify Dev Store',
  type: 'marketplace',
  environment: 'sandbox',
  status: 'connected',
  mapping_count: 2,
};

const mapping = (overrides: Partial<ChannelMapping>): ChannelMapping => ({
  id: 'mapping-1',
  channel_id: channel.id,
  variant_id: 'variant-1',
  product_id: '10000000-0000-4000-8000-000000000001',
  product_name: 'Giày chạy bộ',
  external_sku: 'EXT-SHOE-1',
  canonical_sku: 'CORE-SHOE-1',
  inventory_tracking_enabled: true,
  mapping_status: 'verified',
  listed: true,
  variant_is_active: true,
  pushed_version: 1,
  target_version: 1,
  target_quantity: 5,
  reported_quantity: 3,
  quantity_basis: 'ats',
  drifted: false,
  push_state: 'current',
  latest_sync_status: 'MISMATCH',
  latest_sync_verified_at: '2026-11-07T10:00:00Z',
  ...overrides,
});

beforeEach(() => {
  getChannelSettings.mockResolvedValue({ capabilities: { inventory_write: { can_execute: true } } });
  listChannelMappings.mockResolvedValue({
    items: [
      mapping({}),
      mapping({
        id: 'mapping-2', variant_id: 'variant-2', product_id: undefined, product_name: 'Giày chạy bộ 2',
        external_sku: 'EXT-SHOE-2', canonical_sku: 'CORE-SHOE-2',
        target_quantity: 7, reported_quantity: 7, latest_sync_status: 'VERIFIED',
      }),
    ],
    nextCursor: null,
  });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('ChannelInventoryOperations', () => {
  const summaryValue = (label: string) => screen.getAllByText(label)[0]!.closest('div');

  it('shows the shared quota, platform quantity, verification evidence, and allocation workspace link', async () => {
    render(<ChannelInventoryOperations channel={channel} canManage />);
    expect(await screen.findByText('Tồn kho trên kênh')).toBeInTheDocument();

    expect(summaryValue('Hạn mức OctoFlow')).toHaveTextContent('12');
    expect(summaryValue('Kênh đang báo')).toHaveTextContent('10');
    expect(summaryValue('Đã xác minh')).toHaveTextContent('1/2');
    expect(screen.getByText('Xác minh gần nhất').closest('div')).toHaveTextContent('2026');

    const link = screen.getByRole('link', { name: 'Mở phân bổ đa kênh cho Giày chạy bộ' });
    expect(link).toHaveAttribute('href', '/products/10000000-0000-4000-8000-000000000001?tab=operations&allocation=1');
    expect(screen.getByText(/Hạn mức là số OctoFlow phân bổ, không phải tồn riêng của kênh/)).toBeInTheDocument();
  });
});
