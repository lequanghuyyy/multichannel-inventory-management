import { navigate } from '../../../app/routes';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../lib/cn';
import { dashboardAlerts } from '../dashboard.mock';

const alertTone = {
  critical: { dot: 'bg-on-tertiary-container', text: 'text-on-tertiary-container' },
  warning: { dot: 'bg-traffic-minimize', text: 'text-badge-blocked-text' },
  neutral: { dot: 'bg-graphite', text: 'text-graphite' },
} as const;

export function AttentionPanel() {
  return (
    <Card className="relative flex flex-col gap-4 overflow-hidden bg-secondary-fixed/55 p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <span className="material-symbols-outlined shrink-0 text-xl text-on-tertiary-container" aria-hidden="true">notifications_active</span>
          <h2 className="whitespace-nowrap font-display text-lg font-bold tracking-tight text-on-surface">Cần chú ý</h2>
        </div>
        <span className="shrink-0 rounded-full bg-on-tertiary-container px-2 py-1 font-body text-[10px] font-bold text-pure-white">2 CẦN XỬ LÝ</span>
      </div>
      <p className="font-body text-body-sm text-on-surface-variant">Cần kiểm tra sai lệch tồn kho và độ trễ của các kênh bán.</p>
      <div className="grid gap-3">
        {dashboardAlerts.map((alert) => {
          const tone = alertTone[alert.tone];
          return (
            <article className="rounded-control bg-pure-white p-3.5 shadow-sm ring-1 ring-black/5" key={alert.id}>
              <div className="flex items-center justify-between gap-3 font-body text-caption">
                <span className={cn('flex items-center gap-1 font-bold uppercase tracking-wider', tone.text)}><span className={cn('size-1.5 rounded-full', tone.dot)} aria-hidden="true" />{alert.label}</span>
                <span className="text-graphite">{alert.source}</span>
              </div>
              {alert.title ? <strong className="mt-2 block font-body text-body-sm text-on-surface">{alert.title}</strong> : null}
              {alert.sku ? <code className="mt-1 block font-mono text-caption text-graphite">{alert.sku}</code> : null}
              <p className="mt-2 font-body text-caption leading-5 text-on-surface-variant">{alert.detail}</p>
            </article>
          );
        })}
      </div>
      <Button onClick={() => navigate('/inventory')} className="w-full bg-on-tertiary-container hover:bg-tertiary-container" leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">build_circle</span>}>
        Kiểm tra tồn kho
      </Button>
    </Card>
  );
}
