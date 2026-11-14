import { navigate } from '../../../app/routes';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { recentSyncEvents } from '../dashboard.mock';

export function RecentSyncTable() {
  return (
    <Card className="overflow-hidden p-0">
      <div className="flex flex-col justify-between gap-2 px-5 py-4 sm:flex-row sm:items-center sm:px-6">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="material-symbols-outlined shrink-0 text-xl text-primary" aria-hidden="true">sync_alt</span>
          <h2 className="whitespace-nowrap font-display text-lg font-bold tracking-tight text-on-surface">Hoạt động đồng bộ gần đây</h2>
        </div>
        <div className="flex shrink-0 items-center gap-2 font-body text-caption text-graphite">
          <span className="size-2 shrink-0 rounded-full bg-traffic-maximize motion-safe:animate-pulse" aria-hidden="true" />
          <span className="whitespace-nowrap">Độ trễ đồng bộ: 42 ms</span>
        </div>
      </div>
      <div className="w-full overflow-x-auto">
        <table className="min-w-[760px] w-full border-collapse text-left">
          <thead>
            <tr className="h-10 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
              <th className="px-6">Kênh</th>
              <th className="px-4">SKU / Biến thể</th>
              <th className="px-4">Sự kiện</th>
              <th className="px-4">Trạng thái</th>
              <th className="px-6 text-right">Thời gian</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {recentSyncEvents.map((event) => (
              <tr className="h-12 transition-colors hover:bg-surface-container-low/50" key={event.id}>
                <td className="whitespace-nowrap px-6 py-2">
                  <div className="flex items-center gap-2">
                    <span className={`grid size-6 place-items-center rounded text-[10px] font-bold text-pure-white ${event.channelColorClass}`} aria-hidden="true">{event.channelCode}</span>
                    <span className="font-body text-body-sm font-semibold text-on-surface">{event.channel}</span>
                  </div>
                </td>
                <td className="whitespace-nowrap px-4 py-2 font-mono text-body-sm font-semibold text-on-surface">{event.sku}</td>
                <td className="whitespace-nowrap px-4 py-2 font-body text-body-sm text-graphite">{event.description}</td>
                <td className="whitespace-nowrap px-4 py-2"><StatusBadge tone={event.status === 'success' ? 'success' : 'warning'}>{event.status === 'success' ? 'Thành công' : 'Đang chờ'}</StatusBadge></td>
                <td className="whitespace-nowrap px-6 py-2 text-right font-body text-caption text-graphite">{event.time}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-col justify-between gap-2 border-t border-surface-container bg-surface-container-low/40 px-4 py-3 sm:flex-row sm:items-center">
        <span className="font-body text-caption text-graphite">Hiển thị 5 / 3.412 sự kiện đồng bộ</span>
        <Button variant="ghost" size="sm" onClick={() => navigate('/channels')} className="self-start px-2 sm:self-auto">
          Xem trạng thái kênh <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span>
        </Button>
      </footer>
    </Card>
  );
}
