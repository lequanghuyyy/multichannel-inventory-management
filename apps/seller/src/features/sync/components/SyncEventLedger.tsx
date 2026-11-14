import { Fragment } from 'react';
import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';
import type { SyncEventFixture } from '../sync.types';
import { syncHealthLabels, syncKindLabels, syncStatusLabels } from '../sync.utils';

export interface SyncEventLedgerProps {
  events: SyncEventFixture[];
  selected: ReadonlySet<string>;
  inspectedId: string | null;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onInspect: (id: string) => void;
}

function statusClasses(event: SyncEventFixture) {
  if (event.status === 'confirmed') return 'bg-badge-progress-bg text-badge-progress-text';
  if (event.status === 'failed') return 'bg-error-container text-error';
  if (event.status === 'processing') return 'bg-badge-neutral-bg text-badge-neutral-text';
  return 'bg-badge-blocked-bg text-badge-blocked-text';
}

function EventStatus({ event }: { event: SyncEventFixture }) {
  return <span className={cn('inline-flex rounded-full px-2.5 py-1 font-body text-caption font-bold', statusClasses(event))}>{syncStatusLabels[event.status]}</span>;
}

function Evidence({ event }: { event: SyncEventFixture }) {
  return <div className="grid gap-3 rounded-control border border-outline-variant/50 bg-surface-container-low p-4 sm:grid-cols-[1fr_auto]"><div><p className="font-body text-caption font-bold uppercase tracking-[0.1em] text-graphite">Ghi chú</p><p className="mt-1 font-body text-body-sm leading-6 text-on-surface-variant">{event.evidence}</p></div><div className="sm:text-right"><p className="font-body text-caption text-graphite">Mã liên kết (mẫu)</p><code className="mt-1 block text-caption text-on-surface">{event.correlationId}</code></div></div>;
}

