import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Channel } from '../../../api/channels';
import type { ChannelProduct } from '../../../api/channel-operations';
import { ChannelProductPublishingWizard } from './ChannelProductPublishingWizard';

const api = vi.hoisted(() => ({ listChannelProducts: vi.fn(), getProduct: vi.fn(), listProductMedia: vi.fn(), getProductMediaContent: vi.fn(), getChannelPrices: vi.fn(), getProductPublicationHistory: vi.fn(), listPublicationWorkflows: vi.fn(), getPublicationWorkflow: vi.fn() }));
vi.mock('../../../api/channel-operations', () => ({ listChannelProducts: api.listChannelProducts }));
vi.mock('../../../api/publication-workflows', () => ({ listPublicationWorkflows: api.listPublicationWorkflows, getPublicationWorkflow: api.getPublicationWorkflow }));
vi.mock('../../../api/products', () => ({
  getProduct: api.getProduct,
  listProductMedia: api.listProductMedia,
  getProductMediaContent: api.getProductMediaContent,
  getChannelPrices: api.getChannelPrices,
  getProductPublicationHistory: api.getProductPublicationHistory,
}));
vi.mock('../../products/components/ProductPublicationPanel', () => ({
  ProductPublicationPanel: (props: { onDraftPreview: (preview: unknown) => void; onDraftSubmitReady: (submit: () => Promise<void>) => void; onDraftQueued: (result: { id: string; state: string }) => void }) => <button type="button" onClick={() => {
    props.onDraftPreview({ ready: true, supported: true, issues: [] });
    props.onDraftSubmitReady(async () => { props.onDraftQueued({ id: 'request-1', state: 'queued' }); });
  }}>Kiểm tra điều kiện mẫu</button>,
}));
vi.mock('../../products/components/EbayProductPanel', () => ({ EbayProductPanel: () => null }));
vi.mock('../../products/components/WooCommerceProductPanel', () => ({
  WooCommerceProductPanel: () => <p>Đăng bán sản phẩm WooCommerce chưa được hỗ trợ.</p>,
}));

const channel = { id: '30000000-0000-4000-8000-000000000001', code: 'shopify', name: 'Shopify', type: 'website', environment: 'sandbox', status: 'connected' } as Channel;
const candidate = {
  product_id: '10000000-0000-4000-8000-000000000001', name: 'Giày thể thao ABC', category: 'Giày', brand: 'OctoFlow', master_sku: 'GIAY-001', currency: 'VND',
  core_status: 'active', product_version: 4, variant_count: 1, eligible_variant_count: 1, listing_count: 0, publication_state: 'not_exported', state: 'not_published', mapping_state: 'unmapped',
  catalog_sync_state: 'not_synced', price_sync_state: 'not_synced', inventory_sync_state: 'not_synced', actions: { preflight: true, draft: true, publish: false, map_sku: false, catalog_sync: true, price_sync: false, inventory_sync: false, pause: false, retry: false, history: true },
};

beforeEach(() => {
  api.listChannelProducts.mockResolvedValue({ products: [candidate], total_count: 1, limit: 25 });
  api.getProduct.mockResolvedValue({
    id: candidate.product_id, product_version: 4, name: candidate.name, category: candidate.category, brand: candidate.brand,
    description: 'Giày nhẹ, thoáng khí.', short_description: 'Giày chạy bộ', attributes: {}, weight_grams: null, length_mm: null, width_mm: null, height_mm: null,
    condition: 'new', master_sku: candidate.master_sku, currency: 'VND', status: 'active', variant_count: 1, on_hand: 0, reserved: 0, safety_buffer: 0, available_to_sell: 0,
    variants: [{ id: '20000000-0000-4000-8000-000000000001', sku: 'GIAY-001-41', color: 'Đen', color_description: '', size: '41', price_minor: 350000, barcode: '', is_active: true, variant_is_active: true, on_hand: 0, reserved: 0, safety_buffer: 0, available_to_sell: 0 }],
  });
  api.listProductMedia.mockResolvedValue({ media: [{ id: 'a0000000-0000-4000-8000-000000000001' }] });
  api.getProductMediaContent.mockResolvedValue(new Blob(['image']));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:product-image') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
  api.getChannelPrices.mockResolvedValue({ prices: [] });
  api.getProductPublicationHistory.mockResolvedValue({ requests: [{ id: 'request-1', state: 'draft', issues: [], last_error_code: '' }] });
  api.listPublicationWorkflows.mockResolvedValue({ items: [] });
});
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); });

