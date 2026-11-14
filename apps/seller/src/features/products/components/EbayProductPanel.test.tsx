import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EbayProductPublicationState, EbayStatus } from '../../../api/ebay';
import type { ProductApiDetail } from '../product.detail.api';
import { EbayProductPanel } from './EbayProductPanel';

const api = vi.hoisted(() => ({
  getEbayStatus: vi.fn(), getEbayProductState: vi.fn(), getEbayProductJobs: vi.fn(), getEbayInventoryLocations: vi.fn(),
  getEbayPolicies: vi.fn(), getEbayCategoryTree: vi.fn(), getEbayCategoryAspects: vi.fn(), getEbayCategorySuggestions: vi.fn(),
  createEbayInventoryLocation: vi.fn(), setEbayInventoryLocationEnabled: vi.fn(), queueEbayProductAction: vi.fn(),
}));
vi.mock('../../../api/ebay', () => ({ ...api }));
vi.mock('./ProductInventorySync', () => ({ ProductInventorySync: ({ channelName }: { channelName?: string }) => <div>Mock tồn kho {channelName}</div> }));

const product: ProductApiDetail = {
  id: '10000000-0000-4000-8000-000000000001', productVersion: 3, name: 'Test shoe', category: 'FOOTWEAR', brand: 'OctoFlow',
  description: 'Core description', shortDescription: '', attributes: {}, weightGrams: null, lengthMM: null, widthMM: null, heightMM: null,
  condition: '', masterSku: 'TEST-SHOE', currency: 'VND', status: 'active', variantCount: 1,
  onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0,
  variants: [{ id: '20000000-0000-4000-8000-000000000001', sku: 'TEST-SHOE-BLK-41', color: 'BLACK', colorDescription: '',
    size: '41', priceMinor: 500000, barcode: '', isActive: true, variantIsActive: true, onHand: 0, reserved: 0,
    safetyBuffer: 0, availableToSell: 0 }],
};

const status: EbayStatus = {
  enabled: true, environment: 'sandbox', marketplace_id: 'EBAY_US', inventory_write_enabled: false,
  product_publish_enabled: true, order_write_enabled: false,
  connections: [{ channel_id: '30000000-0000-4000-8000-000000000001', seller_user_id: 'seller', seller_username: 'test-seller',
    marketplace_id: 'EBAY_US', environment: 'sandbox', connection_status: 'connected', granted_scopes: [], mapping_count: 0 }],
};

const state = (overrides: Partial<EbayProductPublicationState> = {}): EbayProductPublicationState => ({
  channel_id: status.connections[0]!.channel_id, product_id: product.id, product_version: product.productVersion,
  marketplace_id: 'EBAY_US', publication_state: 'not_exported', mapping_state: 'unmapped', catalog_sync_state: 'not_synced',
  configuration: {}, channel_connected: true, product_publish_enabled: true, inventory_write_enabled: false, ...overrides,
});

