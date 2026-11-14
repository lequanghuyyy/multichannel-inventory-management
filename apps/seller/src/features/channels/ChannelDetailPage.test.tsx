import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ChannelDetailPage } from './ChannelDetailPage';

const { getChannel, getChannelAPICapabilities, listChannelMappings } = vi.hoisted(() => ({
  getChannel: vi.fn(),
  getChannelAPICapabilities: vi.fn(),
  listChannelMappings: vi.fn(),
}));
vi.mock('../../api/channels', () => ({ getChannel, getChannelAPICapabilities, listChannelMappings }));
const { getShopifyStatus, verifyShopifyStore } = vi.hoisted(() => ({ getShopifyStatus: vi.fn(), verifyShopifyStore: vi.fn() }));
vi.mock('../../api/shopify', () => ({ getShopifyStatus, verifyShopifyStore }));
vi.mock('./components/ShopifyIntegrationPanel', () => ({
  ShopifyIntegrationPanel: ({ onUpdated }: { onUpdated?: () => void }) => <button onClick={onUpdated}>Refresh Shopify mapping</button>,
}));
vi.mock('./components/ShopifyCapabilityPanel', () => ({ ShopifyCapabilityPanel: () => <div>Mock Shopify capabilities</div> }));

// The fixtures are rendered only in explicit demo mode. Live mode must show the backend error.
beforeEach(() => {
  window.history.replaceState({}, '', '/channels');
  getShopifyStatus.mockResolvedValue({ channel_id: '30000000-0000-4000-8000-000000000001' });
  getChannel.mockRejectedValue(new Error('Không kết nối được máy chủ. Hãy thử lại sau.'));
  getChannelAPICapabilities.mockResolvedValue({ capabilities: [], sandbox_skus: [] });
  listChannelMappings.mockRejectedValue(new Error('Không kết nối được máy chủ. Hãy thử lại sau.'));
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/channels');
});

