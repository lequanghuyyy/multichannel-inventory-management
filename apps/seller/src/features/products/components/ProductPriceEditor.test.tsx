import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../core/api-error';
import type { ProductApiDetail } from '../product.detail.api';
import { ProductPriceEditor } from './ProductPriceEditor';

const { updateVariantMock } = vi.hoisted(() => ({ updateVariantMock: vi.fn() }));

vi.mock('../../../api/products', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../api/products')>()),
  updateVariant: updateVariantMock,
}));

const product: ProductApiDetail = {
  id: '10000000-0000-4000-8000-000000000001',
  productVersion: 7,
  name: 'Running Shoe 001',
  category: 'FOOTWEAR',
  brand: 'Vantage',
  description: '',
  shortDescription: '',
  attributes: {},
  weightGrams: null,
  lengthMM: null,
  widthMM: null,
  heightMM: null,
  condition: '',
  masterSku: 'MSKU-RUN-4819',
  currency: 'VND',
  status: 'active',
  variantCount: 2,
  onHand: 18,
  reserved: 3,
  safetyBuffer: 2,
  availableToSell: 13,
  variants: [
    {
      id: 'v-1', sku: 'SHOE-001-BLK-41', color: 'BLACK', colorDescription: '', size: '41',
      priceMinor: 990000, barcode: '', isActive: true, variantIsActive: true,
      onHand: 10, reserved: 2, safetyBuffer: 1, availableToSell: 7,
    },
    {
      id: 'v-2', sku: 'SHOE-001-WHT-42', color: 'WHITE', colorDescription: '', size: '42',
      priceMinor: null, barcode: '', isActive: true, variantIsActive: false,
      onHand: 8, reserved: 1, safetyBuffer: 1, availableToSell: 6,
    },
  ],
};

beforeEach(() => {
  updateVariantMock.mockReset();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

function renderEditor(canWrite = true, onUpdated = vi.fn()) {
  render(<ProductPriceEditor product={product} canWrite={canWrite} disabledReason="Chỉ ADMIN được đổi giá." onUpdated={onUpdated} />);
  return onUpdated;
}

describe('ProductPriceEditor', () => {
  it('shows the current price range and flags unpriced variants', () => {
    renderEditor();
    const card = screen.getByLabelText('Giá bán sản phẩm');
    expect(card).toHaveTextContent('990.000 ₫');
    expect(card).toHaveTextContent('2 biến thể');
    expect(card).toHaveTextContent('1 biến thể chưa có giá sẽ không thể bán');
  });

  it('opens a price row for every variant', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa giá' }));

    expect(screen.getByLabelText('Giá bán của SHOE-001-BLK-41')).toHaveValue(990000);
    expect(screen.getByLabelText('Giá bán của SHOE-001-WHT-42')).toHaveValue(null);
    expect(screen.getByText('Ngừng bán')).toBeInTheDocument();
  });

  it('saves a changed price with the product revision and retries with the same key', async () => {
    updateVariantMock
      .mockRejectedValueOnce(new ApiRequestError({ code: 'PRODUCTS_UNAVAILABLE', message: 'Storage unavailable', request_id: 'r-1' }, 503))
      .mockResolvedValueOnce({ id: 'v-1', sku: 'SHOE-001-BLK-41', price_minor: 1200000 });
    const onUpdated = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa giá' }));
    fireEvent.change(screen.getByLabelText('Giá bán của SHOE-001-BLK-41'), { target: { value: '1200000' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu giá SHOE-001-BLK-41' }));
    await waitFor(() => expect(updateVariantMock).toHaveBeenCalledTimes(1));
    expect(updateVariantMock).toHaveBeenCalledWith(
      product.id,
      'v-1',
      { price_minor: 1200000, expected_product_version: 7 },
      expect.stringMatching(/^product-price-v-1-/),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ chưa lưu được giá. Thử lại sau.');
    expect(onUpdated).not.toHaveBeenCalled();

    const firstKey = updateVariantMock.mock.calls[0]?.[3];
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giá SHOE-001-BLK-41' }));
    await waitFor(() => expect(updateVariantMock).toHaveBeenCalledTimes(2));
    expect(updateVariantMock.mock.calls[1]?.[3]).toBe(firstKey);
    expect(await screen.findByRole('status')).toHaveTextContent('Đã lưu giá 1.200.000 ₫ cho SHOE-001-BLK-41.');
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('sends null when the seller clears a price', async () => {
    updateVariantMock.mockResolvedValue({ id: 'v-1', sku: 'SHOE-001-BLK-41', price_minor: null });
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa giá' }));
    fireEvent.change(screen.getByLabelText('Giá bán của SHOE-001-BLK-41'), { target: { value: '' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu giá SHOE-001-BLK-41' }));
    await waitFor(() => expect(updateVariantMock).toHaveBeenCalledWith(
      product.id,
      'v-1',
      { price_minor: null, expected_product_version: 7 },
      expect.any(String),
    ));
    expect(await screen.findByRole('status')).toHaveTextContent('Đã bỏ giá của SHOE-001-BLK-41.');
  });

  it('rejects a negative or fractional price before calling the API', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa giá' }));
    fireEvent.change(screen.getByLabelText('Giá bán của SHOE-001-BLK-41'), { target: { value: '-1' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu giá SHOE-001-BLK-41' }));
    expect(screen.getByRole('alert')).toHaveTextContent('phải là số nguyên không âm');
    expect(updateVariantMock).not.toHaveBeenCalled();
  });

  it('does not offer a save when the price has not changed', () => {
    renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa giá' }));
    expect(screen.getByRole('button', { name: 'Lưu giá SHOE-001-BLK-41' })).toBeDisabled();
  });

  it('re-reads the product when the revision is stale', async () => {
    updateVariantMock.mockRejectedValue(new ApiRequestError(
      { code: 'PRODUCT_REVISION_STALE', message: 'The product changed', request_id: 'r-2' }, 409,
    ));
    const onUpdated = renderEditor();
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa giá' }));
    fireEvent.change(screen.getByLabelText('Giá bán của SHOE-001-BLK-41'), { target: { value: '1200000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu giá SHOE-001-BLK-41' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Sản phẩm vừa thay đổi ở nơi khác.');
    expect(onUpdated).toHaveBeenCalledTimes(1);
  });

  it('keeps the editor read-only without catalogue write permission', () => {
    renderEditor(false);
    expect(screen.getByRole('button', { name: 'Chỉnh sửa giá' })).toBeDisabled();
    expect(screen.getByText('Chỉ ADMIN được đổi giá.')).toBeInTheDocument();
  });
});
