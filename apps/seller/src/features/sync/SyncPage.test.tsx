import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { SyncPage } from './SyncPage';

const { getSyncMetrics, listSyncEvents, listSyncJobs, getSyncEvent, getSyncRetryHistory, retrySyncEvent, onRealtimeRefresh, authRole } = vi.hoisted(() => ({
  getSyncMetrics: vi.fn(),
  listSyncEvents: vi.fn(),
  listSyncJobs: vi.fn(),
  getSyncEvent: vi.fn(),
  getSyncRetryHistory: vi.fn(),
  retrySyncEvent: vi.fn(),
  onRealtimeRefresh: vi.fn(),
  authRole: { current: 'ADMIN' as string },
}));
vi.mock('../../api/sync', () => ({ getSyncMetrics, listSyncEvents, listSyncJobs, getSyncEvent, getSyncRetryHistory, retrySyncEvent }));
vi.mock('../auth/AuthProvider', () => ({ useAuth: () => ({ user: { role: authRole.current } }) }));
vi.mock('../channels/components/ShopifyIntegrationPanel', () => ({ ShopifyIntegrationPanel: () => null }));
vi.mock('../realtime/RealtimeProvider', () => ({
  useRealtime: () => ({ available: true, status: 'live' }),
  useRealtimeRefresh: (_domains: string[], refresh: () => void) => { onRealtimeRefresh(refresh); },
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  authRole.current = 'ADMIN';
});

const liveSnapshot = (overrides: Record<string, unknown> = {}) => ({
  on_hand: 10,
  reserved: 0,
  safety_buffer: 0,
  available_to_sell: 10,
  ...overrides,
});

const liveEvent = (overrides: Record<string, unknown> = {}) => ({
  id: 25,
  event_id: '0e68457d-8a0b-4f91-8edb-71d705eea69f',
  variant_id: 'v-1',
  sku: 'SHOE-001-BLK-41',
  operation: 'sold',
  source: 'pos',
  before: liveSnapshot(),
  after: liveSnapshot({ on_hand: 8, available_to_sell: 8 }),
  version: 23,
  correlation_id: 'ord-1',
  occurred_at: '2026-10-13T02:00:00Z',
  state: 'delivered',
  attempts: 1,
  delivered_at: '2026-10-13T02:00:01Z',
  delivered_channels: ['shop-a', 'shop-b'],
  ...overrides,
});

const failedJob = (overrides: Record<string, unknown> = {}) => ({
  id: 'job-dead-1', channel_id: 'channel-a', channel_code: 'shop-a',
  event_id: '0e68457d-8a0b-4f91-8edb-71d705eea69f', sku: 'SHOE-001-BLK-41', operation: 'sold',
  kind: 'push_event', status: 'dead', attempts: 7, last_error: 'channel token expired',
  queued_at: '2026-10-13T02:00:00Z', ...overrides,
});

const page = (items: unknown[], nextCursor: string | null = null) => ({ items, nextCursor });

const fireStreamEvent = () => {
  const callback = onRealtimeRefresh.mock.calls.at(-1)?.[0] as (() => void) | undefined;
  callback?.();
};

const liveResolves = (events: unknown[], metrics: Record<string, unknown> = {}, jobs: unknown[] = []) => {
  onRealtimeRefresh.mockClear();
  getSyncEvent.mockClear();
  getSyncEvent.mockImplementation((id: string) => Promise.resolve({
    ...(events.find((event) => (event as { event_id: string }).event_id === id) ?? {}),
    event_id: id,
  }));
  listSyncEvents.mockImplementation(() => Promise.resolve(page(events)));
  getSyncMetrics.mockImplementation(() => Promise.resolve({
    events_by_state: { delivered: events.length },
    delivered: events.length,
    sync_latency_p50_ms: 128,
    sync_latency_p95_ms: 400,
    sync_latency_max_ms: 900,
    ...metrics,
  }));
  listSyncJobs.mockImplementation(() => Promise.resolve(page(jobs)));
  retrySyncEvent.mockResolvedValue({ id: 'retry-1', event_id: 'event-1', status: 'queued', repeated: false, requested_at: '2026-10-13T02:00:00Z' });
};

const apiOffline = () => listSyncEvents.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));

