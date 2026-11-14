import { cn } from '../../../lib/cn';
import type { SyncNodeFixture } from '../sync.types';

const nodeStateLabels = { 'fixture-active': 'mẫu · hoạt động', 'fixture-alert': 'mẫu · cần xem', 'not-deployed': 'chưa triển khai' } as const;

export function SyncNodeStrip({ nodes }: { nodes: SyncNodeFixture[] }) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Các kênh">
      {nodes.map((node) => <article className="rounded-card border border-outline-variant/60 bg-pure-white p-4 shadow-card" key={node.id}><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="material-symbols-outlined grid size-9 shrink-0 place-items-center rounded-control bg-surface-container-low text-xl text-on-surface" aria-hidden="true">{node.icon}</span><div className="min-w-0"><h3 className="truncate font-display text-base font-bold text-on-surface">{node.name}</h3><p className="truncate font-body text-caption text-graphite">{node.environment}</p></div></div><span className={cn('shrink-0 rounded-full px-2 py-1 font-body text-[9px] font-bold uppercase tracking-[0.08em]', node.state === 'fixture-active' ? 'bg-badge-progress-bg text-badge-progress-text' : node.state === 'fixture-alert' ? 'bg-badge-blocked-bg text-badge-blocked-text' : 'bg-surface-container text-graphite')}>{nodeStateLabels[node.state]}</span></div><div className="mt-4 grid gap-1 border-t border-outline-variant/50 pt-3 font-mono text-caption text-graphite"><span>{node.latencyDisplay}</span><span>{node.queueDisplay}</span><span className="text-on-surface">{node.coverageDisplay}</span></div></article>)}
    </section>
  );
}
