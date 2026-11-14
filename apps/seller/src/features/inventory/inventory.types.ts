export type InventoryStatus = 'in_stock' | 'low_stock' | 'out_of_stock';
export type InventorySyncState = 'synced' | 'paused' | 'unavailable';
export type InventoryQuickFilter = 'all' | 'low' | 'out' | 'conflict' | 'custom';

export interface InventoryChannel {
  id: 'shopee' | 'tiktok' | 'lazada' | 'web' | 'pos';
  label: string;
  shortLabel: string;
  colorClass: string;
}

export interface InventoryLedgerRow {
  id: string;
  /** Present on API rows; the fixture has no catalogue image to load. */
  productId?: string;
  /** Authenticated primary image id, used with `productId` to render the thumbnail. */
  primaryMediaId?: string;
  productName: string;
  variantLabel: string;
  icon: string;
  sku: string;
  /** Empty when neither source knows one. The API carries no barcode; the fixture does. */
  barcode: string;
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  availableToSell: number;
  /** Live API version used for optimistic concurrency in bulk adjustments. */
  version?: number;
  channels: InventoryChannel[];
  status: InventoryStatus;
  syncState: InventorySyncState;
  updatedLabel: string;
  location: 'central' | 'east' | 'west';
  customBuffer: boolean;
  syncConflict: boolean;
  reservedNote?: string;
  /**
   * Present only on rows built from `GET /api/v1/inventory`. Absent on fixture rows, which is
   * what keeps the price column out of fixture mode: there is no prototype price to show, and
   * the POS fixture's USD 129 is not this catalogue's price.
   */
  priceLabel?: string;
}

export interface InventoryFilters {
  query: string;
  product: string;
  status: 'all' | InventoryStatus | 'reserved_only';
  channel: 'all' | InventoryChannel['id'];
  /**
   * `'all'` means the filter does not apply, which is the default.
   *
   * It has to be the default: GET /api/v1/inventory has no location column at all, so an
   * exact match against a warehouse name would drop every live row and leave the screen
   * showing only the fixture. Fixture rows are all `'central'`, so defaulting to `'all'`
   * keeps fixture behaviour identical while stopping the API rows from vanishing.
   */
  location: 'all' | 'central' | 'east' | 'west';
  quick: InventoryQuickFilter;
}
