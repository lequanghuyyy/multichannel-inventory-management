import { describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '../../api/products';
import { productExportCsv, walkProductExport } from './product.export';

function row(id: string, name = `Product ${id}`): ProductSummary {
  return {
    id,
    name,
    description: '',
    category: 'FOOTWEAR',
    status: 'active',
    variantCount: 1,
    onHand: 4,
    reserved: 1,
    safetyBuffer: 1,
    availableToSell: 2,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  };
}

describe('product export', () => {
  it('loads products for export using the query', async () => {
    const load = vi.fn().mockResolvedValueOnce({ items: [row('1'), row('2')], nextCursor: null });
    const result = await walkProductExport({ q: 'shoe' }, undefined, load);
    expect(result.map((item) => item.id)).toEqual(['1', '2']);
    expect(load).toHaveBeenCalledWith({ q: 'shoe' }, undefined);
  });

  it('writes a BOM, public summary headers and correctly escaped selected rows', () => {
    const csv = productExportCsv([{
      name: 'Shoe, "Limited"',
      master_sku: 'SKU-1',
      category: 'FOOTWEAR',
      brand: 'A\nB',
      status: 'active',
      variant_count: 1,
      on_hand: 4,
      reserved: 1,
      safety_buffer: 1,
      available_to_sell: 2,
    }]);
    expect(csv.startsWith('\uFEFFname,master_sku,category,brand,status,variant_count,on_hand,reserved,safety_buffer,available_to_sell')).toBe(true);
    expect(csv).toContain('"Shoe, ""Limited"""');
    expect(csv).toContain('"A\nB"');
    expect(csv).not.toContain('currency');
    expect(csv).not.toContain('id,');
  });
});
