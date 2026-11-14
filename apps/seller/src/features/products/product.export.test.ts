import { describe, expect, it, vi } from 'vitest';
import type { ProductSummary } from '../../api/products';
import { productExportCsv, walkProductExport } from './product.export';

function row(id: string, name = `Product ${id}`): ProductSummary {
  return { id, name, master_sku: `SKU-${id}`, category: 'FOOTWEAR', brand: 'Brand', currency: 'VND', status: 'active', variant_count: 1, on_hand: 4, reserved: 1, safety_buffer: 1, available_to_sell: 2 };
}

describe('product export', () => {
  it('walks every page for all scope and deduplicates overlapping rows', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ items: [row('1'), row('2')], nextCursor: 'c2' })
      .mockResolvedValueOnce({ items: [row('2'), row('3')], nextCursor: null });
    const result = await walkProductExport({}, undefined, load);
    expect(result.map((item) => item.id)).toEqual(['1', '2', '3']);
    expect(load).toHaveBeenNthCalledWith(1, { limit: 100 }, undefined);
    expect(load).toHaveBeenNthCalledWith(2, { limit: 100, cursor: 'c2' }, undefined);
  });

  it('keeps current server filters on every filtered page', async () => {
    const load = vi.fn()
      .mockResolvedValueOnce({ items: [row('1')], nextCursor: 'next' })
      .mockResolvedValueOnce({ items: [row('2')], nextCursor: null });
    await walkProductExport({ q: 'shoe', status: 'draft', category: 'FOOTWEAR' }, undefined, load);
    expect(load).toHaveBeenLastCalledWith({ limit: 100, cursor: 'next', q: 'shoe', status: 'draft', category: 'FOOTWEAR' }, undefined);
  });

  it('writes a BOM, public summary headers and correctly escaped selected rows', () => {
    const csv = productExportCsv([{ ...row('1', 'Shoe, "Limited"'), brand: 'A\nB' }]);
    expect(csv.startsWith('\uFEFFname,master_sku,category,brand,status,variant_count,on_hand,reserved,safety_buffer,available_to_sell')).toBe(true);
    expect(csv).toContain('"Shoe, ""Limited"""');
    expect(csv).toContain('"A\nB"');
    expect(csv).not.toContain('currency');
    expect(csv).not.toContain('id,');
  });
});
