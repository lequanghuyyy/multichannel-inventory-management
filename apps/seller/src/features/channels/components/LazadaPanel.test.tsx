import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LazadaStatus } from '../../../api/lazada';
import type { Channel } from '../../../api/channels';
import { LazadaPanel } from './LazadaPanel';

const api = vi.hoisted(() => ({
  disconnectLazada: vi.fn(),
  getLazadaCatalog: vi.fn(),
  getLazadaStatus: vi.fn(),
  importLazadaMappings: vi.fn(),
  previewLazadaMappings: vi.fn(),
  startLazadaOAuth: vi.fn(),
  verifyLazada: vi.fn(),
}));

vi.mock('../../../api/lazada', () => api);

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('LazadaPanel', () => {
  it('allows verification after OAuth stored tokens but before the first live read', async () => {
    const status: LazadaStatus = {
      enabled: true,
      configured: true,
      country: 'VN',
      write_enabled: false,
      product_write_enabled: false,
      inventory_write_enabled: false,
      order_write_enabled: false,
      connection: {
        channel_id: '42',
        seller_id: 'seller-test',
        country: 'VN',
        status: 'disconnected',
        access_token_expires_at: new Date(Date.now() + 60_000).toISOString(),
        refresh_token_expires_at: new Date(Date.now() + 86_400_000).toISOString(),
        capabilities: {},
      },
    };
    api.getLazadaStatus.mockResolvedValue(status);
    const channel: Channel = {
      id: '42',
      code: 'lazada',
      name: 'Lazada VN',
      type: 'marketplace',
      environment: 'sandbox',
      status: 'DISCONNECTED',
    };

    render(<LazadaPanel channel={channel} tab="settings" canManage onUpdated={() => {}} />);

    expect(await screen.findByRole('button', { name: 'Kiểm tra kết nối' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Ngắt kết nối' })).toBeEnabled();
  });
});
