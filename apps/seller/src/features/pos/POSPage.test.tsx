import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { POSPage } from './POSPage';

const { listInventory, getInventoryRowBySku, createOrder, getOrder, confirmOrderPayment } = vi.hoisted(() => ({
  listInventory: vi.fn(),
  getInventoryRowBySku: vi.fn(),
  createOrder: vi.fn(),
  getOrder: vi.fn(),
  confirmOrderPayment: vi.fn(),
}));
vi.mock('../../api/inventory', () => ({ listInventory, getInventoryRowBySku }));
vi.mock('../../api/orders', () => ({ createOrder, getOrder, confirmOrderPayment }));

const inventoryRow = (overrides: Record<string, unknown> = {}) => ({
  variant_id: '20000000-0000-4000-8000-000000000001',
  product_id: '10000000-0000-4000-8000-000000000001',
  sku: 'SHOE-001-BLK-42',
  product_name: 'Running Shoe 001',
  category: 'FOOTWEAR',
  color: 'BLACK',
  size: '42',
  price_minor: 990000,
  currency: 'VND',
  on_hand: 12,
  reserved: 3,
  safety_buffer: 2,
  available_to_sell: 7,
  pos_mode: 'shared',
  desired_pos_mode: 'shared',
  desired_pos_quota: 0,
  active_pos_quota: 0,
  pos_remaining: 0,
  pos_revision: 1,
  pos_transition_state: 'stable',
  online_budget: 7,
  pos_sellable: 7,
  version: 4,
  ...overrides,
});

const orderPending = {
  id: '30000000-0000-4000-8000-000000000001',
  reference: 'POS-20261004-0001',
  channel_code: 'pos',
  status: 'confirmed',
  payment_status: 'pending',
  fulfillment_status: 'pending',
  currency: 'VND',
  item_count: 1,
  total_minor: 990000,
  items: [{
    variant_id: '20000000-0000-4000-8000-000000000001',
    reservation_id: '40000000-0000-4000-8000-000000000001',
    sku: 'SHOE-001-BLK-42',
    name: 'Running Shoe 001',
    quantity: 1,
    unit_price_minor: 990000,
    line_total_minor: 990000,
  }],
  placed_at: '2026-10-04T09:00:00Z',
  updated_at: '2026-10-04T09:00:00Z',
};
const orderPaid = { ...orderPending, payment_status: 'paid' };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.localStorage.clear();
  window.sessionStorage.clear();
  window.history.replaceState({}, '', '/pos');
  vi.stubGlobal('navigator', window.navigator);
});

async function renderLive(rows = [inventoryRow()], snapshots: Record<string, ReturnType<typeof inventoryRow>> = {}, canManageAllocation = false) {
  listInventory.mockResolvedValue({ items: rows, nextCursor: null });
  getInventoryRowBySku.mockImplementation(async (sku: string) => snapshots[sku] ?? rows.find((row) => row.sku === sku) ?? inventoryRow({ sku }));
  render(<POSPage mode="default" userId="user-1" canManageAllocation={canManageAllocation} />);
  await waitFor(() => expect(screen.getByLabelText('Danh mục sản phẩm')).toHaveTextContent('Running Shoe 001'));
}

function addShoe() {
  fireEvent.click(screen.getByRole('button', { name: 'Thêm SHOE-001-BLK-42 vào giỏ' }));
}

function enterCash(value = '1000000') {
  fireEvent.change(screen.getByRole('textbox', { name: 'Tiền khách đưa' }), { target: { value } });
}

function confirmSale() {
  fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền và tạo đơn' }));
}

