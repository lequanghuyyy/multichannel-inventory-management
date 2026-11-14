import { channels } from './channels';
import { recommendations } from './ai';
import { inventorySnapshots } from './inventory';
import { orders } from './orders';
import { products } from './products';
import { inventoryManagementRows } from './inventory-management';
import { inventoryDetailFixtureBySku } from './inventory-detail';
import { settingsFixture } from './settings';
import { syncFixture } from './sync';
import { reportFixture } from './reports';
import { posFixture } from './pos';
import type { InventorySnapshot } from '../features/shared/types';
import type { Order } from '../features/orders/order.types';
import type { SalesChannel } from '../features/channels/channel.types';
import type { Recommendation } from '../features/ai/ai.types';
import type { ProductCatalogItem } from '../features/products/product.types';
import type { InventoryLedgerRow } from '../features/inventory/inventory.types';
import type { InventoryDetailFixture } from '../features/inventory/inventory-detail.types';
import type { SettingsFixture } from '../features/settings/settings.types';
import type { SyncFixture } from '../features/sync/sync.types';
import type { ReportFixture } from '../features/reports/report.types';
import type { PosFixture } from '../features/pos/pos.types';

export type DemoMode = 'default' | 'demo' | 'loading' | 'empty' | 'error';

function pause(): Promise<void> {
  return new Promise(resolve => globalThis.setTimeout(resolve, 120));
}

async function respond<T>(value: T, mode: DemoMode): Promise<T> {
  if (mode === 'loading') await new Promise(resolve => globalThis.setTimeout(resolve, 900));
  else await pause();
  if (mode === 'error') throw new Error('Dữ liệu mẫu tạm thời không tải được. Hãy thử lại.');
  return value;
}

export function demoMode(search: string): DemoMode {
  const value = new URLSearchParams(search).get('demo');
  return value === 'demo' || value === 'loading' || value === 'empty' || value === 'error' ? value : 'default';
}

export function getProducts(mode: DemoMode): Promise<ProductCatalogItem[]> {
  return respond(mode === 'empty' ? [] : products, mode);
}

export function getProduct(id: string, mode: DemoMode): Promise<ProductCatalogItem | undefined> {
  return respond(mode === 'empty' ? undefined : products.find(product => product.id === id), mode);
}

export function getInventory(mode: DemoMode): Promise<InventorySnapshot[]> {
  return respond(mode === 'empty' ? [] : inventorySnapshots, mode);
}

export function getInventoryManagementRows(mode: DemoMode): Promise<InventoryLedgerRow[]> {
  return respond(mode === 'empty' ? [] : inventoryManagementRows, mode);
}

export function getInventoryDetailFixture(sku: string, mode: DemoMode): Promise<InventoryDetailFixture | undefined> {
  return respond(mode === 'empty' ? undefined : inventoryDetailFixtureBySku(sku), mode);
}

export function getOrders(mode: DemoMode): Promise<Order[]> {
  return respond(mode === 'empty' ? [] : orders, mode);
}

export function getOrder(id: string, mode: DemoMode): Promise<Order | undefined> {
  return respond(mode === 'empty' ? undefined : orders.find(order => order.id === id), mode);
}

export function getChannels(mode: DemoMode): Promise<SalesChannel[]> {
  return respond(mode === 'empty' ? [] : channels, mode);
}

export function getChannel(id: string, mode: DemoMode): Promise<SalesChannel | undefined> {
  return respond(mode === 'empty' ? undefined : channels.find(channel => channel.id === id), mode);
}

export function getRecommendations(mode: DemoMode): Promise<Recommendation[]> {
  return respond(mode === 'empty' ? [] : recommendations, mode);
}

export function getRecommendation(id: string, mode: DemoMode): Promise<Recommendation | undefined> {
  return respond(mode === 'empty' ? undefined : recommendations.find(recommendation => recommendation.id === id), mode);
}

export function getSettingsFixture(mode: DemoMode): Promise<SettingsFixture | undefined> {
  return respond(mode === 'empty' ? undefined : settingsFixture, mode);
}

export function getSyncFixture(mode: DemoMode): Promise<SyncFixture | undefined> {
  return respond(mode === 'empty' ? undefined : syncFixture, mode);
}

export function getReportFixture(mode: DemoMode): Promise<ReportFixture | undefined> {
  return respond(mode === 'empty' ? undefined : reportFixture, mode);
}

export function getPosFixture(mode: DemoMode): Promise<PosFixture | undefined> {
  return respond(mode === 'empty' ? undefined : posFixture, mode);
}
