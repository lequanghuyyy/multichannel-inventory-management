import type { ReportSalesPointFixture, ReportSnapshotFixture } from '../report.types';

function SalesPoint({ point }: { point: ReportSalesPointFixture }) {
  return <li className="grid grid-cols-[3.5rem_1fr] items-center gap-3"><span className="font-mono text-caption font-semibold text-graphite">{point.label}</span><div><div className="mb-1 flex items-center justify-between gap-3 font-body text-caption"><span className={point.highlight ? 'font-bold text-on-tertiary-container' : 'font-semibold text-on-surface'}>{point.ordersDisplay}</span><span className="text-graphite">{point.unitsDisplay}</span></div><div className="h-3 overflow-hidden rounded-full bg-surface-container"><div className={`${point.barClass} h-full rounded-full ${point.highlight ? 'bg-on-tertiary-container' : 'bg-carbon'}`} /></div></div></li>;
}

export function SalesVelocityPanel({ snapshot, wide = false }: { snapshot: ReportSnapshotFixture; wide?: boolean }) {
  return (
    <figure className={`rounded-card border border-outline-variant/60 bg-pure-white p-5 shadow-card sm:p-6 ${wide ? 'max-w-none' : ''}`} aria-labelledby="sales-velocity-title">
      <figcaption><p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-graphite">Tốc độ bán</p><h2 className="mt-1 font-display text-xl font-bold text-on-surface" id="sales-velocity-title">Tốc độ bán theo thời gian</h2><p className="mt-1 font-body text-body-sm text-graphite">Số đơn và số sản phẩm của {snapshot.periodLabel.toLowerCase()}.</p></figcaption>
      <ul className="mt-6 grid gap-4" aria-label={`Tốc độ bán của ${snapshot.periodLabel}`}>{snapshot.salesPoints.map((point) => <SalesPoint key={point.label} point={point} />)}</ul>
      <p className="mt-6 border-t border-outline-variant/50 pt-4 font-body text-caption text-graphite">{snapshot.footer}</p>
    </figure>
  );
}
