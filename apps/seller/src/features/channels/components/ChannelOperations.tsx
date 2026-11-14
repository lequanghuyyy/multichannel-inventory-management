import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Channel, ChannelMapping } from '../../../api/channels';
import {
  getChannelActivity, getChannelSettings, listChannelActivity, listChannelProducts, listOrderIngestion,
  pollChannelOrders, reconcileChannelListing, resyncChannelListing,
  type ActivityDomain, type ChannelActivity, type ChannelProduct, type ChannelProductState, type ChannelSettings,
  type InventoryReconciliation, type OrderIngestionPage, type OrderIngestionState,
} from '../../../api/channel-operations';
import { listChannelMappings } from '../../../api/channels';
import { channelCapabilityMessage } from '../channel-messages';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Drawer } from '../../../components/ui/Drawer';
import { Input } from '../../../components/ui/Input';
import { ProductPublicationPanel } from '../../products/components/ProductPublicationPanel';
import { newIdempotencyKey } from '../../products/product.write';

const availableStates = [
  ['not_published', 'Chưa đăng'], ['draft', 'Bản nháp'], ['stopped', 'Đã ngừng bán'], ['needs_attention', 'Cần xử lý'],
] as const;
const fmt = (value?: string | null) => value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }) : 'Chưa có dữ liệu';
const count = (n?: number | null) => n == null ? '—' : n.toLocaleString('vi-VN');
type InventoryTabSummary = { quota: number | null; actual: number | null; verified: number; total: number; mismatched: number; lastVerifiedAt?: string };
function summarizeMappings(rows: ChannelMapping[]): InventoryTabSummary {
  const quotaRows = rows.filter((row) => row.target_quantity != null);
  const actualRows = rows.filter((row) => (row.reported_quantity ?? row.reported_on_hand) != null);
  const lastVerifiedAt = rows.map((row) => row.latest_sync_verified_at).filter(Boolean).sort().at(-1);
  return {
    quota: quotaRows.length ? quotaRows.reduce((total, row) => total + (row.target_quantity as number), 0) : null,
    actual: actualRows.length ? actualRows.reduce((total, row) => total + ((row.reported_quantity ?? row.reported_on_hand) as number), 0) : null,
    verified: rows.filter((row) => row.latest_sync_status === 'VERIFIED').length,
    total: rows.length,
    mismatched: rows.filter((row) => row.drifted || row.latest_sync_status === 'MISMATCH').length,
    lastVerifiedAt,
  };
}
const labelState = (state: string) => ({ not_published: 'Chưa đăng', not_exported: 'Chưa đăng', active: 'Đang bán', published: 'Đang bán', stopped: 'Đã ngừng bán', unpublished: 'Đã ngừng bán', needs_attention: 'Cần xử lý', syncing: 'Đang đồng bộ', sync_pending: 'Đang chờ đồng bộ', sync_failed: 'Đồng bộ thất bại', draft: 'Bản nháp', preflight_failed: 'Cần bổ sung thông tin', verified: 'Đã xác minh', unverified: 'Chưa xác minh', not_synced: 'Chưa đồng bộ', drifted: 'Lệch tồn', verification_pending: 'Chờ xác minh', blocked: 'Bị chặn', imported: 'Đã nhập', pending: 'Chờ xử lý', quarantined: 'Bị cách ly', failed: 'Lỗi nhập', queued: 'Đã tiếp nhận', running: 'Đang xử lý', completed: 'Hoàn tất', unmapped: 'Chưa ghép SKU', mapped: 'Đã ghép SKU', conflict: 'Xung đột', stale: 'Cần xác minh lại' } as Record<string, string>)[state] ?? 'Đang cập nhật';
const coreStatusLabel = (state: string) => ({ active: 'Đang kinh doanh', draft: 'Bản nháp', archived: 'Đã lưu trữ', inactive: 'Ngừng kinh doanh' } as Record<string, string>)[state] ?? labelState(state);
function tone(state: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['active', 'verified', 'imported', 'completed', 'succeeded', 'delivered'].includes(state)) return 'success';
  if (['needs_attention', 'syncing', 'sync_pending', 'pending', 'queued', 'running', 'verification_pending', 'drifted', 'stale'].includes(state)) return 'warning';
  if (['failed', 'sync_failed', 'preflight_failed', 'blocked', 'quarantined', 'dead', 'conflict'].includes(state)) return 'danger';
  return 'neutral';
}
function Heading({ eyebrow, title, detail, action }: { eyebrow: string; title: string; detail?: string; action?: ReactNode }) {
  return <header className="flex flex-wrap items-end justify-between gap-4 border-b border-outline-variant/60 bg-channel-paper px-5 py-5 sm:px-7">
    <div><p className="font-body text-[10px] font-bold uppercase tracking-[.16em] text-octo-ember">{eyebrow}</p><h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-.035em] text-on-surface">{title}</h2>{detail ? <p className="mt-1 max-w-2xl text-sm leading-5 text-graphite">{detail}</p> : null}</div>{action}
  </header>;
}
function FilterBar<T extends string>({ value, onChange, items }: { value: T; onChange: (value: T) => void; items: readonly (readonly [T, string])[] }) {
  return <div className="flex min-w-0 gap-1 overflow-x-auto border-b border-outline-variant/60 bg-pure-white px-4 py-3" role="group">
    {items.map(([key, text]) => <button key={key} type="button" aria-pressed={value === key} onClick={() => onChange(key)} className={'min-h-9 shrink-0 border-b-2 px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-octo-ember ' + (value === key ? 'border-octo-ember text-on-surface' : 'border-transparent text-graphite hover:text-on-surface')}>{text}</button>)}
  </div>;
}

