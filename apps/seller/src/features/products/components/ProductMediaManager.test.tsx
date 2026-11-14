import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ProductMediaManager } from './ProductMediaManager';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  content: vi.fn(),
  upload: vi.fn(),
  reorder: vi.fn(),
  remove: vi.fn(),
}));

vi.mock('../../../api/products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/products')>()),
  listProductMedia: api.list,
  getProductMediaContent: api.content,
  uploadProductMedia: api.upload,
  reorderProductMedia: api.reorder,
  deleteProductMedia: api.remove,
}));

const pid = '10000000-0000-4000-8000-000000000001';
const imageA = {
  id: 'a0000000-0000-4000-8000-000000000001', product_id: pid, position: 0, is_primary: true,
  mime_type: 'image/png' as const, byte_size: 512, sha256: 'a'.repeat(64), content_path: '/media/a', created_at: '2026-10-31T00:00:00Z',
};
const imageB = {
  id: 'a0000000-0000-4000-8000-000000000002', product_id: pid, position: 1, is_primary: false,
  mime_type: 'image/png' as const, byte_size: 1024, sha256: 'b'.repeat(64), content_path: '/media/b', created_at: '2026-10-31T00:00:00Z',
};
const product = {
  id: pid, productVersion: 7, name: 'Runner', category: 'Shoes', brand: '', description: '', shortDescription: '', attributes: {},
  weightGrams: null, lengthMM: null, widthMM: null, heightMM: null, condition: '', masterSku: '', currency: 'VND', status: 'active' as const,
  variantCount: 1, onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0,
  variants: [{ id: 'b0000000-0000-4000-8000-000000000001', sku: 'RUN-BLK-41', color: 'BLACK', colorDescription: '', size: '41', priceMinor: 0, barcode: '', isActive: true, variantIsActive: true, onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0 }],
};

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('ProductMediaManager', () => {
  it('renders authenticated previews and reorders images with the representative image preserved', async () => {
    api.list.mockResolvedValue({ product_version: 7, media: [imageA, imageB] });
    api.content.mockResolvedValue(new Blob(['image']));
    api.reorder.mockResolvedValue({ product_version: 8, media: [imageB, { ...imageA, position: 1 }] });
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:product-image') });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
    const onUpdated = vi.fn();
    render(<ProductMediaManager product={product} canWrite disabledReason="" onUpdated={onUpdated} />);

    await screen.findByAltText('Ảnh sản phẩm 2');
    fireEvent.click(screen.getByRole('button', { name: 'Di chuyển ảnh 2 lên' }));
    await waitFor(() => expect(api.reorder).toHaveBeenCalledWith(pid, {
      expected_product_version: 7,
      media_ids: [imageB.id, imageA.id],
      primary_media_id: imageA.id,
    }, expect.any(String)));
    expect(onUpdated).toHaveBeenCalledOnce();
  });

  it('uploads a selected image to the chosen variant scope', async () => {
    api.list.mockResolvedValue({ product_version: 7, media: [] });
    api.upload.mockResolvedValue({ product_version: 8, media: [{ ...imageA, variant_id: product.variants[0]!.id }] });
    const onUpdated = vi.fn();
    render(<ProductMediaManager product={product} canWrite onUpdated={onUpdated} />);
    await screen.findByText('Chưa có ảnh trong phạm vi này.');

    fireEvent.change(screen.getByLabelText('Phạm vi ảnh'), { target: { value: product.variants[0]!.id } });
    const file = new File(['png'], 'runner.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Chọn tệp ảnh'), { target: { files: [file] } });
    fireEvent.click(screen.getByRole('button', { name: 'Tải ảnh lên' }));

    await waitFor(() => expect(api.upload).toHaveBeenCalledWith(pid, file, 7, expect.any(String), product.variants[0]!.id));
    expect(onUpdated).toHaveBeenCalledOnce();
  });
});
