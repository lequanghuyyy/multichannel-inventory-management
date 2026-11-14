import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { WooCommerceProductPublicationState } from '../../../api/woocommerce';
import type { ProductApiDetail } from '../product.detail.api';
import { WooCommerceProductPanel } from './WooCommerceProductPanel';

const api = vi.hoisted(() => ({
  getWooCommerceProductJobs: vi.fn(), getWooCommerceProductState: vi.fn(), queueWooCommerceProductAction: vi.fn(),
  retryWooCommerceProductJob: vi.fn(), getWooCommerceStatus: vi.fn(), getChannelPrices: vi.fn(),
}));
vi.mock('../../../api/woocommerce', () => ({ ...api }));
vi.mock('../../../api/products', () => ({ getChannelPrices: api.getChannelPrices }));
vi.mock('./ProductInventorySync', () => ({ ProductInventorySync: () => null }));

const product: ProductApiDetail = {
  id: '10000000-0000-4000-8000-000000000001', productVersion: 3, name: 'Test shoe', category: 'FOOTWEAR', brand: '',
  description: '', shortDescription: '', attributes: {}, weightGrams: null, lengthMM: null, widthMM: null, heightMM: null,
  condition: '', masterSku: 'TEST-SHOE', currency: 'VND', status: 'active', variantCount: 1,
  onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0,
  variants: [{ id: '20000000-0000-4000-8000-000000000001', sku: 'TEST-SHOE-BLK-41', color: 'BLACK', colorDescription: '',
    size: '41', priceMinor: 500000, barcode: '', isActive: true, variantIsActive: true, onHand: 0, reserved: 0,
    safetyBuffer: 0, availableToSell: 0 }],
};

const state = (overrides: Partial<WooCommerceProductPublicationState> = {}): WooCommerceProductPublicationState => ({
  product_id: product.id, product_version: product.productVersion, publication_state: 'draft', mapping_state: 'mapped',
  catalog_sync_state: 'verified', inventory_activation_state: 'inactive', inventory_sync_state: 'not_synced',
  allocation_states: [], inventory_tracking_ready: false, ready_to_sell: false, remote_product_id: 81,
  channel_connected: true, product_write_enabled: true, inventory_write_enabled: true, ...overrides,
});

