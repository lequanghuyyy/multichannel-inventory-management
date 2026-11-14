import { describe, expect, it } from 'vitest';
import { filterProductApiRows, summariseProducts, toProductApiRow, type ProductApiRow } from './product.api';
import type { ProductSummary } from '../../api/products';

function summary(overrides: Partial<ProductSummary> = {}): ProductSummary {
  return {
    id: 'p-1',
    name: 'Running Shoe 001',
    category: 'FOOTWEAR',
    brand: 'Vantage',
    description: 'Giày chạy bộ nhẹ.',
    master_sku: 'MSKU-RUN-4819',
    currency: 'VND',
    status: 'active',
    variant_count: 5,
    on_hand: 40,
    reserved: 3,
    safety_buffer: 2,
    available_to_sell: 35,
    ...overrides,
  };
}

// Takes the WIRE shape, because that is what `toProductApiRow` consumes. An earlier version of
// this helper took the rendered camelCase shape and spread it into `summary()`, where every key
// was ignored and every test silently asserted the defaults.
const row = (overrides: Partial<ProductSummary> = {}): ProductApiRow => toProductApiRow(summary(overrides));

describe('toProductApiRow', () => {
  it('reads available_to_sell as given and never recomputes it', () => {
    // 40 − 3 − 2 = 35, so a re-derivation would agree here and hide the bug. These four
    // numbers deliberately do NOT add up: the contract says ATS is summed in SQL over every
    // variant of the product, and a client that trusted its own arithmetic would print 55.
    const projected = toProductApiRow(summary({ on_hand: 40, reserved: 3, safety_buffer: 2, available_to_sell: 11 }));
    expect(projected.availableToSell).toBe(11);
  });

  it('renders an absent master SKU as empty rather than deriving one', () => {
    // The Go struct tags these `omitempty`, so an unstated attribute is an ABSENT key, never a
    // null — asserting against null would test a shape the API cannot send.
    const bare = summary();
    delete bare.master_sku;
    delete bare.brand;
    // master_sku is legitimately absent for a product that predates the 00004 backfill. It is a
    // business code, so it is never reconstructed from the product name.
    expect(toProductApiRow(bare).masterSku).toBe('');
    expect(toProductApiRow(bare).brand).toBe('');
  });

  it('keeps the API status enum verbatim', () => {
    expect(toProductApiRow(summary({ status: 'out_of_stock' })).status).toBe('out_of_stock');
    expect(toProductApiRow(summary({ status: 'archived' })).status).toBe('archived');
  });
});

describe('filterProductApiRows', () => {
  const rows = [
    row({ id: 'p-1', name: 'Running Shoe 001', category: 'FOOTWEAR', master_sku: 'MSKU-RUN-4819', brand: 'Vantage' }),
    row({ id: 'p-2', name: 'Performance Grip Socks', category: 'ACCESSORIES', master_sku: 'MSKU-SCK-0007', brand: '' }),
  ];

  it('matches the name, master SKU, brand and category', () => {
    const filters = { query: '', category: 'all', status: 'all' as const };
    expect(filterProductApiRows(rows, { ...filters, query: 'socks' }).map((r) => r.id)).toEqual(['p-2']);
    expect(filterProductApiRows(rows, { ...filters, query: 'MSKU-RUN' }).map((r) => r.id)).toEqual(['p-1']);
    expect(filterProductApiRows(rows, { ...filters, query: 'vantage' }).map((r) => r.id)).toEqual(['p-1']);
    expect(filterProductApiRows(rows, { ...filters, query: 'accessories' }).map((r) => r.id)).toEqual(['p-2']);
  });

  it('does not match Vietnamese, the way the backend does not either', () => {
    // The stored enum is FOOTWEAR; a Vietnamese query is not a translation request, it is a
    // substring search, and pretending otherwise would claim a match the API never made.
    expect(filterProductApiRows(rows, { query: 'giày', category: 'all', status: 'all' })).toEqual([]);
  });

  it('searches exactly what is available and nothing it was promised', () => {
    // The prototype's search box also matches variant SKUs; a ProductSummary has none, so
    // without a resolver there is nothing to match and the query finds nothing.
    expect(filterProductApiRows(rows, { query: 'SHOE-001-BLK-42', category: 'all', status: 'all' })).toEqual([]);
    // A resolver is scoped to the row it belongs to. Given only p-1's variant SKU, p-2 must
    // stay unmatched — a shared term list would make every row match and the box would stop
    // discriminating at the moment it was handed something extra to discriminate on.
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
    const summary = summariseProducts([
      row({ id: 'p-1', variant_count: 5, available_to_sell: 35 }),
      row({ id: 'p-2', variant_count: 3, available_to_sell: 4 }),
      row({ id: 'p-3', variant_count: 2, available_to_sell: 0, status: 'active' }),
    ]);
    expect(summary).toEqual({ products: 3, variants: 10, lowStock: 1, outOfStock: 1 });
  });

  it('counts an active product with nothing sellable as out of stock', () => {
    // p-3 above is `active`, not `out_of_stock`. A totals card that counted statuses would
    // report zero out-of-stock products for a catalogue that has one, which is the exact row
    // a shopkeeper is looking for.
    const summary = summariseProducts([row({ status: 'active', available_to_sell: 0 })]);
    expect(summary.outOfStock).toBe(1);
  });

  it('does not count a sold-out product as low stock as well', () => {
    // Otherwise "sắp hết hàng" and "hết hàng" overlap and their sum exceeds the catalogue.
    expect(summariseProducts([row({ available_to_sell: 0 })])).toEqual({ products: 1, variants: 5, lowStock: 0, outOfStock: 1 });
  });

  it('returns zeroes for an empty page rather than throwing', () => {
    expect(summariseProducts([])).toEqual({ products: 0, variants: 0, lowStock: 0, outOfStock: 0 });
  });
});