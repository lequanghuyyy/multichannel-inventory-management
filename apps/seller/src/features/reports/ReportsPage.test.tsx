import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { ReportsPage } from './ReportsPage';

const { getReportSummary } = vi.hoisted(() => ({ getReportSummary: vi.fn() }));
vi.mock('../../api/reports', () => ({ getReportSummary }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/reports');
});

// The two sources on this screen are told apart by WHAT THEY RENDER, never by a badge:
// the fixture brief owns the provenance aside, the "MỤC 0N" metric cards and the audit
// footer; the live summary owns the day table, the SKU table and the dated window line.
// A test that cannot tell them apart cannot catch a prototype brief passing for live data.
async function renderFixture(mode: 'default' | 'empty' | 'error' = 'default') {
  getReportSummary.mockRejectedValue(new Error('Không kết nối được báo cáo (HTTP 0).'));
  render(<ReportsPage mode={mode} />);
  if (mode === 'default') {
    await waitFor(() => expect(screen.getByRole('region', { name: 'Chỉ số báo cáo' })).toBeInTheDocument(), { timeout: 3000 });
  }
}

describe('ReportsPage · prototype brief', () => {
  it('states the window and the source of the brief it is showing', async () => {
    await renderFixture();

    expect(screen.getByRole('heading', { level: 1, name: 'Báo cáo' })).toBeInTheDocument();
    const provenance = screen.getByRole('complementary', { name: 'Nguồn số liệu báo cáo' });
    expect(provenance).toHaveTextContent('7 ngày qua (mẫu)');
    expect(provenance).toHaveTextContent('2026-10-03 14:02 UTC');
    // The brief says outright that it is a quick look, not a closed ledger.
    expect(provenance).toHaveTextContent('Đây là báo cáo xem nhanh, không phải chốt sổ.');
    // There is no data source behind it, and the panel says so instead of naming one.
    expect(provenance).toHaveTextContent('Không có');

    // The audit package cannot be produced by anything on this screen.
    expect(screen.getByRole('button', { name: 'Tải báo cáo kiểm toán' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Hẹn gửi báo cáo' })).toBeDisabled();
  });

  it('shows the fixture metric cards, each stamped with its own index', async () => {
    await renderFixture();

    const metrics = screen.getByRole('region', { name: 'Chỉ số báo cáo' });
    expect(metrics).toHaveTextContent('2.840');
    expect(metrics).toHaveTextContent('3.118');
    // The index stamp is what identifies these as the prototype's own numbered cards; the
    // live KPI grid carries no such stamp.
    expect(metrics).toHaveTextContent('MỤC 01');
    expect(metrics).toHaveTextContent('MỤC 06');
  });

  it('switches whole supplied snapshots instead of calculating aggregates', async () => {
    await renderFixture();

    const periods = screen.getByRole('group', { name: 'Khoảng thời gian báo cáo' });
    fireEvent.click(within(periods).getByRole('button', { name: '30 ngày' }));

    // Changing the window re-runs the request. While the replacement is in flight the
    // previous snapshot is still on screen, and the screen passes through the empty state
    // while the request fails and the fallback is re-read — so every assertion below is
    // retried instead of being taken from whichever frame happens to be on screen when
    // the click returns. '11.420' belongs to the 30-day snapshot alone, so it is what
    // proves the switch actually happened.
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'Chỉ số báo cáo' })).toHaveTextContent('11.420');
      expect(screen.getByRole('complementary', { name: 'Nguồn số liệu báo cáo' })).toHaveTextContent('30 ngày qua (mẫu)');
    }, { timeout: 10000 });
  });

  it('filters the SKU evidence while keeping the headline snapshot', async () => {
    await renderFixture();
    fireEvent.click(screen.getByRole('tab', { name: 'Tồn kho' }));

    const controls = screen.getByRole('region', { name: 'Bộ lọc báo cáo' });
    fireEvent.change(within(controls).getByLabelText('Kênh'), { target: { value: 'tiktok' } });
    fireEvent.change(within(controls).getByLabelText('Nhóm sản phẩm'), { target: { value: 'leather' } });

    const panel = screen.getByRole('tabpanel');
    expect(panel).toHaveTextContent('Minimalist Leather Tote');
    expect(panel).not.toHaveTextContent('AeroGlide Runner');
    // The headline cards are a different object from the filtered evidence list, and the
    // filter is not allowed to rewrite them.
    expect(screen.getByRole('region', { name: 'Chỉ số báo cáo' })).toHaveTextContent('2.840');
  });

  it('opens the canonical inventory lookup for a SKU row', async () => {
    await renderFixture();
    fireEvent.click(screen.getByRole('tab', { name: 'Tồn kho' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Xem tồn kho' })[0]!);
    expect(window.location.pathname).toBe('/inventory');
    expect(window.location.search).toBe('?sku=SHOE-001-BLK-42');
  });

  it('keeps gateway telemetry explicitly non-runtime', async () => {
    await renderFixture();
    const inventoryTab = screen.getByRole('tab', { name: 'Tồn kho' });
    fireEvent.keyDown(inventoryTab, { key: 'End' });
    expect(screen.getByRole('tab', { name: 'Đồng bộ' })).toHaveAttribute('aria-selected', 'true');

    const gateway = screen.getByRole('region', { name: 'Báo cáo đồng bộ' });
    expect(within(gateway).getByRole('heading', { name: 'Hiệu năng đồng bộ' })).toBeInTheDocument();
    expect(gateway).toHaveTextContent('99,2% (mẫu)');
    // Every figure is stamped as illustrative, and the diagnostics card says what is missing.
    expect(gateway).toHaveTextContent('Chưa có số đo thật.');
    expect(within(gateway).getByRole('heading', { name: 'Chẩn đoán đồng bộ' })).toBeInTheDocument();
    expect(gateway).toHaveTextContent('Chưa triển khai');
  });

  it('keeps explicit empty and error states', async () => {
    const { unmount } = render(<ReportsPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có báo cáo' })).toBeInTheDocument());
    unmount();

    render(<ReportsPage mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
  });
});

// ---------------------------------------------------------------------------
// Live API mode. Everything below asserts that every figure on screen came out of the core
// database, and — just as importantly — that none of the prototype brief is showing.
// ---------------------------------------------------------------------------

const liveSummary = (overrides: Record<string, unknown> = {}) => ({
  period: '7d',
  from: '2026-10-04T00:00:00Z',
  to: '2026-10-11T00:00:00Z',
  generated_at: '2026-10-10T09:30:00Z',
  source: 'core-database',
  currency: 'VND',
  metrics: {
    order_count: 12, cancelled_orders: 2, refunded_orders: 1,
    units_gross: 20, units_sold: 16, units_cancelled: 4,
    gross_order_value_minor: 9000000, non_cancelled_order_value_minor: 7200000, currency: 'VND',
  },
  average_order_value_minor: 450000,
  sales_by_day: [
    { date: '2026-10-04', order_count: 0, units_sold: 0, non_cancelled_order_value_minor: 0 },
    { date: '2026-10-05', order_count: 0, units_sold: 0, non_cancelled_order_value_minor: 0 },
    { date: '2026-10-06', order_count: 3, units_sold: 4, non_cancelled_order_value_minor: 1800000 },
    { date: '2026-10-07', order_count: 0, units_sold: 0, non_cancelled_order_value_minor: 0 },
    { date: '2026-10-08', order_count: 4, units_sold: 6, non_cancelled_order_value_minor: 2700000 },
    { date: '2026-10-09', order_count: 2, units_sold: 3, non_cancelled_order_value_minor: 1350000 },
    { date: '2026-10-10', order_count: 3, units_sold: 3, non_cancelled_order_value_minor: 1350000 },
  ],
  top_skus: [
    { sku: 'SHOE-001-BLK-41', name: 'Giày da nam', category: 'footwear', order_count: 8, units_sold: 10, non_cancelled_order_value_minor: 4500000 },
    { sku: 'SHOE-002-BLK-42', name: 'Giày thể thao', category: 'footwear', order_count: 4, units_sold: 6, non_cancelled_order_value_minor: 2700000 },
  ],
  channels: [
    { channel_code: 'shop-a', order_count: 6, units_sold: 8, non_cancelled_order_value_minor: 3600000, share_pct: 50 },
    { channel_code: 'pos', order_count: 6, units_sold: 8, non_cancelled_order_value_minor: 3600000, share_pct: 50 },
  ],
  inventory: { variant_count: 30, on_hand: 412, reserved: 18, out_of_stock: 3, low_stock: 2, with_open_holds: 5 },
  sync: { event_count: 48, delivered: 44, pending: 1, failed: 2, dead: 1, dead_before_period: 1 },
  drift: { listing_count: 30, drifted: 4, awaiting_report: 3, unlisted: 1, behind_core: 2, ats_basis: 30, legacy_basis: 27 },
  channel_options: ['pos', 'shop-a', 'shop-b'],
  category_options: ['footwear', 'leather'],
  ...overrides,
});

const live = (overrides: Record<string, unknown> = {}) =>
  getReportSummary.mockResolvedValue(liveSummary(overrides));

async function renderLive() {
  render(<ReportsPage mode="default" />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Chỉ số báo cáo' })).toBeInTheDocument(), { timeout: 3000 });
}

describe('ReportsPage · live API', () => {
  it('shows the aggregates and the window they cover', async () => {
    live();
    await renderLive();

    const kpis = screen.getByRole('region', { name: 'Chỉ số báo cáo' });
    // Read each card's own figure rather than substring-matching the section: "Sắp hết" sits
    // inside "Hết tồn", so a wrong value would still pass a plain textContent check.
    const value = (label: string) => within(kpis).getByText(label).parentElement?.querySelector('strong')?.textContent;
    expect(value('Đơn hàng')).toBe('12');
    expect(value('Sản phẩm bán ra')).toBe('16');       // cancellations already removed
    // The ₫ separator is a narrow no-break space in vi-VN, so it is matched as any
    // whitespace rather than pasted in literally.
    expect(value('Giá trị đơn chưa hủy')).toMatch(/^7\.200\.000\s*₫$/);
    expect(value('Giá trị đơn trung bình')).toMatch(/^450\.000\s*₫$/);
    expect(value('Hết tồn')).toBe('3');
    expect(value('SKU đăng bán bị lệch')).toBe('4');
    expect(value('Sự kiện lỗi hẳn')).toBe('1');

    // Provenance. A number with no stated window is not evidence of anything.
    expect(screen.getByText(/Từ 2026-10-04 đến 2026-10-11 \(không gồm ngày cuối\)/)).toBeInTheDocument();
    expect(screen.getByText(/cập nhật lúc 2026-10-10 09:30/)).toBeInTheDocument();
  });

  it('leaves none of the prototype brief on screen', async () => {
    live();
    await renderLive();

    // The fixture's own landmarks are all absent: an audit footer or a provenance aside
    // next to live numbers would be the prototype talking over the database.
    expect(screen.queryByRole('complementary', { name: 'Nguồn số liệu báo cáo' })).toBeNull();
    expect(screen.queryByRole('region', { name: 'Bộ lọc báo cáo' })).toBeNull();
    expect(screen.queryByText('MỤC 01')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Tải báo cáo kiểm toán' })).toBeNull();
    // 'today' has no server meaning: offering it in live mode would silently widen to 7 days.
    expect(screen.queryByRole('button', { name: 'Hôm nay' })).toBeNull();
  });

  it('keeps the empty days instead of drawing a line through them', async () => {
    live();
    await renderLive();

    const velocity = screen.getByRole('region', { name: 'Tốc độ bán theo ngày' });
    for (const day of ['2026-10-04', '2026-10-05', '2026-10-07']) {
      expect(velocity).toHaveTextContent(day);
    }
  });

  it('keeps the till in the channel table and shows the shares summing to a hundred', async () => {
    live();
    await renderLive();

    fireEvent.click(screen.getByRole('tab', { name: 'Kênh bán' }));
    const table = screen.getByRole('table', { name: 'Giá trị đơn theo kênh' });
    // The till is listed beside the marketplace rather than folded into it.
    expect(table).toHaveTextContent('Bán tại quầy');
    expect(table).toHaveTextContent('shop-a');
    // Summed from the rendered cells rather than asserted as a literal: the property that
    // matters is that the bars agree with the rows, and a hardcoded '100%' would pass even
    // if the server sent 40% and 60%.
    const shares = within(table).getAllByRole('row').slice(1)
      .map((row) => Number((row as HTMLTableRowElement).cells[4]?.textContent?.replace('%', '') ?? '0'));
    expect(shares).toEqual([50, 50]);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(100);
  });

  it('reads the category from the database rather than the SKU', async () => {
    live();
    await renderLive();

    fireEvent.click(screen.getByRole('tab', { name: 'Tồn kho' }));
    const table = screen.getByRole('table', { name: 'Bảng SKU bán chạy' });
    expect(table).toHaveTextContent('SHOE-001-BLK-41');
    // products.category arrives as the stored code and is shown under its Vietnamese name.
    expect(table).toHaveTextContent('Giày dép');
    expect(table).not.toHaveTextContent('footwear');
  });

  it('surfaces dead events and unresolved listings instead of hiding them', async () => {
    live();
    await renderLive();

    fireEvent.click(screen.getByRole('tab', { name: 'Đồng bộ' }));
    const ledger = screen.getByRole('table', { name: 'Tình trạng tồn kho và đồng bộ' });
    expect(ledger).toHaveTextContent('Sự kiện chết');
    expect(ledger).toHaveTextContent('Chết trước kỳ này');
    expect(ledger).toHaveTextContent('Kênh chưa xác nhận');
    expect(ledger).toHaveTextContent('Chậm hơn hệ thống');
  });

  it('offers the channels and categories the database actually holds', async () => {
    live();
    await renderLive();

    const channelSelect = screen.getByLabelText('Kênh') as HTMLSelectElement;
    expect([...channelSelect.options].map((option) => option.value)).toEqual(['all', 'pos', 'shop-a', 'shop-b']);
    const categorySelect = screen.getByLabelText('Nhóm') as HTMLSelectElement;
    expect([...categorySelect.options].map((option) => option.value)).toEqual(['all', 'footwear', 'leather']);
  });

  it('asks the API for the filtered window it is showing', async () => {
    live();
    await renderLive();

    fireEvent.change(screen.getByLabelText('Kênh'), { target: { value: 'shop-a' } });
    await waitFor(() => expect(getReportSummary).toHaveBeenCalledWith(
      expect.objectContaining({ period: '7d', channel: 'shop-a' }), expect.anything(),
    ));
    // The figures must not outrun the query: a live screen over a stale aggregate is the
    // exact failure this hook exists to prevent, so the second response must also land.
    await waitFor(() => expect(screen.getByRole('region', { name: 'Chỉ số báo cáo' })).toBeInTheDocument());
  });

  it('falls back to the prototype brief when the API is unreachable', async () => {
    getReportSummary.mockRejectedValue(new Error('Không kết nối được báo cáo (HTTP 0).'));
    render(<ReportsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Chỉ số báo cáo' })).toBeInTheDocument(), { timeout: 3000 });
    // The prototype grid is the thing that must appear; the live KPI grid looks similar, so
    // the stamped "MỤC 01" card is what actually identifies the fixture.
    expect(screen.getByText('MỤC 01')).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Nguồn số liệu báo cáo' })).toBeInTheDocument();
  });

  it('does not fall back to a prototype brief after a 400', async () => {
    getReportSummary.mockRejectedValue(new ApiRequestError({ code: 'VALIDATION_ERROR', message: 'period must be one of 7d, 30d, 90d', request_id: 'req-1' }, 400));
    render(<ReportsPage mode="default" />);
    // A 400 is an answer. Substituting the prototype brief for it would put a handsome,
    // entirely invented report on screen under a period the server refused.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Dữ liệu chưa hợp lệ'));
    expect(screen.queryByRole('region', { name: 'Chỉ số báo cáo' })).toBeNull();
    expect(screen.queryByRole('complementary', { name: 'Nguồn số liệu báo cáo' })).toBeNull();
  });
});
