export type SyncEventStatus = 'confirmed' | 'processing' | 'conflict' | 'retrying' | 'failed' | 'pending' | 'delivered' | 'dead';
export type SyncEventHealth = 'optimal' | 'degraded' | 'discrepancy';
export type SyncEventKind = 'inventory_changed' | 'order_reserved' | 'buffer_adjusted' | 'mass_push' | 'sku_ingestion' | 'stock_depleted';
export type SyncChannel = 'shopee' | 'tiktok' | 'lazada' | 'pos' | 'shopify';
export type SyncSection = 'overview' | 'activity' | 'errors' | 'reconciliation';

export interface SyncEventFixture {
  id: string;
  correlationId: string;
  timestamp: string;
  sku: string;
  product: string;
  brand: string;
  channel: SyncChannel;
  source: string;
  destination: string;
  kind: SyncEventKind;
  atsDisplay: string;
  latencyDisplay: string;
  status: SyncEventStatus;
  health: SyncEventHealth;
  evidence: string;
}

export interface SyncNodeFixture {
  id: string;
  name: string;
  environment: string;
  state: 'fixture-active' | 'fixture-alert' | 'not-deployed';
  latencyDisplay: string;
  queueDisplay: string;
  coverageDisplay: string;
  icon: string;
}

export interface SyncFixture {
  events: SyncEventFixture[];
  nodes: SyncNodeFixture[];
}

export interface SyncFilters {
  query: string;
  channel: 'all' | SyncChannel;
  status: 'all' | SyncEventStatus;
  kind: 'all' | SyncEventKind;
  health: 'all' | SyncEventHealth;
}
