import type { ReportChannelShareFixture } from '../report.types';

export function ChannelSharePanel({ channels }: { channels: ReportChannelShareFixture[] }) {
  return (
    <section className="rounded-card border border-outline-variant/60 bg-pure-white p-5 shadow-card sm:p-6" aria-labelledby="channel-share-title">
      <p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-graphite">Phân bổ</p><h2 className="mt-1 font-display text-xl font-bold text-on-surface" id="channel-share-title">Doanh số theo kênh</h2><p className="mt-1 font-body text-body-sm text-graphite">Tỷ trọng đơn hàng của từng kênh bán.</p>
      {channels.length > 0 ? <div className="mt-6 grid gap-5">{channels.map((channel) => <article className="grid gap-2" key={channel.id}><div className="flex items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className={`grid size-7 shrink-0 place-items-center rounded text-[10px] font-bold text-pure-white ${channel.colorClass}`}>{channel.code}</span><strong className="truncate font-body text-body-sm text-on-surface">{channel.name}</strong></div><div className="shrink-0 text-right"><strong className="font-mono text-body-sm text-on-surface">{channel.shareDisplay}</strong><span className="ml-2 font-body text-caption text-graphite">{channel.ordersDisplay}</span></div></div><div className="h-2.5 overflow-hidden rounded-full bg-surface-container"><div className={`${channel.barClass} h-full rounded-full ${channel.colorClass}`} /></div></article>)}</div> : <p className="mt-6 rounded-control bg-surface-container-low p-4 font-body text-body-sm text-graphite">Không có kênh nào phù hợp.</p>}
      <p className="mt-6 border-t border-outline-variant/50 pt-4 font-body text-caption text-badge-blocked-text">Đây là số liệu mẫu, không phải tổng của từng kênh trên thực tế.</p>
    </section>
  );
}
