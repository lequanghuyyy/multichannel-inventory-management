import { describe, expect, it } from 'vitest';
import type { InventoryRow } from '../../api/inventory';
import { cartTotalMinor, parseMoneyInput, reviewCartAvailability, toPosProducts } from './pos.api';
import type { CartItem, PosProductFixture } from './pos.types';

const row = (overrides: Partial<InventoryRow> = {}): InventoryRow => ({
  variant_id: '20000000-0000-4000-8000-000000000001',
  product_id: '10000000-0000-4000-8000-000000000001',
  sku: 'SHOE-001-BLK-42',
  product_name: 'Running Shoe 001',
  variant_title: 'BLACK / Cỡ 42',
  price_minor: 990000,
  currency: 'VND',
  on_hand: 12,
  reserved: 3,
  safety_buffer: 2,
  available_to_sell: 7,
  version: 4,
  updated_at: '2026-01-01T00:00:00Z',
  ...overrides,
});

const item = (overrides: Partial<CartItem> = {}): CartItem => ({
  sku: 'SHOE-001-BLK-42',
  name: 'Running Shoe 001',
  variant: 'BLACK / Size 42',
  unitPrice: 990000,
  currency: 'VND',
  qty: 1,
  maxQty: 7,
  ...overrides,
});

describe('toPosProducts', () => {
  it('keeps a variant with missing price visible but unsellable', () => {
    const products = toPosProducts([row(), row({ sku: 'BAG-001-BRN-01', variant_id: '20000000-0000-4000-8000-000000000002', price_minor: null })]);
    expect(products.map((product) => product.sku)).toEqual(['SHOE-001-BLK-42', 'BAG-001-BRN-01']);
    expect(products[1]).toMatchObject({ priceValue: null, priceDisplay: 'Chưa có giá' });
  });

  it('uses the backend ATS quantity as available to sell', () => {
    const [product] = toPosProducts([row({ available_to_sell: 2 })]);
    expect(product?.ats).toBe(2);
    expect(product?.status).toBe('low');
  });

  it('prices the row from price_minor, not from any fixture', () => {
    const fixture: PosProductFixture = { ...toPosProducts([row()])[0]!, priceDisplay: '1.850.000₫', priceValue: 1850000 };
    const [product] = toPosProducts([row()], [fixture]);
    expect(product?.priceValue).toBe(990000);
    expect(product?.priceDisplay).not.toContain('1.850.000');
  });

  it('labels a row out of stock at zero and low at the ledger threshold', () => {
    const products = toPosProducts([
      row({ sku: 'A', available_to_sell: 0 }),
      row({ sku: 'B', variant_id: '20000000-0000-4000-8000-000000000003', available_to_sell: 10 }),
      row({ sku: 'C', variant_id: '20000000-0000-4000-8000-000000000004', available_to_sell: 11 }),
    ]);
    expect(products.map((product) => product.status)).toEqual(['out', 'low', 'instock']);
  });

  it('borrows the colour label from the fixture row of the same SKU', () => {
    const [product] = toPosProducts([row()], [{ ...toPosProducts([row()])[0]!, color: 'Đen' }]);
    expect(product?.color).toBe('Đen');
    expect(product?.ats).toBe(7);
    expect(product?.priceValue).toBe(990000);
  });

  it('falls back to the variant_title from the server', () => {
    const [product] = toPosProducts([row({ variant_title: 'Đen / Size 42' })]);
    expect(product?.variant).toBe('Đen / Size 42');
  });

  it('falls back to the SKU when the row carries no product name', () => {
    const [product] = toPosProducts([row({ product_name: undefined })]);
    expect(product?.name).toBe('SHOE-001-BLK-42');
  });
});

describe('checkout money and stock review', () => {
  it('parses cash as exact minor units for zero, two, and three fraction currencies', () => {
    expect(parseMoneyInput('2.000.000', 'VND')).toBeNull();
    expect(parseMoneyInput('2000000', 'VND')).toBe(2000000);
    expect(parseMoneyInput('129.50', 'USD')).toBe(12950);
    expect(parseMoneyInput('1.234', 'KWD')).toBe(1234);
    expect(parseMoneyInput('12.3456', 'USD')).toBeNull();
    expect(parseMoneyInput('1.2', 'VND')).toBeNull();
  });

  it('safely totals integer minor prices and rejects unsafe totals', () => {
    expect(cartTotalMinor([item({ qty: 2 }), item({ sku: 'B', qty: 1, unitPrice: 10 })])).toBe(1980010);
    expect(cartTotalMinor([item({ unitPrice: Number.MAX_SAFE_INTEGER, qty: 2 })])).toBeNull();
    expect(cartTotalMinor([item({ unitPrice: -1 })])).toBeNull();
  });

  it('proposes stock reductions without changing the cashier chosen cart', () => {
    const cart = [item({ sku: 'A', qty: 4, maxQty: 7 }), item({ sku: 'B', qty: 2, maxQty: 3 })];
    const review = reviewCartAvailability(cart, new Map([
      ['A', row({ sku: 'A', available_to_sell: 2 })],
      ['B', row({ sku: 'B', variant_id: '20000000-0000-4000-8000-000000000005', available_to_sell: 3 })],
    ]));

    expect(cart.map(({ sku, qty }) => [sku, qty])).toEqual([['A', 4], ['B', 2]]);
    expect(review?.proposedCart.map(({ sku, qty, maxQty }) => [sku, qty, maxQty])).toEqual([['A', 2, 2], ['B', 2, 3]]);
    expect(review?.changes).toEqual([expect.objectContaining({ sku: 'A', quantityBefore: 4, quantityAfter: 2, availableBefore: 7, availableAfter: 2, lineTotalBefore: 3960000, lineTotalAfter: 1980000 })]);
    expect(review?.totalBefore).toBe(3960000 + 1980000);
    expect(review?.totalAfter).toBe(1980000 + 1980000);
  });

  it('returns an empty proposed cart when live availability reaches zero, for explicit review', () => {
    const review = reviewCartAvailability([item({ sku: 'A', qty: 1 })], new Map([['A', row({ sku: 'A', available_to_sell: 0 })]]));
    expect(review?.proposedCart).toEqual([]);
    expect(review?.changes[0]).toMatchObject({ quantityBefore: 1, quantityAfter: 0, availableAfter: 0 });
  });

  it('rejects stock snapshots that omit a cart SKU', () => {
    expect(reviewCartAvailability([item({ sku: 'A' })], new Map())).toBeNull();
  });
});
