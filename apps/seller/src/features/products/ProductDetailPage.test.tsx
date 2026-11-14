import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { ProductDetailPage } from './ProductDetailPage';


afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  listProductPublicationsMock.mockReset().mockResolvedValue({ product_id: '10000000-0000-4000-8000-000000000001', product_version: 7, channels: [] });
  previewProductPublicationMock.mockReset();
  createProductPublicationMock.mockReset();
  getProductPublicationHistoryMock.mockReset();
  retryProductPublicationMock.mockReset();
  allocationPanelMock.mockReset();
  window.history.replaceState({}, '', '/products/product-runner-001');
});

async function renderDetail() {
  render(<ProductDetailPage id="product-runner-001" mode="loading" />);
  // Waits for the VARIANT TABLE, not just the heading. The header renders before the table,
  // so a heading-only wait let the assertions below run against a page that had not drawn its
  // rows yet — fine on an idle machine, a failure under load, and a failure that reads as
  // "the page is broken" rather than "the test raced".
  await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
  await waitFor(() => expect(screen.getByRole('heading', { name: 'Pro Lightweight Runner 001' })).toBeInTheDocument());
}

describe('ProductDetailPage', () => {
  it('renders the variant ledger and precomputed inventory fields', async () => {
    await renderDetail();
    expect(screen.getByLabelText('Tóm tắt sản phẩm')).toHaveTextContent('245');
    expect(screen.getByRole('table')).toHaveTextContent('SHOE-001-BLK-42');
    expect(screen.getByRole('table')).toHaveTextContent('15');
    expect(screen.getByRole('table')).toHaveTextContent('10');
    expect(screen.getByRole('table')).toHaveTextContent('2');
    expect(screen.getByRole('table')).toHaveTextContent('3');
    expect(screen.getByRole('heading', { name: 'Liên kết kênh bán' })).toBeInTheDocument();
  });

  it('copies a canonical SKU with accessible feedback', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await renderDetail();

    fireEvent.click(within(screen.getByRole('table')).getByRole('button', { name: 'Sao chép SHOE-001-BLK-42' }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith('SHOE-001-BLK-42'));
    expect(screen.getByText('Đã sao chép SHOE-001-BLK-42')).toBeInTheDocument();
  });

  it('opens the real inventory lookup with the selected SKU', async () => {
    await renderDetail();
    const row = within(screen.getByRole('table')).getByText('SHOE-001-BLK-42').closest('tr');
    expect(row).not.toBeNull();
    fireEvent.click(within(row as HTMLTableRowElement).getByRole('button', { name: 'Tra cứu tồn' }));
    expect(window.location.pathname).toBe('/inventory');
    expect(window.location.search).toBe('?sku=SHOE-001-BLK-42');
  });

  it('switches between overview and channel mapping panels', async () => {
    await renderDetail();
    fireEvent.click(screen.getByRole('tab', { name: 'Tổng quan' }));
    expect(screen.getByRole('heading', { name: 'Lưu ý' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Liên kết kênh bán' }));
    expect(screen.getByText('SHOPEE-LR-B42')).toBeInTheDocument();
  });

  it('keeps explicit missing and error states', async () => {
    const { unmount } = render(<ProductDetailPage id="missing" mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Không tìm thấy sản phẩm' })).toBeInTheDocument());
    unmount();

    render(<ProductDetailPage id="product-runner-001" mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
  });
});

// ---------------------------------------------------------------------------
// Live API mode.
// ---------------------------------------------------------------------------

const { getProductFromApi, transitionProductMock, updateVariantMock, updateProductCatalogMock, importProductsMock, createProductVariantMock, listProductMediaMock, getProductMediaContentMock, uploadProductMediaMock, reorderProductMediaMock, deleteProductMediaMock, listProductPublicationsMock, previewProductPublicationMock, createProductPublicationMock, getProductPublicationHistoryMock, retryProductPublicationMock } = vi.hoisted(() => ({
  getProductFromApi: vi.fn(),
  transitionProductMock: vi.fn(),
  updateVariantMock: vi.fn(),
  updateProductCatalogMock: vi.fn(),
  importProductsMock: vi.fn(),
  createProductVariantMock: vi.fn(),
  listProductMediaMock: vi.fn().mockResolvedValue({ product_version: 7, media: [] }),
  getProductMediaContentMock: vi.fn(),
  uploadProductMediaMock: vi.fn(),
  reorderProductMediaMock: vi.fn(),
  deleteProductMediaMock: vi.fn(),
  listProductPublicationsMock: vi.fn().mockResolvedValue({ product_id: '10000000-0000-4000-8000-000000000001', product_version: 7, channels: [] }),
  previewProductPublicationMock: vi.fn(),
  createProductPublicationMock: vi.fn(),
  getProductPublicationHistoryMock: vi.fn(),
  retryProductPublicationMock: vi.fn(),
}));
const allocationPanelMock = vi.hoisted(() => vi.fn());
vi.mock('../inventory/components/ProductAllocationPanel', () => ({
  ProductAllocationPanel: (props: { product: { id: string }; canExecute: boolean }) => {
    allocationPanelMock(props);
    return null;
  },
}));
const shopifyAPI = vi.hoisted(() => ({
  getShopifyStatus: vi.fn().mockResolvedValue({ enabled: false, connected: false, currency_compatible: false, product_write_enabled: false }),
  listShopifyPublications: vi.fn().mockResolvedValue([]),
  getShopifyProductSyncJobs: vi.fn().mockResolvedValue([]),
  pushShopifyProduct: vi.fn(),
}));
const wooCommerceAPI = vi.hoisted(() => ({
  getWooCommerceProductState: vi.fn(), getWooCommerceProductJobs: vi.fn(),
  queueWooCommerceProductAction: vi.fn(), retryWooCommerceProductJob: vi.fn(),
}));
vi.mock('../../api/shopify', () => shopifyAPI);
vi.mock('../../api/woocommerce', () => wooCommerceAPI);
beforeEach(() => {
  wooCommerceAPI.getWooCommerceProductState.mockReset().mockResolvedValue({
    product_id: '10000000-0000-4000-8000-000000000001', product_version: 7,
    publication_state: 'not_exported', mapping_state: 'unmapped', catalog_sync_state: 'not_synced',
    inventory_activation_state: 'inactive', channel_connected: false,
    product_write_enabled: false, inventory_write_enabled: false,
  });
  wooCommerceAPI.getWooCommerceProductJobs.mockReset().mockResolvedValue([]);
  wooCommerceAPI.queueWooCommerceProductAction.mockReset();
  wooCommerceAPI.retryWooCommerceProductJob.mockReset();
});
vi.mock('../shared/useSystemSnapshot', () => ({
  useSystemSnapshot: () => ({ snapshot: { system: { catalog_write_available: true } }, loading: false, error: '', checked: '', refresh: vi.fn() }),
}));
vi.mock('../../api/products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../api/products')>()),
  getProduct: getProductFromApi,
  transitionProduct: transitionProductMock,
  updateVariant: updateVariantMock,
  updateProductCatalog: updateProductCatalogMock,
  importProducts: importProductsMock,
  createProductVariant: createProductVariantMock,
  listProductMedia: listProductMediaMock,
  getProductMediaContent: getProductMediaContentMock,
  uploadProductMedia: uploadProductMediaMock,
  reorderProductMedia: reorderProductMediaMock,
  deleteProductMedia: deleteProductMediaMock,
  listProductPublications: listProductPublicationsMock,
  previewProductPublication: previewProductPublicationMock,
  createProductPublication: createProductPublicationMock,
  getProductPublicationHistory: getProductPublicationHistoryMock,
  retryProductPublication: retryProductPublicationMock,
}));

function apiDetail(overrides: Record<string, unknown> = {}) {
  return {
    id: '10000000-0000-4000-8000-000000000001',
    product_version: 7,
    name: 'Running Shoe 001',
    category: 'FOOTWEAR',
    brand: 'Vantage',
    description: 'Detailed description',
    short_description: 'Short description',
    attributes: { material: 'leather' },
    weight_grams: 850,
    length_mm: 310,
    width_mm: 110,
    height_mm: 85,
    condition: 'new',
    master_sku: 'MSKU-RUN-4819',
    currency: 'VND',
    status: 'active',
    variant_count: 2,
    on_hand: 18,
    reserved: 3,
    safety_buffer: 2,
    available_to_sell: 13,
    variants: [
      { id: 'v-1', sku: 'SHOE-001-BLK-41', color: 'BLACK', size: '41', price_minor: 990000, barcode: null, variant_is_active: true, is_active: true, on_hand: 10, reserved: 2, safety_buffer: 1, available_to_sell: 7 },
      { id: 'v-2', sku: 'SHOE-001-WHT-42', color: 'WHITE', size: '42', price_minor: 990000, barcode: '89300001', variant_is_active: false, is_active: false, on_hand: 8, reserved: 1, safety_buffer: 1, available_to_sell: 6 },
    ],
    ...overrides,
  };
}

const apiResolves = (detail: unknown) => getProductFromApi.mockImplementation(() => Promise.resolve(detail));

/**
 * The operations surfaces live behind one tab and a disclosure each. Opening them here rather
 * than inline keeps every test pointed at the behaviour it pins instead of the navigation that
 * happens to guard it.
 */
async function openOperations(title: string) {
  fireEvent.click(await screen.findByRole('tab', { name: 'Kênh bán & quản lý' }));
  fireEvent.click(screen.getByText(title));
}

/** A variant's editor is opened from its row, not mounted for every row up front. */
async function openVariantEditor(sku: string) {
  const table = await screen.findByRole('table', { name: 'Danh sách biến thể' });
  const row = within(table).getByText(sku).closest('tr');
  fireEvent.click(within(row as HTMLElement).getByRole('button', { name: 'Sửa SKU' }));
}

describe('ProductDetailPage · live API', () => {
  it('opens the allocation workspace from an operations deep link', async () => {
    const pid = '10000000-0000-4000-8000-000000000001';
    apiResolves(apiDetail());
    window.history.replaceState({}, '', `/products/${pid}?tab=operations&allocation=1`);
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);

    await waitFor(() => expect(allocationPanelMock).toHaveBeenCalledWith({
      product: expect.objectContaining({ id: pid }),
      canExecute: true,
    }));
    expect(screen.getByRole('tab', { name: 'Kênh bán & quản lý' })).toHaveAttribute('aria-selected', 'true');
  });

  it('updates marketplace metadata against the product revision', async () => {
    apiResolves(apiDetail());
    updateProductCatalogMock.mockResolvedValue(apiDetail({ product_version: 8, weight_grams: 900 }));
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    const editor = await screen.findByLabelText('Chỉnh sửa thông tin sản phẩm');
    fireEvent.click(within(editor).getByRole('button', { name: 'Chỉnh sửa thông tin' }));
    fireEvent.change(within(editor).getByLabelText('Trọng lượng (g)'), { target: { value: '900' } });
    fireEvent.click(within(editor).getByRole('button', { name: 'Lưu thông tin sản phẩm' }));
    await waitFor(() => expect(updateProductCatalogMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      expect.objectContaining({ weight_grams: 900, expected_product_version: 7, attributes: { material: 'leather' } }),
      expect.any(String),
    ));
  });

  it('adds a SKU to the existing product without asking for product fields', async () => {
    apiResolves(apiDetail());
    createProductVariantMock.mockResolvedValue({ sku: 'SHOE-001-RED-43' });
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    await waitFor(() => expect(screen.getByRole('table')).toBeInTheDocument());
    await openOperations('Vòng đời và tác vụ danh mục');
    const panel = within(await screen.findByLabelText('Thêm biến thể cho sản phẩm'));
    fireEvent.click(panel.getByRole('button', { name: 'Thêm biến thể' }));
    fireEvent.change(panel.getByLabelText('SKU'), { target: { value: 'SHOE-001-RED-43' } });
    fireEvent.change(panel.getByLabelText('Màu'), { target: { value: 'RED' } });
    fireEvent.change(panel.getByLabelText('Kích cỡ'), { target: { value: '43' } });
    fireEvent.click(panel.getByRole('button', { name: 'Lưu biến thể' }));
    await waitFor(() => expect(createProductVariantMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      { sku: 'SHOE-001-RED-43', color: 'RED', size: '43' },
      expect.stringMatching(/^variant-create-/),
    ));
    expect(await panel.findByText('Đã thêm SHOE-001-RED-43; tồn kho hiện bằng 0.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Master SKU')).toBeNull();
  });

  it('renders the product totals the server summed', async () => {
    apiResolves(apiDetail());
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Tổng tồn kho của sản phẩm' })).toBeInTheDocument());

    const totals = screen.getByRole('region', { name: 'Tổng tồn kho của sản phẩm' });
    expect(totals).toHaveTextContent('18');
    expect(totals).toHaveTextContent('13');
    expect(totals).toHaveTextContent('Tồn kho − đang giữ − tồn đệm');
  });

  it('edits a core price from the product information tab', async () => {
    updateVariantMock.mockReset();
    apiResolves(apiDetail());
    updateVariantMock.mockResolvedValue({ ...apiDetail().variants[0], price_minor: 1200000 });
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);

    // The price editor is part of the product tab itself, not hidden behind the operations
    // disclosures: changing a core price is product editing, not channel management.
    const card = await screen.findByLabelText('Giá bán sản phẩm');
    expect(card).toHaveTextContent('990.000 ₫');
    fireEvent.click(within(card).getByRole('button', { name: 'Chỉnh sửa giá' }));
    fireEvent.change(within(card).getByLabelText('Giá bán của SHOE-001-BLK-41'), { target: { value: '1200000' } });
    fireEvent.click(within(card).getByRole('button', { name: 'Lưu giá SHOE-001-BLK-41' }));

    await waitFor(() => expect(updateVariantMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      'v-1',
      { price_minor: 1200000, expected_product_version: 7 },
      expect.stringMatching(/^product-price-v-1-/),
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu giá 1.200.000 ₫ cho SHOE-001-BLK-41.');
  });

  it('shows every canonical variant with the four numbers taken as given', async () => {
    apiResolves(apiDetail());
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Tổng tồn kho của sản phẩm' })).toBeInTheDocument());

    const table = screen.getByRole('table', { name: 'Danh sách biến thể' });
    expect(table).toHaveTextContent('SHOE-001-BLK-41');
    expect(table).toHaveTextContent('SHOE-001-WHT-42');
    expect(table).toHaveTextContent('990.000 ₫');
    // The inactive variant is labelled rather than hidden: it is still stock the core holds.
    expect(table).toHaveTextContent('ngừng bán');
    expect(table).toHaveTextContent('89300001');
  });

  it('does not invent a channel mapping the API does not return', async () => {
    apiResolves(apiDetail());
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    await openOperations('Giá và hiện diện trên kênh');

    const panel = await screen.findByLabelText('Quản lý đăng sản phẩm đa kênh');
    expect(await within(panel).findByText('Sản phẩm chưa có kênh đăng bán.')).toBeInTheDocument();
    // The prototype's channel bindings and sellable-rate are absent, not filled in.
    expect(within(panel).queryByText(/Shopify Dev Store|sellable/i)).toBeNull();
  });

  it('shows separate publication, mapping, catalog, and inventory states before creating a draft', async () => {
    apiResolves(apiDetail());
    listProductPublicationsMock.mockResolvedValue({
      product_id: '10000000-0000-4000-8000-000000000001', product_version: 7,
      channels: [{
        channel_id: 'channel-shopify', channel_code: 'shopify', channel_name: 'Shopify Dev Store',
        environment: 'sandbox', connection_state: 'connected', publication_state: 'not_exported',
        mapping_state: 'unmapped', catalog_sync_state: 'not_synced', inventory_sync_state: 'not_synced',
        product_version: 7, can_create_draft: true, can_publish: false, can_unpublish: false,
      }],
    });
    previewProductPublicationMock.mockResolvedValue({
      product_id: '10000000-0000-4000-8000-000000000001', channel_id: 'channel-shopify', operation: 'draft',
      product_version: 7, supported: true, ready: true, issues: [],
    });
    createProductPublicationMock.mockResolvedValue({ state: 'queued' });
    getProductPublicationHistoryMock.mockResolvedValue({
      product_id: '10000000-0000-4000-8000-000000000001', channel_id: 'channel-shopify',
      requests: [], attempts: [], evidence: [],
    });
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);

    await openOperations('Giá và hiện diện trên kênh');
    const panel = await screen.findByLabelText('Quản lý đăng sản phẩm đa kênh');
    await within(panel).findByText('Shopify Dev Store');
    expect(panel).toHaveTextContent('Chưa gửi');
    expect(panel).toHaveTextContent('Chưa ghép ID');
    expect(panel).toHaveTextContent('Thông tin và giá');
    expect(panel).toHaveTextContent('Tồn kho trên kênh');
    // The operation choices are visible, but nothing can be confirmed before a preview.
    expect(within(panel).queryByRole('button', { name: 'Xác nhận tạo bản nháp' })).toBeNull();

    fireEvent.click(within(panel).getByRole('button', { name: 'Tạo bản nháp' }));
    fireEvent.click(within(panel).getByRole('button', { name: 'Kiểm tra điều kiện' }));
    await waitFor(() => expect(previewProductPublicationMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      { channel_id: 'channel-shopify', operation: 'draft', expected_product_version: 7 },
    ));
    fireEvent.click(await within(panel).findByRole('button', { name: 'Xác nhận tạo bản nháp' }));
    const confirmationDialog = await screen.findByRole('dialog', { name: 'Tạo bản nháp?' });
    fireEvent.click(within(confirmationDialog).getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(createProductPublicationMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      { channel_id: 'channel-shopify', operation: 'draft', expected_product_version: 7 },
      expect.stringMatching(/^publication-draft-/),
    ));
  });

  it('requires an explicit confirmation before retrying a failed publication', async () => {
    apiResolves(apiDetail());
    listProductPublicationsMock.mockResolvedValue({
      product_id: '10000000-0000-4000-8000-000000000001', product_version: 7,
      channels: [{
        channel_id: 'channel-shopify', channel_code: 'shopify', channel_name: 'Shopify Dev Store',
        environment: 'sandbox', connection_state: 'connected', publication_state: 'sync_failed',
        mapping_state: 'mapped', catalog_sync_state: 'sync_failed', inventory_sync_state: 'not_synced',
        last_error_code: 'PRODUCT_SET_METAFIELD_MISMATCH',
        product_version: 7, can_create_draft: true, can_publish: false, can_unpublish: false,
      }],
    });
    getProductPublicationHistoryMock.mockResolvedValue({
      product_id: '10000000-0000-4000-8000-000000000001', channel_id: 'channel-shopify',
      requests: [{ id: 'request-failed', operation: 'draft', product_version: 7, state: 'sync_failed', attempt_count: 1, last_error_code: 'PRODUCT_SET_METAFIELD_MISMATCH', correlation_id: 'correlation-1', issues: [], created_at: '2026-10-31T00:00:00Z', updated_at: '2026-10-31T00:00:00Z' }],
      attempts: [], evidence: [],
    });
    retryProductPublicationMock.mockResolvedValue({ state: 'queued' });
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    fireEvent.click(await screen.findByRole('tab', { name: 'Kênh bán & quản lý' }));
    fireEvent.click(screen.getByText('Giá và hiện diện trên kênh'));
    const panel = await screen.findByLabelText('Quản lý đăng sản phẩm đa kênh');
    expect(await within(panel).findByText('Shopify từ chối mã định danh sản phẩm trong dữ liệu gửi lên.')).toBeInTheDocument();
    fireEvent.click(within(panel).getByRole('button', { name: 'Xem lần xử lý' }));
    const history = await within(panel).findByRole('region', { name: 'Lịch sử đăng Shopify Dev Store' });
    expect(within(history).getByText(/Mã lỗi: PRODUCT_SET_METAFIELD_MISMATCH/)).toBeInTheDocument();
    fireEvent.click(await within(panel).findByRole('button', { name: 'Thử lại' }));
    const confirmationDialog = await screen.findByRole('dialog', { name: 'Thử lại yêu cầu tạo bản nháp?' });
    fireEvent.click(within(confirmationDialog).getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(retryProductPublicationMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001', 'channel-shopify', 'request-failed', expect.stringMatching(/^publication-retry-/),
    ));
  });

  it('says a master SKU is missing rather than substituting the name', async () => {
    apiResolves(apiDetail({ master_sku: null }));
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    await waitFor(() => expect(screen.getByRole('region', { name: 'Tổng tồn kho của sản phẩm' })).toBeInTheDocument());

    expect(screen.getByText('Chưa có SKU gốc')).toBeInTheDocument();
    expect(screen.queryByText('MSKU-RUN-4819')).toBeNull();
  });

  it('shows an unknown id as missing and does not fall back to another product', async () => {
    getProductFromApi.mockImplementation(() => Promise.reject(new ApiRequestError(
      { code: 'PRODUCT_NOT_FOUND', message: 'Product was not found', request_id: 'req-404' },
      404,
    )));
    render(<ProductDetailPage id="30000000-0000-4000-8000-0000000000ff" mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không tìm thấy sản phẩm'));
  });

  it('fails closed when the API is unreachable', async () => {
    getProductFromApi.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));
    render(<ProductDetailPage id="product-runner-001" mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
    expect(screen.queryByRole('region', { name: 'Tổng tồn kho của sản phẩm' })).toBeNull();
  });
});

