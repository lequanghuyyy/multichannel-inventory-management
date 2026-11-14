import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import type { InventoryDetailStock } from '../../inventory-detail.types';

export interface InventoryAnchorMetricsProps {
  stock: InventoryDetailStock;
  source: 'api' | 'fixture';
  version?: number;
  apiState: 'loading' | 'success' | 'error';
  onRetry: () => void;
  updatedAt?: string;
}

const metricDefinitions = [
  { key: 'onHand', label: 'Tồn trong hệ thống', icon: 'warehouse' },
  { key: 'reserved', label: 'Đang giữ cho đơn', icon: 'lock_clock' },
  { key: 'safetyBuffer', label: 'Tồn đệm an toàn', icon: 'shield' },
  { key: 'availableToSell', label: 'Có thể bán', icon: 'bolt' },
] as const;

function formatUpdatedAt(value?: string): string {
  if (!value) return 'Chưa có thời điểm cập nhật';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa có thời điểm cập nhật' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

export function InventoryAnchorMetrics({ apiState, onRetry, source, stock, version, updatedAt }: InventoryAnchorMetricsProps) {
  const sourceLabel = source === 'api' ? `Phiên bản ${version}` : 'Thông tin mẫu';
  return (
    <section className="grid gap-3" aria-label="Tồn kho hiện tại">
      <div className="flex flex-col justify-between gap-2 rounded-control bg-secondary-fixed px-4 py-3 font-body text-caption text-on-surface sm:flex-row sm:items-center"><strong className="flex items-start gap-2"><span className="material-symbols-outlined text-base" aria-hidden="true">calculate</span><span>Có thể bán = Tồn trong hệ thống ({stock.onHand}) − Đang giữ ({stock.reserved}) − Tồn đệm an toàn ({stock.safetyBuffer})</span></strong><span className="flex flex-wrap items-center gap-x-3 gap-y-1 font-body text-[11px] text-on-surface-variant"><span>Cập nhật {formatUpdatedAt(updatedAt)}</span><span>{sourceLabel}</span>{apiState === 'error' ? <Button variant="ghost" size="sm" onClick={onRetry} className="min-h-7 px-2">Thử lại</Button> : null}</span></div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metricDefinitions.map((metric) => {
          const value = stock[metric.key];
          const available = metric.key === 'availableToSell';
          const helper = metric.key === 'onHand' ? 'Chưa đồng nghĩa với số lượng kiểm kê thực tế.' : metric.key === 'availableToSell' ? 'Tồn hệ thống trừ hàng giữ và tồn đệm.' : metric.key === 'safetyBuffer' ? 'Được giữ lại khỏi lượng có thể bán.' : 'Đang được reservation giữ cho đơn.';
          return <Card key={metric.key} className="rounded-lg border border-metric-ink bg-metric-paper shadow-metric ring-0"><div className="flex items-center justify-between font-body text-caption font-semibold text-graphite"><span>{metric.label}</span><span className={available ? 'material-symbols-outlined text-on-tertiary-container' : 'material-symbols-outlined'} aria-hidden="true">{metric.icon}</span></div><strong className="mt-5 block font-display text-3xl font-bold tabular-nums tracking-tight text-on-surface">{value.toLocaleString('vi-VN')} <span className="font-body text-caption font-semibold text-graphite">chiếc</span></strong><p className={available ? 'mt-2 font-body text-caption font-semibold text-on-tertiary-container' : 'mt-2 font-body text-caption text-graphite'}>{helper}</p></Card>;
        })}
      </div>
    </section>
  );
}
