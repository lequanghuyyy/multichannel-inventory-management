import { describe, expect, it } from 'vitest';
import type { InventoryRow } from '../../api/inventory';
import { inventoryManagementRows } from '../../mocks/inventory-management';
import { toInventoryLedgerRow } from './inventory.api';
import type { InventoryLedgerRow } from './inventory.types';

function apiRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    variant_id: '20000000-0000-4000-8000-000000000002',
    product_id: '10000000-0000-4000-8000-000000000001',
    sku: 'SHOE-001-BLK-42',
    product_name: 'Running Shoe 001',
    category: 'FOOTWEAR',
    color: 'BLACK',
    size: '42',
    price_minor: 990000,
    currency: 'VND',
    on_hand: 10,
    reserved: 0,
    safety_buffer: 0,
    available_to_sell: 10,
    version: 3,
    ...overrides,
  };
}

describe('toInventoryLedgerRow', () => {
  it('reads the four canonical numbers off the API row instead of deriving them', () => {
    // on_hand - reserved - safety_buffer here is 6. The API says 6 is not available, and the
    // API is the source of truth for that: a client-side recomputation is a second
    // implementation of a rule the backend owns, and would silently disagree about it.
    const row = toInventoryLedgerRow(apiRow({ on_hand: 10, reserved: 3, safety_buffer: 1, available_to_sell: 6 }), 'api');

    expect(row.onHand).toBe(10);
    expect(row.reserved).toBe(3);
    expect(row.safetyBuffer).toBe(1);
    expect(row.availableToSell).toBe(6);
  });

  it('never takes stock from the fixture row for the same SKU', () => {
    // The fixture claims SHOE-001-BLK-42 has 15 on hand, 10 reserved, 3 available. Every one
    // of those numbers is wrong for this API row, and enrichment must not reach the numbers.
    const fixture = inventoryManagementRows.find((row) => row.sku === 'SHOE-001-BLK-42');
    expect(fixture).toBeDefined();

    const row = toInventoryLedgerRow(apiRow({ on_hand: 10, reserved: 0, safety_buffer: 0, available_to_sell: 10 }), 'api');
    expect(row.onHand).toBe(10);
    expect(row.reserved).toBe(0);
    expect(row.availableToSell).toBe(10);
  });

  it('does not attach fixture channels or synchronization state to a live inventory row', () => {
    // The API has no channel listing or read-back evidence. An operator must not see fixture
    // channels as real mappings or mistake the fixture's synced flag for remote proof.
    const row = toInventoryLedgerRow(apiRow(), 'api');

    expect(row.barcode).toBe('893521400142');
    expect(row.channels).toEqual([]);
    expect(row.syncState).toBe('unavailable');
  });

  it('carries the product and primary image ids so the ledger can render the catalogue photo', () => {
    const row = toInventoryLedgerRow(apiRow({ primary_media_id: '30000000-0000-4000-8000-000000000001' }), 'api');

    expect(row.productId).toBe('10000000-0000-4000-8000-000000000001');
    expect(row.primaryMediaId).toBe('30000000-0000-4000-8000-000000000001');
  });

  it('does not attach an API image to a fixture row', () => {
    // The fixture predates product media and has no authenticated content path. Reusing the
    // API row's id would make the fixture request bytes it does not own.
    const row = toInventoryLedgerRow(apiRow({ primary_media_id: '30000000-0000-4000-8000-000000000001' }), 'fixture');

    expect(row.productId).toBeUndefined();
    expect(row.primaryMediaId).toBeUndefined();
  });

  it('leaves the barcode empty and the channels empty for a SKU the fixture never had', () => {
    // The seeded catalogue has 34 variants; the fixture has 7. The other 27 must still render,
    // and they render without a barcode rather than with an invented one.
    const row = toInventoryLedgerRow(apiRow({ sku: 'SCK-GRIP-OSZ-M-BLK', variant_id: 'v-new' }), 'api');

    expect(row.barcode).toBe('');
    expect(row.channels).toEqual([]);
    expect(row.productName).toBe('Running Shoe 001');
  });

  it('builds the variant label from stated colour and size rather than the SKU', () => {
    // SHOE-001-BLK-42 says BLACK and 42 by naming convention only. Parsing the SKU for them
    // is exactly what the seed comment forbids, so the label reads what the API stated.
    expect(toInventoryLedgerRow(apiRow(), 'api').variantLabel).toBe('BLACK / 42');
    // The Go struct tags color/size `omitempty`, so an unstated attribute is an ABSENT key,
    // never a null. Asserting against null here would test a shape the API cannot send.
    const bare = apiRow();
    delete (bare as { color?: string }).color;
    delete (bare as { size?: string }).size;
    expect(toInventoryLedgerRow(bare, 'api').variantLabel).toBe('Một biến thể');
    // Only the stated half survives: one size across several colours is a real variant.
    expect(toInventoryLedgerRow(apiRow({ color: undefined }), 'api').variantLabel).toBe('42');
  });

  it('renders the price from price_minor without dividing it', () => {
    // 990000 minor units of VND is 990.000 ₫. A /100 here would print 9.900 ₫ — a 100x error
    // on the exact SKU the seed prices, which is why money.ts exists and why this is asserted
    // against the digits rather than against the separators.
    const label = toInventoryLedgerRow(apiRow(), 'api').priceLabel;
    expect(label).toBeDefined();
    expect(label!.replace(/\D/g, '')).toBe('990000');
  });

  it('distinguishes an unpriced variant from a free one', () => {
    // The contract says a null price_minor means the variant cannot be sold through
    // POST /api/v1/orders. Rendering it as 0 would advertise it as a giveaway.
    expect(toInventoryLedgerRow(apiRow({ price_minor: null }), 'api').priceLabel).toBe('Chưa có giá');
    expect(toInventoryLedgerRow(apiRow({ price_minor: 0 }), 'api').priceLabel).not.toBe('Chưa có giá');
  });

  it('omits the price entirely in fixture mode', () => {
    // Not "Chưa có giá" — absent. The prototype's POS fixture prices these SKUs at USD 129,
    // which is not this catalogue's price, and a column of them would be a currency
    // conversion that never happened.
    const row = toInventoryLedgerRow(apiRow(), 'fixture');
    expect(row.priceLabel).toBeUndefined();
  });
});

