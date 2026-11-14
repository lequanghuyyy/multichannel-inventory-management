import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { OrdersPage } from './OrdersPage';
import { invalidateOrderDetailCache } from './components/OrderApiInlinePreview';

const { listOrders, getOrder, exportOrdersCSV, bulkShipOrders } = vi.hoisted(() => ({ listOrders: vi.fn(), getOrder: vi.fn(), exportOrdersCSV: vi.fn(), bulkShipOrders: vi.fn() }));
vi.mock('../../api/orders', () => ({ listOrders, getOrder, exportOrdersCSV, bulkShipOrders }));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
  invalidateOrderDetailCache();
  window.history.replaceState({}, '', '/orders');
});

// Each test states its own API behaviour rather than inheriting one from a beforeEach. The
// fixture-mode tests above render the prototype baseline because nothing has been mocked, so
// the loader rejects on a missing response and the fallback path is genuinely exercised;
// the tests below say explicitly what the API answers. A default "the API is down" would
// make the offline case the implicit one, and a test that meant to assert live data would
// quietly assert the fallback instead.

async function renderOrders() {
  listOrders.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));
  render(<OrdersPage mode="default" />);
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách đơn hàng' })).toBeInTheDocument(), { timeout: 3000 });
}

describe('OrdersPage', () => {
  it('renders the full-width ledger without opening a preview by default', async () => {
    await renderOrders();
    // The prototype's own figures. They are the fixture baseline, and the live grid replaces
    // them with counted numbers — which is what the second block checks.
    expect(screen.getByLabelText('Chỉ số đơn hàng')).toHaveTextContent('186 sản phẩm');
    expect(screen.getByRole('table')).toHaveTextContent('ORD-DEMO-001');
    expect(screen.queryByRole('region', { name: 'Xem nhanh ORD-DEMO-001' })).toBeNull();
    expect(screen.queryByText('Thanh toán chưa hoàn tất')).toBeNull();
    expect(screen.getByRole('button', { name: 'Giao hàng loạt' })).toBeDisabled();
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Xem nhanh ORD-DEMO-001' }));
    expect(screen.getAllByRole('region', { name: 'Xem nhanh ORD-DEMO-001' })).toHaveLength(2);
    expect(screen.getAllByRole('region', { name: 'Xem nhanh ORD-DEMO-001' })[0]).toHaveTextContent('Nguyễn Thị Lan');
  });

  it('opens the existing POS route from the in-store order action', async () => {
    await renderOrders();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo đơn bán tại quầy' }));
    expect(window.location.pathname).toBe('/pos');
  });

  it('combines SKU search and status tabs', async () => {
    await renderOrders();
    fireEvent.change(screen.getByLabelText('Tìm kiếm đơn hàng'), { target: { value: 'JKT-APX-CHR-M' } });
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-DEMO-003'));
    expect(screen.getByRole('table')).not.toHaveTextContent('ORD-DEMO-001');

    fireEvent.click(screen.getByRole('tab', { name: /Hoàn tất/ }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không có đơn phù hợp' })).toBeInTheDocument());
  });

  it('updates the preview and navigates to the existing detail route', async () => {
    await renderOrders();
    const secondRow = within(screen.getByRole('table')).getByText('ORD-DEMO-002').closest('tr');
    expect(secondRow).not.toBeNull();
    fireEvent.click(within(secondRow as HTMLTableRowElement).getByRole('button', { name: 'Xem nhanh ORD-DEMO-002' }));
    expect(screen.getAllByRole('region', { name: 'Xem nhanh ORD-DEMO-002' })).toHaveLength(2);
    expect(screen.getAllByRole('region', { name: 'Xem nhanh ORD-DEMO-002' })[0]).toHaveTextContent('Trần Minh Khôi');
    expect(screen.queryByRole('region', { name: 'Xem nhanh ORD-DEMO-001' })).toBeNull();

    const refreshedSecondRow = screen.getAllByRole('row').find((row) => row.textContent?.includes('ORD-DEMO-002') && within(row).queryByRole('button', { name: 'Chi tiết' }));
    fireEvent.click(within(refreshedSecondRow as HTMLTableRowElement).getByRole('button', { name: 'Chi tiết' }));
    expect(window.location.pathname).toBe('/orders/20000000-0000-4000-8000-000000000002');
  });

  it('tracks visible order selection', async () => {
    await renderOrders();
    fireEvent.click(within(screen.getByRole('table')).getByLabelText('Chọn tất cả đơn đang hiển thị'));
    expect(screen.getByRole('button', { name: '6 đơn đã chọn' })).toBeDisabled();
  });

  it('keeps explicit empty and error states', async () => {
    const { unmount } = render(<OrdersPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có đơn hàng' })).toBeInTheDocument());
    unmount();
    render(<OrdersPage mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
  });
});

// ---------------------------------------------------------------------------
// Live API mode.
//
// Everything above renders the prototype baseline. The API rows below are a genuinely
// different list — "ORD-LIVE-001" exists only here — so each assertion can say which source
// it is looking at rather than inferring it from a badge.
// ---------------------------------------------------------------------------

function apiOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-00000000000a',
    reference: 'ORD-LIVE-001',
    channel_code: 'pos',
    status: 'confirmed',
    payment_status: 'pending',
    fulfillment_status: 'pending',
    currency: 'VND',
    item_count: 2,
    total_minor: 1980000,
    placed_at: '2026-10-13T02:00:00Z',
    updated_at: '2026-10-13T02:05:00Z',
    ...overrides,
  };
}

const apiPage = (orders: unknown[], nextCursor: string | null = null) => ({
  items: orders,
  nextCursor,
  totalCount: orders.length,
  statusCounts: { placed: orders.length },
  metrics: {
    currency_values: [{
      currency: 'VND',
      gross_order_value_minor: (orders as Array<{ total_minor?: number }>).reduce((sum, order) => sum + (order.total_minor ?? 0), 0),
      non_cancelled_order_value_minor: (orders as Array<{ total_minor?: number; status?: string }>).filter((order) => order.status !== 'cancelled').reduce((sum, order) => sum + (order.total_minor ?? 0), 0),
      manually_paid_order_value_minor: 0,
      cancelled_order_value_minor: (orders as Array<{ total_minor?: number; status?: string }>).filter((order) => order.status === 'cancelled').reduce((sum, order) => sum + (order.total_minor ?? 0), 0),
    }],
    delivered_units: (orders as Array<{ item_count?: number }>).reduce((sum, order) => sum + (order.item_count ?? 0), 0),
    returned_units: 0,
    net_delivered_units: (orders as Array<{ item_count?: number }>).reduce((sum, order) => sum + (order.item_count ?? 0), 0),
    cancelled_orders: (orders as Array<{ status?: string }>).filter((order) => order.status === 'cancelled').length,
    delivered_orders: 0,
  },
});
const apiOffline = () => listOrders.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));
const apiResolves = (rows: unknown[], nextCursor: string | null = null) =>
  listOrders.mockImplementation(() => Promise.resolve(apiPage(rows, nextCursor)));

