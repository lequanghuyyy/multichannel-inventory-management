import { describe, expect, it } from 'vitest';
import { filterProductApiRows, summariseProducts, toProductApiRow, type ProductApiRow } from './product.api';
import type { ProductSummary } from '../../api/products';

function summary(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: 'p-1',
    name: 'Running Shoe 001',
    category: 'FOOTWEAR',
    description: 'Giày chạy bộ nhẹ.',
    status: 'active',
    variantCount: 5,
    onHand: 40,
    reserved: 3,
    safetyBuffer: 2,
    availableToSell: 35,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

const row = (overrides: Partial<ProductSummary> = {}): ProductApiRow => toProductApiRow(summary(overrides));

describe('toProductApiRow', () => {
  it('reads available_to_sell as given and never recomputes it', () => {
    const projected = toProductApiRow(summary({ onHand: 40, reserved: 3, safetyBuffer: 2, availableToSell: 11 }));
    expect(projected.availableToSell).toBe(11);
  });

  it('renders blank master SKU and brand for backend rows', () => {
    const bare = summary();
    expect(toProductApiRow(bare).masterSku).toBe('');
    expect(toProductApiRow(bare).brand).toBe('');
  });

  it('keeps the API status enum verbatim', () => {
    expect(toProductApiRow(summary({ status: 'draft' })).status).toBe('draft');
    expect(toProductApiRow(summary({ status: 'archived' })).status).toBe('archived');
  });
});

describe('filterProductApiRows', () => {
  const rows = [
    row({ id: 'p-1', name: 'Running Shoe 001', category: 'FOOTWEAR' }),
    row({ id: 'p-2', name: 'Performance Grip Socks', category: 'ACCESSORIES' }),
  ];

  it('matches the name and category', () => {
    const filters = { query: '', category: 'all', status: 'all' as const };
    expect(filterProductApiRows(rows, { ...filters, query: 'socks' }).map((r) => r.id)).toEqual(['p-2']);
    expect(filterProductApiRows(rows, { ...filters, query: 'running' }).map((r) => r.id)).toEqual(['p-1']);
    expect(filterProductApiRows(rows, { ...filters, query: 'accessories' }).map((r) => r.id)).toEqual(['p-2']);
  });

  it('does not match Vietnamese, the way the backend does not either', () => {
    expect(filterProductApiRows(rows, { query: 'giày', category: 'all', status: 'all' })).toEqual([]);
  });

  it('searches exactly what is available and nothing it was promised', () => {
    expect(filterProductApiRows(rows, { query: 'SHOE-001-BLK-42', category: 'all', status: 'all' })).toEqual([]);
    const extraFor = (row: ProductApiRow) => (row.id === 'p-1' ? ['SHOE-001-BLK-42'] : []);
    expect(filterProductApiRows(rows, { query: 'SHOE-001-BLK-42', category: 'all', status: 'all', extraFor }).map((r) => r.id)).toEqual(['p-1']);
  });

  it('matches the stored enum exactly rather than by display name', () => {
    expect(filterProductApiRows(rows, { query: '', category: 'FOOTWEAR', status: 'all' }).map((r) => r.id)).toEqual(['p-1']);
    expect(filterProductApiRows(rows, { query: '', category: 'Giày thể thao', status: 'all' })).toEqual([]);
  });

  it('treats every filter as unset when all of them say all', () => {
    expect(filterProductApiRows(rows, { query: '  ', category: 'all', status: 'all' })).toHaveLength(2);
  });
});

describe('summariseProducts', () => {
  it('sums variants and counts stock states from available-to-sell', () => {
    const summaryData = summariseProducts([
      row({ id: 'p-1', variantCount: 5, availableToSell: 35 }),
      row({ id: 'p-2', variantCount: 3, availableToSell: 4 }),
      row({ id: 'p-3', variantCount: 2, availableToSell: 0, status: 'active' }),
    ]);
    expect(summaryData).toEqual({ products: 3, variants: 10, lowStock: 1, outOfStock: 1 });
  });

  it('counts an active product with nothing sellable as out of stock', () => {
    const summaryData = summariseProducts([row({ status: 'active', availableToSell: 0 })]);
    expect(summaryData.outOfStock).toBe(1);
  });

  it('does not count a sold-out product as low stock as well', () => {
    expect(summariseProducts([row({ availableToSell: 0 })])).toEqual({ products: 1, variants: 5, lowStock: 0, outOfStock: 1 });
  });

  it('returns zeroes for an empty page rather than throwing', () => {
    expect(summariseProducts([])).toEqual({ products: 0, variants: 0, lowStock: 0, outOfStock: 0 });
  });
});
