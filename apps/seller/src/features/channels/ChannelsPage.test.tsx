import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { ChannelDetailPage } from './ChannelDetailPage';
import { ChannelsPage } from './ChannelsPage';
import { ChannelApiMappingLedger } from './components/ChannelApiMappingLedger';
import { AuthContext } from '../auth/AuthProvider';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/channels');
});

async function renderChannels() {
  render(<ChannelsPage mode="demo" />);
  await waitFor(() => expect(screen.getByLabelText('Danh sách kênh bán')).toBeInTheDocument());
}

describe('ChannelsPage', () => {
  it('renders channel metrics and guarded actions', async () => {
    await renderChannels();
    const metrics = screen.getByLabelText('Chỉ số kênh bán');
    expect(metrics).toHaveTextContent('Tổng số kênh');
    expect(metrics).toHaveTextContent('5');
    expect(screen.getByText('Shopee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Thêm kênh bán' })).toBeDisabled();
  });

  it('shows simulated channels in the shared shop and channel list', async () => {
    await renderChannels();
    const channels = screen.getByLabelText('Danh sách kênh bán');
    expect(channels).toHaveTextContent('Shop và kênh bán');
    expect(channels).toHaveTextContent('Dữ liệu mô phỏng');
    expect(screen.queryByLabelText('Kênh mô phỏng')).not.toBeInTheDocument();
    expect(channels).toHaveTextContent('Shopee');
    expect(screen.queryByLabelText('Môi trường')).not.toBeInTheDocument();
  });

  it('searches and opens the typed channel detail route', async () => {
    await renderChannels();
    fireEvent.change(screen.getByLabelText('Tìm kênh'), { target: { value: 'TikTok' } });
    await waitFor(() => expect(screen.getByText((_, element) => element?.tagName === 'P' && element.textContent === '1 kênh phù hợp')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Mở kênh' }));
    expect(window.location.pathname).toBe('/channels/30000000-0000-4000-8000-000000000002');
  });

  it('keeps explicit empty and error states', async () => {
    const { unmount } = render(<ChannelsPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có kênh bán' })).toBeInTheDocument());
    unmount();
    render(<ChannelsPage mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
  });
});

// ---------------------------------------------------------------------------
// Live API mode.
// ---------------------------------------------------------------------------

const { getChannel, getChannelAPICapabilities, listChannels, listChannelMappings } = vi.hoisted(() => ({
  getChannel: vi.fn(),
  getChannelAPICapabilities: vi.fn(),
  listChannels: vi.fn(),
  listChannelMappings: vi.fn(),
}));
// `getChannel` is in the same module and the detail page needs it. Leaving it out of the
// factory makes it undefined and the failure reads as a rendering bug rather than a missing
// mock, which is the kind of thing that costs an afternoon.
vi.mock('../../api/channels', () => ({ getChannel, getChannelAPICapabilities, listChannels, listChannelMappings }));

const { getWooCommerceStatus, connectWooCommerceStore } = vi.hoisted(() => ({
  getWooCommerceStatus: vi.fn(),
  connectWooCommerceStore: vi.fn(),
}));
vi.mock('../../api/woocommerce', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../api/woocommerce')>(),
  getWooCommerceStatus,
  connectWooCommerceStore,
}));
getWooCommerceStatus.mockResolvedValue({ enabled: false, configured: false, connected: false, connection_status: 'disconnected' });

function renderAdminChannels() {
  render(<AuthContext.Provider value={{ status: 'authenticated', user: { role: 'ADMIN' } as never, error: null, login: async () => {}, logout: async () => {}, retry: () => {} }}>
    <ChannelsPage mode="default" />
  </AuthContext.Provider>);
}

getChannelAPICapabilities.mockResolvedValue({ capabilities: [], sandbox_skus: [] });

const liveChannel = (overrides: Record<string, unknown> = {}) => ({
  id: '30000000-0000-4000-8000-000000000001',
  code: 'shop-a',
  name: 'Simulator A',
  type: 'marketplace',
  environment: 'simulated',
  status: 'connected',
  mapping_count: 2,
  ...overrides,
});

const apiPage = (items: unknown[]) => ({ items, nextCursor: null });
const apiOffline = () => listChannels.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));
const channelResolves = (overrides: Record<string, unknown> = {}) =>
  getChannel.mockImplementation(() => Promise.resolve(liveChannel(overrides)));