beforeEach(() => {
  api.getWooCommerceStatus.mockResolvedValue({ channel_id: '30000000-0000-4000-8000-000000000001', store_name: 'WooCommerce Local' });
  api.getWooCommerceProductJobs.mockResolvedValue([]);
  api.getWooCommerceProductState.mockResolvedValue(state());
  api.getChannelPrices.mockResolvedValue({ product_id: product.id, prices: [] });
  api.queueWooCommerceProductAction.mockResolvedValue({ id: 'job-1', operation: 'draft', product_version: 3 });
  api.retryWooCommerceProductJob.mockResolvedValue({ id: 'job-retry', operation: 'inventory_activate', product_version: 3 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('WooCommerceProductPanel', () => {
  it('uses a WooCommerce channel price when the Core SKU has no price', async () => {
    const withoutCorePrice = { ...product, variants: [{ ...product.variants[0]!, priceMinor: null }] };
    api.getWooCommerceProductState.mockResolvedValue(state({ remote_product_id: undefined, publication_state: 'blocked', mapping_state: 'unmapped' }));
    api.getWooCommerceProductJobs.mockResolvedValue([{
      id: 'old-price-job', product_id: product.id, product_version: 3, operation: 'sync',
      state: 'conflict', safe_error_code: 'CORE_PRICE_MISSING', attempt_count: 1,
      created_at: '2026-11-07T04:06:00Z', updated_at: '2026-11-07T04:06:00Z',
    }]);
    api.getChannelPrices.mockResolvedValue({ product_id: product.id, prices: [{
      channel_id: '30000000-0000-4000-8000-000000000001', channel_code: 'woocommerce',
      variant_id: product.variants[0]!.id, sku: product.variants[0]!.sku, core_currency: 'VND', currency: 'VND',
      override_amount: '100000', desired_amount: '100000', revision: 1, sync_state: 'pending', write_enabled: true,
    }] });
    render(<WooCommerceProductPanel product={withoutCorePrice} canWrite />);

    const create = await screen.findByRole('button', { name: 'Tạo bản nháp' });
    await waitFor(() => expect(create).toBeEnabled());
    expect(screen.getByText(/Lần thử trước chưa dùng được giá riêng đã lưu/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận tạo bản nháp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.queueWooCommerceProductAction).toHaveBeenCalledWith(product.id, {
      operation: 'draft', expected_product_version: 3, confirm: true,
    }, expect.stringMatching(/^woo-product-draft-/)));
  });

  it('queues catalog sync without stock fields after connection and readiness checks pass', async () => {
    render(<WooCommerceProductPanel product={product} canWrite />);
    const sync = await screen.findByRole('button', { name: 'Cập nhật thông tin và giá' });
    await waitFor(() => expect(sync).toBeEnabled());
    fireEvent.click(sync);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận cập nhật thông tin và giá' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.queueWooCommerceProductAction).toHaveBeenCalledWith(product.id, {
      operation: 'sync', expected_product_version: 3,
    }, expect.stringMatching(/^woo-product-sync-/)));
  });

  it('publishes a mapped draft with automatic stock activation in one confirmed action', async () => {
    render(<WooCommerceProductPanel product={product} canWrite />);
    const publish = await screen.findByRole('button', { name: 'Đăng bán' });
    await waitFor(() => expect(publish).toBeEnabled());
    fireEvent.click(publish);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận đăng bán' }));
    expect(await screen.findByRole('dialog', { name: 'Đăng bán sản phẩm?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.queueWooCommerceProductAction).toHaveBeenCalledWith(product.id, {
      operation: 'publish', expected_product_version: 3, confirm: true,
    }, expect.stringMatching(/^woo-product-publish-/)));
  });

  it('blocks publish until the Core product is active', async () => {
    render(<WooCommerceProductPanel product={{ ...product, status: 'draft' }} canWrite />);
    const publish = await screen.findByRole('button', { name: 'Đăng bán' });
    fireEvent.click(publish);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện' }));
    expect(screen.getByText('Sản phẩm Core cần ở trạng thái đang hoạt động trước khi đăng bán.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận đăng bán' })).not.toBeInTheDocument();
    expect(api.queueWooCommerceProductAction).not.toHaveBeenCalled();
  });

  it('describes a pending worker job without implying human approval', async () => {
    api.getWooCommerceProductJobs.mockResolvedValue([{
      id: 'job-pending', product_id: product.id, product_version: 3, operation: 'sync',
      state: 'pending', attempt_count: 0, created_at: '2026-11-07T04:06:00Z', updated_at: '2026-11-07T04:06:00Z',
    }]);
    render(<WooCommerceProductPanel product={product} canWrite />);
    expect(await screen.findByText('Đang chờ đồng bộ')).toBeInTheDocument();
    expect(screen.getByText(/Trạng thái tự cập nhật; không cần gửi lại/)).toBeInTheDocument();
    expect(screen.queryByText('Chờ duyệt')).not.toBeInTheDocument();
  });

  it('checks an unlinked draft conflict before retrying the draft', async () => {
    api.getWooCommerceProductState.mockResolvedValue(state({
      remote_product_id: undefined, publication_state: 'conflict', mapping_state: 'conflict', catalog_sync_state: 'conflict',
    }));
    render(<WooCommerceProductPanel product={product} canWrite />);
    await screen.findByRole('button', { name: 'Tạo bản nháp' });
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận tạo bản nháp' }));
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.queueWooCommerceProductAction).toHaveBeenCalledWith(product.id, {
      operation: 'draft', expected_product_version: 3, confirm: true,
    }, expect.stringMatching(/^woo-product-draft-/)));
  });

  it('shows the same expandable history pattern as Shopify without a manual refresh', async () => {
    api.getWooCommerceProductJobs.mockResolvedValue([{
      id: 'job-sync', product_id: product.id, product_version: 3, operation: 'sync',
      state: 'succeeded', attempt_count: 1, created_at: '2026-11-07T04:06:00Z', updated_at: '2026-11-07T04:06:00Z',
    }]);
    render(<WooCommerceProductPanel product={product} canWrite />);
    await screen.findByText('Tồn kho trên kênh');
    expect(screen.queryByRole('button', { name: /Làm mới/ })).not.toBeInTheDocument();
    const history = screen.getByRole('button', { name: 'Xem lịch sử' });
    expect(history).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(history);
    expect(screen.getByRole('heading', { name: 'Lịch sử thao tác' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Ẩn lịch sử' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Đồng bộ thông tin sản phẩm')).toBeInTheDocument();
  });

  it('shows allocation status after publication and warns when stock tracking is not verified', async () => {
    api.getWooCommerceProductState.mockResolvedValue(state({ publication_state: 'published', inventory_activation_state: 'inactive' }));
    render(<WooCommerceProductPanel product={product} canWrite />);
    expect(await screen.findByText('Tồn kho trên kênh')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Sản phẩm đã đăng nhưng WooCommerce chưa xác minh theo dõi tồn');
    expect(screen.getByText(/Số lượng trên cửa hàng có thể khác hạn mức phân bổ chung của Core/)).toBeInTheDocument();
  });

  it('explains a published unlinked conflict and does not offer another draft', async () => {
    api.getWooCommerceProductState.mockResolvedValue(state({
      remote_product_id: undefined, publication_state: 'published', mapping_state: 'conflict',
      catalog_sync_state: 'conflict', last_error_code: 'PUBLISHED_PRODUCT_REQUIRES_REVIEW',
    }));
    render(<WooCommerceProductPanel product={product} canWrite />);
    expect(await screen.findByText(/WooCommerce đã có sản phẩm đang bán cùng mã định danh/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện' }));
    expect(screen.getByText(/Sản phẩm đã có trên WooCommerce/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Xác nhận tạo bản nháp' })).not.toBeInTheDocument();
    expect(api.queueWooCommerceProductAction).not.toHaveBeenCalled();
  });

  it('checks WooCommerce state before the wizard submits an explicit draft action', async () => {
    const onDraftSubmitReady = vi.fn();
    api.getWooCommerceProductState.mockResolvedValue(state({ remote_product_id: undefined, publication_state: 'not_exported', mapping_state: 'unmapped', catalog_sync_state: 'not_synced' }));
    render(<WooCommerceProductPanel product={product} canWrite wizardMode onDraftSubmitReady={onDraftSubmitReady} />);
    await screen.findByRole('button', { name: 'Kiểm tra điều kiện' });
    expect(onDraftSubmitReady).toHaveBeenLastCalledWith(null);
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra điều kiện' }));
    await waitFor(() => expect(onDraftSubmitReady).toHaveBeenLastCalledWith(expect.any(Function)));
    expect(api.getWooCommerceProductState).toHaveBeenCalledWith(product.id, expect.any(AbortSignal));
    await onDraftSubmitReady.mock.lastCall?.[0]();
    expect(api.queueWooCommerceProductAction).toHaveBeenCalledWith(product.id, {
      operation: 'draft', expected_product_version: 3, confirm: true,
    }, expect.stringMatching(/^woo-product-draft-/));
  });
});