// The lifecycle route is the only writer of products.is_active, which is what makes a product
// unreservable. These cases pin the edges it offers and the ones it must not.
describe('ProductDetailPage · lifecycle', () => {
  const pid = '10000000-0000-4000-8000-000000000001';

  // These assertions count calls, and the mock is module-scoped and shared with the block
  // above, so a reset is required: without it "called once" measures the whole file.
  beforeEach(() => {
    getProductFromApi.mockReset();
    transitionProductMock.mockReset();
    updateVariantMock.mockReset();
    importProductsMock.mockReset();
  });

  it('offers only the moves the API accepts from active', async () => {
    apiResolves(apiDetail({ status: 'active', available_to_sell: 0 }));
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Vòng đời sản phẩm')).toBeInTheDocument());

    const panel = screen.getByLabelText('Vòng đời sản phẩm');
    expect(panel).toHaveTextContent('Chuyển sang Hết hàng');
    expect(panel).toHaveTextContent('Chuyển sang Lưu trữ');
    // draft -> active is not reachable from active, and there is no button that would 409.
    expect(panel).not.toHaveTextContent('Chuyển sang Đang bán');
  });

  it('draws no move at all from the terminal state', async () => {
    apiResolves(apiDetail({ status: 'archived' }));
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Vòng đời sản phẩm')).toBeInTheDocument());

    const panel = screen.getByLabelText('Vòng đời sản phẩm');
    expect(panel).toHaveTextContent('Đây là trạng thái cuối');
    expect(screen.queryByRole('button', { name: /^Chuyển sang/ })).toBeNull();
  });

  it('re-reads the product after a move instead of patching the card locally', async () => {
    apiResolves(apiDetail({ status: 'active', available_to_sell: 0 }));
    transitionProductMock.mockResolvedValue(apiDetail({ status: 'out_of_stock' }));
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Vòng đời sản phẩm')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang Hết hàng' }));
    await waitFor(() => expect(transitionProductMock).toHaveBeenCalledWith(pid, 'out_of_stock', expect.any(String)));
    // The card must re-read rather than optimistically flip: a local patch would show a state
    // the core has not confirmed, which is the one thing this screen cannot do.
    await waitFor(() => expect(getProductFromApi).toHaveBeenCalledTimes(2));
  });

  it('surfaces the reason instead of pretending the product changed', async () => {
    apiResolves(apiDetail({ status: 'active', available_to_sell: 0 }));
    transitionProductMock.mockRejectedValue(new ApiRequestError(
      { code: 'IDEMPOTENCY_CONFLICT', message: 'Key already used for a different request', request_id: 'r-1' }, 409,
    ));
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Vòng đời sản phẩm')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: 'Chuyển sang Hết hàng' }));
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Key already used'));
    expect(getProductFromApi).toHaveBeenCalledTimes(1);
  });

  it('asks for a reason before a SKU rename and never sends one without it', async () => {
    apiResolves(apiDetail({ status: 'active' }));
    updateVariantMock.mockResolvedValue(apiDetail().variants[0]);
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openVariantEditor('SHOE-001-BLK-41');
    await waitFor(() => expect(screen.getByLabelText(/^Sửa biến thể SHOE-001-BLK-41$/)).toBeInTheDocument());

    const editor = within(screen.getByLabelText(/^Sửa biến thể SHOE-001-BLK-41$/));
    const save = editor.getByRole('button', { name: 'Lưu thay đổi' });
    await expect(save).toBeDisabled();

    fireEvent.change(editor.getByLabelText('SKU'), { target: { value: 'SHOE-001-BLK-49' } });
    // The reason field only appears once a rename is in progress, and the button stays off
    // until it carries text. A renamed SKU is the code a human reads at the till.
    await waitFor(() => expect(editor.queryByLabelText('Lý do đổi SKU')).not.toBeNull());
    await expect(save).toBeDisabled();
    fireEvent.change(editor.getByLabelText('Lý do đổi SKU'), { target: { value: 'mã cũ không quét được' } });
    await expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(updateVariantMock).toHaveBeenCalledWith(
      pid,
      apiDetail().variants[0]?.id,
      expect.objectContaining({ sku: 'SHOE-001-BLK-49', reason: 'mã cũ không quét được' }),
      expect.any(String),
    ));
    // The card re-reads rather than patching the row locally.
    await waitFor(() => expect(getProductFromApi).toHaveBeenCalledTimes(2));
  });

  it('says so when the API refuses to hide a variant that has been sold', async () => {
    apiResolves(apiDetail({ status: 'active' }));
    updateVariantMock.mockRejectedValue(new ApiRequestError(
      { code: 'VARIANT_HAS_SALES', message: 'This variant has been sold; its SKU stays on past orders', request_id: 'r-2' }, 409,
    ));
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    // One editor per opened variant: opening the row is what makes the toggle reachable.
    await openVariantEditor('SHOE-001-BLK-41');
    const editor = await screen.findByLabelText(/^Sửa biến thể SHOE-001-BLK-41$/);
    fireEvent.click(within(editor as HTMLElement).getByRole('button', { name: 'Ẩn khỏi danh mục' }));
    // The refusal is shown as written. A silently ignored toggle teaches the operator the
    // button is broken; this one tells them the variant is on past orders.
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('stays on past orders'));
  });

  it('updates the variant price with the product revision and accepts zero', async () => {
    apiResolves(apiDetail());
    updateVariantMock.mockResolvedValue({ ...apiDetail().variants[0], price_minor: 0 });
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    await openVariantEditor('SHOE-001-BLK-41');
    await waitFor(() => expect(screen.getByLabelText(/^Sửa biến thể SHOE-001-BLK-41$/)).toBeInTheDocument());

    const editor = within(screen.getByLabelText(/^Sửa biến thể SHOE-001-BLK-41$/));
    fireEvent.change(editor.getByLabelText('Giá bán (VND)'), { target: { value: '0' } });
    fireEvent.click(editor.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(updateVariantMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      'v-1',
      expect.objectContaining({ price_minor: 0, expected_product_version: 7 }),
      expect.any(String),
    ));
  });

  it('sends null when a seller clears a price', async () => {
    apiResolves(apiDetail());
    updateVariantMock.mockResolvedValue({ ...apiDetail().variants[0], price_minor: null });
    render(<ProductDetailPage id="10000000-0000-4000-8000-000000000001" mode="default" canManageCatalog />);
    await openVariantEditor('SHOE-001-BLK-41');
    await waitFor(() => expect(screen.getByLabelText(/^Sửa biến thể SHOE-001-BLK-41$/)).toBeInTheDocument());

    const editor = within(screen.getByLabelText(/^Sửa biến thể SHOE-001-BLK-41$/));
    fireEvent.change(editor.getByLabelText('Giá bán (VND)'), { target: { value: '' } });
    fireEvent.click(editor.getByRole('button', { name: 'Lưu thay đổi' }));

    await waitFor(() => expect(updateVariantMock).toHaveBeenCalledWith(
      '10000000-0000-4000-8000-000000000001',
      'v-1',
      expect.objectContaining({ price_minor: null, expected_product_version: 7 }),
      expect.any(String),
    ));
  });

  it('shows no variant editor when a default API detail read fails', async () => {
    getProductFromApi.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));
    render(<ProductDetailPage id="product-runner-001" mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
    expect(screen.queryByLabelText(/^Sửa biến thể/)).toBeNull();
  });

  it('shows no lifecycle control when a default API detail read fails', async () => {
    getProductFromApi.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));
    // The fixture catalogue keys on its own id, not the API's, so the fallback can only render
    // for an id the prototype actually knows.
    render(<ProductDetailPage id="product-runner-001" mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
    // Archiving a product the screen never read is exactly what this placement prevents.
    expect(screen.queryByLabelText('Vòng đời sản phẩm')).toBeNull();
  });
});

