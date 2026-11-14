export type SalesMetric = 'revenue' | 'orders' | 'units';

export interface SalesChannel {
  id: string;
  label: string;
  shortLabel: string;
  total: string;
  percentage: number;
  colorClass: string;
}

export interface SalesPoint {
  label: string;
  today?: boolean;
  values: readonly number[];
}

export interface SyncEvent {
  id: string;
  channel: string;
  channelCode: string;
  channelColorClass: string;
  sku: string;
  description: string;
  status: 'success' | 'pending';
  time: string;
}

export interface DashboardAlert {
  id: string;
  label: string;
  source: string;
  title?: string;
  sku?: string;
  detail: string;
  tone: 'critical' | 'warning' | 'neutral';
}

export interface InventoryHealthSegment {
  id: string;
  label: string;
  percentage: number;
  count: number;
  colorClass: string;
}
