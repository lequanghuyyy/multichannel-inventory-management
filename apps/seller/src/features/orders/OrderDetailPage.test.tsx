import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { OrderDetailPage } from './OrderDetailPage';

const { getOrder, getOrderHistory, getOrderReturns, transitionOrder, confirmOrderPayment } = vi.hoisted(() => ({ getOrder: vi.fn(), getOrderHistory: vi.fn(), getOrderReturns: vi.fn(), transitionOrder: vi.fn(), confirmOrderPayment: vi.fn() }));
vi.mock('../../api/orders', () => ({ getOrder, getOrderHistory, getOrderReturns, transitionOrder, confirmOrderPayment }));
const { getShopifyFulfillmentStatus, getShopifyStatus, createShopifyFulfillment } = vi.hoisted(() => ({ getShopifyFulfillmentStatus: vi.fn(), getShopifyStatus: vi.fn(), createShopifyFulfillment: vi.fn() }));
vi.mock('../../api/shopify', () => ({ getShopifyFulfillmentStatus, getShopifyStatus, createShopifyFulfillment }));
const { useAuth } = vi.hoisted(() => ({ useAuth: vi.fn(() => ({ user: { role: 'STAFF' } })) }));
vi.mock('../auth/AuthProvider', () => ({ useAuth }));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  useAuth.mockReturnValue({ user: { role: 'STAFF' } });
  window.history.replaceState({}, '', '/orders');
});

function apiOrder(overrides: Record<string, unknown> = {}) {
  return {
    id: '00000000-0000-4000-8000-00000000000a',
    reference: 'ORD-LIVE-001',
    channel_code: 'pos',
    status: 'placed',
    payment_status: 'pending',
    fulfillment_status: 'pending',
    currency: 'VND',
    item_count: 2,
    total_minor: 1980000,
    placed_at: '2026-10-13T02:00:00Z',
    updated_at: '2026-10-13T02:05:00Z',
    items: [
      { variant_id: 'v-1', reservation_id: 'r-1', sku: 'SHOE-001-BLK-42', name: 'Running Shoe 001', quantity: 2, unit_price_minor: 990000, line_total_minor: 1980000 },
    ],
    ...overrides,
  };
}

const live = (order: unknown) => getOrder.mockImplementation(() => Promise.resolve(order));
const offline = () => getOrder.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));

// The live order is identified by what it RENDERS, not by a badge: the API panel and its
// lifecycle card exist only for a row the server sent. A fixture order has neither.
async function renderLive(order: unknown = apiOrder()) {
  live(order);
  getOrderHistory.mockResolvedValue({ history: [] });
  getOrderReturns.mockResolvedValue({ returns: [], returnable_items: [] });
  render(<OrderDetailPage id="00000000-0000-4000-8000-00000000000a" mode="default" />);
  await waitFor(() => expect(screen.getByRole('heading', { level: 1, name: 'ORD-LIVE-001' })).toBeInTheDocument());
}

