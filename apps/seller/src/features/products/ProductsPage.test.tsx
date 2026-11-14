import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductsPage } from './ProductsPage';

const { createProductMock, importProductsMock, listProducts } = vi.hoisted(() => ({ createProductMock: vi.fn(), importProductsMock: vi.fn(), listProducts: vi.fn() }));
vi.mock('../../api/products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/products')>()),
  createProduct: createProductMock,
  importProducts: importProductsMock,
  listProducts,
}));
vi.mock('../shared/useSystemSnapshot', () => ({
  useSystemSnapshot: () => ({ snapshot: { system: { catalog_write_available: true } }, loading: false, error: '', checked: '', refresh: vi.fn() }),
}));

function apiRow(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    name: 'Running Shoe 001',
    category: 'FOOTWEAR',
    brand: 'Vantage',
    master_sku: 'MSKU-RUN-4819',
    currency: 'VND',
    status: 'active',
    variant_count: 5,
    on_hand: 40,
    reserved: 3,
    safety_buffer: 2,
    available_to_sell: 35,
    ...overrides,
  };
}

// The seeded catalogue and the fixture are genuinely different lists, not the same rows
// wearing a different label: "Running Shoe 001" exists only in the API, "Pro Lightweight
// Runner 001" only in the fixture. Every assertion below can therefore say which one it sees.
const apiRows = [
  apiRow(),
  apiRow({ id: 'p-2', name: 'Performance Grip Socks', category: 'ACCESSORIES', master_sku: 'MSKU-SCK-0007', variant_count: 3, on_hand: 6, reserved: 1, safety_buffer: 1, available_to_sell: 4 }),
  apiRow({ id: 'p-3', name: 'Minimalist Leather Zip Wallet', category: 'ACCESSORIES', master_sku: 'MSKU-WLT-9930', status: 'draft', variant_count: 2, on_hand: 0, reserved: 0, safety_buffer: 0, available_to_sell: 0 }),
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/products');
});

// The default for the whole fixture block: the API is unreachable, so the page is on the
// prototype baseline and stays there. That is why no pre-existing assertion below changed.
const apiOffline = () => listProducts.mockRejectedValue(new Error('Không kết nối được API (HTTP 0).'));

async function renderProducts() {
  render(<ProductsPage mode="default" />);
  await waitFor(() => expect(screen.getAllByText('Pro Lightweight Runner 001').length).toBeGreaterThan(0));
}

