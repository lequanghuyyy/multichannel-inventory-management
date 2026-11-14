import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { InventoryDetailPage } from './InventoryDetailPage';

const { adjustInventory, getInventoryAdjustmentLedger, getInventoryBySku } = vi.hoisted(() => ({
  adjustInventory: vi.fn(),
  getInventoryAdjustmentLedger: vi.fn(),
  getInventoryBySku: vi.fn(),
}));
vi.mock('../../api/inventory', () => ({ adjustInventory, getInventoryAdjustmentLedger, getInventoryBySku }));

const snapshot = {
  variant_id: 'variant-42', product_id: 'product-1', sku: 'SHOE-001-BLK-42', color: 'BLACK', size: '42',
  on_hand: 10, reserved: 8, safety_buffer: 1, available_to_sell: 42, version: 7,
};
const adjustment = {
  id: 1, variant_id: 'variant-42', sku: 'SHOE-001-BLK-42', event: 'adjustment', delta: -2,
  on_hand_before: 10, on_hand_after: 8, reserved: 8, safety_buffer: 1, available_to_sell: 42,
  reason: 'Hàng lỗi', created_at: '2026-10-06T08:00:00Z',
};

function mockLoaded(ledger: unknown[] = []) {
  getInventoryBySku.mockResolvedValue(snapshot);
  getInventoryAdjustmentLedger.mockResolvedValue(ledger);
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/inventory/SHOE-001-BLK-42');
});

