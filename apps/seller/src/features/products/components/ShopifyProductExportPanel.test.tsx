import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShopifyProductExportPanel } from './ShopifyProductExportPanel';
import type { ProductApiDetail } from '../product.detail.api';

const api = vi.hoisted(() => ({ getShopifyStatus: vi.fn(), getShopifyProductSyncJobs: vi.fn(), pushShopifyProduct: vi.fn(), retryShopifyProductSync: vi.fn() }));
vi.mock('../../../api/shopify', () => api);

const connected = {
  enabled: true, connected: true, currency_compatible: true, product_write_enabled: true, product_sync_available: true,
};

const product = (overrides: Partial<ProductApiDetail> = {}): ProductApiDetail => ({
  id: '10000000-0000-4000-8000-000000000001', productVersion: 1, name: 'Test shoe', category: 'FOOTWEAR', brand: '',
  description: '', shortDescription: '', attributes: {}, weightGrams: null, lengthMM: null, widthMM: null, heightMM: null, condition: '',
  masterSku: 'TEST-SHOE', currency: 'VND', status: 'active', variantCount: 1,
  onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0,
  variants: [{ id: '20000000-0000-4000-8000-000000000001', sku: 'TEST-SHOE-BLK-41', color: 'BLACK',
    colorDescription: '', size: '41', priceMinor: 500000, barcode: '', isActive: true, variantIsActive: true,
    onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0 }],
  ...overrides,
});

beforeEach(() => {
  api.getShopifyStatus.mockResolvedValue(connected);
  api.getShopifyProductSyncJobs.mockResolvedValue([]);
  api.pushShopifyProduct.mockResolvedValue({ job_id: 'job-1', product_id: product().id, product_version: 1, state: 'pending' });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ShopifyProductExportPanel', () => {
  it('pushes one Core product as a Shopify draft after the gates pass', async () => {
    render(<ShopifyProductExportPanel product={product()} />);
    const button = await screen.findByRole('button', { name: 'Xếp lịch đồng bộ sản phẩm' });
    await waitFor(() => expect(button).toBeEnabled());
    fireEvent.click(button);
    await waitFor(() => expect(api.pushShopifyProduct).toHaveBeenCalledWith(product().id));
    expect(await screen.findByRole('status')).toHaveTextContent('phiên bản sản phẩm 1');
  });

  it('blocks export until Shopify currency matches VND', async () => {
    api.getShopifyStatus.mockResolvedValue({ ...connected, currency_compatible: false });
    render(<ShopifyProductExportPanel product={product()} />);
    const button = await screen.findByRole('button', { name: 'Xếp lịch đồng bộ sản phẩm' });
    await waitFor(() => expect(button).toBeDisabled());
    expect(screen.getByText('Đổi tiền tệ Shopify sang VND rồi kiểm tra kết nối lại.')).toBeInTheDocument();
    expect(api.pushShopifyProduct).not.toHaveBeenCalled();
  });

  it('blocks export when a variant has no price', async () => {
    render(<ShopifyProductExportPanel product={product({ variants: [{ ...product().variants[0]!, priceMinor: null }] })} />);
    expect(await screen.findByText(/giá cho từng biến thể/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Xếp lịch đồng bộ sản phẩm' })).toBeDisabled();
  });

  it('reloads channel sync evidence when the Core product revision changes', async () => {
    const initial = product();
    const { rerender } = render(<ShopifyProductExportPanel product={initial} />);
    await waitFor(() => expect(api.getShopifyProductSyncJobs).toHaveBeenCalledTimes(1));

    rerender(<ShopifyProductExportPanel product={product({ productVersion: initial.productVersion + 1 })} />);
    await waitFor(() => expect(api.getShopifyProductSyncJobs).toHaveBeenCalledTimes(2));
  });
});
