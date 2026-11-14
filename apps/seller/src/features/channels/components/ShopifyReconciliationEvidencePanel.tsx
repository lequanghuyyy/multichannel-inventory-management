import { useCallback, useEffect, useRef, useState } from 'react';
import { getShopifyReconciliationEvidence, type ShopifyWebhookReconciliationEvidence, type ShopifyWebhookReconciliationEvidencePage } from '../../../api/shopify';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

const pageSize = 25;
const topics: ShopifyWebhookReconciliationEvidence['topic'][] = [
  'products/create', 'products/update', 'products/delete', 'inventory_levels/update', 'inventory_items/update',
];

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}

function stateTone(state: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (state === 'verified') return 'success';
  if (state === 'conflict' || state === 'failed') return 'danger';
  if (state === 'observed' || state === 'unmapped') return 'warning';
  return 'neutral';
}

export function ShopifyReconciliationEvidencePanel({ channelId }: { channelId: string }) {
  const [items, setItems] = useState<ShopifyWebhookReconciliationEvidence[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [topic, setTopic] = useState('');
  const [state, setState] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (nextPage: number, append: boolean) => {
    const requestGeneration = ++generation.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setError(null);
    if (append) setLoadingMore(true);
    else { setLoading(true); setItems([]); }
    try {
      const response: ShopifyWebhookReconciliationEvidencePage = await getShopifyReconciliationEvidence({
        channel_id: channelId,
        ...(topic ? { topic: topic as ShopifyWebhookReconciliationEvidence['topic'] } : {}),
        ...(state ? { state: state as ShopifyWebhookReconciliationEvidence['state'] } : {}),
        page: nextPage,
        limit: pageSize,
      }, request.signal);
      if (request.signal.aborted || generation.current !== requestGeneration) return;
      setItems((current) => append ? [...current, ...response.items.filter((item) => !current.some((row) => row.id === item.id))] : response.items);
      setTotal(response.total);
      setPage(nextPage);
    } catch (cause) {
      if (!request.signal.aborted && generation.current === requestGeneration) setError(cause);
    } finally {
      if (!request.signal.aborted && generation.current === requestGeneration) { setLoading(false); setLoadingMore(false); }
    }
  }, [channelId, state, topic]);

  useEffect(() => {
    void load(1, false);
    return () => { generation.current += 1; controller.current?.abort(); };
  }, [load]);

  return <Card className="grid min-w-0 gap-3 p-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h3 className="font-display text-base font-bold text-on-surface">Shopify product và inventory webhook evidence</h3><p className="mt-1 text-caption text-graphite">{items.length} / {total} bản ghi đã đọc · chỉ lưu kết quả read-back an toàn, không có payload webhook.</p></div>
      <Button variant="secondary" size="sm" loading={loading} onClick={() => void load(1, false)}>Làm mới</Button>
    </header>
    <div className="grid gap-2 sm:grid-cols-2">
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Topic<select className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="">Tất cả</option>{topics.map((value) => <option key={value}>{value}</option>)}</select></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Kết quả<select className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={state} onChange={(event) => setState(event.target.value)}><option value="">Tất cả</option>{['observed', 'verified', 'conflict', 'unmapped', 'failed'].map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    {loading ? <LoadingState label="Đang tải reconciliation evidence…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => void load(1, false)} /> : null}
    {!loading && !error && items.length === 0 ? <EmptyState title="Chưa có Shopify webhook evidence" detail="Kết quả sẽ xuất hiện sau khi webhook sản phẩm hoặc tồn kho được đọc lại từ Shopify." /> : null}
    {!loading && !error && items.length > 0 ? <ul className="grid min-w-0 gap-2" aria-label="Shopify reconciliation evidence">
      {items.map((item) => <li key={item.id} className="grid min-w-0 gap-2 rounded-control border border-outline-variant/50 p-3">
        <div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0"><strong className="break-all text-xs text-on-surface">{item.topic} · {item.external_resource_id}</strong><p className="mt-1 break-all font-mono text-[10px] text-graphite">Event {item.event_id}</p></div><StatusBadge tone={stateTone(item.state)}>{item.state}</StatusBadge></div>
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="text-danger">{item.safe_error_code || '—'}</span><time className="text-graphite">{formatTime(item.checked_at)}</time></div>
        <details><summary className="cursor-pointer text-xs font-semibold text-on-surface underline">Remote read-back và mục tiêu Core</summary><dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><div className="min-w-0"><dt className="text-graphite">Shopify</dt><dd className="mt-1 break-all font-mono text-on-surface">{JSON.stringify(item.evidence.remote ?? {})}</dd></div><div className="min-w-0"><dt className="text-graphite">Core / allocation</dt><dd className="mt-1 break-all font-mono text-on-surface">{JSON.stringify(item.evidence.expected ?? {})}</dd></div><div><dt className="text-graphite">Core version</dt><dd className="mt-1 font-semibold text-on-surface">{item.evidence.core_version ?? '—'}</dd></div></dl></details>
      </li>)}
    </ul> : null}
    {!loading && !error && items.length < total ? <div className="flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={() => void load(page + 1, true)}>Tải thêm evidence</Button></div> : null}
  </Card>;
}
