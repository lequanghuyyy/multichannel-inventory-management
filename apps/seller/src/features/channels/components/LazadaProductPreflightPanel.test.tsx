import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductApiDetail } from '../../products/product.detail.api';
import { LazadaProductPreflightPanel } from './LazadaProductPreflightPanel';

const api = vi.hoisted(() => ({ specification: vi.fn(), brands: vi.fn(), images: vi.fn() }));
vi.mock('../../../api/lazada', () => ({
  getLazadaSpecification: api.specification,
  getLazadaBrands: api.brands,
  getLazadaProductImages: api.images,
}));
vi.mock('./LazadaCategoryPanel', () => ({ LazadaCategoryPanel: () => null }));
vi.mock('./ChannelProductImage', () => ({ ChannelProductImage: () => <span aria-hidden="true" /> }));

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('LazadaProductPreflightPanel', () => {
  it('requires an explicit choice from the Lazada brand list even when Core brand matches', async () => {
    api.specification.mockResolvedValue({ spec: {
      category_id: '', brand_id: '', attributes: {}, expected_core_version: 1, metadata_version: 0,
      skus: [{ variant_id: 'variant-1', attributes: {}, package_length: '', package_width: '', package_height: '', package_weight: '', package_content: '' }],
    }, core_version: 1, stale: false });
    api.brands.mockResolvedValue({ data: { module: [{ brand_id: 123, name: 'Octo' }], total_record: 1 } });
    api.images.mockResolvedValue({ accepted: 0, product_images: 0, variant_images: 0, primary_ready: false, items: [], issues: [] });
    const product = {
      id: 'product-1', productVersion: 1, name: 'Áo', brand: 'Octo', category: 'Thời trang', description: '', shortDescription: '', attributes: {},
      currency: 'VND', variants: [{ id: 'variant-1', sku: 'AO-1', color: '', size: '', priceMinor: 100000, isActive: true, variantIsActive: true }],
      weightGrams: null, lengthMM: null, widthMM: null, heightMM: null,
    } as ProductApiDetail;
    render(<LazadaProductPreflightPanel channelId="channel-1" product={product} canWrite />);

    expect(await screen.findByRole('button', { name: 'Octo' })).toBeInTheDocument();
    expect(screen.getByText('Chưa chọn thương hiệu')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Octo' }));
    expect(screen.getByText('Đã chọn thương hiệu')).toBeInTheDocument();
  });
});
