import { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import { salesChannels, salesMetricLabels, salesPoints } from '../dashboard.mock';
import type { SalesMetric } from '../dashboard.types';

const metricTabs: readonly TabItem<SalesMetric>[] = [
  { value: 'revenue', label: salesMetricLabels.revenue },
  { value: 'orders', label: salesMetricLabels.orders },
  { value: 'units', label: salesMetricLabels.units },
];

export function SalesOverviewCard() {
  const [metric, setMetric] = useState<SalesMetric>('revenue');
  const points = salesPoints[metric];
  const maxTotal = Math.max(...points.map((point) => point.values.reduce((sum, value) => sum + value, 0)));

  return (
    <Card className="flex flex-col gap-5 p-5 sm:p-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="whitespace-nowrap font-display text-lg font-bold tracking-tight text-on-surface">Tổng quan bán hàng theo kênh</h2>
          <p className="mt-1 font-body text-body-sm text-graphite">Doanh số theo ngày của từng kênh bán.</p>
        </div>
        <div className="shrink-0">
          <Tabs items={metricTabs} value={metric} onValueChange={setMetric} ariaLabel="Chọn chỉ số biểu đồ" />
        </div>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-2">
        {salesChannels.map((channel) => (
          <div className="flex items-center gap-1.5 font-body text-caption font-semibold text-on-surface" key={channel.id}>
            <span className={`size-2.5 rounded-full ${channel.colorClass}`} aria-hidden="true" />
            <span>{channel.label}{metric === 'revenue' ? ` (${channel.total})` : ''}</span>
          </div>
        ))}
      </div>
      <div className="rounded-card bg-surface-container-low p-3 sm:p-4">
        <div className="flex h-56 items-end justify-between gap-2 sm:gap-3" role="img" aria-label={`Biểu đồ ${salesMetricLabels[metric].toLowerCase()} trong 7 ngày`}>
          {points.map((point) => (
            <div className="group flex h-full min-w-0 flex-1 flex-col items-center justify-end" key={point.label} title={`${point.label}: ${point.values.reduce((sum, value) => sum + value, 0)}`}>
              <div className={`flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-sm shadow-sm transition-transform motion-safe:group-hover:scale-[1.03] ${point.today ? 'ring-2 ring-primary ring-offset-2' : ''}`}>
                {point.values.map((value, index) => {
                  const channel = salesChannels[index];
                  if (!channel) return null;
                  const height = Math.max(4, Math.round((value / maxTotal) * 168));
                  return <span key={channel.id} className={`w-full ${channel.colorClass}`} style={{ height }} />;
                })}
              </div>
              <span className={`mt-2 truncate font-body text-[10px] sm:text-caption ${point.today ? 'font-bold text-primary' : 'font-medium text-graphite'}`}>{point.label}</span>
            </div>
          ))}
        </div>
        <div className="mt-3 flex flex-col justify-between gap-1 border-t border-outline-variant/50 pt-3 font-body text-caption text-graphite sm:flex-row">
          <span>Giờ bán cao điểm: <strong className="text-on-surface">TikTok Shop · 14:00</strong></span>
          <span className="font-semibold text-badge-progress-text">+22,4% so với tuần trước</span>
        </div>
      </div>
    </Card>
  );
}