export function ChannelCoreProducts({ channel, canManage }: { channel: Channel; canManage: boolean }) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState<ChannelProduct[]>([]);
  const [cursor, setCursor] = useState('');
  const [total, setTotal] = useState(0);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<unknown>();
  const [selected, setSelected] = useState<ChannelProduct | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerState, setPickerState] = useState<ChannelProductState>('not_published');
  const [pickerQuery, setPickerQuery] = useState('');
  const [candidates, setCandidates] = useState<ChannelProduct[]>([]);
  const [pickerCursor, setPickerCursor] = useState('');
  const [pickerTotal, setPickerTotal] = useState(0);
  const [pickerBusy, setPickerBusy] = useState(false);
  const [pickerError, setPickerError] = useState<unknown>();
  const [pickerAttempt, setPickerAttempt] = useState(0);

  const loadPublished = useCallback((signal?: AbortSignal) => {
    setBusy(true);
    setError(undefined);
    void listChannelProducts(channel.id, { state: 'active', q: query.trim() || undefined, limit: 25 }, signal).then((result) => {
      if (signal?.aborted) return;
      setPage(result.products ?? []);
      setCursor(result.next_cursor ?? '');
      setTotal(result.total_count ?? 0);
    }).catch((cause) => {
      if (!signal?.aborted) setError(cause);
    }).finally(() => {
      if (!signal?.aborted) setBusy(false);
    });
  }, [channel.id, query]);

  useEffect(() => {
    const controller = new AbortController();
    loadPublished(controller.signal);
    return () => controller.abort();
  }, [attempt, loadPublished]);

  const loadCandidates = useCallback((signal?: AbortSignal) => {
    setPickerBusy(true);
    setPickerError(undefined);
    void listChannelProducts(channel.id, { state: pickerState, q: pickerQuery.trim() || undefined, limit: 25 }, signal).then((result) => {
      if (signal?.aborted) return;
      setCandidates(result.products ?? []);
      setPickerCursor(result.next_cursor ?? '');
      setPickerTotal(result.total_count ?? 0);
    }).catch((cause) => {
      if (!signal?.aborted) setPickerError(cause);
    }).finally(() => {
      if (!signal?.aborted) setPickerBusy(false);
    });
  }, [channel.id, pickerQuery, pickerState]);

  useEffect(() => {
    if (!pickerOpen) return;
    const controller = new AbortController();
    loadCandidates(controller.signal);
    return () => controller.abort();
  }, [loadCandidates, pickerAttempt, pickerOpen]);

  const loadMorePublished = async () => {
    if (!cursor) return;
    try {
      const result = await listChannelProducts(channel.id, { state: 'active', q: query.trim() || undefined, limit: 25, cursor });
      setPage((current) => [...current, ...(result.products ?? [])]);
      setCursor(result.next_cursor ?? '');
    } catch (cause) {
      setError(cause);
    }
  };

  const loadMoreCandidates = async () => {
    if (!pickerCursor) return;
    setPickerBusy(true);
    try {
      const result = await listChannelProducts(channel.id, { state: pickerState, q: pickerQuery.trim() || undefined, limit: 25, cursor: pickerCursor });
      setCandidates((current) => [...current, ...(result.products ?? [])]);
      setPickerCursor(result.next_cursor ?? '');
    } catch (cause) {
      setPickerError(cause);
    } finally {
      setPickerBusy(false);
    }
  };

  const chooseProduct = (product: ChannelProduct) => {
    setSelected(product);
    setPickerOpen(false);
  };

  return <>
    <Card className="overflow-hidden border border-outline-variant/70 bg-pure-white p-0 shadow-none">
      <Heading eyebrow="Danh mục · Kênh bán" title="Sản phẩm đang bán" detail={count(total) + ' sản phẩm đang được đăng bán trên ' + channel.name + '.'} action={<div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" disabled={!canManage} onClick={() => setPickerOpen(true)}>+ Chọn sản phẩm từ OctoFlow</Button><Button variant="ghost" size="sm" onClick={() => setAttempt((value) => value + 1)} loading={busy}>Làm mới</Button></div>} />
      <div className="border-b border-outline-variant/60 p-4">
        <Input label="Tìm sản phẩm đang bán" placeholder="Tên sản phẩm hoặc SKU" value={query} onChange={(event) => setQuery(event.target.value)} leading={<span className="material-symbols-outlined">search</span>} />
      </div>
      {busy ? <LoadingState label="Đang tải sản phẩm đã đăng bán…" /> : error ? <div className="p-4"><ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /></div> : page.length === 0 ? <div className="grid justify-items-center gap-3 px-5 py-12 text-center"><EmptyState title="Chưa có sản phẩm nào đang bán trên kênh" detail="Chọn sản phẩm trong danh mục OctoFlow, kiểm tra thông tin rồi gửi lên kênh này." /><Button variant="secondary" size="sm" disabled={!canManage} onClick={() => setPickerOpen(true)}>Chọn sản phẩm từ OctoFlow</Button></div> : <>
        <div className="hidden overflow-x-auto lg:block"><table className="w-full min-w-[1020px] text-left"><caption className="sr-only">Sản phẩm đang bán trên kênh {channel.name}</caption><thead><tr className="border-b border-outline-variant/60 bg-channel-paper-tint text-[11px] uppercase tracking-wide text-graphite"><th className="px-5 py-3">Sản phẩm</th><th className="px-3 py-3">Trạng thái Core</th><th className="px-3 py-3">Trạng thái kênh</th><th className="px-3 py-3">Ghép SKU</th><th className="px-3 py-3">Catalog / Giá / Tồn</th><th className="px-3 py-3">Cập nhật</th><th className="px-5 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{page.map((product) => <tr key={product.product_id} className="hover:bg-[#fffaf4]"><td className="px-5 py-4"><strong className="block font-semibold text-on-surface">{product.name}</strong><code className="mt-1 block font-mono text-xs text-graphite">{product.master_sku || 'Chưa có SKU'} · {product.eligible_variant_count}/{product.variant_count} mẫu mã sẵn sàng</code></td><td className="px-3 py-4 text-sm">{coreStatusLabel(product.core_status)}</td><td className="px-3 py-4"><StatusBadge tone={tone(product.state)}>{labelState(product.state)}</StatusBadge><span className="mt-1 block text-xs text-graphite">{product.listing_count} listing</span></td><td className="px-3 py-4 text-sm">{labelState(product.mapping_state)}</td><td className="px-3 py-4 text-xs leading-5">Danh mục {labelState(product.catalog_sync_state)}<br/>Giá {labelState(product.price_sync_state)}<br/>Tồn {labelState(product.inventory_sync_state)}</td><td className="px-3 py-4 text-xs text-graphite">{product.last_successful_sync_at ? fmt(product.last_successful_sync_at) : 'Chưa đồng bộ'}</td><td className="px-5 py-4 text-right"><Button size="sm" variant="secondary" onClick={() => setSelected(product)}>Xem chi tiết</Button></td></tr>)}</tbody></table></div>
        <div className="grid divide-y divide-outline-variant/50 lg:hidden">{page.map((product) => <article key={product.product_id} className="grid gap-3 p-4"><div className="flex justify-between gap-3"><div><strong className="font-semibold">{product.name}</strong><code className="mt-1 block font-mono text-xs text-graphite">{product.master_sku || 'Chưa có SKU'}</code></div><StatusBadge tone="success">Đang bán</StatusBadge></div><div className="text-xs text-graphite">{product.eligible_variant_count}/{product.variant_count} mẫu mã · {product.listing_count} listing · Ghép SKU {labelState(product.mapping_state)}</div><Button size="sm" variant="secondary" className="justify-self-start" onClick={() => setSelected(product)}>Xem chi tiết</Button></article>)}</div>
        <footer className="flex items-center justify-between border-t border-outline-variant/60 px-5 py-3 text-xs text-graphite"><span>{page.length} / {total} sản phẩm đang bán</span>{cursor ? <Button size="sm" variant="ghost" onClick={() => void loadMorePublished()}>Xem thêm</Button> : null}</footer>
      </>}
    </Card>

    <Drawer open={pickerOpen} onClose={() => setPickerOpen(false)} title="Chọn sản phẩm từ OctoFlow" description={'Sản phẩm được lấy từ danh mục chính và chuẩn bị đăng lên ' + channel.name + '.'} className="max-w-4xl">
      <div className="grid gap-4">
        <p className="text-sm leading-5 text-graphite">Chọn một sản phẩm để kiểm tra điều kiện đăng. Sản phẩm chỉ xuất hiện trong danh sách đang bán sau khi kênh xác nhận đăng thành công.</p>
        <Input label="Tìm trong danh mục OctoFlow" placeholder="Tên sản phẩm hoặc SKU" value={pickerQuery} onChange={(event) => setPickerQuery(event.target.value)} leading={<span className="material-symbols-outlined">search</span>} />
        <FilterBar value={pickerState} onChange={setPickerState} items={availableStates} />
        {pickerBusy ? <LoadingState label="Đang tìm sản phẩm trong danh mục…" /> : pickerError ? <div className="p-4"><ErrorState error={pickerError} retry={() => setPickerAttempt((value) => value + 1)} /></div> : candidates.length === 0 ? <EmptyState title="Không tìm thấy sản phẩm phù hợp" detail="Thử đổi bộ lọc hoặc tìm bằng mã SKU khác." /> : <div className="divide-y divide-outline-variant/50 rounded-lg border border-outline-variant/60">{candidates.map((product) => <article key={product.product_id} className="flex flex-wrap items-center justify-between gap-3 p-4"><div className="min-w-0"><h3 className="font-semibold text-on-surface">{product.name}</h3><p className="mt-1 text-xs text-graphite">{product.master_sku || 'Chưa có SKU'} · {product.eligible_variant_count}/{product.variant_count} mẫu mã có thể đăng · {labelState(product.state)}</p></div><Button size="sm" variant="secondary" disabled={!canManage} onClick={() => chooseProduct(product)}>Kiểm tra và đăng</Button></article>)}</div>}
        {pickerCursor && !pickerBusy ? <div className="text-center"><Button size="sm" variant="ghost" onClick={() => void loadMoreCandidates()}>Tải thêm sản phẩm</Button></div> : null}
        <p className="border-t border-outline-variant/50 pt-3 text-xs leading-5 text-graphite">{pickerTotal.toLocaleString('vi-VN')} sản phẩm trong nhóm đang chọn. Dữ liệu sản phẩm gốc vẫn được quản lý tại OctoFlow.</p>
      </div>
    </Drawer>

    <Drawer open={Boolean(selected)} onClose={() => setSelected(null)} title="Chi tiết sản phẩm" description={'Kênh ' + channel.name} className="max-w-6xl">
      {selected ? <div className="grid gap-5">
        <section className="grid gap-5 rounded-lg border border-sandstone bg-channel-paper p-5 sm:p-6" aria-label="Thông tin sản phẩm">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-start">
            <div className="flex min-w-0 gap-4">
              <span className="grid size-14 shrink-0 place-items-center rounded-lg bg-carbon text-channel-paper"><span className="material-symbols-outlined text-2xl" aria-hidden="true">inventory_2</span></span>
              <div className="min-w-0">
                <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-graphite">{[selected.brand, selected.category].filter(Boolean).join(' · ') || 'Sản phẩm trong danh mục'}</p>
                <h3 className="mt-1 break-words font-display text-2xl font-bold tracking-tight text-on-surface">{selected.name}</h3>
                <p className="mt-2 break-all font-mono text-sm text-graphite">SKU {selected.master_sku || 'Chưa thiết lập'}</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 sm:justify-end">
              <StatusBadge tone={tone(selected.core_status)}>{coreStatusLabel(selected.core_status)}</StatusBadge>
              <StatusBadge tone={tone(selected.state)}>{labelState(selected.state)}</StatusBadge>
            </div>
          </div>
          <dl className="grid grid-cols-2 gap-3 border-t border-sandstone pt-4 sm:grid-cols-4">
            <DetailMetric label="Listing trên kênh" value={count(selected.listing_count)} icon="storefront" />
            <DetailMetric label="Mẫu mã sẵn sàng" value={count(selected.eligible_variant_count) + ' / ' + count(selected.variant_count)} icon="inventory_2" />
            <DetailMetric label="Ghép SKU" value={labelState(selected.mapping_state)} icon="link" />
            <DetailMetric label="Cập nhật gần nhất" value={selected.last_successful_sync_at ? fmt(selected.last_successful_sync_at) : 'Chưa đồng bộ'} icon="schedule" />
          </dl>
        </section>
        <ProductPublicationPanel productId={selected.product_id} productVersion={selected.product_version} canWrite={canManage} channelFilter={channel.id} />
      </div> : null}
    </Drawer>
  </>;
}
function DetailMetric({ label, value, icon }: { label: string; value: string; icon: string }) {
  return <div className="min-w-0 rounded-lg bg-pure-white p-3">
    <span className="material-symbols-outlined text-lg text-graphite" aria-hidden="true">{icon}</span>
    <dt className="mt-2 text-caption text-graphite">{label}</dt>
    <dd className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</dd>
  </div>;
}

export function ChannelInventoryOperations({ channel, canManage, focusListingId }: { channel: Channel; canManage: boolean; focusListingId?: string }) {
  const [rows, setRows] = useState<ChannelMapping[]>([]); const [settings, setSettings] = useState<ChannelSettings | null>(null); const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState<string | null>(null); const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(); const [result, setResult] = useState<InventoryReconciliation | null>(null); const [message, setMessage] = useState(''); const [attempt, setAttempt] = useState(0); const [busyId, setBusyId] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => { setLoading(true); setError(undefined); try { const [m, s] = await Promise.all([listChannelMappings(channel.id, { limit: 100 }, signal), getChannelSettings(channel.id, signal)]); if (!signal?.aborted) { setRows(m.items); setCursor(m.nextCursor); setSettings(s); } } catch (e) { if (!signal?.aborted) setError(e); } finally { if (!signal?.aborted) setLoading(false); } }, [channel.id]);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [attempt, load]);
  useEffect(() => { if (!focusListingId) return; document.getElementById(`channel-inventory-listing-${focusListingId}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, [focusListingId, rows]);
  const resyncEnabled = Boolean(settings?.capabilities.inventory_write?.can_execute);
  const summary = useMemo(() => summarizeMappings(rows), [rows]);
  const loadMore = async () => { if (!cursor || loadingMore) return; setLoadingMore(true); try { const next = await listChannelMappings(channel.id, { limit: 100, cursor }); setRows((current) => [...current, ...next.items]); setCursor(next.nextCursor); } catch (e) { setError(e); } finally { setLoadingMore(false); } };
  const runAudit = async (row: ChannelMapping) => { setBusyId(row.id); setMessage(''); try { setResult(await reconcileChannelListing(channel.id, row.id)); } catch { setMessage('Không thể hoàn tất đối soát. Kiểm tra trạng thái kết nối rồi thử lại.'); } finally { setBusyId(''); } };
  const runResync = async (row: ChannelMapping) => { if (!window.confirm(`Đưa tồn của listing ${row.external_sku || row.canonical_sku} về mục tiêu ATS do OctoFlow phân bổ?`)) return; setBusyId(row.id); setMessage(''); try { const receipt = await resyncChannelListing(channel.id, row.id, newIdempotencyKey('channel-inventory-resync')); setMessage(`Đã tiếp nhận job ${receipt.job_id}. Thành công chỉ được xác nhận sau khi đọc lại từ kênh.`); setAttempt((n) => n + 1); } catch { setMessage('Không thể yêu cầu đồng bộ tồn. Có thể listing đang có job hoặc capability ghi tồn chưa sẵn sàng.'); } finally { setBusyId(''); } };
  if (loading) return <LoadingState label="Đang tải trạng thái tồn kho…" />;
  if (error) return <ErrorState error={error} retry={() => setAttempt((n) => n + 1)} />;
  return <Card className="overflow-hidden border border-outline-variant/70 bg-white p-0 shadow-none">
    <Heading eyebrow="Tồn kho · Đối chiếu" title="Tồn kho trên kênh" detail={`Hạn mức là phần Core ATS được chia cho ${channel.name} theo chính sách chung; thay đổi cho một SKU sẽ ảnh hưởng đồng thời Shopify, eBay và WooCommerce. Đối soát chỉ đọc số liệu và không thay đổi tồn Core.`} action={<Button variant="secondary" size="sm" loading={loading} onClick={() => setAttempt((n) => n + 1)}>Làm mới</Button>} />
    <div className="grid grid-cols-2 border-b border-outline-variant/60 sm:grid-cols-5">
      {([['Hạn mức OctoFlow', summary.quota], ['Kênh đang báo', summary.actual], ['Đã xác minh', summary.total ? `${summary.verified}/${summary.total}` : '—'], ['Lệch tồn', summary.mismatched], ['Xác minh gần nhất', summary.lastVerifiedAt ? fmt(summary.lastVerifiedAt) : 'Chưa có']] as const).map(([label, value]) => <div key={label} className="border-r border-outline-variant/40 px-4 py-3 last:border-0"><span className="block text-xs text-graphite">{label}</span><strong className="mt-1 block font-display text-lg tabular-nums">{typeof value === 'number' ? count(value) : value ?? '—'}</strong></div>)}
    </div>
    <p className="border-b border-outline-variant/60 bg-channel-paper px-5 py-2 text-xs leading-5 text-graphite">Hạn mức là số OctoFlow phân bổ, không phải tồn riêng của kênh. Khi Core ATS thay đổi hoặc một kênh giữ thêm tồn, phần chia cho các kênh còn lại cũng thay đổi.</p>
    {message ? <p role="status" className="border-b border-outline-variant/60 bg-channel-paper px-5 py-3 text-sm">{message}</p> : null}
    {focusListingId && !rows.some((row) => row.id === focusListingId) ? <p role="status" className="border-b border-outline-variant/60 bg-amber-50 px-5 py-3 text-sm text-amber-950">Listing được chọn chưa nằm trong trang mapping đã tải. Dùng “Tải thêm listing” để tìm đến dòng tương ứng.</p> : null}
<div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left"><thead><tr className="border-b border-outline-variant/60 bg-channel-paper-tint text-[11px] uppercase tracking-wide text-graphite"><th className="px-4 py-3">SKU / Sản phẩm</th><th className="px-3 py-3 text-right">Core</th><th className="px-3 py-3 text-right">Đã giữ</th><th className="px-3 py-3 text-right">Safety</th><th className="px-3 py-3 text-right">Hạn mức OctoFlow</th><th className="px-3 py-3 text-right">Kênh đang báo</th><th className="px-3 py-3">Trạng thái</th><th className="px-4 py-3 text-right">Thao tác</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{rows.map((r) => { const state = r.drifted ? 'drifted' : r.sync_pending ? 'syncing' : r.latest_sync_status === 'BLOCKED' ? 'blocked' : r.latest_sync_status === 'VERIFIED' ? 'verified' : 'verification_pending'; return <tr id={`channel-inventory-listing-${r.id}`} key={r.id} className={`hover:bg-[#fffaf4] ${r.id === focusListingId ? 'bg-secondary-fixed outline outline-2 outline-channel-accent' : ''}`}><td className="px-4 py-3"><strong className="block text-sm">{r.product_name}</strong><code className="text-xs text-graphite">{r.canonical_sku} / {r.external_sku}</code></td><td className="px-3 py-3 text-right tabular-nums">{count(r.core_on_hand)}</td><td className="px-3 py-3 text-right tabular-nums">{count(r.core_reserved)}</td><td className="px-3 py-3 text-right tabular-nums">{count(r.core_safety_buffer)}</td><td className="px-3 py-3 text-right font-semibold tabular-nums">{count(r.target_quantity)}</td><td className="px-3 py-3 text-right tabular-nums">{r.reported_quantity != null || r.reported_on_hand != null ? count(r.reported_quantity ?? r.reported_on_hand) : 'Chưa đọc'}</td><td className="px-3 py-3"><StatusBadge tone={tone(state)}>{channel.code === 'woocommerce' && !r.listed ? 'Bản nháp · chưa mở bán' : labelState(state)}</StatusBadge>{r.latest_sync_verified_at ? <span className="mt-1 block text-[10px] text-graphite">Xác minh {fmt(r.latest_sync_verified_at)}</span> : <span className="mt-1 block text-[10px] text-graphite">Chưa xác minh</span>}{r.latest_sync_error_code ? <span className="mt-1 block font-mono text-[10px] text-error">{r.latest_sync_error_code}</span> : null}</td><td className="px-4 py-3 text-right"><div className="inline-flex flex-wrap items-center justify-end gap-1">{r.product_id ? <a className="inline-flex min-h-9 items-center rounded-control px-2 text-xs font-semibold text-octo-ember underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-octo-ember" href={`/products/${r.product_id}?tab=operations&allocation=1`} aria-label={`Mở phân bổ đa kênh cho ${r.product_name || r.canonical_sku}`}>Phân bổ</a> : null}<Button size="sm" variant="ghost" disabled={busyId === r.id || (channel.code === 'woocommerce' && !r.listed)} loading={busyId === r.id} onClick={() => void runAudit(r)}>Đối soát</Button><Button size="sm" variant="secondary" disabled={!canManage || !resyncEnabled || r.mapping_status !== 'verified' || busyId === r.id || (channel.code === 'woocommerce' && !r.listed)} onClick={() => void runResync(r)}>Đồng bộ lại</Button></div></td></tr>; })}</tbody></table></div>
    {!rows.length ? <EmptyState title="Chưa có listing đã ghép SKU" detail="Tồn theo kênh sẽ xuất hiện khi có listing được ánh xạ." /> : null}
    {cursor ? <div className="border-t border-outline-variant/60 p-3 text-center"><Button variant="ghost" size="sm" loading={loadingMore} onClick={() => void loadMore()}>Tải thêm listing</Button></div> : null}
    <Drawer open={Boolean(result)} onClose={() => setResult(null)} title="Kết quả đối soát" description="Đây là phép đọc và so sánh, không gửi tồn lên marketplace.">{result ? <div className="grid gap-4"><div className="flex items-center justify-between"><span>Trạng thái</span><StatusBadge tone={tone(result.state)}>{labelState(result.state)}</StatusBadge></div><Fact label="SKU Core" value={result.canonical_sku} /><Fact label="Core ATS" value={count(result.core_ats)} /><Fact label="Mục tiêu hiện tại" value={count(result.expected_quantity)} /><Fact label="Số kênh đọc được" value={count(result.remote_quantity)} /><Fact label="Phiên bản Core" value={String(result.core_version)} /><Fact label="Mã lỗi" value={result.error_code || 'Không có'} /></div> : null}</Drawer>
  </Card>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div><span className="block text-xs text-graphite">{label}</span><strong className="mt-1 block break-all text-sm font-semibold text-on-surface">{value}</strong></div>; }

const orderFilters = [['all','Tất cả'],['imported','Đã nhập'],['pending','Chờ xử lý'],['quarantined','Bị cách ly'],['failed','Lỗi nhập']] as const;
export function ChannelOrderIngestion({ channel, canManage }: { channel: Channel; canManage: boolean }) {
  const [state, setState] = useState<OrderIngestionState>('all'); const [data, setData] = useState<OrderIngestionPage | null>(null); const [busy, setBusy] = useState(true);
  const [pollBusy, setPollBusy] = useState(false); const [message, setMessage] = useState(''); const [error, setError] = useState<unknown>(); const [attempt, setAttempt] = useState(0);
  const [settings, setSettings] = useState<ChannelSettings | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<OrderIngestionPage['receipts'][number] | null>(null);
  const load = useCallback(async (signal?: AbortSignal) => { setBusy(true); setError(undefined); try { const result = await listOrderIngestion(channel.id, { state, limit: 25 }, signal); if (!signal?.aborted) setData(result); } catch (e) { if (!signal?.aborted) setError(e); } finally { if (!signal?.aborted) setBusy(false); } }, [channel.id, state]);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [attempt, load]);
  useEffect(() => { const c = new AbortController(); void getChannelSettings(channel.id, c.signal).then(setSettings).catch(() => setSettings(null)); return () => c.abort(); }, [channel.id]);
  const poll = async () => { setPollBusy(true); setMessage(''); try { const job = await pollChannelOrders(channel.id, newIdempotencyKey('channel-orders-poll')); setMessage(`Yêu cầu ${job.job_id} đã được tiếp nhận (${labelState(job.status)}). Việc tiếp nhận chưa đồng nghĩa đơn hàng đã nhập xong.`); setAttempt((n) => n + 1); } catch { setMessage('Không thể kiểm tra đơn mới. Có thể connector chưa sẵn sàng hoặc đang có một lần polling khác.'); } finally { setPollBusy(false); } };
  const summary = data?.summary;
  const canPoll = canManage && (settings?.capabilities.order_polling?.can_execute === true || settings?.capabilities.order_import?.can_execute === true);
  return <Card className="overflow-hidden border border-outline-variant/70 bg-white p-0 shadow-none"><Heading eyebrow="Đơn hàng · Marketplace" title="Nhập đơn hàng" action={<div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)} loading={busy}>Làm mới</Button>{canPoll ? <Button size="sm" onClick={() => void poll()} loading={pollBusy}>Kiểm tra đơn mới</Button> : null}</div>} />
    {!settings && canManage ? <p className="border-b border-outline-variant/60 px-5 py-2 text-xs text-graphite">Đang xác minh quyền polling…</p> : null}
    {message ? <p role="status" className="border-b border-outline-variant/60 bg-channel-paper px-5 py-3 text-sm leading-5">{message}</p> : null}
    <div className="grid grid-cols-2 border-b border-outline-variant/60 sm:grid-cols-5">{[['Đã nhập',summary?.imported],['Chờ xử lý',summary?.pending],['Bị cách ly',summary?.quarantined],['Lỗi nhập',summary?.failed],['Khác',summary?.other]].map(([l,v]) => <div key={String(l)} className="border-r border-outline-variant/40 px-4 py-3 last:border-0"><span className="block text-xs text-graphite">{l}</span><strong className="mt-1 block font-display text-xl tabular-nums">{busy ? '—' : count(v as number)}</strong></div>)}</div>
    <FilterBar value={state} onChange={setState} items={orderFilters} />
    {busy ? <LoadingState label="Đang tải biên nhận đơn hàng…" /> : error ? <div className="p-4"><ErrorState error={error} retry={() => setAttempt((n) => n + 1)} /></div> : !data?.receipts.length ? <EmptyState title="Chưa có biên nhận đơn hàng" detail="Các đơn được nhận từ polling hoặc webhook sẽ xuất hiện tại đây." /> : <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b border-outline-variant/60 bg-channel-paper-tint text-[11px] uppercase tracking-wide text-graphite"><th className="px-5 py-3">Mã đơn marketplace</th><th className="px-3 py-3">Core Order ID</th><th className="px-3 py-3">Nguồn</th><th className="px-3 py-3">Trạng thái</th><th className="px-3 py-3">Lần thử</th><th className="px-3 py-3">Lần nhận đầu</th><th className="px-5 py-3">Lỗi / hành động</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{data.receipts.map((r) => <tr key={r.receipt_id} className="hover:bg-[#fffaf4]"><td className="px-5 py-3"><button type="button" onClick={() => setSelectedReceipt(r)} className="text-left font-mono text-sm font-semibold underline decoration-outline-variant underline-offset-4">{r.external_order_id}</button><span className="mt-1 block font-mono text-[10px] text-graphite">Receipt {r.receipt_id.slice(0,8)}</span></td><td className="px-3 py-3 font-mono text-xs">{r.core_order_id || '—'}</td><td className="px-3 py-3 text-sm">{r.source === 'webhook' ? 'Webhook' : 'Polling'}</td><td className="px-3 py-3"><StatusBadge tone={tone(r.status)}>{labelState(r.status)}</StatusBadge><span className="mt-1 block text-[10px] text-graphite">Nguồn: {r.raw_status}</span></td><td className="px-3 py-3 text-sm tabular-nums">{r.attempt_count}</td><td className="px-3 py-3 text-xs text-graphite">{fmt(r.first_seen_at)}</td><td className="px-5 py-3 text-xs">{r.error_code ? <code className="block font-mono text-error">{r.error_code}</code> : null}<span className="text-graphite">{r.required_action || (r.retryable ? 'Có thể xử lý lại theo connector' : 'Không có thao tác retry an toàn')}</span></td></tr>)}</tbody></table></div>}
    <Drawer open={Boolean(selectedReceipt)} onClose={() => setSelectedReceipt(null)} title="Chi tiết biên nhận đơn" description={selectedReceipt?.external_order_id}>{selectedReceipt ? <div className="grid gap-4"><div className="flex items-center justify-between"><span>Trạng thái nhập</span><StatusBadge tone={tone(selectedReceipt.status)}>{labelState(selectedReceipt.status)}</StatusBadge></div><Fact label="External Order ID" value={selectedReceipt.external_order_id} /><Fact label="Core Order ID" value={selectedReceipt.core_order_id || 'Chưa tạo'} /><Fact label="Nguồn nhận" value={selectedReceipt.source} /><Fact label="Raw status" value={selectedReceipt.raw_status} /><Fact label="External Event ID" value={selectedReceipt.external_event_id || '—'} /><Fact label="Số lần thử" value={String(selectedReceipt.attempt_count)} /><Fact label="Lần đầu nhận" value={fmt(selectedReceipt.first_seen_at)} /><Fact label="Lần thử gần nhất" value={fmt(selectedReceipt.last_attempt_at)} /><Fact label="Mã lỗi an toàn" value={selectedReceipt.error_code || 'Không có'} /><Fact label="Hành động cần thiết" value={selectedReceipt.required_action || 'Không có'} /><p className="border-t border-outline-variant/60 pt-3 text-xs leading-5 text-graphite">{selectedReceipt.retryable ? 'Có thể thử lại nếu điều kiện nghiệp vụ đã được khắc phục.' : 'Không có thao tác retry an toàn cho receipt này.'}</p></div> : null}</Drawer>
  </Card>;
}

const activityDomains = [['all','Tất cả'],['catalog','Catalog'],['price','Giá'],['inventory','Tồn kho'],['order','Đơn hàng']] as const;
export function ChannelActivityHistory({ channel }: { channel: Channel }) {
  const [domain, setDomain] = useState<ActivityDomain | 'all'>('all'); const [query, setQuery] = useState(''); const [items, setItems] = useState<ChannelActivity[]>([]); const [cursor, setCursor] = useState('');
  const [busy, setBusy] = useState(true); const [error, setError] = useState<unknown>(); const [selected, setSelected] = useState<ChannelActivity | null>(null); const [attempt, setAttempt] = useState(0);
  const load = useCallback(async (signal?: AbortSignal) => { setBusy(true); setError(undefined); try { const result = await listChannelActivity(channel.id, { domain: domain === 'all' ? undefined : domain, q: query.trim() || undefined, limit: 30 }, signal); if (!signal?.aborted) { setItems(result.activities ?? []); setCursor(result.next_cursor ?? ''); } } catch (e) { if (!signal?.aborted) setError(e); } finally { if (!signal?.aborted) setBusy(false); } }, [channel.id, domain, query]);
  useEffect(() => { const c = new AbortController(); void load(c.signal); return () => c.abort(); }, [attempt, load]);
  const more = async () => { if (!cursor) return; try { const result = await listChannelActivity(channel.id, { domain: domain === 'all' ? undefined : domain, q: query.trim() || undefined, limit: 30, cursor }); setItems((old) => [...old, ...(result.activities ?? [])]); setCursor(result.next_cursor ?? ''); } catch (e) { setError(e); } };
  return <Card className="overflow-hidden border border-outline-variant/70 bg-white p-0 shadow-none"><Heading eyebrow="Lịch sử · Hợp nhất" title="Lịch sử kênh" action={<Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)} loading={busy}>Làm mới</Button>} />
    <div className="grid gap-3 border-b border-outline-variant/60 p-4 md:grid-cols-[minmax(220px,1fr)_auto] md:items-end"><Input label="Tìm hoạt động" placeholder="SKU, mã đơn, mã hoạt động" value={query} onChange={(e) => setQuery(e.target.value)} leading={<span className="material-symbols-outlined">search</span>} /><span className="pb-2 text-xs text-graphite">Mới nhất trước · dữ liệu phân trang từ máy chủ</span></div><FilterBar value={domain} onChange={setDomain} items={activityDomains} />
    {busy ? <LoadingState label="Đang tải lịch sử…" /> : error ? <div className="p-4"><ErrorState error={error} retry={() => setAttempt((n) => n + 1)} /></div> : !items.length ? <EmptyState title="Chưa có hoạt động" detail="Các lần đồng bộ và nhận đơn sẽ được ghi nhận ở đây." /> : <div className="divide-y divide-outline-variant/50">{items.map((item) => <button key={item.id} type="button" onClick={() => setSelected(item)} className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-5 py-4 text-left hover:bg-[#fffaf4] focus-visible:outline focus-visible:outline-2 focus-visible:outline-octo-ember"><span className="grid size-9 place-items-center bg-channel-paper text-octo-ember"><span className="material-symbols-outlined">{item.domain === 'order' ? 'receipt_long' : item.domain === 'inventory' ? 'inventory_2' : item.domain === 'price' ? 'sell' : 'inventory'}</span></span><span className="min-w-0"><strong className="block truncate text-sm">{item.operation.replaceAll('_',' ')}</strong><span className="mt-1 block truncate text-xs text-graphite">{item.external_id || item.order_id || item.product_id || item.variant_id || item.id} · {item.source} · {item.attempt_count} lần thử</span>{item.error_code ? <code className="mt-1 block font-mono text-[10px] text-error">{item.error_code}</code> : null}</span><span className="grid justify-items-end gap-1"><StatusBadge tone={tone(item.state)}>{labelState(item.state)}</StatusBadge><time className="text-[10px] text-graphite">{fmt(item.updated_at)}</time></span></button>)}</div>}
    {cursor && !busy ? <div className="border-t border-outline-variant/60 p-3 text-center"><Button variant="ghost" size="sm" onClick={() => void more()}>Xem hoạt động cũ hơn</Button></div> : null}
    <ActivityDrawer channelId={channel.id} item={selected} onClose={() => setSelected(null)} />
  </Card>;
}
function ActivityDrawer({ channelId, item, onClose }: { channelId: string; item: ChannelActivity | null; onClose: () => void }) {
  const [detail, setDetail] = useState<ChannelActivity | null>(null);
  useEffect(() => { if (!item) { setDetail(null); return; } const c = new AbortController(); void getChannelActivity(channelId, item.id, c.signal).then(setDetail).catch(() => setDetail(item)); return () => c.abort(); }, [channelId, item]);
  const current = detail ?? item;
  return <Drawer open={Boolean(item)} onClose={onClose} title="Chi tiết hoạt động" description={current?.operation.replaceAll('_',' ')}>{current ? <div className="grid gap-4"><div className="flex items-center justify-between"><span>Trạng thái</span><StatusBadge tone={tone(current.state)}>{labelState(current.state)}</StatusBadge></div><Fact label="Activity ID" value={current.id} /><Fact label="Domain / nguồn" value={`${current.domain} · ${current.source}`} /><Fact label="Số lần thử" value={String(current.attempt_count)} /><Fact label="Cập nhật lúc" value={fmt(current.updated_at)} /><Fact label="Xác minh" value={current.verification_state || 'Chưa có bằng chứng'} /><Fact label="Mã lỗi an toàn" value={current.error_code || 'Không có'} />{current.evidence?.map((ev, i) => <section key={`${ev.type}-${i}`} className="border-t border-outline-variant/60 pt-3"><h3 className="text-sm font-bold">{ev.type}</h3><p className="mt-1 text-xs text-graphite">{ev.state || ev.verification_status || 'Bằng chứng'} · {fmt(ev.recorded_at)}</p>{ev.remote_identifier ? <code className="mt-1 block break-all text-xs">Remote ID: {ev.remote_identifier}</code> : null}</section>)}</div> : null}</Drawer>;
}

export function ChannelCapabilitiesSettings({ channel }: { channel: Channel }) {
  const [settings, setSettings] = useState<ChannelSettings | null>(null); const [busy, setBusy] = useState(true); const [error, setError] = useState<unknown>(); const [attempt, setAttempt] = useState(0);
  useEffect(() => { const c = new AbortController(); setBusy(true); void getChannelSettings(channel.id, c.signal).then(setSettings).catch((e) => { if (!c.signal.aborted) setError(e); }).finally(() => { if (!c.signal.aborted) setBusy(false); }); return () => c.abort(); }, [attempt, channel.id]);
  if (busy) return <LoadingState label="Đang tải capability và cấu hình kênh…" />;
  if (error || !settings) return <ErrorState error={error ?? new Error('Không có dữ liệu cấu hình')} retry={() => { setError(undefined); setAttempt((n) => n + 1); }} />;
  const capabilities = Object.entries(settings.capabilities ?? {});
  return <div className="grid gap-4">
    <Card className="overflow-hidden border border-outline-variant/70 bg-white p-0 shadow-none"><Heading eyebrow="Kết nối · Danh tính" title="Kết nối & danh tính" detail={`${channel.name} · ${channel.environment}`} action={<StatusBadge tone={tone(settings.connection_state)}>{labelState(settings.connection_state)}</StatusBadge>} />
      <dl className="grid gap-4 p-5 sm:grid-cols-2 lg:grid-cols-3">{Object.entries(settings.connector_identity ?? {}).map(([key,value]) => <Fact key={key} label={key.replaceAll('_',' ')} value={String(value ?? '—')} />)}<Fact label="Tiền tệ cửa hàng" value={settings.shop_currency || '—'} /><Fact label="Mapping đã lưu" value={count(settings.mapping_count)} /><Fact label="Xác minh gần nhất" value={fmt(settings.last_verified_at)} /></dl>
      {settings.granted_scopes?.length ? <div className="border-t border-outline-variant/60 px-5 py-4"><h3 className="text-sm font-bold">Quyền đã cấp</h3><div className="mt-2 flex flex-wrap gap-2">{settings.granted_scopes.map((scope) => <code key={scope} className="bg-[#f5f2ed] px-2 py-1 font-mono text-[11px]">{scope}</code>)}</div></div> : null}
    </Card>
    <Card className="overflow-hidden border border-outline-variant/70 bg-white p-0 shadow-none"><Heading eyebrow="Quyền connector" title="Khả năng thao tác" detail="Mỗi trạng thái được lấy từ capability backend. ‘Có thể thực hiện’ chỉ bật khi cấu hình, quyền, kết nối và xác minh đáp ứng." action={<Button variant="secondary" size="sm" onClick={() => setAttempt((n) => n + 1)}>Làm mới quyền</Button>} />
      <div className="overflow-x-auto"><table className="w-full min-w-[900px] text-left"><thead><tr className="border-b border-outline-variant/60 bg-channel-paper-tint text-[11px] uppercase tracking-wide text-graphite"><th className="px-5 py-3">Tính năng</th><th className="px-3 py-3">Nền tảng</th><th className="px-3 py-3">Connector</th><th className="px-3 py-3">Cấu hình</th><th className="px-3 py-3">Scope</th><th className="px-3 py-3">Kết nối</th><th className="px-3 py-3">Live</th><th className="px-5 py-3">Thực thi / lý do</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{capabilities.map(([key, cap]) => <tr key={key}><td className="px-5 py-3 text-sm font-semibold">{key.replaceAll('_',' ')}</td><td className="px-3 py-3">{yesNo(cap.supported_by_platform)}</td><td className="px-3 py-3">{yesNo(cap.implemented_in_connector)}</td><td className="px-3 py-3">{yesNo(cap.enabled_by_config)}</td><td className="px-3 py-3">{yesNo(cap.allowed_by_scope)}</td><td className="px-3 py-3">{yesNo(cap.connection_ready)}</td><td className="px-3 py-3">{yesNo(cap.live_verified)}</td><td className="px-5 py-3"><StatusBadge tone={cap.can_execute ? 'success' : 'neutral'}>{cap.can_execute ? 'Có thể dùng' : 'Chưa sẵn sàng'}</StatusBadge>{cap.reason_message || cap.reason_code ? <span className="mt-1 block max-w-64 text-xs leading-4 text-graphite">{channelCapabilityMessage(cap.reason_code, cap.reason_message)}</span> : null}</td></tr>)}</tbody></table></div>
    </Card>
  </div>;
}
function yesNo(value: boolean) { return <span className={value ? 'font-semibold text-badge-progress-text' : 'text-graphite'}>{value ? 'Có' : 'Không'}</span>; }
