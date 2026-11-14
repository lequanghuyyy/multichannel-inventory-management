import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LivestreamSimulatorPage } from './LivestreamSimulatorPage';

const { listChannels, listOrderLoadRuns, getOrderLoadCatalog, startOrderLoadRun } = vi.hoisted(() => ({
  listChannels: vi.fn(),
  listOrderLoadRuns: vi.fn(),
  getOrderLoadCatalog: vi.fn(),
  startOrderLoadRun: vi.fn(),
}));

vi.mock('../../api/channels', () => ({ listChannels }));
vi.mock('../../api/orderLoad', async () => {
  const actual = await vi.importActual<typeof import('../../api/orderLoad')>('../../api/orderLoad');
  return { ...actual, listOrderLoadRuns, getOrderLoadCatalog, startOrderLoadRun };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const channel = { id: '30000000-0000-4000-8000-000000000001', code: 'load-sim', name: 'Load Simulator', type: 'simulator', environment: 'simulated', status: 'connected', mapping_count: 1 };
const catalog = { shop_id: '10000000-0000-4000-8000-000000000001', channel_id: channel.id, items: [{ external_listing_id: 'LIST-1', sku: 'SHOE-001-BLK-41', on_hand: 12, available_to_sell: 12 }] };

describe('LivestreamSimulatorPage', () => {
  it('loads a real simulator catalog and exposes Normal/Burst controls', async () => {
    listChannels.mockResolvedValue({ items: [channel], nextCursor: null });
    listOrderLoadRuns.mockResolvedValue([]);
    getOrderLoadCatalog.mockResolvedValue(catalog);
    startOrderLoadRun.mockResolvedValue({ id: 'run-1', config: { mode: 'burst', seed: 12345, rate: 10, burst_rate: 100, burst_after_ms: 20000, burst_duration_ms: 10000, duration_ms: 60000, max_events: 1000, concurrency: 8, start_at: new Date().toISOString(), shop_id: catalog.shop_id, channel_id: catalog.channel_id, catalog: [{ external_listing_id: 'LIST-1' }] }, config_hash: 'a'.repeat(64), input_hash: 'b'.repeat(64), generator_version: 'orderload/v1', status: 'running', planned_events: 10, sent_events: 0, processed_events: 0, quarantined_events: 0, failed_events: 0, cancelled_events: 0, simulator_only: true, created_at: new Date().toISOString() });
    render(<LivestreamSimulatorPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: /Giả lập đơn hàng livestream/ })).toBeInTheDocument());
    // The safe-zone banner is the point of this screen: it says the run never touches a real
    // marketplace, and the tag on it is the shortest possible form of that claim.
    expect(screen.getByText('KHÔNG KẾT NỐI SÀN')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText((_, element) => element?.tagName === 'STRONG' && element.textContent?.includes('1 sản phẩm được phép') === true)).toBeInTheDocument());
    // The mode switch is a radio-like group of two buttons, not two tabs.
    fireEvent.click(screen.getByRole('button', { name: /Đột biến/ }));
    expect(screen.getByLabelText('Tốc độ đột biến (đơn/giây)')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Bắt đầu giả lập' }));
    await waitFor(() => expect(startOrderLoadRun).toHaveBeenCalledWith(expect.objectContaining({ mode: 'burst', shop_id: catalog.shop_id, channel_id: catalog.channel_id })));
  });
});