describe('OrderDetailPage · live API', () => {
  it('requires Shopify handover preflight and confirmation before queuing fulfillment', async () => {
    useAuth.mockReturnValue({ user: { role: 'ADMIN' } });
    getShopifyFulfillmentStatus.mockResolvedValue({
      order_id: '00000000-0000-4000-8000-00000000000a',
      shopify_order_id: 'gid://shopify/Order/123',
      core_status: 'packed', core_fulfillment_status: 'picking',
      shopify_fulfillment_status: 'IN_PROGRESS',
      fulfillment_order_ids: ['gid://shopify/FulfillmentOrder/456'],
      handover_eligible: true, eligible: false, progress_state: 'verified',
      progress_attempt_count: 1, sync_state: 'in_sync', permission_verified: false,
    });
    getShopifyStatus.mockResolvedValue({ write_enabled: true });
    transitionOrder.mockResolvedValue(apiOrder({ status: 'shipped', channel_code: 'shopify' }));
    await renderLive(apiOrder({ status: 'packed', channel_code: 'shopify' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Bàn giao vận chuyển' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận bàn giao vận chuyển Shopify' });
    await waitFor(() => expect(within(dialog).getByText(/FulfillmentOrder:/)).toBeInTheDocument());
    expect(transitionOrder).not.toHaveBeenCalled();
    expect(createShopifyFulfillment).not.toHaveBeenCalled();
    expect(within(dialog).queryByLabelText('Đơn vị vận chuyển')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Mã vận đơn')).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Xác nhận và gửi Shopify' }));
    await waitFor(() => expect(transitionOrder).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-00000000000a', { status: 'shipped' }, expect.any(String),
    ));
    expect(createShopifyFulfillment).not.toHaveBeenCalled();
  });

  it('reconciles an already fulfilled Shopify order without creating a second fulfillment', async () => {
    useAuth.mockReturnValue({ user: { role: 'ADMIN' } });
    getShopifyFulfillmentStatus.mockResolvedValue({
      order_id: '00000000-0000-4000-8000-00000000000a',
      shopify_order_id: 'gid://shopify/Order/123',
      core_status: 'packed', core_fulfillment_status: 'shipped',
      shopify_fulfillment_status: 'FULFILLED',
      fulfillment_order_ids: ['gid://shopify/FulfillmentOrder/456'],
      handover_eligible: false, fulfillment_recovery_eligible: true,
      handover_blocked_reason: 'SHOPIFY_ORDER_ALREADY_FULFILLED',
      sync_state: 'conflict', permission_verified: false,
    });
    getShopifyStatus.mockResolvedValue({ write_enabled: true });
    transitionOrder.mockResolvedValue(apiOrder({ status: 'shipped', channel_code: 'shopify' }));
    await renderLive(apiOrder({ status: 'packed', channel_code: 'shopify' }));

    fireEvent.click(screen.getAllByRole('button', { name: 'Bàn giao vận chuyển' })[0]!);
    const dialog = screen.getByRole('dialog', { name: 'Xác nhận bàn giao vận chuyển Shopify' });
    await waitFor(() => expect(within(dialog).getByRole('status')).toHaveTextContent('không gửi thêm fulfillment'));
    const reconcile = within(dialog).getByRole('button', { name: 'Đối soát fulfillment đã có' });
    expect(reconcile).toBeEnabled();
    expect(within(dialog).getByRole('status')).toHaveTextContent('không gửi thêm fulfillment');
    fireEvent.click(reconcile);

    await waitFor(() => expect(transitionOrder).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-00000000000a', { status: 'shipped' }, expect.any(String),
    ));
    expect(createShopifyFulfillment).not.toHaveBeenCalled();
  });

  it('renders the live order with its lines and total', async () => {
    await renderLive();

    // The reference is both the page heading and the panel heading; assert on the level-1 one
    // so the test says which element it means.
    expect(screen.getByRole('heading', { level: 1, name: 'ORD-LIVE-001' })).toBeInTheDocument();
    expect(screen.getByText('SHOE-001-BLK-42')).toBeInTheDocument();
    // Twice on purpose: the order total and the single line total are the same number here
    // (2 x 990000), and asserting both is what proves neither was recomputed in the browser.
    expect(screen.getAllByText('1.980.000 ₫')).toHaveLength(2);
    // The live panel says plainly that the server has no history for this order, instead of
    // drawing a journey it never recorded.
    expect(screen.getByLabelText('Chi tiết ORD-LIVE-001')).toHaveTextContent('Chưa có lịch sử thay đổi trạng thái của đơn này.');
  });

  it('shows Shopify fulfillment evidence on a Shopify order detail', async () => {
    getShopifyFulfillmentStatus.mockResolvedValue({
      order_id: '00000000-0000-4000-8000-00000000000a',
      shopify_order_id: 'gid://shopify/Order/123',
      core_status: 'packed',
      core_fulfillment_status: 'picking',
      shopify_fulfillment_status: 'UNFULFILLED',
      eligible: false,
      blocked_reason: 'CORE_ORDER_NOT_SHIPPED',
      progress_state: 'pending', progress_attempt_count: 0, sync_state: 'pending',
      permission_verified: false,
    });
    getShopifyStatus.mockResolvedValue({ shop_domain: 'octoflow-dev.myshopify.com', write_enabled: true });

    await renderLive(apiOrder({ channel_code: 'shopify' }));

    expect(await screen.findByText('Chưa fulfillment')).toBeInTheDocument();
    expect(screen.getByText('Đang chờ đồng bộ')).toBeInTheDocument();
    expect(screen.getByLabelText('Shopify fulfillment')).toBeInTheDocument();
  });

  it('only offers Shopify fulfillment to an administrator when eligibility is confirmed', async () => {
    useAuth.mockReturnValue({ user: { role: 'ADMIN' } });
    getShopifyFulfillmentStatus.mockResolvedValue({
      order_id: '00000000-0000-4000-8000-00000000000a',
      shopify_order_id: 'gid://shopify/Order/123',
      core_status: 'shipped',
      core_fulfillment_status: 'shipped',
      shopify_fulfillment_status: 'UNFULFILLED',
      eligible: true,
      permission_verified: false,
    });
    getShopifyStatus.mockResolvedValue({ shop_domain: 'octoflow-dev.myshopify.com', write_enabled: true });

    await renderLive(apiOrder({ channel_code: 'shopify' }));

    expect(await screen.findByRole('button', { name: 'Kiểm tra trước khi gửi' })).toBeInTheDocument();
    expect(createShopifyFulfillment).not.toHaveBeenCalled();
  });

  it('allows administrators to reconcile a verified existing fulfillment for a shipped order', async () => {
    useAuth.mockReturnValue({ user: { role: 'ADMIN' } });
    getShopifyFulfillmentStatus.mockResolvedValue({
      order_id: '00000000-0000-4000-8000-00000000000a',
      shopify_order_id: 'gid://shopify/Order/123',
      core_status: 'shipped', core_fulfillment_status: 'shipped',
      shopify_fulfillment_status: 'FULFILLED', eligible: false,
      handover_eligible: false, fulfillment_recovery_eligible: true,
      sync_state: 'conflict', permission_verified: false,
    });
    getShopifyStatus.mockResolvedValue({ write_enabled: false });
    createShopifyFulfillment.mockResolvedValue({ record_state: 'succeeded' });
    await renderLive(apiOrder({ channel_code: 'shopify', status: 'shipped', fulfillment_status: 'shipped' }));

    const panel = screen.getByLabelText('Shopify fulfillment');
    fireEvent.click(await within(panel).findByRole('button', { name: 'Đối soát fulfillment đã có' }));
    await waitFor(() => expect(createShopifyFulfillment).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-00000000000a', {},
    ));
    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it('confirms an optional-tracking Shopify fulfillment before creating it', async () => {
    useAuth.mockReturnValue({ user: { role: 'ADMIN' } });
    getShopifyFulfillmentStatus.mockResolvedValue({
      order_id: '00000000-0000-4000-8000-00000000000a',
      shopify_order_id: 'gid://shopify/Order/123',
      core_status: 'shipped', core_fulfillment_status: 'shipped',
      shopify_fulfillment_status: 'IN_PROGRESS', eligible: true,
      handover_eligible: false, progress_attempt_count: 1,
      sync_state: 'pending', permission_verified: false,
    });
    getShopifyStatus.mockResolvedValue({ write_enabled: true });
    createShopifyFulfillment.mockResolvedValue({ record_state: 'succeeded' });
    await renderLive(apiOrder({ channel_code: 'shopify', status: 'shipped', fulfillment_status: 'shipped' }));
    const panel = screen.getByLabelText('Shopify fulfillment');
    await within(panel).findByRole('button', { name: 'Kiểm tra trước khi gửi' });
    expect(within(panel).queryByLabelText('Đơn vị vận chuyển')).not.toBeInTheDocument();
    expect(within(panel).queryByLabelText('Mã vận đơn')).not.toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Kiểm tra trước khi gửi' }));
    expect(createShopifyFulfillment).not.toHaveBeenCalled();
    fireEvent.click(within(panel).getByRole('button', { name: 'Xác nhận tạo fulfillment Shopify' }));
    await waitFor(() => expect(createShopifyFulfillment).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-00000000000a', {},
    ));
  });

  it('requires an explicit confirmation and records manual payment with a stable key', async () => {
    await renderLive();
    confirmOrderPayment.mockResolvedValue(apiOrder({ payment_status: 'paid' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ghi nhận đã thu tiền' }));
    expect(screen.getByRole('dialog', { name: 'Xác nhận thanh toán thủ công' })).toBeInTheDocument();
    expect(screen.getByText(/không phải xác minh từ ngân hàng/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText(/Ghi chú/), { target: { value: 'Tiền mặt tại quầy' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã thu' }));
    await waitFor(() => expect(confirmOrderPayment).toHaveBeenCalledWith(
      '00000000-0000-4000-8000-00000000000a', 'Tiền mặt tại quầy', 'payment-ui-00000000-0000-4000-8000-00000000000a',
    ));
  });

  it('offers only the moves the API allows and hides cancel once the goods have left', async () => {
    await renderLive(apiOrder({ status: 'delivered', fulfillment_status: 'delivered' }));

    // Delivered is terminal: the edge list has no exit, so neither button is offered.
    expect(screen.queryByRole('button', { name: /Xác nhận đơn/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Hủy đơn/ })).toBeNull();
    expect(screen.getByText(/Đơn đã giao/)).toBeInTheDocument();
  });

  it('warns that a packed order must be physically unpacked before cancelling', async () => {
    await renderLive(apiOrder({ status: 'packed', fulfillment_status: 'shipped' }));

    // The stock is restored by the API, but the parcel on the bench is not: the seller needs
    // to be told the units are only back on the shelf once someone unpacks them.
    expect(screen.getByText(/đơn đã đóng gói/)).toBeInTheDocument();
    expect(screen.getByText(/bóc kiện và xếp hàng trở lại kệ kho/)).toBeInTheDocument();
  });

  it('refuses to cancel without a reason, because the reason is the only record left', async () => {
    await renderLive();

    const cancel = screen.getByRole('button', { name: /Hủy đơn/ });
    expect(cancel).toBeDisabled();
    fireEvent.change(screen.getByLabelText(/Lý do hủy/), { target: { value: 'Khách đổi ý' } });
    await waitFor(() => expect(screen.getByRole('button', { name: /Hủy đơn/ })).toBeEnabled());
    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it('sends a key derived from the order and target, not from the click', async () => {
    await renderLive();
    transitionOrder.mockImplementation(() => Promise.resolve(apiOrder({ status: 'cancelled', cancelled_reason: 'Khách đổi ý' })));

    fireEvent.change(screen.getByLabelText(/Lý do hủy/), { target: { value: 'Khách đổi ý' } });
    fireEvent.click(screen.getByRole('button', { name: /Hủy đơn/ }));

    await waitFor(() => expect(transitionOrder).toHaveBeenCalled());
    const [orderId, body, key] = transitionOrder.mock.calls[0] as [string, { status: string; reason?: string }, string];
    expect(orderId).toBe('00000000-0000-4000-8000-00000000000a');
    expect(body).toEqual({ status: 'cancelled', reason: 'Khách đổi ý' });
    // The whole point: cancelling restocks, so the key must be stable per (order, target) or a
    // retry after a lost acknowledgement would put the units back on the shelf twice.
    expect(key).toContain('00000000-0000-4000-8000-00000000000a');
    expect(key).toContain('cancelled');
  });

  it('keeps the server message when a move is refused', async () => {
    // The constructor takes the wire field name, `request_id`, not the class's own
    // `requestId`. Passing the camelCase one silently yields an undefined request id and a
    // support panel with nothing to quote.
    transitionOrder.mockImplementation(() => Promise.reject(new ApiRequestError({
      code: 'STATE_CONFLICT',
      message: 'This order cannot move to that status from where it is now',
      request_id: 'req-9',
    })));
    await renderLive(apiOrder({ status: 'confirmed' }));

    fireEvent.click(screen.getByRole('button', { name: /Đóng gói/ }));
    // The alert presents the code's operator sentence rather than the raw message, and it
    // says the right thing to do: reload, then try again. Both are asserted because a
    // generic "something went wrong" would satisfy neither.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Dữ liệu đã thay đổi'));
    expect(screen.getByRole('alert')).toHaveTextContent('Hãy tải lại rồi thử lại');
    expect(screen.getByRole('alert')).toHaveTextContent('req-9');
  });

  it('falls back to the prototype dossier when the API is unreachable', async () => {
    offline();
    render(<OrderDetailPage id="20000000-0000-4000-8000-000000000001" mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Tiến trình đơn hàng (mẫu)' })).toBeInTheDocument());
    // The live lifecycle card belongs to a live order alone. Offering it over a fixture row
    // would send a PATCH for an order the API has never heard of.
    expect(screen.queryByLabelText('Vòng đời đơn hàng')).toBeNull();
    // The prototype panel does draw a "Hủy đơn" button, but it is disabled: a cashier must
    // not be able to press it and believe an order was cancelled.
    expect(screen.getByRole('button', { name: 'Hủy đơn' })).toBeDisabled();
    expect(transitionOrder).not.toHaveBeenCalled();
  });

  it('says an unknown id is missing rather than unreachable', async () => {
    getOrder.mockImplementation(() => Promise.reject(new ApiRequestError({
      code: 'ORDER_NOT_FOUND',
      message: 'Order was not found',
      request_id: 'req-404',
    }, 404)));
    render(<OrderDetailPage id="30000000-0000-4000-8000-0000000000ff" mode="default" />);
    // A 404 is not a broken connection and not an empty list. Rendering it as "cannot
    // connect" would send an operator to check a network that is working fine — and falling
    // back to the prototype baseline would put a DIFFERENT order on screen under this URL.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy đơn hàng'));
  });
});
