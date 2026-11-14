import { cn } from '../../../lib/cn';
import type { ReportMetricFixture } from '../report.types';

const toneClasses = { neutral: 'text-graphite', success: 'text-badge-progress-text', warning: 'text-badge-blocked-text' } as const;

export function ReportMetricGrid({ metrics }: { metrics: ReportMetricFixture[] }) {
  return <section className="grid grid-cols-2 gap-4 lg:grid-cols-3 xl:grid-cols-6" aria-label="Chỉ số báo cáo">{metrics.map((metric, index) => <article className="flex min-h-36 flex-col justify-between rounded-lg border border-metric-ink bg-metric-paper p-4 shadow-metric" key={metric.id}><div className="flex items-start justify-between gap-2 font-body text-[10px] font-bold uppercase tracking-[0.11em] text-graphite"><span>{metric.label}</span><span className="material-symbols-outlined text-lg" aria-hidden="true">{metric.icon}</span></div><div><strong className="block font-display text-2xl font-bold tabular-nums tracking-tight text-on-surface">{metric.value}</strong><p className={cn('mt-1 font-body text-caption font-semibold', toneClasses[metric.tone])}>{metric.detail}</p><span className="mt-3 block font-mono text-[9px] text-graphite">MỤC 0{index + 1}</span></div></article>)}</section>;
}
