import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProductApiDetail } from '../product.detail.api';
import { WooCommerceProductPanel } from './WooCommerceProductPanel';

const product: ProductApiDetail = {
  id: '10000000-0000-4000-8000-000000000001', productVersion: 3, name: 'Test shoe', category: 'FOOTWEAR', brand: '',
  description: '', shortDescription: '', attributes: {}, weightGrams: null, lengthMM: null, widthMM: null, heightMM: null,
  condition: '', masterSku: 'TEST-SHOE', currency: 'VND', status: 'active', variantCount: 1,
  onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0,
  variants: [{ id: '20000000-0000-4000-8000-000000000001', sku: 'TEST-SHOE-BLK-41', color: 'BLACK', colorDescription: '',
    size: '41', priceMinor: 500000, barcode: '', isActive: true, variantIsActive: true, onHand: 0, reserved: 0,
    safetyBuffer: 0, availableToSell: 0 }],
};

afterEach(cleanup);

describe('WooCommerceProductPanel', () => {
  it('states that product publishing is outside Phase 06 without calling product endpoints', () => {
    const onDraftSubmitReady = vi.fn();
    render(<WooCommerceProductPanel product={product} canWrite onDraftSubmitReady={onDraftSubmitReady} />);

    expect(screen.getByRole('heading', { name: 'Đăng bán sản phẩm chưa được hỗ trợ' })).toBeInTheDocument();
    expect(screen.getByText(/Phase 06 chỉ đồng bộ tồn kho WooCommerce/)).toBeInTheDocument();
    expect(screen.getByText('Ngoài phạm vi Phase 06')).toBeInTheDocument();
    expect(onDraftSubmitReady).toHaveBeenCalledWith(null);
  });
});
