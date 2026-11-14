import type { SyncEventFixture } from '../sync.types';

export function SyncMetricGrid({ events }: { events: SyncEventFixture[] }) {
  const metrics = [
    { id: 'sample', label: 'Sự kiện mẫu', value: String(events.length), detail: 'Dữ liệu minh hoạ' },
    { id: 'confirmed', label: 'Đã xác nhận', value: String(events.filter((event) => event.status === 'confirmed').length), detail: 'Chưa phải xác nhận từ sàn thật' },
    { id: 'attention', label: 'Cần xem lại', value: String(events.filter((event) => ['conflict', 'retrying', 'failed'].includes(event.status)).length), detail: 'Sự kiện bất thường' },
    { id: 'mapping', label: 'Thiếu liên kết SKU', value: String(events.filter((event) => event.status === 'failed').length), detail: 'Chưa có công cụ sửa' },
  ] as const;
  return <section className="grid grid-cols-2 gap-4 lg:grid-cols-4" aria-label="Số liệu đồng bộ">{metrics.map((metric, index) => <article className="min-h-36 rounded-lg border border-metric-ink bg-metric-paper p-4 shadow-metric sm:p-5" key={metric.id}><div className="flex justify-between font-body text-[10px] font-bold uppercase tracking-[0.12em] text-graphite"><span>{metric.label}</span><span>0{index + 1}</span></div><strong className="mt-7 block font-display text-3xl font-bold tabular-nums tracking-tight text-on-surface">{metric.value}</strong><p className="mt-1 font-body text-caption text-graphite">{metric.detail}</p></article>)}</section>;
}
