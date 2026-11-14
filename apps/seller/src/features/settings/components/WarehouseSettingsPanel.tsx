import { Button } from '../../../components/ui/Button';
import type { WarehouseSettingsFixture } from '../settings.types';

export function WarehouseSettingsPanel({ warehouse }: { warehouse: WarehouseSettingsFixture }) {
  return (
    <section className="grid gap-5" aria-labelledby="warehouse-panel-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="font-body text-caption font-bold uppercase tracking-[0.14em] text-graphite">Thiết lập 02</p><h2 className="mt-1 whitespace-nowrap font-display text-2xl font-bold text-on-surface" id="warehouse-panel-title">Kho chính</h2></div><span className="w-fit shrink-0 rounded-full bg-secondary-fixed px-3 py-1 font-body text-caption font-bold text-on-surface">SỐ LIỆU MẪU</span></div>
      <div className="rounded-card border border-outline-variant/60 bg-pure-white shadow-card">
        <div className="flex flex-col gap-5 p-5 sm:p-7 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-4"><span className="material-symbols-outlined grid size-12 place-items-center rounded-control bg-carbon text-2xl text-pure-white" aria-hidden="true">warehouse</span><div><div className="flex flex-wrap items-center gap-2"><h3 className="font-display text-xl font-bold text-on-surface">{warehouse.name}</h3><code className="rounded bg-surface-container px-2 py-1 text-caption text-on-surface">{warehouse.code}</code></div><p className="mt-1 font-body text-body-sm text-graphite">{warehouse.location}</p><p className="mt-2 font-body text-caption font-semibold text-badge-blocked-text">{warehouse.state} · dữ liệu mẫu</p></div></div>
          <Button variant="secondary" disabled leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">tune</span>}>Thông số kho</Button>
        </div>
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Số liệu kho">{warehouse.metrics.map((metric) => <article className="min-h-36 rounded-lg border border-metric-ink bg-metric-paper p-5 text-on-surface shadow-metric" key={metric.id}><p className="font-body text-caption font-bold uppercase tracking-[0.11em] text-graphite">{metric.label}</p><strong className="mt-5 block font-display text-2xl font-bold tabular-nums tracking-tight">{metric.value}</strong><p className="mt-2 font-body text-caption text-graphite">{metric.detail}</p></article>)}</div>
        <div className="border-t border-outline-variant/50 bg-badge-neutral-bg/40 px-5 py-4 font-body text-body-sm leading-6 text-badge-neutral-text"><strong>Lưu ý:</strong> các số tổng ở đây chỉ để minh hoạ, chưa phải số liệu thật của kho.</div>
      </div>
    </section>
  );
}