describe('ProductsPage', () => {
  it('filters the typed fixture catalog by SKU search', async () => {
    apiOffline();
    await renderProducts();
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'MSKU-WLT-9930' } });

    await waitFor(() => expect(screen.getAllByText('Minimalist Leather Zip Wallet').length).toBeGreaterThan(0));
    expect(screen.queryByText('Pro Lightweight Runner 001')).not.toBeInTheDocument();
    expect(screen.getByText(/Hiển thị/).parentElement).toHaveTextContent('1 / 7 sản phẩm mẫu');
  });

  it('combines inventory filters and reset behavior', async () => {
    apiOffline();
    await renderProducts();
    fireEvent.change(screen.getByLabelText('Trạng thái tồn'), { target: { value: 'out_of_stock' } });

    expect(screen.getAllByText('Thermal Insulated Bottle 750ml').length).toBeGreaterThan(0);
    expect(screen.queryByText('Oversized Boxy Heavy Tee')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại' }));
    expect(screen.getAllByText('Oversized Boxy Heavy Tee').length).toBeGreaterThan(0);
  });

  it('tracks row selection and supports a grid view', async () => {
    apiOffline();
    await renderProducts();
    const table = screen.getByRole('table');
    fireEvent.click(within(table).getByLabelText('Chọn Pro Lightweight Runner 001'));
    expect(screen.getByRole('button', { name: 'Xuất 1 đã chọn' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Xem dạng lưới' }));
    expect(screen.getByRole('button', { name: 'Xem dạng lưới' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByLabelText('Chọn Pro Lightweight Runner 001')).toHaveLength(1);
  });

  it('navigates from a product row to its detail route', async () => {
    apiOffline();
    await renderProducts();
    const row = within(screen.getByRole('table')).getByText('MSKU-RUN-4819').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Chi tiết' }));
    expect(window.location.pathname).toBe('/products/product-runner-001');
  });

  it('retains explicit empty and error states', async () => {
    apiOffline();
    const { unmount } = render(<ProductsPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có sản phẩm trong catalogue' })).toBeInTheDocument());
    unmount();

    render(<ProductsPage mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
  });
});

// Live-data behaviour, kept separate because the table, the metric cards and the filter panel
// are the parts that MUST differ between the two sources. A test that cannot tell them apart
// cannot catch a screen quietly showing the fixture as live data.
describe('ProductsPage on live API data', () => {
  it('sends deferred search to the server, including matches beyond the loaded page', async () => {
    listProducts.mockResolvedValue({ items: [apiRow()], nextCursor: null });
    render(<ProductsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Tìm kiếm'), { target: { value: 'SECOND-PAGE-SKU' } });
    await waitFor(() => expect(listProducts).toHaveBeenLastCalledWith({ limit: 50, q: 'SECOND-PAGE-SKU' }, expect.any(AbortSignal)));
  });

  it('sends status and category together and resets selection', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    fireEvent.click(screen.getAllByLabelText('Chọn Running Shoe 001')[0]!);
    fireEvent.change(screen.getByLabelText('Trạng thái sản phẩm'), { target: { value: 'active' } });
    fireEvent.change(screen.getByLabelText('Danh mục'), { target: { value: 'FOOTWEAR' } });
    await waitFor(() => expect(listProducts).toHaveBeenLastCalledWith({ limit: 50, status: 'active', category: 'FOOTWEAR' }, expect.any(AbortSignal)));
    expect(screen.getByRole('button', { name: 'Xuất mục đã chọn' })).toBeDisabled();
  });

  it('renders live API rows in grid mode', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Xem dạng lưới' }));
    expect(screen.getByLabelText('Lưới sản phẩm API')).toHaveTextContent('Running Shoe 001');
  });

  it('validates and creates a product, then refreshes page one', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    createProductMock.mockResolvedValue({});
    render(<ProductsPage mode="default" canManageCatalog />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Thêm sản phẩm' }));
    const panel = within(screen.getByLabelText('Tạo sản phẩm'));
    fireEvent.click(panel.getByRole('button', { name: 'Tạo sản phẩm' }));
    expect(panel.getByRole('alert')).toHaveTextContent('Tên sản phẩm');
    fireEvent.change(panel.getByLabelText('Tên sản phẩm'), { target: { value: 'New Product' } });
    fireEvent.change(panel.getByLabelText('Master SKU'), { target: { value: 'NEW-1' } });
    fireEvent.change(panel.getByLabelText('Danh mục'), { target: { value: 'FOOTWEAR' } });
    fireEvent.change(panel.getByLabelText('Mô tả ngắn (tối đa 500 ký tự)'), { target: { value: 'Leather running shoe' } });
    fireEvent.change(panel.getByLabelText('Trọng lượng (g, tùy chọn)'), { target: { value: '850' } });
    fireEvent.change(panel.getByLabelText('Thuộc tính marketplace'), { target: { value: '{"material":"leather"}' } });
    fireEvent.change(panel.getByLabelText('Tình trạng (tùy chọn)'), { target: { value: 'new' } });
    fireEvent.change(panel.getByLabelText('SKU'), { target: { value: 'NEW-1-BLK' } });
    fireEvent.change(panel.getAllByLabelText('Màu')[0]!, { target: { value: 'BLACK' } });
    fireEvent.change(panel.getAllByLabelText('Kích cỡ')[0]!, { target: { value: '41' } });
    fireEvent.click(panel.getByRole('button', { name: '+ Thêm SKU' }));
    fireEvent.change(panel.getAllByLabelText('SKU')[1]!, { target: { value: 'NEW-1-WHT' } });
    fireEvent.change(panel.getAllByLabelText('Màu')[1]!, { target: { value: 'WHITE' } });
    fireEvent.change(panel.getAllByLabelText('Kích cỡ')[1]!, { target: { value: '42' } });
    fireEvent.click(panel.getByRole('button', { name: 'Tạo sản phẩm' }));
    await waitFor(() => expect(createProductMock).toHaveBeenCalledWith(expect.objectContaining({
      name: 'New Product', master_sku: 'NEW-1', short_description: 'Leather running shoe',
      attributes: { material: 'leather' }, weight_grams: 850, condition: 'new',
      variants: [expect.objectContaining({ sku: 'NEW-1-BLK' }), expect.objectContaining({ sku: 'NEW-1-WHT' })],
    }), expect.stringMatching(/^product-create-/)));
    await waitFor(() => expect(listProducts).toHaveBeenCalledTimes(2));
    expect(screen.queryByLabelText('Tạo sản phẩm')).toBeNull();
  });

  it('rejects duplicate SKU and duplicate color-size pairs before writing', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" canManageCatalog />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Thêm sản phẩm' }));
    const panel = within(screen.getByLabelText('Tạo sản phẩm'));
    fireEvent.change(panel.getByLabelText('Tên sản phẩm'), { target: { value: 'New Product' } });
    fireEvent.change(panel.getByLabelText('Master SKU'), { target: { value: 'NEW-2' } });
    fireEvent.change(panel.getByLabelText('Danh mục'), { target: { value: 'FOOTWEAR' } });
    fireEvent.change(panel.getAllByLabelText('SKU')[0]!, { target: { value: 'NEW-2-BLK' } });
    fireEvent.change(panel.getAllByLabelText('Màu')[0]!, { target: { value: 'BLACK' } });
    fireEvent.change(panel.getAllByLabelText('Kích cỡ')[0]!, { target: { value: '41' } });
    fireEvent.click(panel.getByRole('button', { name: '+ Thêm SKU' }));
    fireEvent.change(panel.getAllByLabelText('SKU')[1]!, { target: { value: 'NEW-2-BLK' } });
    fireEvent.change(panel.getAllByLabelText('Màu')[1]!, { target: { value: 'BLACK' } });
    fireEvent.change(panel.getAllByLabelText('Kích cỡ')[1]!, { target: { value: '41' } });
    fireEvent.click(panel.getByRole('button', { name: 'Tạo sản phẩm' }));
    expect(panel.getByRole('alert')).toHaveTextContent('SKU bị trùng');
    expect(createProductMock).not.toHaveBeenCalled();
  });

  it('fails closed for catalog writes without the ADMIN role', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" canManageCatalog={false} />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    expect(screen.getByRole('button', { name: 'Thêm sản phẩm' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Nhập sản phẩm' })).toBeDisabled();
    expect(screen.getByText('Chỉ ADMIN được quản lý danh mục.')).toBeInTheDocument();
  });
  it('labels the screen as live and renders the API rows, not the fixture ones', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('Running Shoe 001');
    // Its absence is the proof that a failed API read did not leave the fixture underneath.
    expect(table).not.toHaveTextContent('Pro Lightweight Runner 001');
  });

  it('renders the four stock totals the contract sums in SQL', async () => {
    listProducts.mockResolvedValue({ items: [apiRow()], nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    const table = screen.getByRole('table');
    expect(table).toHaveTextContent('Tồn kho');
    expect(table).toHaveTextContent('Đang giữ');
    expect(table).toHaveTextContent('Tồn đệm');
    // 35 is what the API said. Nothing on this screen recomputes it, so it can only be 35.
    expect(within(table).getAllByText('35').length).toBeGreaterThan(0);
    expect(within(table).getAllByText('40').length).toBeGreaterThan(0);
  });

  it('has no price column, because ProductSummary carries no price', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    // The fixture table DOES have one. Its absence here is the honest outcome of a contract
    // with no price field: a column of blanks, or an N+1 GET /products/{id} per row to fill
    // it, would each be worse than no column.
    expect(screen.queryByText('Giá')).toBeNull();
  });

  it('withdraws the filters the contract cannot answer', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    // ProductSummary has no channel binding and no inventory STATE — only four summed
    // quantities. A select whose every option matches nothing is a control that lies.
    expect(screen.queryByLabelText('Kênh bán')).toBeNull();
    expect(screen.queryByLabelText('Trạng thái tồn')).toBeNull();
    expect(screen.getByLabelText('Trạng thái sản phẩm')).toBeInTheDocument();
    // Nor does the search box still promise variant SKUs it can no longer match.
    expect(screen.getByLabelText('Tìm kiếm')).toHaveAttribute('placeholder', expect.stringContaining('thương hiệu') as unknown as string);
  });

  it('builds the category list from the rows instead of the prototype labels', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    const options = within(screen.getByLabelText('Danh mục')).getAllByRole('option').map((option) => option.getAttribute('value'));
    expect(options).toEqual(['all', 'ACCESSORIES', 'FOOTWEAR']);
    // "Giày thể thao" is the prototype's display name. Paired with API rows it is a filter
    // that matches nothing, so the screen would go empty instead of showing the catalogue.
    expect(options).not.toContain('Giày thể thao');
  });

  it('sends a stored category to the server and does not filter the loaded subset locally', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    fireEvent.change(screen.getByLabelText('Danh mục'), { target: { value: 'FOOTWEAR' } });

    await waitFor(() => expect(listProducts).toHaveBeenLastCalledWith({ limit: 50, category: 'FOOTWEAR' }, expect.any(AbortSignal)));
    expect(screen.getByRole('table')).toHaveTextContent('Performance Grip Socks');
  });

  it('counts the metric cards from the rows instead of quoting the catalogue', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    const metrics = screen.getByRole('region', { name: 'Chỉ số sản phẩm' });
    expect(metrics).toHaveTextContent('3 sản phẩm đã tải');
    // 5 + 3 + 2 variants summed from the rows; "1.482 master SKU" would be a claim about a
    // catalogue that is not on screen.
    expect(metrics).toHaveTextContent('10');
    // Read each card's own strong element rather than substring-matching the whole section:
    // toHaveTextContent is a substring match, so 'Sắp hết hàng' and 'Hết hàng' both sit
    // inside the first one's label and a wrong value would still pass.
    const cardOf = (label: string) => within(metrics).getByText(label).closest('div.min-h-32');
    expect(cardOf('Sắp hết hàng')).toHaveTextContent('1');
    // out_of_stock counts ATS === 0, not the `draft` status: an ACTIVE product with nothing
    // sellable is exactly what a shopkeeper needs to see here.
    expect(cardOf('Hết hàng')).toHaveTextContent('1');
    expect(metrics).not.toHaveTextContent('1.482');
  });

  it('asks the API for the first page by keyset cursor and walks to the next', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: 'cursor-2' });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(listProducts).toHaveBeenCalledWith({ limit: 50 }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));
    await waitFor(() => expect(listProducts).toHaveBeenCalledWith({ limit: 50, cursor: 'cursor-2' }, expect.any(AbortSignal)));
  });

  it('hides the load-more button on the last page instead of disabling it', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    // A permanently-disabled button cannot be told apart from "the next page has not loaded
    // yet". An absent next_cursor means the walk is over, so the control goes away.
    expect(screen.queryByRole('button', { name: 'Tải thêm' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Sau →' })).toBeNull();
    expect(screen.getByText('Đã hiển thị hết.')).toBeInTheDocument();
  });

  it('keeps the rows already shown when the next page fails', async () => {
    listProducts.mockResolvedValueOnce({ items: [apiRow()], nextCursor: 'cursor-2' });
    listProducts.mockRejectedValueOnce(new Error('page two failed'));
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Tải thêm' }));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không tải thêm được. Các dòng ở trên vẫn đúng.'));
    expect(screen.getByRole('table')).toHaveTextContent('Running Shoe 001');
  });

  it('still navigates to the detail route from a live row', async () => {
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    const row = within(screen.getByRole('table')).getByText('MSKU-RUN-4819').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row!).getByRole('button', { name: 'Chi tiết' }));
    // The detail page is still fixture-backed, which is correct for now: it reads velocity,
    // movement history and procurement, none of which the backend has.
    expect(window.location.pathname).toBe(`/products/${apiRows[0]?.id}`);
  });

  it('retries the API and recovers from the fallback', async () => {
    apiOffline();
    render(<ProductsPage mode="default" />);

    await waitFor(() => expect(screen.getAllByText('Pro Lightweight Runner 001').length).toBeGreaterThan(0));
    listProducts.mockResolvedValue({ items: apiRows, nextCursor: null });
    fireEvent.click(screen.getByRole('button', { name: 'Thử lại' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Danh sách sản phẩm' })).toBeInTheDocument());
    expect(screen.getByRole('table')).not.toHaveTextContent('Pro Lightweight Runner 001');
  });
});