const apiDetail = () => ({
  ...apiOrder({ customer_name: 'Khách API', items: [{ variant_id: 'v-1', reservation_id: 'r-1', sku: 'SKU-API-1', name: 'Mặt hàng API', quantity: 2, unit_price_minor: 990000, line_total_minor: 1980000 }] }),
});

describe('OrdersPage · live API', () => {
  it('exports the complete filtered result set from the API', async () => {
    apiResolves([apiOrder()], null);
    exportOrdersCSV.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
    const TestURL = class extends URL {};
    Object.defineProperty(TestURL, 'createObjectURL', { value: vi.fn(() => 'blob:orders') });
    vi.stubGlobal('URL', TestURL);
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Xuất CSV phù hợp bộ lọc' })).toBeEnabled());
    fireEvent.change(screen.getByLabelText('Tìm kiếm đơn hàng'), { target: { value: 'ORD-LIVE' } });
    await waitFor(() => expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({ q: 'ORD-LIVE' }), expect.anything()));
    fireEvent.click(screen.getByRole('button', { name: 'Xuất CSV phù hợp bộ lọc' }));
    await waitFor(() => expect(exportOrdersCSV).toHaveBeenCalledWith({ q: 'ORD-LIVE' }, []));
  });

  it('previews packed-only batch fulfillment and sends one atomic request', async () => {
    apiResolves([apiOrder({ status: 'packed', fulfillment_status: 'picking' })], null);
    bulkShipOrders.mockResolvedValue({ orders: [apiOrder({ status: 'shipped', fulfillment_status: 'shipped' })] });
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Giao hàng loạt' })).toHaveLength(2));
    fireEvent.click(screen.getAllByLabelText('Chọn ORD-LIVE-001')[0]!);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Giao hàng loạt' }).some((button) => !button.hasAttribute('disabled'))).toBe(true));
    fireEvent.click(screen.getAllByRole('button', { name: 'Giao hàng loạt' }).at(0)!);
    expect(screen.getByRole('dialog', { name: 'Giao hàng loạt' })).toHaveTextContent('đủ điều kiện 1');
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận bàn giao' }));
    await waitFor(() => expect(bulkShipOrders).toHaveBeenCalledWith(
      ['00000000-0000-4000-8000-00000000000a'], expect.stringMatching(/^bulk-[a-f0-9]{64}$/),
    ));
  });

  it('renders API rows, with no prototype columns', async () => {
    apiResolves([
      apiOrder(),
      apiOrder({ id: '00000000-0000-4000-8000-00000000000b', reference: 'ORD-LIVE-002', status: 'cancelled', cancelled_reason: 'Khách đổi ý', total_minor: 990000, item_count: 1 }),
    ]);
    render(<OrdersPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));
    expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001');
    expect(screen.getByRole('table')).not.toHaveTextContent('ORD-DEMO-001');
    // A cancellation reason is real data the API returns, and it is shown.
    expect(screen.getByRole('table')).toHaveTextContent('Khách đổi ý');
  });

  it('never prints a fixture figure next to a live id', async () => {
    apiResolves([apiOrder()]);
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));

    // The prototype's hardcoded figures must be gone: "186 sản phẩm" was a fixture constant
    // that would sit under live ids and read as a real one.
    const metrics = screen.getByLabelText('Chỉ số đơn hàng');
    expect(metrics).not.toHaveTextContent('186 sản phẩm');
    expect(metrics).not.toHaveTextContent('870,3 triệu đ');
    expect(metrics).toHaveTextContent('Tổng giá trị đơn');
  });

  it('counts metrics from the loaded rows and says the page is not the whole shop', async () => {
    apiResolves([apiOrder(), apiOrder({ id: 'x', total_minor: 990000, item_count: 1 })]);
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));

    const metrics = screen.getByLabelText('Chỉ số đơn hàng');
    // 1980000 + 990000 minor units of VND, formatted by formatMinor and nowhere else.
    expect(metrics).toHaveTextContent('2.970.000');
    expect(metrics).toHaveTextContent('3 sản phẩm');
    // The scope line says how much of the shop this page covers: a page of 50 is not the
    // whole order book, and the reader has to be told which one they are looking at.
    expect(metrics).toHaveTextContent('Toàn bộ 2 đơn theo bộ lọc');
  });

  it('offers the API lifecycle vocabulary, not the prototype one', async () => {
    apiResolves([apiOrder()]);
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));

    // "Đã đóng gói" and "Đang giao" exist in the API and not in the prototype; "Hoàn tất" and
    // "Đang giữ hàng" exist in the prototype and not in the API. Offering the wrong set would
    // let a reader click a tab that can never match.
    expect(screen.getByRole('tab', { name: /Đã đóng gói/ })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: /Đang giao/ })).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: /Hoàn tất/ })).toBeNull();
    expect(screen.queryByRole('tab', { name: /Đang giữ hàng/ })).toBeNull();
  });

  it('offers only server-supported fulfillment and date filters in live API mode', async () => {
    apiResolves([apiOrder()]);
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));

    expect(screen.getByLabelText('Trạng thái giao hàng')).toBeInTheDocument();
    expect(screen.getByLabelText('Từ ngày (UTC)')).toBeInTheDocument();
    expect(screen.getByLabelText('Đến ngày (UTC)')).toBeInTheDocument();
    // The channel list is built from the loaded rows, so it cannot promise a filter that
    // returns nothing.
    expect(screen.getByLabelText('Kênh')).toHaveTextContent('Bán tại quầy');
  });

  it('sends text and lifecycle filters to the server before pagination', async () => {
    apiResolves([apiOrder()]);
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách đơn hàng' })).toBeInTheDocument());
    listOrders.mockClear();

    fireEvent.change(screen.getByLabelText('Tìm kiếm đơn hàng'), { target: { value: 'ORD-LIVE-001' } });
    await waitFor(() => expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({ q: 'ORD-LIVE-001' }), expect.any(AbortSignal)), { timeout: 2000 });

    fireEvent.change(screen.getByLabelText('Trạng thái giao hàng'), { target: { value: 'pending' } });
    await waitFor(() => expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({ q: 'ORD-LIVE-001', fulfillment_status: 'pending' }), expect.any(AbortSignal)));

    fireEvent.change(screen.getByLabelText('Từ ngày (UTC)'), { target: { value: '2026-10-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày (UTC)'), { target: { value: '2026-10-02' } });
    await waitFor(() => expect(listOrders).toHaveBeenCalledWith(expect.objectContaining({
      placed_from: '2026-10-01',
      placed_to: '2026-10-03',
    }), expect.any(AbortSignal)));
  });

  it('says the order lines were not requested rather than that the order is empty', async () => {
    // A LIST response is a summary and carries no lines by construction.
    apiResolves([apiOrder({ item_count: 3 })]);
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));

    expect(screen.getByRole('table')).toHaveTextContent('3 dòng · chưa tải chi tiết');
    expect(screen.queryByText('Chưa có dòng hàng')).toBeNull();
    expect(getOrder).not.toHaveBeenCalled();
  });

  it('does not draw a lifecycle timeline the API never recorded', async () => {
    apiResolves([apiOrder()]);
    getOrder.mockResolvedValue(apiDetail());
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));
    expect(getOrder).not.toHaveBeenCalled();
    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Xem nhanh ORD-LIVE-001' }));
    expect(await screen.findAllByText('Chưa có lịch sử thay đổi trạng thái của đơn này.')).toHaveLength(2);
    expect(screen.queryByText('Sarah Jenkins')).toBeNull();
    expect(getOrder).toHaveBeenCalledTimes(1);
  });

  it('retries a failed inline detail request and reuses the successful snapshot', async () => {
    apiResolves([apiOrder()]);
    getOrder.mockRejectedValueOnce(new Error('temporary detail failure')).mockResolvedValue(apiDetail());
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001'));
    expect(getOrder).not.toHaveBeenCalled();

    const previewButton = () => within(screen.getByRole('table')).getByRole('button', { name: /xem nhanh ORD-LIVE-001/i });
    fireEvent.click(previewButton());
    expect(await screen.findAllByRole('alert')).toHaveLength(2);
    expect(screen.getAllByRole('alert')[0]).toHaveTextContent('temporary detail failure');
    fireEvent.click(screen.getAllByRole('button', { name: 'Thử lại' })[0]!);
    expect(await screen.findAllByText('Mặt hàng API')).toHaveLength(2);
    expect(getOrder).toHaveBeenCalledTimes(2);

    fireEvent.click(previewButton());
    fireEvent.click(previewButton());
    expect(getOrder).toHaveBeenCalledTimes(2);
  });

  it('falls back to the prototype baseline when the API is unreachable', async () => {
    apiOffline();
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách đơn hàng' })).toBeInTheDocument(), { timeout: 3000 });

    expect(screen.getByRole('table')).toHaveTextContent('ORD-DEMO-001');
    // The fixture baseline is identified by its own numbers: the prototype's hardcoded
    // metric card, which the live grid replaces.
    expect(screen.getByLabelText('Chỉ số đơn hàng')).toHaveTextContent('186 sản phẩm');
  });

  it('does not mix a live page with a fixture row when a later page fails', async () => {
    listOrders.mockResolvedValueOnce(apiPage([apiOrder()], 'cursor-2'));
    render(<OrdersPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách đơn hàng' })).toBeInTheDocument());

    listOrders.mockImplementationOnce(() => Promise.reject(new Error('mạng mất')));
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(screen.getByText('Không tải thêm được. Hãy thử lại.')).toBeInTheDocument());
    // The live rows are still the ones on screen. A fallback here would replace one shop's
    // orders with the prototype's, and the reader could not tell.
    expect(screen.getByRole('table')).toHaveTextContent('ORD-LIVE-001');
    expect(screen.getByRole('table')).not.toHaveTextContent('ORD-DEMO-001');
  });
});
