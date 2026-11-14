import { cn } from '../../../lib/cn';
import type { ReportObservationFixture } from '../report.types';

const toneClasses = { growth: 'bg-badge-progress-bg text-badge-progress-text', risk: 'bg-badge-blocked-bg text-badge-blocked-text', neutral: 'bg-surface-container text-graphite' } as const;

export function OperationalObservations({ observations }: { observations: ReportObservationFixture[] }) {
  return (
    <section className="grid gap-4 border-y border-outline-variant/60 py-6" aria-labelledby="observations-title">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between"><div><p className="font-body text-caption font-bold uppercase tracking-[0.13em] text-graphite">Nhận xét</p><h2 className="mt-1 font-display text-2xl font-bold text-on-surface" id="observations-title">Nhận xét vận hành</h2></div><span className="font-mono text-caption text-graphite">{observations.length} NHẬN XÉT</span></div>
      <div className="grid gap-px overflow-hidden rounded-card border border-outline-variant/60 bg-outline-variant/50 lg:grid-cols-3">{observations.map((observation, index) => <article className="grid min-h-56 grid-cols-[auto_1fr] gap-x-4 bg-pure-white p-5" key={observation.id}><span className="font-display text-4xl font-bold text-outline-variant">0{index + 1}</span><div className="justify-self-end"><span className={cn('rounded-full px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.08em]', toneClasses[observation.tone])}>{observation.label}</span></div><div className="col-span-full mt-8 self-end"><p className="font-body text-caption font-semibold uppercase tracking-[0.08em] text-graphite">{observation.source}</p><h3 className="mt-2 font-display text-lg font-bold leading-6 text-on-surface">{observation.title}</h3><p className="mt-2 font-body text-body-sm leading-6 text-on-surface-variant">{observation.detail}</p></div></article>)}</div>
    </section>
  );
}
