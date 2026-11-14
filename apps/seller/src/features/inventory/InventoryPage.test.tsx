import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError, parseApiError } from '../../core/api-error';
import { InventoryPage } from './InventoryPage';

const { getInventoryBySku, listInventory, exportInventory, previewBulkInventoryAdjustment, commitBulkInventoryAdjustment, getProductMediaContent } = vi.hoisted(() => ({ getInventoryBySku: vi.fn(), listInventory: vi.fn(), exportInventory: vi.fn(), previewBulkInventoryAdjustment: vi.fn(), commitBulkInventoryAdjustment: vi.fn(), getProductMediaContent: vi.fn() }));
vi.mock('../../api/inventory', () => ({ getInventoryBySku, listInventory, exportInventory, previewBulkInventoryAdjustment, commitBulkInventoryAdjustment }));
vi.mock('../../api/products', () => ({ getProductMediaContent }));

const snapshot = {
  variant_id: '20000000-0000-4000-8000-000000000002',
  product_id: '10000000-0000-4000-8000-000000000001',
  sku: 'SHOE-001-BLK-42',
  color: 'BLACK',
  size: '42',
  on_hand: 10,
  reserved: 8,
  safety_buffer: 1,
  available_to_sell: 42,
  version: 7,
};

function submit(sku = 'SHOE-001-BLK-42') {
  fireEvent.change(screen.getByLabelText('Mã SKU'), { target: { value: sku } });
  fireEvent.click(screen.getByRole('button', { name: 'Tra cứu' }));
}

function apiRow(overrides: Record<string, unknown> = {}) {
  return {
    variant_id: '20000000-0000-4000-8000-000000000002',
    product_id: '10000000-0000-4000-8000-000000000001',
    sku: 'SHOE-001-BLK-42',
    product_name: 'Running Shoe 001',
    category: 'FOOTWEAR',
    color: 'BLACK',
    size: '42',
    price_minor: 990000,
    currency: 'VND',
    on_hand: 10,
    reserved: 0,
    safety_buffer: 0,
    available_to_sell: 10,
    version: 3,
    ...overrides,
  };
}

// The seeded catalogue holds 34 variants and the fixture 7, so the API path is a genuinely
// different list — not the same rows wearing a different label. Anything that looks for a
// fixture-only SKU proves which source is on screen.
// The second row is deliberately low_stock (4 available) and the third sold out (0), so the
// three status buckets each have exactly one member and a wrong count cannot still be right.
const apiRows = [
  apiRow({ on_hand: 40, available_to_sell: 40 }),
  apiRow({ variant_id: 'v-3', sku: 'SCK-GRIP-OSZ-M-BLK', product_name: 'Performance Grip Socks', category: 'ACCESSORIES', color: 'Đen', size: 'M', price_minor: 220000, on_hand: 6, available_to_sell: 4 }),
  apiRow({ variant_id: 'v-4', sku: 'WLT-ZIP-TAN-01', product_name: 'Minimalist Leather Zip Wallet', category: 'ACCESSORIES', color: 'Nâu', size: 'One Size', price_minor: 420000, on_hand: 0, available_to_sell: 0 }),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/inventory');
});

// The default for the whole block: the API is unreachable, so the page is on the fixture
// baseline and stays there. Every pre-existing assertion below is a fixture-mode assertion,
// and saying so here is why none of them need to change.
const apiOffline = () => listInventory.mockRejectedValue(new Error('Không kết nối được API (HTTP 0).'));

