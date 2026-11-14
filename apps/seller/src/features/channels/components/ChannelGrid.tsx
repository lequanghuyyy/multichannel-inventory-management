import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../lib/cn';
import type { SalesChannel } from '../channel.types';
import { connectionPresentation, formatChannelTime } from '../channel.utils';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';

const kindNames = { marketplace: 'Sàn thương mại điện tử', pos: 'Bán tại quầy', simulator: 'Kênh mô phỏng', future: 'Dự kiến' } as const;

function ChannelCard({ channel, onOpen }: { channel: SalesChannel; onOpen: () => void }) {
  const connection = connectionPresentation[channel.connectionStatus];
  const mappedPercentage = channel.mappings.total > 0 ? Math.round((channel.mappings.mapped / channel.mappings.total) * 100) : 0;
  return <Card className="relative flex min-h-[310px] flex-col overflow-hidden p-0"><span className={cn('absolute inset-x-0 top-0 h-1', channel.colorClass)} /><div className="flex flex-1 flex-col gap-5 p-5"><div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-control bg-pure-white"><ChannelBrandIcon code={channel.name} simulated={channel.kind === 'simulator'} /></span><div className="min-w-0"><h2 className="truncate font-display text-lg font-bold text-on-surface">{channel.name}</h2><p className="truncate font-body text-caption text-graphite">{channel.subtitle}</p></div></div><StatusBadge tone={connection.tone}>{connection.label}</StatusBadge></div><div className="flex flex-wrap gap-2"><span className="rounded-full bg-surface-container-low px-2.5 py-1 font-body text-caption text-graphite">{channel.kind === 'simulator' ? 'Dữ liệu mô phỏng' : kindNames[channel.kind]}</span></div><p className="font-body text-body-sm leading-5 text-on-surface-variant">{channel.summary}</p><div className="mt-auto grid gap-2"><div className="flex justify-between font-body text-caption"><span className="text-graphite">SKU đã liên kết</span><strong className="tabular-nums text-on-surface">{channel.mappings.mapped} / {channel.mappings.total}</strong></div><div className="h-1.5 overflow-hidden rounded-full bg-surface-container"><span className={cn('block h-full rounded-full', channel.mappings.unmapped > 0 ? 'bg-apricot' : 'bg-traffic-maximize')} style={{ width: mappedPercentage + '%' }} /></div><p className="font-body text-[10px] text-graphite">{channel.mappings.unmapped} chưa liên kết · {channel.mappings.conflicts} xung đột · {formatChannelTime(channel.lastSyncAt)}</p></div></div><footer className="flex items-center justify-between gap-2 border-t border-outline-variant/50 bg-surface-container-low/50 p-4"><Button variant="secondary" size="sm" disabled title="Chưa có">Đồng bộ</Button><Button size="sm" onClick={onOpen}>Mở kênh <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button></footer></Card>;
}

export function ChannelGrid({ channels, onOpen }: { channels: SalesChannel[]; onOpen: (id: string) => void }) {
  const renderCards = (items: SalesChannel[]) => <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((channel) => <ChannelCard key={channel.id} channel={channel} onOpen={() => onOpen(channel.id)} />)}</div>;
  return <div className="grid gap-6" aria-label="Danh sách kênh bán">
    {channels.length ? <section className="grid gap-3" aria-label="Shop và kênh bán"><h2 className="font-display text-base font-bold text-on-surface">Shop và kênh bán</h2>{renderCards(channels)}</section> : null}
    {channels.length ? <Card variant="muted" className="grid min-h-[190px] place-items-center border border-dashed border-outline-variant text-center"><div><span className="material-symbols-outlined text-3xl text-graphite" aria-hidden="true">add_link</span><h2 className="mt-3 font-display text-lg font-bold text-on-surface">Kênh tuỳ chỉnh</h2><p className="mt-2 max-w-xs font-body text-body-sm text-graphite">Kết nối hệ thống ERP, quản lý kho hoặc website riêng của bạn.</p><Button className="mt-4" disabled title="Chưa có">Thêm kênh</Button></div></Card> : null}
  </div>;
}