export function SyncEventLedger({ events, inspectedId, onInspect, onToggle, onToggleAll, selected }: SyncEventLedgerProps) {
  const allSelected = events.length > 0 && events.every((event) => selected.has(event.id));
  return (
    <section className="overflow-hidden rounded-card border border-outline-variant/60 bg-pure-white shadow-card" aria-label="Danh sách sự kiện đồng bộ">
      <div className="flex flex-col gap-3 border-b border-outline-variant/50 p-4 sm:flex-row sm:items-center sm:justify-between">
        <label className="flex min-h-10 items-center gap-3 font-body text-body-sm font-semibold text-on-surface"><input aria-label="Chọn tất cả sự kiện đang hiển thị" className="size-4 accent-carbon" type="checkbox" checked={allSelected} onChange={onToggleAll} />Chọn tất cả sự kiện đang hiển thị</label>
        <p aria-label="Số sự kiện đã chọn" className="font-body text-caption text-graphite"><strong className="text-on-surface">{selected.size}</strong> đã chọn · chưa có thao tác</p>
      </div>
      <div className="hidden overflow-x-auto lg:block">
        <table className="w-full min-w-[1080px] border-collapse text-left font-body text-body-sm">
          <caption className="sr-only">Danh sách sự kiện đồng bộ</caption>
          <thead className="bg-surface-container-low text-caption uppercase tracking-[0.1em] text-graphite"><tr><th className="w-12 px-4 py-3"><span className="sr-only">Chọn</span></th><th className="px-3 py-3">Sự kiện / thời gian</th><th className="px-3 py-3">SKU / sản phẩm</th><th className="px-3 py-3">Từ → đến</th><th className="px-3 py-3">Loại sự kiện</th><th className="px-3 py-3">Có thể bán</th><th className="px-3 py-3">Độ trễ</th><th className="px-3 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Chi tiết</th></tr></thead>
          <tbody className="divide-y divide-outline-variant/50">{events.map((event) => <Fragment key={event.id}><tr className={cn('align-top', event.health === 'discrepancy' ? 'bg-error-container/15' : event.health === 'degraded' ? 'bg-badge-blocked-bg/15' : null)}><td className="px-4 py-4"><input aria-label={`Chọn ${event.id}`} className="size-4 accent-carbon" type="checkbox" checked={selected.has(event.id)} onChange={() => onToggle(event.id)} /></td><td className="px-3 py-4"><strong className="block font-mono text-body-sm text-on-surface">#{event.id}</strong><span className="mt-1 block font-mono text-caption text-graphite">{event.timestamp}</span></td><td className="max-w-56 px-3 py-4"><strong className="block truncate text-on-surface" title={event.product}>{event.product}</strong><code className="mt-1 block truncate text-caption text-graphite">{event.sku}</code></td><td className="px-3 py-4"><span className="block text-caption font-semibold text-on-surface">{event.source}</span><span className="mt-1 flex items-center gap-1 text-caption text-graphite"><span className="material-symbols-outlined text-sm" aria-hidden="true">arrow_forward</span>{event.destination}</span></td><td className="px-3 py-4"><span className="rounded bg-surface-container px-2 py-1 text-caption font-semibold text-on-surface">{syncKindLabels[event.kind]}</span></td><td className="px-3 py-4 font-mono text-caption text-on-surface">{event.atsDisplay}</td><td className="px-3 py-4 font-mono text-caption text-graphite">{event.latencyDisplay}</td><td className="px-3 py-4"><EventStatus event={event} /></td><td className="px-4 py-4 text-right"><Button aria-expanded={inspectedId === event.id} size="sm" variant="secondary" onClick={() => onInspect(event.id)}>Xem</Button></td></tr>{inspectedId === event.id ? <tr><td className="p-4" colSpan={9}><Evidence event={event} /></td></tr> : null}</Fragment>)}</tbody>
        </table>
      </div>
      <div className="grid divide-y divide-outline-variant/50 lg:hidden">{events.map((event) => <article className={cn('grid gap-4 p-4', event.health === 'discrepancy' ? 'bg-error-container/15' : event.health === 'degraded' ? 'bg-badge-blocked-bg/15' : null)} key={event.id}><div className="flex items-start justify-between gap-3"><label className="flex min-w-0 items-start gap-3"><input aria-label={`Chọn ${event.id}`} className="mt-1 size-4 shrink-0 accent-carbon" type="checkbox" checked={selected.has(event.id)} onChange={() => onToggle(event.id)} /><span className="min-w-0"><strong className="block font-mono text-body-sm text-on-surface">#{event.id} · {event.timestamp}</strong><span className="mt-1 block truncate font-body text-caption text-graphite">{event.product}</span><code className="block truncate text-caption text-graphite">{event.sku}</code></span></label><EventStatus event={event} /></div><div className="grid grid-cols-2 gap-3 rounded-control bg-surface-container-low p-3"><div><span className="font-body text-caption text-graphite">Từ → đến</span><p className="mt-1 font-body text-caption font-semibold text-on-surface">{event.source} → {event.destination}</p></div><div><span className="font-body text-caption text-graphite">Có thể bán</span><p className="mt-1 font-mono text-caption text-on-surface">{event.atsDisplay}</p></div><div><span className="font-body text-caption text-graphite">Loại</span><p className="mt-1 font-body text-caption text-on-surface">{syncKindLabels[event.kind]}</p></div><div><span className="font-body text-caption text-graphite">Tình trạng / độ trễ</span><p className="mt-1 font-body text-caption text-on-surface">{syncHealthLabels[event.health]} · {event.latencyDisplay}</p></div></div><Button aria-expanded={inspectedId === event.id} className="w-full" variant="secondary" onClick={() => onInspect(event.id)}>{inspectedId === event.id ? 'Ẩn chi tiết' : 'Xem chi tiết'}</Button>{inspectedId === event.id ? <Evidence event={event} /> : null}</article>)}</div>
    </section>
  );
}
