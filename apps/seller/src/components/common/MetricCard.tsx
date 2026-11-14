import type { Metric, MetricTone } from '../../types/metric';
import { cn } from '../../lib/cn';
import { Card } from '../ui/Card';

export interface MetricCardProps {
  metric: Metric;
  className?: string;
}

const toneClasses: Record<MetricTone, string> = {
  neutral: 'text-graphite',
  success: 'text-badge-progress-text',
  warning: 'text-badge-blocked-text',
  danger: 'text-error',
};

export function MetricCard({ className, metric }: MetricCardProps) {
  const tone = metric.tone ?? 'neutral';
  return (
    <Card className={cn('flex min-h-32 flex-col justify-between rounded-lg border border-metric-ink bg-metric-paper p-4 shadow-metric ring-0 sm:p-5', className)}>
      <div className="flex items-center justify-between gap-3 font-body text-caption font-semibold text-graphite">
        <span>{metric.label}</span>
        {metric.icon ? <span className="material-symbols-outlined text-lg" aria-hidden="true">{metric.icon}</span> : null}
      </div>
      <div className="mt-4">
        <strong className="font-display text-2xl font-bold tabular-nums tracking-tight text-on-surface">{metric.value}</strong>
        {metric.detail ? <p className={cn('mt-1 font-body text-caption', toneClasses[tone])}>{metric.detail}</p> : null}
      </div>
    </Card>
  );
}
