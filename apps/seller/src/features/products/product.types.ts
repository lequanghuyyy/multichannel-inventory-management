/**
 * `under_review` is prototype-only and `out_of_stock` is API-only, and both are kept.
 *
 * The backend's `products.status` is `active|draft|archived|out_of_stock`; `out_of_stock` is a
 * real state of the catalogue with a real writer, so narrowing the union to the API's four
 * would delete a state the database can hold. `under_review` has no backend at all. WIDENING
 * rather than narrowing is what lets one badge table serve both sources — and it is why
 * `statusOptions` and `statusPresentation` below are exhaustively keyed: adding a value makes
 * TypeScript name every place that has to learn about it.
 */
export type ProductStatus = 'active' | 'draft' | 'under_review' | 'archived' | 'out_of_stock';
export type InventoryState = 'healthy' | 'low' | 'critical' | 'out_of_stock';
export type ProductChannelId = 'shopee' | 'tiktok' | 'lazada' | 'web' | 'pos';

export interface ProductVariant {
  id: string;
  sku: string;
  color: string;
  size: string;
  colorDescription?: string;
  barcode?: string;
  price?: number;
  inventory?: {
    onHand: number;
    reserved: number;
    safetyBuffer: number;
    available: number;
    state: InventoryState;
  };
}

export interface ProductChannel {
  id: ProductChannelId;
  label: string;
  shortLabel: string;
  state: 'active' | 'paused' | 'delisted';
  colorClass: string;
}

export interface ProductInventory {
  total: number;
  available: number;
  reserved: number;
  safetyBuffer: number;
  sellableRate: number;
  note: string;
  state: InventoryState;
}

export interface ProductChannelMapping {
  channel: ProductChannel;
  context: string;
  connection: string;
  remoteIdLabel: string;
  remoteId: string;
  channelSku: string;
  published: number;
}

export interface ProductCatalogItem {
  id: string;
  name: string;
  masterSku: string;
  brand: string;
  category: string;
  icon: string;
  status: ProductStatus;
  variants: ProductVariant[];
  inventory: ProductInventory;
  channels: ProductChannel[];
  updatedAt: string;
  secondaryAction: 'variants' | 'restock' | 'publish';
  description?: string;
  canonicalId?: string;
  createdAt?: string;
  basePrice?: number;
  currency?: string;
  focusSku?: string;
  channelMappings?: ProductChannelMapping[];
}

export interface ProductFilters {
  query: string;
  category: string;
  status: ProductStatus | 'all';
  channel: ProductChannelId | 'all';
  inventory: InventoryState | 'all';
}
