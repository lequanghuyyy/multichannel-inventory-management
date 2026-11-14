import { expect, it } from 'vitest';
import { href, parseRoute } from './routes';

it('parses Seller App area routes and details', () => {
  expect(parseRoute('/products')).toEqual({ name: 'products' });
  expect(parseRoute('/products/product-1')).toEqual({ name: 'product-detail', id: 'product-1' });
  expect(parseRoute('/inventory')).toEqual({ name: 'inventory' });
  expect(parseRoute('/inventory/SHOE-001-BLK-42')).toEqual({ name: 'inventory-detail', id: 'SHOE-001-BLK-42' });
  expect(parseRoute('/receipts')).toEqual({ name: 'receipts' });
  expect(parseRoute('/receipts/new')).toEqual({ name: 'receipt-create' });
  expect(parseRoute('/receipts/rec-123')).toEqual({ name: 'receipt-detail', id: 'rec-123' });
  expect(parseRoute('/orders/order-1')).toEqual({ name: 'order-detail', id: 'order-1' });
  expect(parseRoute('/pos')).toEqual({ name: 'pos' });
  expect(parseRoute('/channels/channel-1')).toEqual({ name: 'channel-detail', id: 'channel-1' });
  expect(parseRoute('/sync')).toEqual({ name: 'sync' });
  expect(parseRoute('/reports')).toEqual({ name: 'reports' });
  expect(parseRoute('/ai/recommendation-1')).toEqual({ name: 'ai-detail', id: 'recommendation-1' });
  expect(parseRoute('/settings')).toEqual({ name: 'settings' });
  expect(parseRoute('/simulator/orders')).toEqual({ name: 'simulator' });
  expect(parseRoute('/missing')).toEqual({ name: 'not-found' });
});

it('serializes typed detail routes', () => {
  expect(href({ name: 'product-detail', id: 'product-1' })).toBe('/products/product-1');
  expect(href({ name: 'inventory-detail', id: 'SHOE-001-BLK-42' })).toBe('/inventory/SHOE-001-BLK-42');
  expect(href({ name: 'receipts' })).toBe('/receipts');
  expect(href({ name: 'receipt-create' })).toBe('/receipts/new');
  expect(href({ name: 'receipt-detail', id: 'rec-123' })).toBe('/receipts/rec-123');
  expect(href({ name: 'pos' })).toBe('/pos');
  expect(href({ name: 'settings' })).toBe('/settings');
  expect(href({ name: 'sync' })).toBe('/sync');
  expect(href({ name: 'reports' })).toBe('/reports');
  expect(href({ name: 'simulator' })).toBe('/simulator/orders');
});