describe('ChannelDetailPage', () => {
  it('renders Shopee fixture evidence and functional mapping filters', async () => {
    window.history.replaceState({}, '', '/channels?tab=products');
    render(<ChannelDetailPage id="30000000-0000-4000-8000-000000000003" mode="demo" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Shopee' })).toBeInTheDocument());
    expect(screen.getByRole('table')).toHaveTextContent('SP-SHOE-BLK-42');
    expect(screen.getByRole('status')).toHaveTextContent('Đang xem dữ liệu demo');

    fireEvent.click(screen.getByRole('tab', { name: 'Chưa liên kết (2)' }));
    expect(screen.getByRole('table')).not.toHaveTextContent('HD-CHR-L');
    fireEvent.change(screen.getByLabelText('Lọc liên kết'), { target: { value: 'Trắng' } });
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('SP-SHOE-WHT-43'));
    // Re-linking is not implemented, and the button says so rather than failing silently when
    // pressed.
    expect(screen.getAllByRole('button', { name: 'Liên kết biến thể' })[0]).toBeDisabled();
  });

  it('handles channels without mappings and missing records', async () => {
    window.history.replaceState({}, '', '/channels?tab=products');
    const { unmount } = render(<ChannelDetailPage id="30000000-0000-4000-8000-000000000001" mode="demo" />);
    await waitFor(() => expect(screen.getByText('Kênh này chưa có liên kết SKU nào.')).toBeInTheDocument());
    unmount();
    render(<ChannelDetailPage id="missing" mode="demo" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không tìm thấy kênh' })).toBeInTheDocument());
  });

  it('shows a live backend outage instead of another channel fixture', async () => {
    render(<ChannelDetailPage id="30000000-0000-4000-8000-000000000003" mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
    expect(screen.queryByRole('heading', { name: 'Shopee' })).toBeNull();
    expect(listChannelMappings).not.toHaveBeenCalled();
  });

  it('loads the second backend mapping page and uses the server total', async () => {
    window.history.replaceState({}, '', '/channels?tab=products');
    const channelId = '30000000-0000-4000-8000-000000000001';
    getChannel.mockResolvedValue({ id: channelId, code: 'shop-a', name: 'Simulator A', type: 'marketplace', environment: 'simulated', status: 'connected', mapping_count: 150 });
    const mapping = (index: number) => ({
      id: `mapping-${index}`, channel_id: channelId, variant_id: `variant-${index}`, external_sku: `EXTERNAL-${index}`,
      canonical_sku: `CORE-${index}`, listed: true, variant_is_active: true, pushed_version: 1, target_version: 1,
      quantity_basis: 'ats', drifted: false, push_state: 'current',
    });
    listChannelMappings.mockResolvedValueOnce({
      items: Array.from({ length: 100 }, (_, index) => mapping(index + 1)),
      nextCursor: 'mapping-page-2', totalCount: 150, issues: [], issueCount: 0, nextIssueCursor: null,
    }).mockResolvedValueOnce({
      items: Array.from({ length: 50 }, (_, index) => mapping(index + 101)),
      nextCursor: null, totalCount: 150, issues: [], issueCount: 0, nextIssueCursor: null,
    });

    render(<ChannelDetailPage id={channelId} mode="default" />);
    expect(await screen.findByText('Đã tải 100 dòng · 150 SKU đã mapping trên toàn kênh')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm mapping' }));
    await waitFor(() => expect(screen.getByText('Đã tải 150 dòng · 150 SKU đã mapping trên toàn kênh')).toBeInTheDocument());
    expect(listChannelMappings).toHaveBeenNthCalledWith(2, channelId, { limit: 100, cursor: 'mapping-page-2' }, expect.any(AbortSignal));
    expect(screen.getAllByText('EXTERNAL-150').length).toBeGreaterThan(0);
  });

  it('keeps the live channel UI mounted while a successful Shopify action refreshes its data', async () => {
    window.history.replaceState({}, '', '/channels?tab=settings');
    const channelId = '30000000-0000-4000-8000-000000000001';
    const channel = { id: channelId, code: 'shopify', name: 'Shopify Dev Store', type: 'marketplace', environment: 'sandbox', status: 'connected', mapping_count: 0 };
    getChannel.mockResolvedValueOnce(channel);
    let resolveRefresh: ((value: unknown) => void) | undefined;
    getChannel.mockReturnValueOnce(new Promise((resolve) => { resolveRefresh = resolve; }));
    listChannelMappings.mockResolvedValue({ items: [], nextCursor: null, totalCount: 0, issues: [], issueCount: 0, nextIssueCursor: null });

    render(<ChannelDetailPage id={channelId} mode="default" />);
    const refreshAction = await screen.findByRole('button', { name: 'Refresh Shopify mapping' });
    fireEvent.click(refreshAction);
    await waitFor(() => expect(getChannel).toHaveBeenCalledTimes(2));
    expect(screen.getByRole('button', { name: 'Refresh Shopify mapping' })).toBeInTheDocument();
    expect(screen.queryByText('Đang tải kênh bán…')).not.toBeInTheDocument();

    resolveRefresh?.(channel);
    await waitFor(() => expect(getChannel).toHaveBeenCalledTimes(2));
  });

  it('ignores a channel response that arrives after navigation to another channel', async () => {
    let resolveOld: ((value: unknown) => void) | undefined;
    getChannel.mockImplementation((id: string) => id === 'old-channel'
      ? new Promise((resolve) => { resolveOld = resolve; })
      : Promise.resolve({ id, code: 'sim-b', name: 'Simulator B', type: 'marketplace', environment: 'simulated', status: 'connected', mapping_count: 0 }));
    listChannelMappings.mockResolvedValue({ items: [], nextCursor: null, totalCount: 0, issues: [], issueCount: 0, nextIssueCursor: null });

    const view = render(<ChannelDetailPage id="old-channel" mode="default" />);
    view.rerender(<ChannelDetailPage id="new-channel" mode="default" />);
    expect(await screen.findByRole('heading', { name: 'Simulator B', level: 1 })).toBeInTheDocument();
    resolveOld?.({ id: 'old-channel', code: 'sim-a', name: 'Simulator A', type: 'marketplace', environment: 'simulated', status: 'connected', mapping_count: 0 });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Simulator B', level: 1 })).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Simulator A', level: 1 })).not.toBeInTheDocument();
  });
});
