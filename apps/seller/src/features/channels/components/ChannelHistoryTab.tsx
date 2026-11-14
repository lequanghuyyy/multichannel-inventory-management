import { useCallback, useEffect, useState } from 'react';
import { listSyncEvents, type SyncEvent } from '../../../api/sync';
import type { Channel } from '../../../api/channels';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

type ActivityFilter = 'all' | 'done' | 'attention';

export function ChannelHistoryTab({ channel }: { channel: Channel; canManage?: boolean }) {
  const [events, setEvents] = useState<SyncEvent[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState<ActivityFilter>('all');
  const [attempt, setAttempt] = useState(0);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null); setEvents([]);
    try { const page = await listSyncEvents({ limit: 30, channel_id: channel.id }, signal); if (!signal?.aborted) { setEvents(page.items); setCursor(page.nextCursor); } }
    catch (cause) { if (!signal?.aborted) setError(cause); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [channel.id]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => controller.abort(); }, [attempt, load]);

  const loadMore = async () => {
    if (!cursor || loadingMore) return;
    setLoadingMore(true); setError(null);
    try { const page = await listSyncEvents({ limit: 30, channel_id: channel.id, cursor }); setEvents((current) => [...current, ...page.items.filter((item) => !current.some((old) => old.id === item.id))]); setCursor(page.nextCursor); }
    catch (cause) { setError(cause); }
    finally { setLoadingMore(false); }
  };

  const visible = events.filter((event) => filter === 'all' || (filter === 'done' && event.state === 'delivered') || (filter === 'attention' && ['failed', 'dead'].includes(event.state)));

  return <div className="grid min-w-0 gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><h2 className="font-display text-xl font-bold text-on-surface">Lịch sử hoạt động</h2><Button variant="secondary" size="sm" loading={loading} onClick={() => setAttempt((value) => value + 1)} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}>Làm mới</Button></header>
    <Card className="flex min-w-0 gap-2 overflow-x-auto p-3" role="group" aria-label="Lọc lịch sử hoạt động">{[
      { id: 'all' as const, label: 'Tất cả' }, { id: 'done' as const, label: 'Hoàn tất' }, { id: 'attention' as const, label: 'Cần kiểm tra' },
    ].map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold ${filter === item.id ? 'bg-carbon text-pure-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>{item.label}</button>)}</Card>
    {loading ? <LoadingState label="Đang tải hoạt động…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /> : null}
    {!loading && !error && visible.length === 0 ? <EmptyState title={filter === 'attention' ? 'Không có mục cần kiểm tra' : 'Chưa có hoạt động'} detail={filter === 'attention' ? 'Chưa ghi nhận thay đổi nào gặp vấn đề.' : 'Các thay đổi được ghi nhận sẽ hiển thị tại đây.'} /> : null}
    {!loading && !error && visible.length > 0 ? <Card className="min-w-0 overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[720px] border-collapse text-left"><caption className="sr-only">Lịch sử hoạt động của {channel.name}</caption><thead><tr className="h-12 border-b border-outline-variant/50 bg-surface-container-low text-xs font-semibold text-graphite"><th className="px-5">Hoạt động</th><th className="px-3">Mã sản phẩm</th><th className="px-3">Thay đổi số có thể bán</th><th className="px-3">Tình trạng</th><th className="px-5 text-right">Thời gian</th></tr></thead><tbody className="divide-y divide-surface-container">{visible.map((event) => <ActivityRow key={event.id} event={event} />)}</tbody></table></div>
      <div className="grid gap-2 p-3 md:hidden">{visible.map((event) => <ActivityCard key={event.id} event={event} />)}</div>
      {cursor ? <footer className="flex justify-center border-t border-outline-variant/50 p-3"><Button variant="ghost" size="sm" loading={loadingMore} onClick={() => void loadMore()}>Xem thêm</Button></footer> : null}
    </Card> : null}
  </div>;
}

function ActivityRow({ event }: { event: SyncEvent }) {
  const status = statusView(event.state);
  return <tr className="text-sm hover:bg-surface-container-low/60"><td className="px-5 py-4"><strong className="block font-medium text-on-surface">{activityLabel(event.operation)}</strong><span className="mt-1 block text-xs text-graphite">{event.source === 'user' ? 'Thay đổi thủ công' : 'Cập nhật tự động'}</span></td><td className="px-3 py-4 font-mono text-xs text-on-surface">{event.sku || '—'}</td><td className="px-3 py-4 text-xs tabular-nums text-on-surface">{event.before.available_to_sell.toLocaleString('vi-VN')} <span className="mx-1 text-graphite">→</span> {event.after.available_to_sell.toLocaleString('vi-VN')}</td><td className="px-3 py-4"><StatusBadge tone={status.tone}>{status.label}</StatusBadge>{status.help ? <span className="mt-1 block max-w-52 text-xs text-graphite">{status.help}</span> : null}</td><td className="px-5 py-4 text-right text-xs text-graphite">{formatTime(event.occurred_at)}</td></tr>;
}

function ActivityCard({ event }: { event: SyncEvent }) {
  const status = statusView(event.state);
  return <article className="grid gap-3 rounded-control border border-outline-variant/50 p-4"><div className="flex items-start justify-between gap-3"><div><strong className="text-sm font-semibold text-on-surface">{activityLabel(event.operation)}</strong><span className="mt-1 block font-mono text-xs text-graphite">{event.sku || '—'}</span></div><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div><div className="flex items-center justify-between border-t border-outline-variant/50 pt-3 text-xs"><span className="text-graphite">Số có thể bán</span><strong className="tabular-nums text-on-surface">{event.before.available_to_sell.toLocaleString('vi-VN')} → {event.after.available_to_sell.toLocaleString('vi-VN')}</strong></div><time className="text-xs text-graphite">{formatTime(event.occurred_at)}</time>{status.help ? <p className="text-xs leading-5 text-graphite">{status.help}</p> : null}</article>;
}

function activityLabel(operation: string) { const value = operation.toLocaleLowerCase('en'); return value.includes('product') ? 'Cập nhật sản phẩm' : value.includes('inventory') || value.includes('stock') ? 'Cập nhật tồn kho' : 'Cập nhật cửa hàng'; }
function statusView(state: string) { if (state === 'delivered') return { label: 'Hoàn tất', tone: 'success' as const, help: '' }; if (state === 'pending') return { label: 'Đang cập nhật', tone: 'warning' as const, help: '' }; if (state === 'dead') return { label: 'Cần kiểm tra', tone: 'danger' as const, help: 'Không thể cập nhật. Hãy kiểm tra kết nối cửa hàng.' }; if (state === 'failed') return { label: 'Đang thử lại', tone: 'warning' as const, help: '' }; return { label: 'Đã ghi nhận', tone: 'neutral' as const, help: '' }; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
