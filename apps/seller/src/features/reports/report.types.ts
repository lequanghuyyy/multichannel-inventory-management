export type ReportPeriod = 'today' | '7d' | '30d';
export type ReportSection = 'overview' | 'sales' | 'inventory' | 'channels' | 'synchronization';
export type ReportChannel = 'shopee' | 'tiktok' | 'pos' | 'lazada';
export type ReportCategory = 'footwear' | 'leather' | 'apparel' | 'accessories';

export interface ReportFilters {
  channel: 'all' | ReportChannel;
  category: 'all' | ReportCategory;
}

export interface ReportMetricFixture {
  id: string;
  label: string;
  value: string;
  detail: string;
  tone: 'neutral' | 'success' | 'warning';
  icon: string;
}

export interface ReportSalesPointFixture {
  label: string;
  ordersDisplay: string;
  unitsDisplay: string;
  barClass: string;
  highlight?: boolean;
}

export interface ReportChannelShareFixture {
  id: ReportChannel;
  name: string;
  code: string;
  ordersDisplay: string;
  shareDisplay: string;
  barClass: string;
  colorClass: string;
}

export interface ReportObservationFixture {
  id: string;
  label: string;
  source: string;
  title: string;
  detail: string;
  tone: 'growth' | 'risk' | 'neutral';
}

export interface ReportSnapshotFixture {
  period: ReportPeriod;
  periodLabel: string;
  capturedAt: string;
  metrics: ReportMetricFixture[];
  salesPoints: ReportSalesPointFixture[];
  channelShares: ReportChannelShareFixture[];
  observations: ReportObservationFixture[];
  footer: string;
}

export interface ReportSkuFixture {
  id: string;
  product: string;
  variant: string;
  sku: string;
  category: ReportCategory;
  channel: ReportChannel;
  unitsSoldDisplay: string;
  onHandDisplay: string;
  reservedDisplay: string;
  bufferDisplay: string;
  atsDisplay: string;
  status: 'stable' | 'low' | 'critical';
  topChannelDisplay: string;
}

export interface ReportGatewayFixture {
  id: string;
  title: string;
  label: string;
  facts: Array<{ label: string; value: string }>;
  note: string;
}

export interface ReportFixture {
  snapshots: Record<ReportPeriod, ReportSnapshotFixture>;
  skus: ReportSkuFixture[];
  gateways: ReportGatewayFixture[];
}