describe('inventory status derived from the API row', () => {
  it('calls zero available out of stock even when stock exists on hand', () => {
    // 10 units physically present, all of them reserved or buffered. "Còn hàng" here would
    // invite an order the backend will reject with a 409.
    const row = toInventoryLedgerRow(apiRow({ on_hand: 10, reserved: 8, safety_buffer: 2, available_to_sell: 0 }), 'api');
    expect(row.status).toBe('out_of_stock');
  });

  it('calls a small available count low stock and a large one in stock', () => {
    expect(toInventoryLedgerRow(apiRow({ available_to_sell: 5 }), 'api').status).toBe('low_stock');
    expect(toInventoryLedgerRow(apiRow({ available_to_sell: 11 }), 'api').status).toBe('in_stock');
  });

  it('leaves a seeded zero-stock variant out of stock without touching on_hand', () => {
    // 27 of the 34 seeded variants are 0/0/0 by design, so this is the common case, not an edge.
    const row = toInventoryLedgerRow(apiRow({ sku: 'BTL-750-BLK', on_hand: 0, reserved: 0, safety_buffer: 0, available_to_sell: 0 }), 'api');
    expect(row.status).toBe('out_of_stock');
    expect(row.onHand).toBe(0);
  });

  it('does not claim a live row is synced when the API has no remote inventory evidence', () => {
    expect(toInventoryLedgerRow(apiRow(), 'api').syncState).toBe('unavailable');
    expect(toInventoryLedgerRow(apiRow({ sku: 'SCK-GRIP-OSZ-M-BLK', variant_id: 'v-new' }), 'api').syncState).toBe('unavailable');
  });
});

describe('filterInventoryRows with the location filter', () => {
  // Imported here rather than at the top so the D12 intent reads in one place.
  it('keeps every row when no location is chosen', async () => {
    const { filterInventoryRows, initialInventoryFilters } = await import('./inventory.utils');
    const rows: InventoryLedgerRow[] = inventoryManagementRows;
    expect(initialInventoryFilters.location).toBe('all');
    expect(filterInventoryRows(rows, initialInventoryFilters)).toHaveLength(rows.length);
  });

  it('still narrows to a chosen location', async () => {
    const { filterInventoryRows, initialInventoryFilters } = await import('./inventory.utils');
    // A location the fixture does not have must return nothing, or the dropdown would look
    // like it works when it does not.
    expect(filterInventoryRows(inventoryManagementRows, { ...initialInventoryFilters, location: 'east' })).toHaveLength(0);
    expect(filterInventoryRows(inventoryManagementRows, { ...initialInventoryFilters, location: 'central' })).toHaveLength(inventoryManagementRows.length);
  });
});
