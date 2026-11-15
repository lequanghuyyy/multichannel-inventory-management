import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import type { Channel } from '../../../api/channels';
import { channelErrorMessage } from '../channel-messages';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';

const statusLabels: Record<string, string> = { connected: 'Đang kết nối', disconnected: 'Chưa kết nối', syncing: 'Đang đồng bộ', error: 'Cần xử lý' };
const statusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = { connected: 'success', disconnected: 'neutral', syncing: 'warning', error: 'danger' };
const typeLabels: Record<string, string> = { marketplace: 'Sàn thương mại điện tử', pos: 'Bán tại quầy', website: 'Website', simulator: 'Kênh giả lập' };

function environmentLabel(env?: string): string {
  if (!env) return '';
  if (env === 'simulated' || env === 'simulation') return 'Simulator';
  if (env === 'sandbox') return 'Sandbox';
  if (env === 'production') return 'Production';
  return env;
}

function isSimulator(channel: Channel): boolean {
  return channel.type === 'simulator' || channel.environment === 'simulated';
}

function timeLabel(value?: string): string {
  if (!value) return 'Chưa có lần đồng bộ';
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 'Chưa có lần đồng bộ' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(parsed));
}

function ChannelIdentity({ channel }: { channel: Channel }) {
  return <div className="flex min-w-0 items-center gap-3">
    <span className={'grid size-11 shrink-0 place-items-center rounded-control bg-pure-white ' + (isSimulator(channel) ? 'text-graphite' : 'text-on-surface')} aria-hidden="true">
      <ChannelBrandIcon code={channel.code} simulated={isSimulator(channel)} />
    </span>
    <div className="min-w-0"><strong className="block break-words text-on-surface">{channel.name}</strong><code className="block break-all font-mono text-[10px] text-graphite">{channel.code}</code></div>
  </div>;
}

function ChannelRows({ channels, onOpen }: { channels: Channel[]; onOpen: (id: string) => void }) {
  return <>
    <div className="hidden overflow-x-auto lg:block">
      <table className="w-full min-w-[810px] border-collapse text-left">
        <caption className="sr-only">Danh sách kênh bán và trạng thái kết nối</caption>
        <thead><tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite"><th className="px-5">Kênh / shop</th><th className="px-3">Loại kênh</th><th className="px-3">Kết nối</th><th className="px-3 text-right">SKU đã ghép</th><th className="px-3">Đồng bộ gần nhất</th><th className="px-5 text-right"><span className="sr-only">Thao tác</span></th></tr></thead>
        <tbody className="divide-y divide-surface-container">{channels.map((channel) => <tr key={channel.id} className="font-body text-body-sm">
          <td className="px-5 py-3"><ChannelIdentity channel={channel} /></td>
          <td className="px-3 py-3 text-on-surface-variant">
            <div>{typeLabels[channel.type] ?? 'Kênh bán'}</div>
            <span className="text-caption text-graphite">{environmentLabel(channel.environment)}</span>
          </td>
          <td className="px-3 py-3">
            <StatusBadge tone={isSimulator(channel) ? 'warning' : statusTone[channel.status] ?? 'neutral'}>
              {isSimulator(channel) ? 'Mô phỏng' : statusLabels[channel.status] ?? 'Đang cập nhật'}
            </StatusBadge>
            {channel.last_error ? (
              <span className="mt-1 block max-w-56 text-caption text-error">
                {channelErrorMessage(channel.last_error)}
                <code className="mt-0.5 block font-mono text-[11px] text-error">{channel.last_error}</code>
              </span>
            ) : null}
          </td>
          <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{channel.mapping_count !== undefined ? channel.mapping_count.toLocaleString('vi-VN') : '—'}</td>
          <td className="px-3 py-3 text-caption text-graphite">{timeLabel(channel.last_sync)}</td>
          <td className="px-5 py-3 text-right"><Button variant="secondary" size="sm" onClick={() => onOpen(channel.id)}>Quản lý kênh</Button></td>
        </tr>)}</tbody>
      </table>
    </div>
    <div className="grid gap-3 p-3 lg:hidden">{channels.map((channel) => <article key={channel.id} className="grid min-w-0 gap-3 rounded-card border border-outline-variant/50 bg-pure-white p-4">
      <div className="flex min-w-0 items-start justify-between gap-3"><ChannelIdentity channel={channel} /><StatusBadge tone={isSimulator(channel) ? 'warning' : statusTone[channel.status] ?? 'neutral'}>{isSimulator(channel) ? 'Mô phỏng' : statusLabels[channel.status] ?? 'Đang cập nhật'}</StatusBadge></div>
      <div className="grid grid-cols-2 gap-3 border-t border-outline-variant/50 pt-3 text-caption"><div><span className="block text-graphite">Loại kênh</span><strong className="mt-1 block text-on-surface">{typeLabels[channel.type] ?? 'Kênh bán'} · {environmentLabel(channel.environment)}</strong></div><div><span className="block text-graphite">SKU đã ghép</span><strong className="mt-1 block tabular-nums text-on-surface">{channel.mapping_count !== undefined ? channel.mapping_count.toLocaleString('vi-VN') : '—'}</strong></div><div><span className="block text-graphite">Đồng bộ gần nhất</span><strong className="mt-1 block text-on-surface">{timeLabel(channel.last_sync)}</strong></div></div>
      {channel.last_error ? <div className="text-caption text-error"><p className="break-words">{channelErrorMessage(channel.last_error)}</p><code className="mt-0.5 block font-mono text-[11px] text-error">{channel.last_error}</code></div> : null}<Button variant="secondary" size="sm" onClick={() => onOpen(channel.id)}>Quản lý kênh</Button>
    </article>)}</div>
  </>;
}

export function ChannelApiGrid({ channels, onOpen }: { channels: Channel[]; onOpen: (id: string) => void }) {
  return <Card className="min-w-0 overflow-hidden p-0">
    {channels.length ? <section aria-label="Shop và kênh bán"><div className="border-b border-outline-variant/50 bg-channel-paper px-5 py-3"><h3 className="font-body text-sm font-semibold text-on-surface">Shop và kênh bán</h3><p className="mt-1 text-caption text-graphite">Trạng thái kết nối và dữ liệu đồng bộ từ từng nền tảng.</p></div><ChannelRows channels={channels} onOpen={onOpen} /></section> : null}
  </Card>;
}