describe('ChannelsPage · live API', () => {
  it('lets an ADMIN register a WooCommerce website from the existing channels page', async () => {
    listChannels.mockImplementation(() => Promise.resolve(apiPage([])));
    getWooCommerceStatus.mockResolvedValue({ enabled: true, configured: true, connected: false, connection_status: 'disconnected' });
    connectWooCommerceStore.mockResolvedValue({ enabled: true, configured: true, connected: true, connection_status: 'connected', channel_id: '30000000-0000-4000-8000-000000000009' });
    renderAdminChannels();
    const connect = await screen.findByRole('button', { name: 'Kết nối website WooCommerce' });
    fireEvent.click(connect);
    await waitFor(() => expect(connectWooCommerceStore).toHaveBeenCalledOnce());
    await waitFor(() => expect(window.location.pathname).toBe('/channels/30000000-0000-4000-8000-000000000009'));
  });

  it('keeps the WooCommerce registration action disabled until server config is enabled', async () => {
    listChannels.mockImplementation(() => Promise.resolve(apiPage([])));
    getWooCommerceStatus.mockResolvedValue({ enabled: false, configured: false, connected: false, connection_status: 'disconnected' });
    renderAdminChannels();
    expect(await screen.findByRole('button', { name: 'WooCommerce chưa bật' })).toBeDisabled();
    expect(screen.getByTitle('Bật WOOCOMMERCE_ENABLED và nhập đủ server secrets trước.')).toBeInTheDocument();
  });

  it('renders the pair (type, environment) so a simulator is not read as a marketplace', async () => {
    listChannels.mockImplementation(() => Promise.resolve(apiPage([
      liveChannel(),
      liveChannel({ id: '30000000-0000-4000-8000-000000000003', code: 'web', name: 'Seller Web Storefront', type: 'website', environment: 'sandbox', status: 'disconnected', mapping_count: 0 }),
    ])));
    render(<ChannelsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const table = screen.getByRole('table');
    // Keep the channel kind separate from its environment: the first is a simulator,
    // and the second is a sandbox website.
    expect(table).toHaveTextContent('Simulator');
    expect(table).toHaveTextContent('Sandbox');
    expect(table).toHaveTextContent('Sàn thương mại điện tử');
    expect(table).toHaveTextContent('Website');
  });

  it('keeps the channel list focused on channels without a redundant metric block', async () => {
    listChannels.mockImplementation(() => Promise.resolve(apiPage([
      liveChannel(),
      liveChannel({ id: 'x', environment: 'sandbox', mapping_count: 5 }),
    ])));
    render(<ChannelsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    expect(screen.queryByLabelText('Chỉ số kênh bán')).toBeNull();
    expect(screen.queryByText('Kết nối hợp lệ')).toBeNull();
    expect(screen.queryByText('Kênh cần xử lý')).toBeNull();
    expect(screen.queryByText('Kết nối và quản lý các nền tảng bán hàng của cửa hàng.')).toBeNull();
  });

  it('shows a channel error together with the reason the server gave', async () => {
    listChannels.mockImplementation(() => Promise.resolve(apiPage([
      liveChannel({ status: 'error', last_error: 'token rejected by channel' }),
    ])));
    render(<ChannelsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    expect(screen.getByRole('table')).toHaveTextContent('token rejected by channel');
  });

  it('shows the backend outage without replacing live channels with fixtures', async () => {
    apiOffline();
    render(<ChannelsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
    expect(screen.queryByLabelText('Danh sách kênh bán')).toBeNull();
    expect(screen.queryByLabelText('Chỉ số kênh mẫu')).toBeNull();
    expect(screen.queryByText('Shopee')).toBeNull();
  });
});

describe('ChannelDetailPage · live API', () => {
  it('renders the reconciliation ledger with all three numbers', async () => {
    window.history.replaceState({}, '', '/channels?tab=inventory');
    channelResolves();
    listChannelMappings.mockImplementation(() => Promise.resolve(apiPage([
      {
        id: 'm-1', channel_id: '30000000-0000-4000-8000-000000000001',
        variant_id: 'v-1', external_sku: 'SKU-A-001', canonical_sku: 'SHOE-001-BLK-41',
        listed: true, variant_is_active: true, pushed_version: 7, pushed_on_hand: 12,
        reported_on_hand: 3, core_on_hand: 12, core_reserved: 0, core_safety_buffer: 0,
        core_version: 7, drifted: true, push_state: 'current',
      },
    ])));
    render(<ChannelDetailPage id="30000000-0000-4000-8000-000000000001" mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Sổ đối soát SKU' })).toBeInTheDocument());

    const ledger = screen.getByRole('table');
    expect(ledger).toHaveTextContent('SKU-A-001');
    expect(ledger).toHaveTextContent('SHOE-001-BLK-41');
    // 12 core, 12 pushed, 3 reported — the three numbers a drift decision rests on.
    // push_state describes DELIVERY. The push landed, while the reported number remains
    // separately visible as a drift; the label must not imply the two quantities match.
    expect(ledger).toHaveTextContent('Đã gửi phiên bản hiện tại');
    expect(ledger).toHaveTextContent('7 / 7');
    // The drift count lives in the ledger's header, not in a cell: it is a property of the
    // page the operator is reading, not of any one row.
    expect(screen.getByText(/lệch: 1/)).toBeInTheDocument();
  });

  it('shows Shopify read-back mismatch evidence instead of a synced label', async () => {
    render(<ChannelApiMappingLedger shopify mappings={[{
      id: 'm-shopify', channel_id: '30000000-0000-4000-8000-000000000001',
      variant_id: 'v-shopify', external_sku: 'SKU-SHOP-1', canonical_sku: 'SKU-SHOP-1',
      listed: true, variant_is_active: true, inventory_tracking_enabled: true,
      mapping_status: 'verified', pushed_version: 8, target_version: 8, target_quantity: 6,
      core_version: 8, core_on_hand: 20, core_reserved: 3, core_safety_buffer: 2,
      pushed_quantity: 6, reported_quantity: 4, drifted: true, push_state: 'current', quantity_basis: 'ats',
      latest_sync_status: 'MISMATCH', latest_sync_attempt_at: '2026-10-27T05:00:00Z',
      latest_sync_requested_available: 6, latest_sync_remote_after: 4,
      latest_sync_core_version: 8, latest_sync_target_version: 8,
      latest_sync_mutation_acknowledged: true, latest_sync_error_code: 'READBACK_MISMATCH',
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết mapping' }));
    const ledger = screen.getByRole('table');
    expect(ledger).toHaveTextContent('Shopify báo sai số');
    expect(ledger).not.toHaveTextContent('Đã đồng bộ');
    expect(ledger).toHaveTextContent('6 / 4');
    expect(ledger).toHaveTextContent('Lần thử gần nhất');
    expect(ledger).toHaveTextContent('READBACK_MISMATCH');
    expect(ledger).toHaveTextContent('Có');
  });

  it('does not call an old Shopify report verified without evidence', async () => {
    render(<ChannelApiMappingLedger shopify mappings={[{
      id: 'm-shopify-old', channel_id: '30000000-0000-4000-8000-000000000001',
      variant_id: 'v-shopify', external_sku: 'SKU-SHOP-1', canonical_sku: 'SKU-SHOP-1',
      listed: true, variant_is_active: true, inventory_tracking_enabled: true,
      mapping_status: 'verified', pushed_version: 7, target_version: 7, target_quantity: 3,
      core_version: 7, core_on_hand: 3, core_reserved: 0, core_safety_buffer: 0,
      pushed_quantity: 3, reported_quantity: 3, drifted: false, push_state: 'current', quantity_basis: 'ats',
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết mapping' }));
    const ledger = screen.getByRole('table');
    expect(ledger).toHaveTextContent('Chưa có bằng chứng xác minh');
    expect(ledger).not.toHaveTextContent('Đã đồng bộ');
  });

  it('shows a durable write block and its safe reason code', () => {
    render(<ChannelApiMappingLedger shopify mappings={[{
      id: 'm-shopify-blocked', channel_id: '30000000-0000-4000-8000-000000000001',
      variant_id: 'v-shopify', external_sku: 'SKU-SHOP-1', canonical_sku: 'SKU-SHOP-1',
      listed: true, variant_is_active: true, inventory_tracking_enabled: false,
      mapping_status: 'needs_attention', pushed_version: 7, target_version: 8, target_quantity: 5,
      core_version: 8, core_on_hand: 10, core_reserved: 0, core_safety_buffer: 0,
      drifted: false, push_state: 'superseded', quantity_basis: 'ats',
      latest_sync_status: 'BLOCKED', latest_sync_attempt_at: '2026-10-27T05:00:00Z',
      latest_sync_error_code: 'MAPPING_INVALID', latest_sync_core_version: 8, latest_sync_target_version: 8,
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết mapping' }));
    const ledger = screen.getByRole('table');
    expect(ledger).toHaveTextContent('Bị chặn');
    expect(ledger).toHaveTextContent('MAPPING_INVALID');
  });

  it('distinguishes an acknowledged mutation from a verified read-back', () => {
    render(<ChannelApiMappingLedger shopify mappings={[{
      id: 'm-shopify-awaiting-readback', channel_id: '30000000-0000-4000-8000-000000000001',
      variant_id: 'v-shopify', external_sku: 'SKU-SHOP-1', canonical_sku: 'SKU-SHOP-1',
      listed: true, variant_is_active: true, inventory_tracking_enabled: true,
      mapping_status: 'verified', pushed_version: 7, target_version: 8, target_quantity: 5,
      core_version: 8, core_on_hand: 10, core_reserved: 0, core_safety_buffer: 0,
      drifted: false, push_state: 'superseded', quantity_basis: 'ats',
      latest_sync_status: 'DEFERRED', latest_sync_attempt_at: '2026-10-27T05:00:00Z',
      latest_sync_error_code: 'READBACK_RATE_LIMITED', latest_sync_requested_available: 5,
      latest_sync_mutation_acknowledged: true, latest_sync_core_version: 8, latest_sync_target_version: 8,
    }]} />);

    fireEvent.click(screen.getByRole('button', { name: 'Chi tiết mapping' }));
    const ledger = screen.getByRole('table');
    expect(ledger).toHaveTextContent('Shopify đã nhận, chờ xác minh');
    expect(ledger).not.toHaveTextContent('Đã xác minh từ Shopify');
    expect(ledger).toHaveTextContent('read-back đang chờ API capacity');
  });

  it('says a channel with no listings is unconfigured, not broken', async () => {
    window.history.replaceState({}, '', '/channels?tab=inventory');
    channelResolves({ id: '30000000-0000-4000-8000-000000000003', code: 'web', name: 'Seller Web Storefront', environment: 'sandbox', mapping_count: 0 });
    listChannelMappings.mockImplementation(() => Promise.resolve(apiPage([])));
    render(<ChannelDetailPage id="30000000-0000-4000-8000-000000000003" mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có listing để đối soát' })).toBeInTheDocument());
  });

  it('does not fall back to another channel when the id does not exist', async () => {
    // A 404 is the server answering, so the page must say so rather than reach for the
    // prototype's channel with a different id.
    getChannel.mockImplementation(() => Promise.reject(new ApiRequestError(
      { code: 'CHANNEL_NOT_FOUND', message: 'Channel was not found', request_id: 'req-404' },
      404,
    )));
    render(<ChannelDetailPage id="30000000-0000-4000-8000-0000000000ff" mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.queryByRole('heading', { name: 'Sổ đối soát SKU' })).toBeNull();
  });
});