describe('ProductDetailPage · CSV import', () => {
  const pid = '10000000-0000-4000-8000-000000000001';
  const file = 'master_sku,variant_sku,name,category,brand,color,size,currency\nIMP-A,IMP-A-41,One,FOOTWEAR,N,BLACK,41,VND\n';

  beforeEach(() => {
    importProductsMock.mockReset();
    apiResolves(apiDetail({ status: 'active' }));
  });

  it('runs a dry run before it will let anything be committed', async () => {
    importProductsMock.mockResolvedValue({ batch_id: 'b-1', dry_run: true, created: 1, attached: 0, unchanged: 0, rejected: 0, problems: [], imported_at: '2026-10-13T00:00:00Z' });
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Nhập danh mục bằng CSV')).toBeInTheDocument());

    const panel = within(screen.getByLabelText('Nhập danh mục bằng CSV'));
    const commit = panel.getByRole('button', { name: 'Ghi vào danh mục' });
    // Committing before reading the dry run would put a catalogue on screen that nobody has
    // looked at, so the button does not exist in a clickable state until one has come back.
    await expect(commit).toBeDisabled();

    fireEvent.change(panel.getByLabelText('Nội dung CSV'), { target: { value: file } });
    fireEvent.click(panel.getByRole('button', { name: 'Kiểm tra (không ghi)' }));
    await waitFor(() => expect(importProductsMock).toHaveBeenCalledWith(file, true, undefined, expect.any(AbortSignal)));
    await waitFor(() => expect(commit).toBeEnabled());
  });

  it('invalidates the dry run when the CSV is edited, forcing a re-check', async () => {
    importProductsMock.mockResolvedValue({ batch_id: 'b-3', dry_run: true, created: 1, attached: 0, unchanged: 0, rejected: 0, problems: [], imported_at: '2026-10-13T00:00:00Z' });
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Nhập danh mục bằng CSV')).toBeInTheDocument());

    const panel = within(screen.getByLabelText('Nhập danh mục bằng CSV'));
    const commit = panel.getByRole('button', { name: 'Ghi vào danh mục' });
    fireEvent.change(panel.getByLabelText('Nội dung CSV'), { target: { value: file } });
    fireEvent.click(panel.getByRole('button', { name: 'Kiểm tra (không ghi)' }));
    await waitFor(() => expect(commit).toBeEnabled());

    // Editing the text makes the preview describe a file that no longer exists in the box. The
    // commit must go back to disabled until the NEW text has been checked.
    fireEvent.change(panel.getByLabelText('Nội dung CSV'), { target: { value: `${file}IMP-D,IMP-D-42,Two,FOOTWEAR,N,BLACK,42,VND\n` } });
    await expect(commit).toBeDisabled();
    await expect(panel.queryByText(/Kiểm tra xong/)).toBeNull();
    // Committing now would send text nobody dry-ran, so the API mock must not have been asked.
    expect(importProductsMock).toHaveBeenCalledTimes(1);
  });

  it('ignores a dry-run response that arrives after the CSV changed', async () => {
    let resolveDryRun!: (value: {
      batch_id: string; dry_run: boolean; created: number; attached: number; unchanged: number;
      rejected: number; problems: never[]; imported_at: string;
    }) => void;
    let signal: AbortSignal | undefined;
    importProductsMock.mockImplementationOnce((_csv: string, _dryRun: boolean, _key?: string, requestSignal?: AbortSignal) => {
      signal = requestSignal;
      return new Promise((resolve) => { resolveDryRun = resolve; });
    });
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Nhập danh mục bằng CSV')).toBeInTheDocument());

    const panel = within(screen.getByLabelText('Nhập danh mục bằng CSV'));
    const nextFile = `${file}IMP-D,IMP-D-42,Two,FOOTWEAR,N,BLACK,42,VND\n`;
    fireEvent.change(panel.getByLabelText('Nội dung CSV'), { target: { value: file } });
    fireEvent.click(panel.getByRole('button', { name: 'Kiểm tra (không ghi)' }));
    await waitFor(() => expect(importProductsMock).toHaveBeenCalledTimes(1));

    fireEvent.change(panel.getByLabelText('Nội dung CSV'), { target: { value: nextFile } });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      resolveDryRun({ batch_id: 'stale-a', dry_run: true, created: 1, attached: 0, unchanged: 0, rejected: 0, problems: [], imported_at: '2026-10-13T00:00:00Z' });
      await Promise.resolve();
    });

    expect(panel.queryByText(/Kiểm tra xong/)).toBeNull();
    expect(panel.getByRole('button', { name: 'Ghi vào danh mục' })).toBeDisabled();
    expect(importProductsMock).toHaveBeenCalledTimes(1);
  });

  it('names the offending line and keeps the commit disabled', async () => {
    importProductsMock.mockResolvedValue({
      batch_id: 'b-2', dry_run: true, created: 0, attached: 0, unchanged: 1, rejected: 1,
      problems: [{ row_number: 3, sku: 'IMP-B', field: 'variant_sku', message: 'must match ^[A-Z0-9][A-Z0-9._-]{0,63}$' }],
      imported_at: '2026-10-13T00:00:00Z',
    });
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Nhập danh mục bằng CSV')).toBeInTheDocument());

    const panel = within(screen.getByLabelText('Nhập danh mục bằng CSV'));
    fireEvent.change(panel.getByLabelText('Nội dung CSV'), { target: { value: file } });
    fireEvent.click(panel.getByRole('button', { name: 'Kiểm tra (không ghi)' }));
    await waitFor(() => expect(screen.getByText(/Dòng 3 \(IMP-B\)/)).toBeInTheDocument());
    // Line 1 is the header, so "dòng 3" is the row a human counts to find.
    expect(screen.getByText(/Dòng 3 \(IMP-B\)/)).toHaveTextContent('must match');
    await expect(panel.getByRole('button', { name: 'Ghi vào danh mục' })).toBeDisabled();
  });

  it('says the file is all-or-nothing before anyone clicks', async () => {
    render(<ProductDetailPage id={pid} mode="default" canManageCatalog />);
    await openOperations('Vòng đời và tác vụ danh mục');
    await waitFor(() => expect(screen.getByLabelText('Nhập danh mục bằng CSV')).toBeInTheDocument());
    const panel = screen.getByLabelText('Nhập danh mục bằng CSV');
    expect(panel).toHaveTextContent('cả tệp không được ghi');
    // The draft rule is on screen because it is the part an operator is most likely to be
    // surprised by: an import that produced sellable products.
    expect(panel).toHaveTextContent('Bản nháp');
  });

  it('shows no import panel when a default API detail read fails', async () => {
    getProductFromApi.mockImplementation(() => Promise.reject(new Error('Không kết nối được API (HTTP 0).')));
    render(<ProductDetailPage id="product-runner-001" mode="default" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
    expect(screen.queryByLabelText('Nhập danh mục bằng CSV')).toBeNull();
  });
});