describe('InventoryPage', () => {
  it('falls back to the fixture ledger when the API is unreachable', async () => {
    apiOffline();
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());
    expect(screen.getByRole('table')).toHaveTextContent('Pro Lightweight Runner 001');
    // 990.000 ₫ is the seed's price for this SKU; the fixture has no price column at all, so
    // its absence here is how the reader tells the two catalogues apart.
    expect(screen.queryByText('Giá')).toBeNull();
    // The fixture baseline is identified by its own numbers and its own pagination, not by a
    // badge: the prototype totals are hardcoded and the prototype pager is a stub.
    expect(screen.getByLabelText('Chỉ số tồn kho')).toHaveTextContent('38.420');
    expect(screen.getByRole('button', { name: 'Trang trước' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Trang sau' })).toBeDisabled();
  });

  it('shows input guidance without a lookup request', () => {
    render(<InventoryPage />);
    expect(screen.getByRole('heading', { name: 'Nhập SKU để tra cứu' })).toBeInTheDocument();
    expect(getInventoryBySku).not.toHaveBeenCalled();
  });

  it('shows loading while the backend snapshot request is pending', () => {
    getInventoryBySku.mockReturnValue(new Promise(() => undefined));
    render(<InventoryPage />);
    submit();
    expect(screen.getByText('Đang tra cứu tồn kho…')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Đang đọc…' })).toBeDisabled();
  });

  it('renders backend-provided stock fields without deriving available_to_sell', async () => {
    getInventoryBySku.mockResolvedValue(snapshot);
    render(<InventoryPage />);
    submit();

    await waitFor(() => expect(screen.getByTestId('inventory-SHOE-001-BLK-42')).toBeInTheDocument());
    const result = screen.getByTestId('inventory-SHOE-001-BLK-42');
    // 42 is the backend's number, and it does NOT equal 10 - 8 - 1. The client must not
    // recompute it: the backend owns the rule, and a client-side sum would silently
    // disagree with every other screen that reads the same figure.
    expect(within(result).getByText('42')).toBeInTheDocument();
    expect(result).toHaveTextContent('Tồn kho hiện tại · phiên bản 7');
    expect(result).toHaveTextContent('Số có thể bán = tồn kho − đang giữ − tồn đệm an toàn.');
    expect(getInventoryBySku).toHaveBeenCalledWith('SHOE-001-BLK-42', expect.any(AbortSignal));
  });

  it('keeps input and renders a not-found empty state', async () => {
    getInventoryBySku.mockRejectedValue(new ApiRequestError(parseApiError({ error: { code: 'SKU_NOT_FOUND', message: 'not found', request_id: 'req-404' } })));
    render(<InventoryPage />);
    submit('MISSING');

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không tìm thấy SKU' })).toBeInTheDocument());
    expect(screen.getByLabelText('Mã SKU')).toHaveValue('MISSING');
  });

  it('renders typed API errors and retries the same lookup', async () => {
    getInventoryBySku.mockRejectedValue(new ApiRequestError(parseApiError({ error: { code: 'INVENTORY_UNAVAILABLE', message: 'unavailable', request_id: 'req-503' } })));
    render(<InventoryPage />);
    submit();

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Kho tạm thời không khả dụng'));
    // The inspector's own retry sits inside the alert; the ledger's retry button sits above.
    // Both are named "Thử lại", so the one that retries the LOOKUP is the one in the alert.
    fireEvent.click(within(screen.getByRole('alert')).getByRole('button', { name: 'Thử lại' }));
    expect(getInventoryBySku).toHaveBeenCalledTimes(2);
  });

  it('filters the fixture ledger without replacing the API inspector', async () => {
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'WLT-ZIP-TAN-01' } });
    await waitFor(() => expect(screen.getByRole('table')).toHaveTextContent('Vintage Leather Zip Wallet'));
    expect(screen.getByRole('table')).not.toHaveTextContent('Pro Lightweight Runner 001');
    // The inspector is a separate concern from the ledger and is still on the page.
    expect(screen.getByRole('heading', { name: 'Tra cứu tồn kho theo SKU' })).toBeInTheDocument();
  });

  it('uses a ledger SKU to request a backend snapshot', async () => {
    getInventoryBySku.mockResolvedValue(snapshot);
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());

    const row = within(screen.getByRole('table')).getByText('SHOE-001-BLK-42').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Tra cứu nhanh' }));

    await waitFor(() => expect(screen.getByTestId('inventory-SHOE-001-BLK-42')).toBeInTheDocument());
    expect(getInventoryBySku).toHaveBeenCalledWith('SHOE-001-BLK-42', expect.any(AbortSignal));
  });

  it('opens the typed inventory detail route from the ledger', async () => {
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    const row = within(screen.getByRole('table')).getByText('SHOE-001-BLK-42').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Chi tiết' }));
    expect(window.location.pathname).toBe('/inventory/SHOE-001-BLK-42');
  });

  it('supports explicit empty and fixture error states', async () => {
    apiOffline();
    const { unmount } = render(<InventoryPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có SKU nào' })).toBeInTheDocument());
    unmount();

    render(<InventoryPage mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
  });

  it('separates an empty catalogue from a filter that matches nothing', async () => {
    render(<InventoryPage />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());

    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'không-có-sku-này' } });
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không có SKU phù hợp' })).toBeInTheDocument());
    // The catalogue is not empty — the filter is what excludes everything, and the two
    // readings lead to different next steps.
    expect(screen.queryByRole('heading', { name: 'Chưa có SKU nào' })).toBeNull();
  });
});

