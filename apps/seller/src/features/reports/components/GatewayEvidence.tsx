import { navigate } from '../../../app/routes';
import { Button } from '../../../components/ui/Button';
import type { ReportGatewayFixture } from '../report.types';

export function GatewayEvidence({ gateways }: { gateways: ReportGatewayFixture[] }) {
  return (
    <section className="grid gap-4 md:grid-cols-3" aria-label="Báo cáo đồng bộ">
      {gateways.map((gateway, index) => <article className="flex min-h-72 flex-col rounded-card border border-outline-variant/60 bg-pure-white p-5 shadow-card" key={gateway.id}><div className="flex items-start justify-between gap-3"><div><p className="font-body text-caption font-bold uppercase tracking-[0.11em] text-graphite">{gateway.label}</p><h2 className="mt-1 font-display text-xl font-bold text-on-surface">{gateway.title}</h2></div><span className="font-display text-3xl font-bold text-outline-variant">0{index + 1}</span></div><dl className="mt-6 grid gap-2">{gateway.facts.map((fact) => <div className="flex items-baseline justify-between gap-3 border-b border-outline-variant/40 pb-2" key={fact.label}><dt className="font-body text-caption text-graphite">{fact.label}</dt><dd className="font-mono text-caption font-semibold text-on-surface">{fact.value}</dd></div>)}</dl><p className="mt-auto pt-5 font-body text-caption leading-5 text-badge-blocked-text">{gateway.note}</p>{gateway.id === 'diagnostics' ? <Button className="mt-4" variant="secondary" onClick={() => navigate('/sync')}>Mở trang Đồng bộ</Button> : null}</article>)}
    </section>
  );
}
