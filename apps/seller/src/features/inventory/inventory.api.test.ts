import { describe, expect, it } from 'vitest';
import type { InventoryRow } from '../../api/inventory';
import { inventoryManagementRows } from '../../mocks/inventory-management';
import { toInventoryLedgerRow } from './inventory.api';

function apiRow(overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    variant_id: '20000000-0000-4000-8000-000000000002',
    product_id: '10000000-0000-4000-8000-000000000001',
    sku: 'SHOE-001-BLK-42',
    product_name: 'Running Shoe 001',
    variant_title: 'Đen / 42',
    price_minor: 990000,
    currency: 'VND',
    on_hand: 10,
    reserved: 0,
    safety_buffer: 0,
    available_to_sell: 10,
    version: 3,
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('toInventoryLedgerRow', () => {
  it('reads the four canonical numbers off the API row instead of deriving them', () => {
    const row = toInventoryLedgerRow(apiRow({ on_hand: 10, reserved: 3, safety_buffer: 1, available_to_sell: 6 }), 'api');

    expect(row.onHand).toBe(10);
    expect(row.reserved).toBe(3);
    expect(row.safetyBuffer).toBe(1);
    expect(row.availableToSell).toBe(6);
  });

  it('never takes stock from the fixture row for the same SKU', () => {
    const fixture = inventoryManagementRows.find((row) => row.sku === 'SHOE-001-BLK-42');
    expect(fixture).toBeDefined();

    const row = toInventoryLedgerRow(apiRow({ on_hand: 10, reserved: 0, safety_buffer: 0, available_to_sell: 10 }), 'api');
    expect(row.onHand).toBe(10);
    expect(row.reserved).toBe(0);
    expect(row.availableToSell).toBe(10);
  });

  it('does not attach fixture channels or synchronization state to a live inventory row', () => {
    const row = toInventoryLedgerRow(apiRow(), 'api');

    expect(row.barcode).toBe('893521400142');
    expect(row.channels).toEqual([]);
    expect(row.syncState).toBe('unavailable');
  });

  it('leaves the barcode empty and the channels empty for a SKU the fixture never had', () => {
    const row = toInventoryLedgerRow(apiRow({ sku: 'SCK-GRIP-OSZ-M-BLK', variant_id: '99' }), 'api');

    expect(row.barcode).toBe('');
    expect(row.channels).toEqual([]);
    expect(row.productName).toBe('Running Shoe 001');
  });

  it('builds the variant label from variant_title', () => {
    expect(toInventoryLedgerRow(apiRow(), 'api').variantLabel).toBe('Đen / 42');
    expect(toInventoryLedgerRow(apiRow({ variant_title: undefined }), 'api').variantLabel).toBe('Một biến thể');
  });

  it('renders the price from price without dividing it', () => {
    const label = toInventoryLedgerRow(apiRow(), 'api').priceLabel;
    expect(label).toBeDefined();
    expect(label!.replace(/\D/g, '')).toBe('990000');
  });
});
