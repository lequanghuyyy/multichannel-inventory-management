import { Card } from '../../../components/ui/Card';
import { salesChannels } from '../dashboard.mock';

export function SalesByChannelCard() {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="whitespace-nowrap font-display text-lg font-bold tracking-tight text-on-surface">Doanh số theo kênh</h2>
        <span className="shrink-0 font-body text-caption text-graphite">Tổng: 370,5 triệu đ</span>
      </div>
      <div className="grid gap-3.5">
        {salesChannels.map((channel) => (
          <div className="grid gap-1" key={channel.id}>
            <div className="flex items-center justify-between gap-3 font-body text-body-sm">
              <span className="font-semibold text-on-surface">{channel.label}</span>
              <span className="font-semibold text-on-surface">{channel.total} <span className="font-normal text-graphite">({channel.percentage}%)</span></span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-container-low">
              <div className={`h-full rounded-full ${channel.colorClass}`} style={{ width: `${channel.percentage}%` }} />
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
