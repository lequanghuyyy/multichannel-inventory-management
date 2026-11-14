import { describe, expect, it } from 'vitest';
import type { InventoryRow } from '../../api/inventory';
import { cartTotalMinor, parseMoneyInput, reviewCartAvailability, toPosProducts } from './pos.api';
import type { CartItem, PosProductFixture } from './pos.types';

// The WIRE shape, because that is what `toPosProducts` consumes. A helper that took the
// rendered PosProductFixture instead would let every key be silently ignored, exactly as an
// earlier version of the products helper did.
const row = (overrides: Partial<InventoryRow> = {}): InventoryRow => ({
  variant_id: '20000000-0000-4000-8000-000000000001',
  product_id: '10000000-0000-4000-8000-000000000001',
  sku: 'SHOE-001-BLK-42',
  product_name: 'Running Shoe 001',
  category: 'FOOTWEAR',
  color: 'BLACK',
  size: '42',
  price_minor: 990000,
  currency: 'VND',
  on_hand: 12,
  reserved: 3,
  safety_buffer: 2,
  available_to_sell: 7,
  pos_mode: 'shared',
  desired_pos_mode: 'shared',
  desired_pos_quota: 0,
  active_pos_quota: 0,
  pos_remaining: 0,
  pos_revision: 1,
  pos_transition_state: 'stable',
  online_budget: 7,
  pos_sellable: 7,
  version: 4,
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
    const products = toPosProducts([row(), row({ sku: 'BAG-001-BRN-01', variant_id: 'v-2', price_minor: null })]);
    expect(products.map((product) => product.sku)).toEqual(['SHOE-001-BLK-42', 'BAG-001-BRN-01']);
    expect(products[1]).toMatchObject({ priceValue: null, priceDisplay: 'Chưa có giá' });
  });

  it('uses the backend POS sellable quantity without recomputing it', () => {
    // Deliberately inconsistent: Core ATS is 7 and POS sellable says 2. The POS must honor
    // the backend field instead of recomputing its own limit from the Core balance.
    const [product] = toPosProducts([row({ pos_sellable: 2 })]);
    expect(product?.ats).toBe(2);
    expect(product?.status).toBe('low');
  });

  it('uses backend POS sellable instead of Core ATS for Dedicated variants', () => {
    const [product] = toPosProducts([row({
      available_to_sell: 18,
      pos_mode: 'dedicated',
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      active_pos_quota: 4,
      pos_remaining: 2,
      pos_revision: 7,
      pos_transition_state: 'stable',
      online_budget: 16,
      pos_sellable: 2,
    })]);

    expect(product).toMatchObject({ coreAts: 18, ats: 2, posMode: 'dedicated', posRemaining: 2, status: 'low' });
  });

  it('fails closed in the catalog while a POS quota transition is pending', () => {
    const [product] = toPosProducts([row({
      available_to_sell: 18,
      pos_mode: 'shared',
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      active_pos_quota: 0,
      pos_remaining: 0,
      pos_revision: 2,
      pos_transition_state: 'pending',
      online_budget: 14,
      pos_sellable: 0,
    })]);

    expect(product).toMatchObject({ coreAts: 18, ats: 0, posTransitionState: 'pending', status: 'transitioning' });
  });

  it('prices the row from price_minor, not from any fixture', () => {
    const fixture: PosProductFixture = { ...toPosProducts([row()])[0]!, priceDisplay: '1.850.000₫', priceValue: 1850000 };
    const [product] = toPosProducts([row()], [fixture]);
    // The prototype's own POS fixture quotes 1.850.000 for this SKU while the seed says
    // 990.000. Whichever the API says has to be the one on screen — a stale fixture must not
    // be able to overcharge a customer.
    expect(product?.priceValue).toBe(990000);
    expect(product?.priceDisplay).not.toContain('1.850.000');
  });

  it('labels a row out of stock at zero and low at the ledger threshold', () => {
    const products = toPosProducts([
      row({ sku: 'A', available_to_sell: 0, pos_sellable: 0 }),
      row({ sku: 'B', variant_id: 'v-b', available_to_sell: 10, pos_sellable: 10 }),
      row({ sku: 'C', variant_id: 'v-c', available_to_sell: 11, pos_sellable: 11 }),
    ]);
    expect(products.map((product) => product.status)).toEqual(['out', 'low', 'instock']);
  });

  it('locks the POS card when quota state is missing instead of assuming Shared', () => {
    const [product] = toPosProducts([row({ pos_mode: undefined, pos_sellable: undefined })]);
    expect(product).toMatchObject({ posMode: 'unknown', ats: 0, status: 'unavailable' });
  });

  it('borrows only the colour label from the fixture row of the same SKU', () => {
    // The API stores raw attribute codes ("BLACK"); the fixture carries "Đen". That is display
    // enrichment, not stock — the four numbers and the price never come from the fixture.
    const [product] = toPosProducts([row({ color: 'BLACK' })], [{ ...toPosProducts([row()])[0]!, color: 'Đen' }]);
    expect(product?.color).toBe('Đen');
    expect(product?.ats).toBe(7);
    expect(product?.priceValue).toBe(990000);
  });

  it('falls back to the raw attribute codes when no fixture row matches', () => {
    const [product] = toPosProducts([row()], [{ ...toPosProducts([row({ sku: 'OTHER' })])[0]! }]);
    expect(product?.color).toBe('BLACK');
    expect(product?.size).toBe('42');
    expect(product?.variant).toBe('BLACK / Cỡ 42');
  });

  it('falls back to the SKU when the row carries no product name', () => {
    // product_name is `omitempty` on the Go side, so absent means absent — not null, not ''.
    const [product] = toPosProducts([row({ product_name: undefined })]);
    expect(product?.name).toBe('SHOE-001-BLK-42');
  });

  it('places a category the fixture has no counter for rather than dropping the row', () => {
    const [product] = toPosProducts([row({ category: 'LEATHER_GOODS' })]);
    expect(product?.category).toBe('bags');
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
      ['A', row({ sku: 'A', available_to_sell: 2, pos_sellable: 2 })],
      ['B', row({ sku: 'B', variant_id: 'v-b', available_to_sell: 3, pos_sellable: 3 })],
    ]));

    expect(cart.map(({ sku, qty }) => [sku, qty])).toEqual([['A', 4], ['B', 2]]);
    expect(review?.proposedCart.map(({ sku, qty, maxQty }) => [sku, qty, maxQty])).toEqual([['A', 2, 2], ['B', 2, 3]]);
    expect(review?.changes).toEqual([expect.objectContaining({ sku: 'A', quantityBefore: 4, quantityAfter: 2, availableBefore: 7, availableAfter: 2, lineTotalBefore: 3960000, lineTotalAfter: 1980000 })]);
    expect(review?.totalBefore).toBe(3960000 + 1980000);
    expect(review?.totalAfter).toBe(1980000 + 1980000);
  });

  it('reviews a Dedicated cart against backend POS remaining rather than Core ATS', () => {
    const dedicated = row({
      available_to_sell: 18,
      pos_mode: 'dedicated',
      desired_pos_mode: 'dedicated',
      desired_pos_quota: 4,
      active_pos_quota: 4,
      pos_remaining: 2,
      pos_revision: 2,
      pos_transition_state: 'stable',
      online_budget: 16,
      pos_sellable: 2,
    });
    const review = reviewCartAvailability([item({ qty: 3, maxQty: 7 })], new Map([[dedicated.sku, dedicated]]));

    expect(review?.proposedCart[0]).toMatchObject({ qty: 2, maxQty: 2 });
    expect(review?.changes[0]).toMatchObject({ availableBefore: 7, availableAfter: 2, quantityAfter: 2 });
  });

  it('returns an empty proposed cart when live availability reaches zero, for explicit review', () => {
    const review = reviewCartAvailability([item({ sku: 'A', qty: 1 })], new Map([['A', row({ sku: 'A', available_to_sell: 0, pos_sellable: 0 })]]));
    expect(review?.proposedCart).toEqual([]);
    expect(review?.changes[0]).toMatchObject({ quantityBefore: 1, quantityAfter: 0, availableAfter: 0 });
  });

  it('rejects stock snapshots that omit a cart SKU', () => {
    expect(reviewCartAvailability([item({ sku: 'A' })], new Map())).toBeNull();
  });

  it('proposes current server prices and rejects a refreshed basket with mixed currencies', () => {
    const priceReview = reviewCartAvailability([item()], new Map([['SHOE-001-BLK-42', row({ price_minor: 1050000 })]]));
    expect(priceReview?.proposedCart[0]).toMatchObject({ unitPrice: 1050000, currency: 'VND' });
    expect(priceReview?.changes[0]).toMatchObject({ priceBeforeMinor: 990000, priceAfterMinor: 1050000, lineTotalAfter: 1050000 });
    expect(priceReview?.totalAfter).toBe(1050000);

    const mixedReview = reviewCartAvailability(
      [item(), item({ sku: 'B', qty: 1 })],
      new Map([
        ['SHOE-001-BLK-42', row({ price_minor: 990000, currency: 'VND' })],
        ['B', row({ sku: 'B', variant_id: 'v-b', price_minor: 1200, currency: 'USD' })],
      ]),
    );
    expect(mixedReview).toBeNull();
  });
});