// ---------------------------------------------------------------------------
// The two sources are told apart by WHAT THEY RENDER, never by a badge. The prototype ledger
// owns the checkbox column, the "Xem" button and the sample metric cards; the live ledger
// owns the "Tra chi tiết" button, the job log and the measured latency cards. A test that
// cannot tell them apart cannot catch a prototype event passing for a recorded one.
// ---------------------------------------------------------------------------
async function renderFixture(mode: 'loading' | 'empty' | 'error' = 'loading') {
  apiOffline();
  getSyncMetrics.mockRejectedValue(new Error('Không kết nối được máy chủ. Hãy thử lại sau.'));
  render(<SyncPage mode={mode} />);
  if (mode === 'loading') {
    await waitFor(() => expect(screen.getByRole('region', { name: 'Danh sách sự kiện đồng bộ' })).toBeInTheDocument(), { timeout: 3000 });
  }
}

async function renderLive() {
  render(<SyncPage mode="default" />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Nhật ký thay đổi tồn' })).toBeInTheDocument(), { timeout: 3000 });
}

describe('SyncPage · prototype ledger', () => {
  it('states that it is only synchronising with a simulated channel', async () => {
    await renderFixture();

    expect(screen.getByRole('heading', { level: 1, name: 'Đồng bộ' })).toBeInTheDocument();
    // The header says outright that no real marketplace is connected.
    expect(screen.getByText(/chưa kết nối sàn thật/)).toBeInTheDocument();

    const metrics = screen.getByRole('region', { name: 'Số liệu đồng bộ' });
    const value = (label: string) => within(metrics).getByText(label).closest('article')?.querySelector('strong')?.textContent;
    expect(value('Sự kiện mẫu')).toBe('6');
    expect(value('Đã xác nhận')).toBe('2');
    expect(value('Cần xem lại')).toBe('3');
    expect(value('Thiếu liên kết SKU')).toBe('1');

    // A prototype row is not an operator retry target.
    expect(screen.queryByRole('button', { name: /Thử lại mục đã chọn/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Gửi lại tồn kho' })).toBeDisabled();
  });

  it('lists the simulated channels and says which of them are not deployed', async () => {
    await renderFixture();

    const nodes = screen.getByRole('region', { name: 'Các kênh' });
    expect(within(nodes).getByRole('heading', { name: 'Shopee (thử nghiệm)' })).toBeInTheDocument();
    expect(within(nodes).getByRole('heading', { name: 'TikTok Shop' })).toBeInTheDocument();
    expect(nodes).toHaveTextContent('mẫu · cần xem');
    expect(nodes).toHaveTextContent('chưa triển khai');
  });

  it('filters event evidence without changing the supplied sellable figures', async () => {
    await renderFixture();
    fireEvent.change(screen.getByLabelText('Tìm sự kiện đồng bộ'), { target: { value: 'ACC-BELT-BLK-M' } });

    await waitFor(() => expect(screen.getByLabelText('Kết quả đồng bộ')).toHaveTextContent('1 sự kiện phù hợp'));
    const ledger = screen.getByRole('region', { name: 'Danh sách sự kiện đồng bộ' });
    expect(ledger).toHaveTextContent('— → 12 · nhập mới');
    expect(ledger).not.toHaveTextContent('SHOE-001-BLK-42');
  });

  it('supports keyboard tabs and reveals the forensic evidence of a row', async () => {
    await renderFixture();
    const overview = screen.getByRole('tab', { name: 'Tổng quan' });
    fireEvent.keyDown(overview, { key: 'ArrowRight' });
    expect(screen.getByRole('tab', { name: 'Hoạt động · 6' })).toHaveAttribute('aria-selected', 'true');

    fireEvent.click(screen.getByRole('tab', { name: 'Lỗi · 3' }));
    expect(screen.getByLabelText('Kết quả đồng bộ')).toHaveTextContent('3 sự kiện phù hợp');

    // "Xem" renders once per row in the desktop table and once more in the mobile card.
    // The error tab opens on EV-90235 (conflict) — the first row of that tab — so the
    // evidence shown is that row's own note, not another event's.
    fireEvent.click(screen.getAllByRole('button', { name: 'Xem' })[0]!);
    expect(screen.getByRole('region', { name: 'Danh sách sự kiện đồng bộ' })).toHaveTextContent('Tình huống hai kênh cùng mua món hàng cuối cùng, chỉ là minh hoạ.');
    expect(screen.getByRole('region', { name: 'Danh sách sự kiện đồng bộ' })).toHaveTextContent('#EV-90235');
  });

  it('tracks local selection without enabling bulk commands', async () => {
    await renderFixture();
    fireEvent.click(screen.getAllByLabelText('Chọn EV-90241')[0]!);

    expect(screen.getByLabelText('Số sự kiện đã chọn')).toHaveTextContent('1 đã chọn');
    // The count says what selection is for: nothing yet.
    expect(screen.getByLabelText('Số sự kiện đã chọn')).toHaveTextContent('chưa có thao tác');
    expect(screen.queryByRole('button', { name: /Thử lại mục đã chọn/ })).toBeNull();
  });

  it('keeps explicit empty and error states', async () => {
    const { unmount } = render(<SyncPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có dữ liệu đồng bộ' })).toBeInTheDocument());
    unmount();

    render(<SyncPage mode="error" />);
    await waitFor(() => expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Không thể tải dữ liệu'))).toBe(true));
  });
});

// ---------------------------------------------------------------------------
// Live API mode: the transactional outbox. Every row on this screen is a change the core
// actually recorded in the same transaction as the stock movement it describes.
// ---------------------------------------------------------------------------

describe('SyncPage · live API', () => {
  it('queries backend errors and lets an admin queue a confirmed, idempotent retry', async () => {
    const failed = liveEvent({ state: 'dead', attempts: 7, last_error: 'channel token expired', delivered_channels: [] });
    liveResolves([failed], { events_by_state: { dead: 1 } }, [failedJob()]);
    getSyncRetryHistory.mockResolvedValue([{ kind: 'manual_request', id: 'retry-1', status: 'recovered', attempt: 0, started_at: '2026-10-13T02:00:00Z' }]);
    await renderLive();
    fireEvent.click(screen.getByRole('tab', { name: /Lỗi/ }));
    await waitFor(() => expect(listSyncEvents).toHaveBeenCalledWith(expect.objectContaining({ errors_only: true }), expect.any(AbortSignal)));
    await waitFor(() => expect(listSyncJobs).toHaveBeenCalledWith(expect.objectContaining({ status: 'failed,dead' }), expect.any(AbortSignal)));
    const errorTable = await screen.findByRole('table', { name: 'Lịch sử gửi sự kiện tới kênh bán' }, { timeout: 5000 });
    expect(errorTable).toHaveTextContent('channel token expired');
    expect(errorTable).toHaveTextContent('7');

    fireEvent.click(screen.getByLabelText('Chọn shop-a 0e68457d-8a0b-4f91-8edb-71d705eea69f'));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại mục đã chọn/ }));
    expect(screen.getByRole('dialog')).toHaveTextContent('Không chạy lại lệnh bán');
    fireEvent.change(screen.getByLabelText('Lý do vận hành'), { target: { value: 'Đã cập nhật token channel' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xếp hàng' }));
    await waitFor(() => expect(retrySyncEvent).toHaveBeenCalledWith(failed.event_id, 'Đã cập nhật token channel', expect.any(String)));
    expect(await screen.findByText(/Đã xếp hàng; đang chờ channel xác nhận/)).toBeInTheDocument();
    expect(await screen.findByText(/Backend xác nhận việc gửi đã khôi phục/, {}, { timeout: 3000 })).toBeInTheDocument();
  });

  it('keeps failed and dead rows visible when the API is unavailable instead of showing fixture data', async () => {
    apiOffline();
    getSyncMetrics.mockRejectedValue(new Error('offline'));
    render(<SyncPage mode="default" />);
    await waitFor(() => expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Không thể tải dữ liệu'))).toBe(true));
    expect(screen.queryByText('Sự kiện mẫu')).toBeNull();
  });

  it('does not expose retry actions to staff', async () => {
    authRole.current = 'STAFF';
    liveResolves([liveEvent({ state: 'failed', last_error: 'temporary' })], { events_by_state: { failed: 1 } }, [failedJob({ status: 'failed', last_error: 'temporary' })]);
    await renderLive();
    fireEvent.click(screen.getByRole('tab', { name: /Lỗi/ }));
    expect(screen.queryByRole('button', { name: /Thử lại mục đã chọn/ })).toBeNull();
    expect(screen.queryByLabelText('Chọn shop-a 0e68457d-8a0b-4f91-8edb-71d705eea69f')).toBeNull();
  });

  it('reports a state conflict without claiming that retry was queued', async () => {
    liveResolves([liveEvent({ state: 'failed', last_error: 'temporary' })], { events_by_state: { failed: 1 } }, [failedJob({ status: 'failed', last_error: 'temporary' })]);
    retrySyncEvent.mockRejectedValue(new ApiRequestError({ code: 'SYNC_RETRY_CONFLICT', message: 'Event is already running', request_id: 'r-1' }, 409));
    await renderLive();
    fireEvent.click(screen.getByRole('tab', { name: /Lỗi/ }));
    await screen.findByRole('table', { name: 'Lịch sử gửi sự kiện tới kênh bán' }, { timeout: 5000 });
    fireEvent.click(screen.getByLabelText('Chọn shop-a 0e68457d-8a0b-4f91-8edb-71d705eea69f'));
    fireEvent.click(screen.getByRole('button', { name: /Thử lại mục đã chọn/ }));
    fireEvent.change(screen.getByLabelText('Lý do vận hành'), { target: { value: 'Lỗi đã được xử lý' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận xếp hàng' }));
    expect(await screen.findByText(/Event is already running/)).toBeInTheDocument();
    expect(screen.queryByText(/Đã xếp hàng; đang chờ channel xác nhận/)).toBeNull();
  });

  it('renders the committed transition, not just a status word', async () => {
    liveResolves([liveEvent()]);
    await renderLive();

    // Two tables render in live mode — the event log and the job log — so the event ledger is
    // addressed by its own caption rather than by position, which would break the moment a
    // third table appears above it.
    const table = screen.getByRole('table', { name: 'Nhật ký thay đổi tồn kho' });
    expect(table).toHaveTextContent('SHOE-001-BLK-41');
    expect(table).toHaveTextContent('Bán ra');
    expect(table).toHaveTextContent('Bán tại quầy');
    // before → after on the canonical numbers, plus the sellable pair and the version. An
    // event that only said "sold" would leave a reader unable to tell a sale of two from twenty.
    expect(table).toHaveTextContent('10');
    expect(table).toHaveTextContent('8');
    expect(table).toHaveTextContent('Có thể bán 10 → 8 · phiên bản 23');
  });

  it('names the channels that acknowledged the change', async () => {
    liveResolves([liveEvent()]);
    await renderLive();
    // Without this the screen cannot answer the only question it exists for.
    expect(screen.getByRole('table', { name: 'Nhật ký thay đổi tồn kho' })).toHaveTextContent('shop-a, shop-b');
  });

  it('shows measured latency and says what it covers', async () => {
    liveResolves([liveEvent()], { delivered: 1, sync_latency_p50_ms: 128, sync_latency_p95_ms: 400 });
    await renderLive();

    // The metrics arrive on their own request, so waiting for the event ledger is not enough:
    // the ledger resolves first and the numbers may still be loading.
    const metrics = await screen.findByRole('region', { name: 'Số liệu đồng bộ' }, { timeout: 15000 });
    expect(metrics).toHaveTextContent('128 ms');
    expect(metrics).toHaveTextContent('400 ms');
    expect(metrics).toHaveTextContent('Chỉ tính sự kiện kênh đã xác nhận');
  });

  it('surfaces the delivery job log with its retry count and latency', async () => {
    liveResolves([liveEvent()], {}, [{
      id: 'j-1', channel_id: 'c-1', channel_code: 'shop-a', event_id: '0e68457d-8a0b-4f91-8edb-71d705eea69f',
      kind: 'push_event', status: 'succeeded', attempts: 3, latency_ms: 900,
      queued_at: '2026-10-13T02:00:00Z', started_at: '2026-10-13T02:00:00Z', finished_at: '2026-10-13T02:00:01Z',
    }]);
    await renderLive();

    // The job log arrives on its own request, independently of the event page. Waiting for
    // the event ledger alone races it, and the failure looks like a rendering bug rather than
    // a missing await.
    const jobs = await screen.findByRole('table', { name: 'Lịch sử gửi sự kiện tới kênh bán' }, { timeout: 15000 });
    await within(jobs).findByText('shop-a', {}, { timeout: 15000 });
    expect(jobs).toHaveTextContent('Thành công');
    expect(jobs).toHaveTextContent('900 ms');
  });

  it('counts a dead-lettered event as needing a person', async () => {
    liveResolves([
      liveEvent({ id: 1, state: 'dead', attempts: 8, last_error: 'listing archived on this channel', delivered_channels: [] }),
      liveEvent({ id: 2, state: 'delivered' }),
    ], { events_by_state: { dead: 1, delivered: 1 }, delivered: 1 });
    await renderLive();

    const metrics = await screen.findByRole('region', { name: 'Số liệu đồng bộ' }, { timeout: 15000 });
    expect(metrics).toHaveTextContent('1 lỗi hẳn');
    // The channel's own words survive into the log; that sentence is what an operator acts on.
    const table = screen.getByRole('table', { name: 'Nhật ký thay đổi tồn kho' });
    expect(table).toHaveTextContent('listing archived on this channel');
    expect(table).toHaveTextContent('8 lần thử');
    // An event that reached no channel says so instead of showing an empty cell.
    expect(table).toHaveTextContent('Chưa kênh nào đăng bán SKU này');
  });

  it('does not present an all-superseded event as delivered to a channel', async () => {
    liveResolves([liveEvent({ id: 1, state: 'delivered', delivered_channels: [] })], {
      events_by_state: { delivered: 1 }, delivered: 0,
    });
    await renderLive();

    const table = screen.getByRole('table', { name: 'Nhật ký thay đổi tồn kho' });
    expect(table).toHaveTextContent('Đã xử lý, chưa có xác nhận');
    expect(table).toHaveTextContent('Không có kênh nào xác nhận lần cập nhật này');
    expect(table).not.toHaveTextContent('Đã giao');
  });

  it('sends reconciliation to the channel ledger instead of faking it from events', async () => {
    liveResolves([liveEvent()]);
    await renderLive();

    fireEvent.click(screen.getByRole('tab', { name: /Đối soát/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đối soát nằm ở màn Kênh bán' })).toBeInTheDocument());
  });

  it('never shows a prototype latency figure beside a live event', async () => {
    liveResolves([liveEvent()], { delivered: 1, sync_latency_p50_ms: 128, sync_latency_p95_ms: 400 });
    await renderLive();

    const metrics = await screen.findByRole('region', { name: 'Số liệu đồng bộ' }, { timeout: 15000 });
    expect(metrics).toHaveTextContent('128 ms');
    // The prototype cards and their hardcoded SLA are gone. A made-up percentage under live
    // events would read as a measured figure.
    expect(screen.queryByText('Sự kiện mẫu')).toBeNull();
    expect(screen.queryByText(/99,4%/)).toBeNull();
    expect(screen.queryByText(/99,9%/)).toBeNull();
  });

  it('does not fall back to the prototype ledger when the API is unreachable', async () => {
    apiOffline();
    getSyncMetrics.mockRejectedValue(new Error('offline'));
    render(<SyncPage mode="default" />);
    await waitFor(() => expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Không thể tải dữ liệu'))).toBe(true), { timeout: 3000 });
    expect(screen.queryByText('Sự kiện mẫu')).toBeNull();
    expect(listSyncEvents).toHaveBeenCalled();
  });
});

describe('SyncPage · live stream', () => {
  beforeEach(() => onRealtimeRefresh.mockClear());

  it('subscribes the live ledger to the shared realtime manager', async () => {
    liveResolves([liveEvent()]);
    await renderLive();
    expect(onRealtimeRefresh).toHaveBeenCalled();
    expect(screen.getByText('Đang chờ sự kiện mới…')).toBeInTheDocument();
  });

  it('claims a live update only after the revalidation snapshot succeeds', async () => {
    liveResolves([liveEvent({ version: 23 })]);
    await renderLive();

    let resolveSnapshot!: (value: ReturnType<typeof page>) => void;
    listSyncEvents.mockImplementationOnce(() => new Promise((resolve) => { resolveSnapshot = resolve; }));
    fireStreamEvent();
    await waitFor(() => expect(listSyncEvents).toHaveBeenCalledTimes(2));
    expect(screen.getByText('Đang chờ sự kiện mới…')).toBeInTheDocument();

    await act(async () => {
      resolveSnapshot(page([liveEvent({ version: 24 })]));
      await Promise.resolve();
    });
    await waitFor(() => expect(screen.getByText(/Cập nhật trực tiếp lúc/)).toBeInTheDocument());
    expect(screen.getByRole('table', { name: 'Nhật ký thay đổi tồn kho' })).toHaveTextContent('24');
  });

  it('keeps API errors explicit when the stream asks the screen to re-read', async () => {
    apiOffline();
    getSyncMetrics.mockRejectedValue(new Error('offline'));
    render(<SyncPage mode="default" />);
    await waitFor(() => expect(screen.getAllByRole('alert').some((alert) => alert.textContent?.includes('Không thể tải dữ liệu'))).toBe(true), { timeout: 3000 });
    const before = listSyncEvents.mock.calls.length;
    fireStreamEvent();
    await waitFor(() => expect(listSyncEvents.mock.calls.length).toBeGreaterThan(before));
    expect(screen.queryByText('Sự kiện mẫu')).toBeNull();
  });

  it('re-reads the rows when the dispatcher publishes, rather than patching them', async () => {
    liveResolves([liveEvent()]);
    await renderLive();

    const before = listSyncEvents.mock.calls.length;
    fireStreamEvent();
    // Both conditions in ONE poll rather than two in sequence. The re-read briefly flips the
    // ledger back to its loading state, which unmounts the paragraph below the table; two
    // sequential waits can each land on the wrong side of that flip, and the failure then
    // reads as "the stream did not re-read" when it did.
    //
    // 20s rather than the default: a re-read is two more rounds of promises plus two sidecar
    // requests, and under the whole suite's CPU contention a short bound measures the machine.
    await waitFor(() => {
      expect(listSyncEvents.mock.calls.length).toBeGreaterThan(before);
      expect(screen.getByText(/Cập nhật trực tiếp lúc/)).toBeInTheDocument();
    }, { timeout: 20000 });
  });

  it('does not let an older sidecar response replace the latest metrics', async () => {
    let resolveOld!: (value: { sync_latency_p50_ms: number; sync_latency_p95_ms: number; sync_latency_max_ms: number; events_by_state: Record<string, number>; delivered: number }) => void;
    liveResolves([liveEvent()]);
    getSyncMetrics.mockImplementationOnce(() => new Promise((resolve) => { resolveOld = resolve; }));
    await renderLive();
    await waitFor(() => expect(getSyncMetrics).toHaveBeenCalledTimes(1));

    fireStreamEvent();
    await waitFor(() => expect(getSyncMetrics).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.getByRole('region', { name: 'Số liệu đồng bộ' })).toHaveTextContent('128 ms'));

    await act(async () => resolveOld({
      events_by_state: { delivered: 1 }, delivered: 1,
      sync_latency_p50_ms: 999, sync_latency_p95_ms: 999, sync_latency_max_ms: 999,
    }));
    expect(screen.getByRole('region', { name: 'Số liệu đồng bộ' })).toHaveTextContent('128 ms');
    expect(screen.getByRole('region', { name: 'Số liệu đồng bộ' })).not.toHaveTextContent('999 ms');
  });

  it('unsubscribes the page callback when the screen goes away', async () => {
    liveResolves([liveEvent()]);
    const { unmount } = render(<SyncPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Nhật ký thay đổi tồn' })).toBeInTheDocument(), { timeout: 3000 });
    const callbackCount = onRealtimeRefresh.mock.calls.length;
    unmount();
    fireStreamEvent();
    expect(onRealtimeRefresh.mock.calls.length).toBe(callbackCount);
  });
});

describe('SyncPage · one event, read by id', () => {
  beforeEach(() => { onRealtimeRefresh.mockClear(); getSyncEvent.mockClear(); });

  it('reads the event by its id and shows the committed pair', async () => {
    liveResolves([liveEvent()]);
    await renderLive();

    fireEvent.click(screen.getByRole('button', { name: /^Tra sự kiện/ }));
    await waitFor(() => expect(getSyncEvent).toHaveBeenCalledWith('0e68457d-8a0b-4f91-8edb-71d705eea69f', expect.any(AbortSignal)));
    const detail = await screen.findByRole('status');
    expect(detail).toHaveTextContent('0e68457d-8a0b-4f91-8edb-71d705eea69f');
    expect(detail).toHaveTextContent('Có thể bán 10 → 8');
    expect(detail).toHaveTextContent('phiên bản 23');
  });

  it('reports a 404 instead of substituting a different event', async () => {
    liveResolves([liveEvent()]);
    getSyncEvent.mockRejectedValue(new ApiRequestError(
      { code: 'SYNC_EVENT_NOT_FOUND', message: 'Sync event was not found', request_id: 'r-1' }, 404,
    ));
    await renderLive();

    fireEvent.click(screen.getByRole('button', { name: /^Tra sự kiện/ }));
    // Putting a different event on screen under the id the reader clicked is the one
    // substitution an audit ledger cannot afford.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Sync event was not found'));
    // No detail panel appears at all. Substituting a row from the list would put an event the
    // reader never asked for under the id they clicked.
    expect(screen.queryByText('0e68457d-8a0b-4f91-8edb-71d705eea69f ·')).toBeNull();
  });
});