// Live-data behaviour. Kept in its own block because the price column, the counted metrics
// and the pagination controls are the parts that must differ between the two sources — and a
// test that cannot tell them apart cannot catch a screen quietly showing fixture as live.
describe('InventoryPage on live API data', () => {
  it('renders the API rows, not the fixture ones, and counts its metrics from them', async () => {
    listInventory.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());
    const table = screen.getByRole('table');
    // "Performance Grip Socks" exists only in the seeded API catalogue.
    expect(table).toHaveTextContent('Performance Grip Socks');
    // "Pro Lightweight Runner 001" exists only in the fixture: its absence is the proof that
    // a failed API read did not quietly leave the fixture underneath.
    expect(table).not.toHaveTextContent('Pro Lightweight Runner 001');
    // The live metrics are summed from the rows on screen, so the detail line says how many
    // rows were summed. The prototype's hardcoded 38.420 must be gone.
    const metrics = screen.getByLabelText('Chỉ số tồn kho');
    expect(metrics).toHaveTextContent('Cộng 3 biến thể đang hiển thị');
    expect(metrics).not.toHaveTextContent('38.420');
  });

  it('renders the authenticated product image for a live row that has one', async () => {
    getProductMediaContent.mockResolvedValue(new Blob(['image'], { type: 'image/png' }));
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:inventory-image');
    vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
    listInventory.mockResolvedValue({ items: [apiRow({ primary_media_id: '30000000-0000-4000-8000-000000000001' })], nextCursor: null });
    const { container } = render(<InventoryPage />);

    await waitFor(() => expect(container.querySelector('img')?.getAttribute('src')).toBe('blob:inventory-image'));
    expect(getProductMediaContent).toHaveBeenCalledWith('10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001', expect.any(AbortSignal));
  });

  it('exports selected live rows and requires preview before bulk commit', async () => {
    listInventory.mockResolvedValue({ items: [apiRow()], nextCursor: null });
    exportInventory.mockResolvedValue(new Blob(['csv'], { type: 'text/csv' }));
    previewBulkInventoryAdjustment.mockResolvedValue({ valid: true, items: [{ sku: 'SHOE-001-BLK-42', delta: 2, current_on_hand: 10, projected_on_hand: 12, version: 3, valid: true, errors: [] }] });
    commitBulkInventoryAdjustment.mockRejectedValueOnce(new Error('Network unavailable')).mockResolvedValue({ batch_id: 'batch-1', items: [] });
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:inventory');
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText('Chọn SHOE-001-BLK-42').at(0)!);
    fireEvent.click(screen.getByRole('button', { name: 'Xuất 1 đã chọn' }));
    await waitFor(() => expect(exportInventory).toHaveBeenCalledWith('selected', ['20000000-0000-4000-8000-000000000002']));

    fireEvent.click(screen.getByRole('button', { name: 'Điều chỉnh hàng loạt' }));
    fireEvent.change(screen.getByLabelText('Điều chỉnh số lượng SHOE-001-BLK-42'), { target: { value: '2' } });
    fireEvent.change(screen.getByLabelText('Lý do điều chỉnh'), { target: { value: 'Kiểm kê' } });
    fireEvent.click(screen.getByRole('button', { name: 'Xem trước' }));
    await waitFor(() => expect(screen.getByText('Có thể áp dụng toàn bộ thay đổi')).toBeInTheDocument());
    expect(previewBulkInventoryAdjustment).toHaveBeenCalledWith({ reason: 'Kiểm kê', items: [{ sku: 'SHOE-001-BLK-42', delta: 2, expected_version: 3 }] });
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận điều chỉnh' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Network unavailable'));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận điều chỉnh' }));
    await waitFor(() => expect(commitBulkInventoryAdjustment).toHaveBeenCalledTimes(2));
    const firstKey = commitBulkInventoryAdjustment.mock.calls[0]![1];
    const retryKey = commitBulkInventoryAdjustment.mock.calls[1]![1];
    expect(commitBulkInventoryAdjustment).toHaveBeenNthCalledWith(1, { reason: 'Kiểm kê', items: [{ sku: 'SHOE-001-BLK-42', delta: 2, expected_version: 3 }] }, firstKey);
    expect(retryKey).toBe(firstKey);
  });

  it('renders the price as VND minor units with no divisor', async () => {
    listInventory.mockResolvedValue({ items: [apiRow()], nextCursor: null });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());
    // The ledger renders two responsive layouts, so the price cell appears twice. Asserting on
    // the digits rather than the separators keeps this about magnitude, which is what breaks.
    const cell = within(screen.getByRole('table')).getByText(/990\.000/);
    expect(cell.textContent?.replace(/\D/g, '')).toContain('990000');
    // The price column exists only when a row carries a price.
    expect(within(screen.getByRole('table')).getByRole('columnheader', { name: 'Giá' })).toBeInTheDocument();
  });

  it('asks the API for the first page by keyset cursor', async () => {
    listInventory.mockResolvedValue({ items: apiRows, nextCursor: 'cursor-2' });
    render(<InventoryPage />);

    await waitFor(() => expect(listInventory).toHaveBeenCalledWith({ limit: 50 }, expect.any(AbortSignal)));
    // next_cursor arrives as "cursor-2" and goes back out as the query's cursor.
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(listInventory).toHaveBeenCalledWith({ limit: 50, cursor: 'cursor-2' }, expect.any(AbortSignal)));
  });

  it('hides the load-more button on the last page instead of disabling it', async () => {
    listInventory.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());
    // A button that is present but permanently disabled cannot be told apart from "the next
    // page has not loaded yet"; omitting next_cursor means the walk is over and the control
    // goes away.
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Trang sau' })).toBeNull();
    expect(screen.getByText('Đã hiển thị hết.')).toBeInTheDocument();
  });

  it('keeps the rows already shown when the next page fails', async () => {
    listInventory.mockResolvedValueOnce({ items: [apiRow()], nextCursor: 'cursor-2' });
    listInventory.mockRejectedValueOnce(new Error('page two failed'));
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không tải thêm được. Các dòng ở trên vẫn đúng.'));
    // The live rows are still the ones on screen. A fallback here would replace one shop's
    // stock with the prototype's, and the reader could not tell.
    expect(screen.getByRole('table')).toHaveTextContent('Running Shoe 001');
  });

  it('keeps every API row when no location filter is chosen', async () => {
    listInventory.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());
    // D12. GET /api/v1/inventory has no location column, so an exact match against a
    // warehouse name filtered out all 34 seeded variants and left the fallback showing.
    expect(screen.getByRole('table')).toHaveTextContent('SCK-GRIP-OSZ-M-BLK');
    expect(screen.getByRole('table')).toHaveTextContent('WLT-ZIP-TAN-01');
    expect(screen.getByLabelText('Vị trí')).toHaveValue('all');
  });

  it('counts the quick filters from the visible rows rather than quoting the catalogue', async () => {
    listInventory.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách tồn kho' })).toBeInTheDocument());
    const quick = screen.getByRole('group', { name: 'Bộ lọc nhanh tồn kho' });
    // "14 sắp hết hàng" beside a 3-row ledger is a number about a catalogue that is not the
    // one on screen; these are counted, so the badge and the rows agree. Three distinct values
    // on purpose — a wrong count cannot still pass.
    const countOf = (label: RegExp) => within(quick).getByRole('button', { name: label }).querySelector('span:last-child')?.textContent;
    expect(countOf(/Tất cả SKU/)).toBe('3');
    expect(countOf(/Sắp hết hàng/)).toBe('1');
    expect(countOf(/Hết hàng/)).toBe('1');
    expect(countOf(/Lệch đồng bộ/)).toBe('0');
  });

  it('retries the API and recovers from the fallback', async () => {
    apiOffline();
    render(<InventoryPage />);

    await waitFor(() => expect(screen.getByLabelText('Chỉ số tồn kho')).toHaveTextContent('38.420'));
    listInventory.mockResolvedValue({ items: apiRows, nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(screen.getByLabelText('Chỉ số tồn kho')).toHaveTextContent('Cộng 3 biến thể đang hiển thị'));
    expect(screen.getByRole('table')).not.toHaveTextContent('Pro Lightweight Runner 001');
  });
});