describe('InventoryDetailPage', () => {
  it('hides the ADMIN-only adjustment action from STAFF', async () => {
    mockLoaded();
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" canAdjust={false} />);
    await waitFor(() => expect(screen.getByLabelText('Tồn kho hiện tại')).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Điều chỉnh tồn' })).toBeNull();
    expect(adjustInventory).not.toHaveBeenCalled();
  });

  it('renders the backend balance and an empty server ledger', async () => {
    mockLoaded();
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" />);

    await waitFor(() => expect(screen.getByLabelText('Tồn kho hiện tại')).toBeInTheDocument());
    // The four canonical numbers come from the backend, and the formula line spells out which
    // three of them produced the fourth. 42 is the backend's own figure and does NOT equal
    // 10 - 8 - 1: the client must not recompute it.
    const metrics = screen.getByLabelText('Tồn kho hiện tại');
    expect(metrics).toHaveTextContent('Có thể bán = Tồn kho (10) − Đang giữ (8) − Tồn đệm an toàn (1)');
    expect(metrics).toHaveTextContent('Phiên bản 7');
    expect(metrics).toHaveTextContent('42');
    expect(screen.getByText('SKU này chưa có biến động tồn kho.')).toBeInTheDocument();
  });

  it('submits a valid adjustment once and refreshes balance plus ledger from the server', async () => {
    const updated = { ...snapshot, on_hand: 8, reserved: 2, safety_buffer: 1, available_to_sell: 5, version: 8 };
    getInventoryBySku.mockResolvedValueOnce(snapshot).mockResolvedValue(updated);
    getInventoryAdjustmentLedger.mockResolvedValueOnce([]).mockResolvedValue([adjustment]);
    adjustInventory.mockResolvedValue(updated);
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Điều chỉnh tồn' })).toBeEnabled());

    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh tồn' }));
    fireEvent.change(screen.getByLabelText('Loại điều chỉnh'), { target: { value: 'decrease' } });
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Hàng lỗi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận điều chỉnh' }));

    await waitFor(() => expect(adjustInventory).toHaveBeenCalledTimes(1));
    expect(adjustInventory).toHaveBeenCalledWith({ sku: 'SHOE-001-BLK-42', delta: -2, reason: 'Hàng lỗi' }, expect.stringMatching(/^adjust-SHOE-001-BLK-42-/));
    await waitFor(() => expect(getInventoryBySku).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(getInventoryAdjustmentLedger).toHaveBeenCalledTimes(2));
    // The new version proves the screen re-read the balance from the server rather than
    // patching the number it already had.
    expect(screen.getByLabelText('Tồn kho hiện tại')).toHaveTextContent('Phiên bản 8');
    expect(screen.getAllByText('Hàng lỗi').length).toBeGreaterThan(0);
  });

  it('does not mutate client balance or ledger when backend rejects the adjustment', async () => {
    mockLoaded();
    adjustInventory.mockRejectedValue(new ApiRequestError({ code: 'INSUFFICIENT_BUFFER', message: 'backend reason', request_id: 'req-adjust-1' }));
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Điều chỉnh tồn' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh tồn' }));
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '20' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Hàng lỗi' } });
    fireEvent.change(screen.getByLabelText('Loại điều chỉnh'), { target: { value: 'decrease' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận điều chỉnh' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể giảm tồn kho'));
    // The balance on screen is still the server's, unchanged.
    expect(screen.getByLabelText('Tồn kho hiện tại')).toHaveTextContent('Phiên bản 7');
    expect(getInventoryBySku).toHaveBeenCalledTimes(1);
    expect(getInventoryAdjustmentLedger).toHaveBeenCalledTimes(1);
  });

  it('rejects empty, zero and whitespace-only form values before the request', async () => {
    mockLoaded();
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Điều chỉnh tồn' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh tồn' }));
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '0' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: '   ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận điều chỉnh' }));
    expect(screen.getByText('Nhập số lượng nguyên lớn hơn 0.')).toBeInTheDocument();
    expect(screen.getByText('Lý do là bắt buộc.')).toBeInTheDocument();
    expect(adjustInventory).not.toHaveBeenCalled();
  });

  it('prevents double submit while the mutation is pending', async () => {
    mockLoaded();
    let resolve: ((value: typeof snapshot) => void) | undefined;
    adjustInventory.mockImplementation(() => new Promise<typeof snapshot>((complete) => { resolve = complete; }));
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Điều chỉnh tồn' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh tồn' }));
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Kiểm kê' } });
    const submit = screen.getByRole('button', { name: 'Xác nhận điều chỉnh' });
    fireEvent.click(submit);
    fireEvent.click(submit);
    expect(adjustInventory).toHaveBeenCalledTimes(1);
    resolve?.(snapshot);
  });

  it('shows permission denial from the backend', async () => {
    mockLoaded();
    adjustInventory.mockRejectedValue(new ApiRequestError({ code: 'FORBIDDEN', message: 'forbidden', request_id: 'req-forbidden' }));
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" />);
    await waitFor(() => expect(screen.getByRole('button', { name: 'Điều chỉnh tồn' })).toBeEnabled());
    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh tồn' }));
    fireEvent.change(screen.getByLabelText('Số lượng'), { target: { value: '1' } });
    fireEvent.change(screen.getByLabelText('Lý do'), { target: { value: 'Kiểm kê' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận điều chỉnh' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không có quyền thực hiện'));
  });

  it('renders API loading and SKU not-found states', async () => {
    getInventoryBySku.mockReturnValue(new Promise(() => undefined));
    getInventoryAdjustmentLedger.mockReturnValue(new Promise(() => undefined));
    render(<InventoryDetailPage sku="SHOE-001-BLK-42" mode="default" />);
    expect(await screen.findByText('Đang tải dữ liệu tồn kho…')).toBeInTheDocument();

    cleanup();
    getInventoryBySku.mockRejectedValue(new ApiRequestError({ code: 'SKU_NOT_FOUND', message: 'missing', request_id: 'req-missing' }));
    getInventoryAdjustmentLedger.mockRejectedValue(new ApiRequestError({ code: 'SKU_NOT_FOUND', message: 'missing', request_id: 'req-missing' }));
    render(<InventoryDetailPage sku="MISSING" mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không tìm thấy SKU' })).toBeInTheDocument());
  });
});