beforeEach(() => {
  api.getEbayStatus.mockResolvedValue(status);
  api.getEbayProductState.mockResolvedValue(state());
  api.getEbayProductJobs.mockResolvedValue([]);
  api.getEbayInventoryLocations.mockResolvedValue([{ merchantLocationKey: 'LOC-1', name: 'Main warehouse', merchantLocationStatus: 'ENABLED' }]);
  api.getEbayPolicies.mockResolvedValue({ marketplace_id: 'EBAY_US', policy_management_enabled: true,
    payment_policies: [{ paymentPolicyId: 'PAY-1', name: 'Payment' }], fulfillment_policies: [{ fulfillmentPolicyId: 'SHIP-1', name: 'Shipping' }],
    return_policies: [{ returnPolicyId: 'RET-1', name: 'Returns' }] });
  api.getEbayCategoryTree.mockResolvedValue({ categoryTreeId: '0' });
  api.getEbayCategoryAspects.mockResolvedValue({ categoryTreeId: '0', categoryId: '123', aspects: [] });
  api.getEbayCategorySuggestions.mockResolvedValue([]);
  api.createEbayInventoryLocation.mockResolvedValue({ location: { merchantLocationKey: 'LOC-1', name: 'Main warehouse' }, created: true, reconciled: false });
  api.setEbayInventoryLocationEnabled.mockResolvedValue({ location: { merchantLocationKey: 'LOC-1', name: 'Main warehouse', merchantLocationStatus: 'ENABLED' }, enabled: true });
  api.queueEbayProductAction.mockResolvedValue({ id: 'job-1', channel_id: status.connections[0]!.channel_id, product_id: product.id,
    product_version: 3, operation: 'draft', state: 'pending', attempt_count: 0, created_at: '', updated_at: '' });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('EbayProductPanel', () => {
  it('shows allocation progress and missing inventory permission after an offer is published', async () => {
    api.getEbayProductState.mockResolvedValue(state({ publication_state: 'published', mapping_state: 'verified', catalog_sync_state: 'verified' }));
    render(<EbayProductPanel product={product} canWrite />);
    expect(await screen.findByRole('heading', { name: 'Phân bổ và tồn kho sau khi đăng' })).toBeInTheDocument();
    expect(screen.getByText(/chưa cấp quyền ghi tồn/)).toBeInTheDocument();
    expect(screen.getByText(/Listing đã được đăng nhưng tồn chưa được xác minh/)).toBeInTheDocument();
    expect(screen.getByText('Mock tồn kho eBay')).toBeInTheDocument();
  });

  it('keeps Core VND price out of the marketplace price input', async () => {
    render(<EbayProductPanel product={product} canWrite />);
    const price = await screen.findByRole('spinbutton');
    await screen.findByRole('option', { name: 'USD' });
    expect(screen.getByLabelText('Tiền tệ marketplace')).toHaveValue('USD');
    expect(price).toHaveValue(null);
    expect(screen.getByText(/Giá được thiết lập riêng theo tiền tệ của marketplace/)).toBeInTheDocument();
  });

  it('keeps all product writes disabled when the Sandbox flag is off', async () => {
    api.getEbayStatus.mockResolvedValue({ ...status, product_publish_enabled: false });
    api.getEbayProductState.mockResolvedValue(state({ product_publish_enabled: false }));
    render(<EbayProductPanel product={product} canWrite />);
    expect(await screen.findByText(/Tài khoản hiện chưa cho phép OctoFlow tạo hoặc cập nhật sản phẩm trên eBay/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tạo / cập nhật bản nháp' })).toBeDisabled();
  });

  it('requires confirmation and queues a target-currency draft with zero-stock semantics', async () => {
    render(<EbayProductPanel product={product} canWrite />);
    await screen.findByText('EBAY_US');
    fireEvent.change(screen.getByLabelText('Mã danh mục'), { target: { value: '123' } });
    fireEvent.change(screen.getByLabelText('URL ảnh HTTPS công khai, mỗi dòng một URL'), { target: { value: 'https://localhost/shoe.jpg' } });
    fireEvent.change(screen.getByLabelText('Địa điểm gửi hàng đang bật'), { target: { value: 'LOC-1' } });
    fireEvent.change(screen.getByLabelText('Chính sách thanh toán'), { target: { value: 'PAY-1' } });
    fireEvent.change(screen.getByLabelText('Chính sách giao hàng'), { target: { value: 'SHIP-1' } });
    fireEvent.change(screen.getByLabelText('Chính sách đổi trả'), { target: { value: 'RET-1' } });
    fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '24.95' } });
    const draft = screen.getByRole('button', { name: 'Tạo / cập nhật bản nháp' });
    expect(await screen.findByText(/không nhận localhost/)).toBeInTheDocument();
    expect(draft).toBeDisabled();
    fireEvent.change(screen.getByLabelText('URL ảnh HTTPS công khai, mỗi dòng một URL'), { target: { value: 'https://images.example.com/shoe.jpg' } });
    await waitFor(() => expect(draft).toBeEnabled());
    fireEvent.click(draft);
    expect(await screen.findByRole('dialog', { name: 'Tạo hoặc cập nhật bản nháp eBay?' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Xác nhận' }));
    await waitFor(() => expect(api.queueEbayProductAction).toHaveBeenCalledWith(status.connections[0]!.channel_id, product.id, {
      operation: 'draft', expected_product_version: 3, confirm: true,
      spec: expect.objectContaining({ price_currency: 'USD', prices: { 'TEST-SHOE-BLK-41': '24.95' }, merchant_location_key: 'LOC-1', category_id: '123' }),
    }, expect.stringMatching(/^ebay-product-draft-/)));
  });
});
