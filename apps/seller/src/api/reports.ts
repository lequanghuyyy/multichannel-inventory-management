import { createApiClient } from './client';
import { ApiRequestError, parseApiError } from '../core/api-error';

export type ReportPeriod = '7d' | '30d' | '90d';

export type ReportMetrics = {
  order_count: number;
  cancelled_orders: number;
  refunded_orders: number;
  units_gross: number;
  units_sold: number;
  units_cancelled: number;
  gross_order_value_minor: number;
  non_cancelled_order_value_minor: number;
  currency: string;
  returned_sellable_units: number;
  completed_returns: number;
};

export type ExternalCurrencyValue = {
  currency: string;
  source: string;
  orders_observed: number;
  marketplace_total?: string;
  payment_evidence_count: number;
  payment_evidence_amount?: string;
};

export type ReportDayBucket = {
  date: string;
  order_count: number;
  units_sold: number;
  non_cancelled_order_value_minor: number;
};

export type ReportSkuRow = {
  sku: string;
  name: string;
  category: string;
  order_count: number;
  units_sold: number;
  non_cancelled_order_value_minor: number;
};

export type ReportChannelShare = {
  channel_code: string;
  order_count: number;
  units_sold: number;
  non_cancelled_order_value_minor: number;
  share_pct: number;
};

export type ReportInventoryHealth = {
  variant_count: number;
  on_hand: number;
  reserved: number;
  out_of_stock: number;
  low_stock: number;
  with_open_holds: number;
};

export type ReportSyncHealth = {
  event_count: number;
  delivered: number;
  pending: number;
  failed: number;
  dead: number;
  dead_before_period: number;
};

export type ReportListingDrift = {
  listing_count: number;
  drifted: number;
  awaiting_report: number;
  unlisted: number;
  behind_core: number;
  ats_basis: number;
  legacy_basis: number;
};

export type ReportSummary = {
  period: ReportPeriod;
  from: string;
  to: string;
  generated_at: string;
  /** `core-database` on every successful response. There is no cached or estimated path. */
  source: 'core-database';
  currency: string;
  metrics: ReportMetrics;
  /** One bucket per day in the window, including days with no sales. */
  sales_by_day: ReportDayBucket[];
  top_skus: ReportSkuRow[];
  channels: ReportChannelShare[];
  external_currency_values: ExternalCurrencyValue[];
  inventory: ReportInventoryHealth;
  /** Non-cancelled order value over the non-cancelled orders, computed server-side so two clients cannot round it differently. */
  average_order_value_minor: number;
  sync: ReportSyncHealth;
  drift: ReportListingDrift;
  channel_options: string[];
  category_options: string[];
};

export interface ReportQuery {
  period?: ReportPeriod;
  channel?: string;
  category?: string;
}

export async function getReportSummary(query: ReportQuery = {}, signal?: AbortSignal): Promise<ReportSummary> {
  const client = createApiClient();
  const params = {
    ...(query.period ? { period: query.period } : {}),
    ...(query.channel ? { channel: query.channel } : {}),
    ...(query.category ? { category: query.category } : {}),
  };
  const { data, error, response } = await client.GET('/api/v1/reports/summary', {
    params: { query: params }, signal, cache: 'no-store',
  });
  if (!response.ok) {
    if (error && typeof error === 'object') throw new ApiRequestError(parseApiError(error), response.status);
    throw new Error('Không kết nối được báo cáo. Hãy thử lại sau.');
  }
  if (!data) throw new Error('Dữ liệu báo cáo nhận về không hợp lệ.');
  return data as unknown as ReportSummary;
}