describe('POSPage', () => {
  it('renders a live catalogue, mobile pane controls, and an empty disabled checkout', async () => {
    await renderLive();
    expect(screen.getByRole('heading', { level: 1, name: 'Bán tại quầy' })).toBeInTheDocument();
    expect(screen.getByLabelText('Danh mục sản phẩm')).toHaveTextContent('990.000');
    expect(screen.getByRole('button', { name: 'Danh mục (1)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Giỏ hàng (0)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền và tạo đơn' })).toBeDisabled();
  });

  it('caps a Dedicated POS basket at backend POS remaining, not Core ATS', async () => {
    await renderLive([inventoryRow({
      available_to_sell: 18,
      pos_mode: 'dedicated',
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      active_pos_quota: 4,
      pos_remaining: 2,
      pos_revision: 7,
      pos_transition_state: 'stable',
      online_budget: 16,
      pos_sellable: 2,
    })]);

    const stock = screen.getByLabelText('Tồn kho SHOE-001-BLK-42');
    expect(stock).toHaveTextContent('Core ATS18');
    expect(stock).toHaveTextContent('POS được phép bán2');
    addShoe();
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng SHOE-001-BLK-42' }));
    expect(screen.getByRole('button', { name: 'Tăng số lượng SHOE-001-BLK-42' })).toBeDisabled();
    expect(screen.getByLabelText('Danh sách sản phẩm trong giỏ')).toHaveTextContent('2');
  });

  it('shows that POS quota is empty while Core stock remains', async () => {
    await renderLive([inventoryRow({
      available_to_sell: 18,
      pos_mode: 'dedicated',
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      active_pos_quota: 4,
      pos_remaining: 0,
      pos_revision: 8,
      pos_transition_state: 'stable',
      online_budget: 18,
      pos_sellable: 0,
    })]);

    expect(screen.getByText('POS đã hết tồn được phân bổ. Kho trung tâm vẫn còn hàng dành cho các kênh khác.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Hết quota POS SHOE-001-BLK-42' })).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Mở phân bổ tồn POS' })).not.toBeInTheDocument();
  });

  it('lets Admin open the allocation screen from an exhausted POS SKU', async () => {
    await renderLive([inventoryRow({
      available_to_sell: 18,
      pos_mode: 'dedicated',
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      active_pos_quota: 4,
      pos_remaining: 0,
      pos_revision: 8,
      pos_transition_state: 'stable',
      online_budget: 18,
      pos_sellable: 0,
    })], {}, true);

    expect(screen.getByRole('button', { name: 'Mở phân bổ tồn POS' })).toBeEnabled();
  });

  it('shows missing-price variants but prevents adding them to the basket', async () => {
    const missing = inventoryRow({ variant_id: '20000000-0000-4000-8000-000000000002', sku: 'BAG-NO-PRICE', product_name: 'Bag without price', price_minor: null });
    await renderLive([inventoryRow(), missing]);
    expect(screen.getAllByText('Chưa có giá').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Chưa có giá cho BAG-NO-PRICE' })).toBeDisabled();
  });

  it('shows out-of-stock variants but prevents adding them to the basket', async () => {
    const unavailable = inventoryRow({ variant_id: '20000000-0000-4000-8000-000000000003', sku: 'SHOE-OUT-OF-STOCK', available_to_sell: 0, pos_sellable: 0 });
    await renderLive([unavailable]);
    expect(screen.getByRole('button', { name: 'Hết hàng SHOE-OUT-OF-STOCK' })).toBeDisabled();
  });

  it('rejects products from a different currency instead of creating a mixed basket', async () => {
    const usd = inventoryRow({ variant_id: '20000000-0000-4000-8000-000000000002', sku: 'BAG-USD-01', product_name: 'USD Bag', category: 'ACCESSORIES', price_minor: 1200, currency: 'USD' });
    await renderLive([inventoryRow(), usd]);
    addShoe();
    fireEvent.click(screen.getByRole('button', { name: 'Thêm BAG-USD-01 vào giỏ' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Không thể thêm BAG-USD-01');
    expect(screen.getByLabelText('Danh sách sản phẩm trong giỏ')).toHaveTextContent('Running Shoe 001');
    expect(screen.getByLabelText('Danh sách sản phẩm trong giỏ')).not.toHaveTextContent('USD Bag');
  });

  it('keeps fixture mode read only and never creates an order', async () => {
    listInventory.mockRejectedValue(new Error('network down'));
    render(<POSPage mode="default" userId="user-1" />);
    await waitFor(() => expect(screen.getByLabelText('Danh mục sản phẩm')).toBeInTheDocument());
    addShoe();
    expect(screen.getByText(/Dữ liệu minh họa · không thể bán/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền và tạo đơn' })).toBeDisabled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('records cash, change, order creation, and payment before clearing the cart', async () => {
    createOrder.mockResolvedValue(orderPending);
    confirmOrderPayment.mockResolvedValue(orderPaid);
    await renderLive();
    addShoe();
    enterCash();
    expect(screen.getByText(/Tiền thừa:/)).toHaveTextContent('10.000');
    confirmSale();

    await waitFor(() => expect(confirmOrderPayment).toHaveBeenCalledTimes(1));
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(createOrder.mock.calls[0]?.[0]).toMatchObject({ channel_code: 'pos', lines: [{ sku: 'SHOE-001-BLK-42', quantity: 1 }] });
    expect(confirmOrderPayment.mock.calls[0]?.[0]).toBe(orderPending.id);
    expect(confirmOrderPayment.mock.calls[0]?.[1]).toContain('received_minor=1000000');
    expect(confirmOrderPayment.mock.calls[0]?.[1]).toContain('change_minor=10000');
    expect(confirmOrderPayment.mock.calls[0]?.[2]).toMatch(/^[A-Za-z0-9._:-]{1,128}$/);
    expect(await screen.findByText('Đã hoàn tất bán hàng và ghi nhận thanh toán')).toBeInTheDocument();
    expect(screen.getByLabelText('Danh sách sản phẩm trong giỏ')).toHaveTextContent('Giỏ hàng đang trống');
  });

  it('does not create an order until cash received covers the total', async () => {
    await renderLive();
    addShoe();
    enterCash('500000');
    expect(screen.getByText('Tiền khách đưa chưa đủ để thanh toán.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền và tạo đơn' })).toBeDisabled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('requires explicit review before applying a reduced fresh-stock quantity', async () => {
    const reducedStock = inventoryRow({ available_to_sell: 1, pos_sellable: 1, on_hand: 6, reserved: 3, safety_buffer: 2 });
    await renderLive([inventoryRow()], { 'SHOE-001-BLK-42': reducedStock });
    addShoe();
    fireEvent.click(screen.getByRole('button', { name: 'Tăng số lượng SHOE-001-BLK-42' }));
    enterCash('2000000');
    confirmSale();

    const review = await screen.findByRole('region', { name: 'Giá hoặc tồn khả dụng đã thay đổi' });
    expect(review).toHaveTextContent('Số lượng: 2 → 1');
    expect(review).toHaveTextContent('Tổng trước: 1.980.000');
    expect(review).toHaveTextContent('Tổng sau khi xác nhận: 990.000');
    expect(createOrder).not.toHaveBeenCalled();
    fireEvent.click(within(review).getByRole('button', { name: 'Xác nhận giỏ hàng mới' }));
    expect(screen.getByRole('button', { name: 'Giảm số lượng SHOE-001-BLK-42' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Tăng số lượng SHOE-001-BLK-42' })).toBeDisabled();
    expect(createOrder).not.toHaveBeenCalled();
  });

  it('requires explicit review and fresh tender when the server price changed before checkout', async () => {
    const repriced = inventoryRow({ price_minor: 1050000 });
    await renderLive([inventoryRow()], { 'SHOE-001-BLK-42': repriced });
    addShoe();
    enterCash('1000000');
    confirmSale();

    const review = await screen.findByRole('region', { name: 'Giá hoặc tồn khả dụng đã thay đổi' });
    expect(review).toHaveTextContent(/Đơn giá: 990\.000 ₫ → 1\.050\.000 ₫/);
    expect(review).toHaveTextContent(/Tổng trước: 990\.000 ₫/);
    expect(review).toHaveTextContent(/Tổng sau khi xác nhận: 1\.050\.000 ₫/);
    expect(createOrder).not.toHaveBeenCalled();
    fireEvent.click(within(review).getByRole('button', { name: 'Xác nhận giỏ hàng mới' }));
    expect(screen.getByRole('textbox', { name: 'Tiền khách đưa' })).toHaveValue('');
    expect(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền và tạo đơn' })).toBeDisabled();
  });

  it('locks the basket and reuses a saved payment operation after a timeout', async () => {
    createOrder.mockResolvedValue(orderPending);
    confirmOrderPayment.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(orderPaid);
    getOrder.mockResolvedValue(orderPending);
    await renderLive();
    addShoe();
    enterCash();
    confirmSale();
    await waitFor(() => expect(confirmOrderPayment).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Chưa xác định được kết quả xác nhận thanh toán.')).toBeInTheDocument();
    const firstKey = confirmOrderPayment.mock.calls[0]?.[2];

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra hoặc gửi lại xác nhận thanh toán' }));
    await waitFor(() => expect(confirmOrderPayment).toHaveBeenCalledTimes(2));
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(confirmOrderPayment.mock.calls[1]?.[2]).toBe(firstKey);
    expect(await screen.findByText('Đã hoàn tất bán hàng và ghi nhận thanh toán')).toBeInTheDocument();
  });

  it('holds payment when the order response uses a newer price and shows its actual total', async () => {
    const repriced = {
      ...orderPending,
      total_minor: 1050000,
      items: [{ ...orderPending.items[0], unit_price_minor: 1050000, line_total_minor: 1050000 }],
    };
    createOrder.mockResolvedValue(repriced);
    await renderLive([inventoryRow()]);
    addShoe();
    enterCash('1200000');
    confirmSale();

    expect(await screen.findByText(/Giá hoặc loại tiền của SKU đã đổi/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getAllByText(/1\.050\.000/).length).toBeGreaterThan(0));
    expect(screen.getByRole('textbox', { name: 'Tiền khách đưa' })).toHaveValue('');
    expect(confirmOrderPayment).not.toHaveBeenCalled();
    expect(createOrder).toHaveBeenCalledTimes(1);
  });

  it('keeps an unknown order response and retries with the same create idempotency key', async () => {
    createOrder.mockRejectedValueOnce(new Error('response lost')).mockResolvedValueOnce(orderPending);
    confirmOrderPayment.mockResolvedValue(orderPaid);
    await renderLive();
    addShoe();
    enterCash();
    confirmSale();
    expect(await screen.findByText('Chưa xác định được kết quả tạo đơn.')).toBeInTheDocument();
    const [firstInput, firstKey] = createOrder.mock.calls[0] as [unknown, string];

    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra hoặc gửi lại đơn hàng' }));
    await waitFor(() => expect(confirmOrderPayment).toHaveBeenCalledTimes(1));
    expect(createOrder).toHaveBeenCalledTimes(2);
    expect(createOrder.mock.calls[1]?.[0]).toEqual(firstInput);
    expect(createOrder.mock.calls[1]?.[1]).toBe(firstKey);
  });

  it('preserves the intended quantity after a stock conflict and asks for review', async () => {
    const reducedStock = inventoryRow({ available_to_sell: 1, pos_sellable: 1, on_hand: 6, reserved: 3, safety_buffer: 2 });
    createOrder.mockRejectedValue(new ApiRequestError({ code: 'INSUFFICIENT_STOCK', message: 'stock changed', request_id: 'req-pos' }, 409));
    getInventoryRowBySku.mockResolvedValueOnce(inventoryRow()).mockResolvedValueOnce(reducedStock);
    listInventory.mockResolvedValue({ items: [inventoryRow()], nextCursor: null });
    render(<POSPage mode="default" userId="user-1" />);
    await waitFor(() => expect(screen.getByLabelText('Danh mục sản phẩm')).toBeInTheDocument());
    addShoe();
    enterCash();
    confirmSale();

    expect(await screen.findByRole('region', { name: 'Giá hoặc tồn khả dụng đã thay đổi' })).toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(screen.getByLabelText('Danh sách sản phẩm trong giỏ')).toHaveTextContent('Running Shoe 001');
  });

  it('explains a POS quota rejection and keeps the sale unconfirmed', async () => {
    const dedicated = inventoryRow({
      available_to_sell: 18,
      pos_mode: 'dedicated',
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      active_pos_quota: 4,
      pos_remaining: 2,
      pos_revision: 7,
      pos_transition_state: 'stable',
      online_budget: 16,
      pos_sellable: 2,
    });
    createOrder.mockRejectedValue(new ApiRequestError({ code: 'POS_QUOTA_INSUFFICIENT', message: 'insufficient', request_id: 'req-pos' }, 409));
    await renderLive([dedicated]);
    addShoe();
    enterCash();
    confirmSale();

    expect(await screen.findByText(/POS không còn đủ quota/)).toBeInTheDocument();
    expect(createOrder).toHaveBeenCalledTimes(1);
    expect(confirmOrderPayment).not.toHaveBeenCalled();
    expect(screen.queryByText('Đã hoàn tất bán hàng và ghi nhận thanh toán')).not.toBeInTheDocument();
  });

  it('offers server pagination instead of silently stopping at the first inventory page', async () => {
    listInventory.mockResolvedValueOnce({ items: [inventoryRow()], nextCursor: 'next-page' })
      .mockResolvedValueOnce({ items: [inventoryRow({ variant_id: '20000000-0000-4000-8000-000000000002', sku: 'SHOE-PAGE-2', product_name: 'Second page shoe' })], nextCursor: null });
    getInventoryRowBySku.mockResolvedValue(inventoryRow());
    render(<POSPage mode="default" userId="user-1" />);
    await waitFor(() => expect(screen.getByLabelText('Danh mục sản phẩm')).toHaveTextContent('Running Shoe 001'));
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm sản phẩm' }));
    await waitFor(() => expect(screen.getByLabelText('Danh mục sản phẩm')).toHaveTextContent('Second page shoe'));
    expect(listInventory).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: 'next-page' }), expect.anything());
  });

  it('does not create new sales while offline', async () => {
    await renderLive();
    addShoe();
    enterCash();
    act(() => { window.dispatchEvent(new Event('offline')); });
    expect(screen.getByText('Mất kết nối mạng.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xác nhận đã nhận tiền và tạo đơn' })).toBeDisabled();
    expect(createOrder).not.toHaveBeenCalled();
  });
});