describe('ChannelProductPublishingWizard', () => {
  it('selects a real Core product, checks it, confirms a draft, then reads the saved result', async () => {
    render(<ChannelProductPublishingWizard channel={channel} open canWrite onClose={vi.fn()} onCompleted={vi.fn()} />);

    fireEvent.click(await screen.findByRole('button', { name: /Giày thể thao ABC/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Điều phối đăng và phân bổ tồn theo một quy trình/ }));
    expect(await screen.findByRole('heading', { name: 'Kiểm tra sản phẩm trước khi đăng' })).toBeInTheDocument();
    expect(screen.getByText(/Có thể bán trong Core: 0/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục' }));

    fireEvent.click(await screen.findByRole('button', { name: 'Kiểm tra điều kiện mẫu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Tiếp tục xác nhận' }));
    expect(await screen.findByRole('heading', { name: 'Xác nhận tạo bản nháp trên Shopify' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tạo bản nháp trên Shopify' }));

    await waitFor(() => expect(screen.getByRole('heading', { name: 'Đã tạo và xác minh bản nháp' })).toBeInTheDocument());
    expect(api.getProduct).toHaveBeenCalledWith(candidate.product_id, expect.any(AbortSignal));
    expect(api.listChannelProducts).toHaveBeenCalledWith(channel.id, expect.objectContaining({ state: 'not_published', limit: 25 }), expect.any(AbortSignal));
    expect(api.getProductPublicationHistory).toHaveBeenCalledWith(candidate.product_id, channel.id);
  });

  it('allows the Core price when a Shopify channel override is not configured', async () => {
    api.getChannelPrices.mockResolvedValue({ prices: [] });
    render(<ChannelProductPublishingWizard channel={channel} open canWrite onClose={vi.fn()} onCompleted={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: /Giày thể thao ABC/ }));
    fireEvent.click(screen.getByRole('checkbox', { name: /Điều phối đăng và phân bổ tồn theo một quy trình/ }));
    expect(await screen.findByText('Mỗi SKU có giá Shopify (giá riêng hoặc Core)')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tiếp tục' })).toBeEnabled();
  });

  it('restores the saved workflow and shows allocation recovery after reopening', async () => {
    api.listPublicationWorkflows.mockResolvedValue({ items: [{ id: 'workflow-1', state: 'blocked', channels: [{ channel_id: channel.id }] }] });
    api.getPublicationWorkflow.mockResolvedValue({
      id: 'workflow-1', product_id: candidate.product_id, product_version: 4, state: 'blocked', can_retry: false,
      channels: [{ channel_id: channel.id, channel_code: 'shopify', channel_name: 'Shopify', state: 'published', last_error_code: '', last_error_message: '' }],
      variants: [{ variant_id: '20000000-0000-4000-8000-000000000001', sku: 'GIAY-001-41', allocation_state: 'blocked', available_to_sell: 7, core_version: 10, allocation_revision: 2, allocation_plan_id: 'plan-1', last_error_code: 'ALLOCATION_PAUSED', last_error_message: '' }],
      events: [],
    });
    render(<ChannelProductPublishingWizard channel={channel} open canWrite initialProduct={candidate as ChannelProduct} onClose={vi.fn()} onCompleted={vi.fn()} />);

    expect(await screen.findByText(/Workflow workflow-1/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'trang phân bổ tồn' })).toHaveAttribute('href', `/products/${candidate.product_id}?tab=operations&allocation=1`);
    fireEvent.click(screen.getByRole('button', { name: 'Tạo quy trình mới' }));
    expect(screen.queryByText(/Workflow workflow-1/)).not.toBeInTheDocument();
  });
});
