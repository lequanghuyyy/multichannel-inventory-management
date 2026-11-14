import { MetricCard } from '../../../components/common/MetricCard';
import type { DataSource } from '../../shared/useApiPage';
import type { InventoryLedgerRow } from '../inventory.types';
import type { Metric } from '../../../types/metric';

const metrics: Metric[] = [
  { id: 'on-hand', label: 'Tổng tồn kho', value: '38.420', detail: 'Trên 3 kho', icon: 'inventory_2' },
  { id: 'reserved', label: 'Đang giữ', value: '3.110', detail: 'Chờ thanh toán và giao hàng', icon: 'lock_clock', tone: 'warning' },
  { id: 'buffers', label: 'Tổng tồn đệm an toàn', value: '1.020', detail: 'Áp dụng cho 38 SKU biến động', icon: 'shield', tone: 'neutral' },
  { id: 'available', label: 'Có thể bán', value: '34.290', detail: 'Đang đăng trên 5 kênh', icon: 'broadcast_on_personal', tone: 'success' },
];

/**
 * Sums the four canonical numbers across whatever rows are on screen.
 *
 * `available_to_sell` is summed from the values each row already carries rather than
 * recomputed here: when the source is the API those are the backend's numbers, and a
 * client-side `onHand - reserved - buffer` would be a second implementation of a rule that
 * the backend owns. It is the SUM of those numbers, not the subtrahend — the sum of the two
 * sides happens to agree, but only because the rows already satisfy the identity.
 *
 * When the source is the fixture there are no real aggregates to show, so the prototype
 * totals are shown and LABELLED as such rather than computed over seven rows and presented
 * as the shop's stock.
 */
export function InventoryMetricGrid({ rows, source }: { rows: InventoryLedgerRow[]; source: DataSource }) {
  if (source === 'fixture') {
    return <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số tồn kho">{metrics.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>;
  }

  const totals = rows.reduce((total, row) => ({
    onHand: total.onHand + row.onHand,
    reserved: total.reserved + row.reserved,
    buffers: total.buffers + row.safetyBuffer,
    available: total.available + row.availableToSell,
  }), { onHand: 0, reserved: 0, buffers: 0, available: 0 });
  const counter = new Intl.NumberFormat('vi-VN');

  const live: Metric[] = [
    { id: 'on-hand', label: 'Tổng tồn kho', value: counter.format(totals.onHand), detail: `Cộng ${rows.length} biến thể đang hiển thị`, icon: 'inventory_2' },
    { id: 'reserved', label: 'Đang giữ', value: counter.format(totals.reserved), detail: 'Chờ thanh toán và giao hàng', icon: 'lock_clock', tone: 'warning' },
    { id: 'buffers', label: 'Tổng tồn đệm an toàn', value: counter.format(totals.buffers), detail: 'Trừ khỏi số có thể bán', icon: 'shield', tone: 'neutral' },
    { id: 'available', label: 'Có thể bán', value: counter.format(totals.available), detail: 'Số khách có thể mua', icon: 'broadcast_on_personal', tone: 'success' },
  ];

  return <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số tồn kho">{live.map((metric) => <MetricCard key={metric.label} metric={metric} />)}</section>;
}
