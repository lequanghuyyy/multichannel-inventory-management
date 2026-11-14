import { useMemo, useState } from 'react';
import type { Channel, ChannelMapping, ChannelMappingIssue, ChannelProductSummary } from '../../../api/channels';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

export function ChannelInventoryTab({ channel, mappings, summary, totalCount, issueCount, loading, error, loadingMore, hasMore, onLoadMore, onRefresh }: {
  channel: Channel; mappings: ChannelMapping[]; summary: ChannelProductSummary; totalCount: number; issues: ChannelMappingIssue[]; issueCount: number;
  loading: boolean; error: unknown; loadingMore: boolean; hasMore: boolean; onLoadMore: () => void; onRefresh: () => void;
}) {
  const [query, setQuery] = useState('');
  const rows = useMemo(() => mappings.filter((item) => `${item.product_name ?? ''} ${item.product_code ?? ''} ${item.product_category ?? ''} ${item.canonical_sku} ${item.external_sku} ${item.barcode ?? ''} ${item.variant_color ?? ''} ${item.color_description ?? ''} ${item.variant_size ?? ''}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi'))), [mappings, query]);
  const needsUpdate = mappings.filter((item) => item.drifted || item.latest_sync_status === 'MISMATCH' || item.latest_sync_status === 'BLOCKED').length;

  return <div className="grid min-w-0 gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-xl font-bold text-on-surface">Tồn kho</h2><p className="mt-1 text-sm text-graphite">{summary.variant_count.toLocaleString('vi-VN')} mẫu mã · {summary.product_count.toLocaleString('vi-VN')} sản phẩm{needsUpdate ? ` · ${needsUpdate} cần cập nhật` : ''}{issueCount ? ` · ${issueCount} cần kiểm tra` : ''}</p></div>
      <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}>Làm mới</Button>
    </header>

    <Card className="grid min-w-0 gap-4 p-4 sm:p-5">
      <Input label="Tìm sản phẩm hoặc mẫu mã" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, mã sản phẩm, SKU hoặc barcode" leading={<span className="material-symbols-outlined text-xl" aria-hidden="true">search</span>} />
      {needsUpdate > 0 ? <div className="flex items-start gap-3 rounded-control bg-badge-blocked-bg px-4 py-3 text-badge-blocked-text"><span className="material-symbols-outlined mt-0.5 text-lg" aria-hidden="true">warning</span><p className="text-sm leading-5">Có {needsUpdate} sản phẩm cần kiểm tra lại số lượng hiển thị trên cửa hàng.</p></div> : null}
    </Card>

    {loading ? <LoadingState label="Đang tải tồn kho…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={onRefresh} /> : null}
    {!loading && !error && rows.length === 0 ? <EmptyState title={query ? 'Không tìm thấy sản phẩm' : 'Chưa có dữ liệu tồn kho'} detail={query ? 'Hãy kiểm tra SKU hoặc thử từ khóa khác.' : 'Tồn kho sẽ hiển thị khi sản phẩm được liên kết với cửa hàng.'} /> : null}
    {!loading && !error && rows.length === 0 && hasMore ? <div className="flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={onLoadMore}>Xem thêm sản phẩm</Button></div> : null}
    {!loading && !error && rows.length > 0 ? <Card className="min-w-0 overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] border-collapse text-left"><caption className="sr-only">Số lượng tồn kho trên {channel.name}</caption><thead><tr className="h-12 border-b border-outline-variant/50 bg-surface-container-low text-xs font-semibold text-graphite"><th className="px-5">Sản phẩm</th><th className="px-3">Mẫu mã</th><th className="px-3 text-right">Trong kho</th><th className="px-3 text-right">Đã giữ</th><th className="px-3 text-right">Có thể bán</th><th className="px-3 text-right">Trên cửa hàng</th><th className="px-5 text-right">Tình trạng</th></tr></thead><tbody className="divide-y divide-surface-container">{rows.map((item) => <InventoryRow key={item.id} item={item} />)}</tbody></table></div>
      <div className="grid gap-2 p-3 md:hidden">{rows.map((item) => <InventoryCard key={item.id} item={item} />)}</div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/50 px-5 py-3 text-xs text-graphite"><span>{rows.length} / {totalCount.toLocaleString('vi-VN')} sản phẩm</span>{hasMore ? <Button variant="ghost" size="sm" loading={loadingMore} onClick={onLoadMore}>Xem thêm</Button> : null}</footer>
    </Card> : null}
  </div>;
}

function InventoryRow({ item }: { item: ChannelMapping }) {
  const quantities = getQuantities(item);
  const state = getState(item, quantities);
  return <tr className="text-sm transition-colors hover:bg-surface-container-low/60"><td className="max-w-[22rem] px-5 py-4"><strong className="block truncate font-medium text-on-surface">{item.product_name || item.canonical_sku || item.external_sku || 'Sản phẩm'}</strong><span className="mt-1 block truncate text-xs text-graphite">{item.product_category || 'Chưa phân loại'}{item.product_code ? ` · Mã ${item.product_code}` : ''}</span></td><td className="px-3 py-4"><span className="block font-mono text-xs text-on-surface">{item.canonical_sku || item.external_sku || '—'}</span><span className="mt-1 block text-xs text-graphite">{[item.color_description || item.variant_color, item.variant_size, item.barcode ? `Barcode ${item.barcode}` : ''].filter(Boolean).join(' · ') || `SKU kênh ${item.external_sku || '—'}`}</span></td><td className="px-3 py-4 text-right tabular-nums text-on-surface">{quantity(quantities.onHand)}</td><td className="px-3 py-4 text-right tabular-nums text-on-surface">{quantity(quantities.reserved)}</td><td className="px-3 py-4 text-right font-semibold tabular-nums text-on-surface">{quantity(quantities.available)}</td><td className="px-3 py-4 text-right tabular-nums text-on-surface">{quantity(quantities.store)}</td><td className="px-5 py-4 text-right"><StatusBadge tone={state.tone}>{state.label}</StatusBadge></td></tr>;
}

function InventoryCard({ item }: { item: ChannelMapping }) {
  const q = getQuantities(item);
  const state = getState(item, q);
  return <article className="grid gap-3 rounded-control border border-outline-variant/50 p-4"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><strong className="block break-words text-sm font-semibold text-on-surface">{item.product_name || item.canonical_sku || item.external_sku || 'Sản phẩm'}</strong><span className="mt-1 block break-words text-xs text-graphite">{item.product_category || 'Chưa phân loại'}{item.product_code ? ` · ${item.product_code}` : ''}</span><span className="mt-1 block break-words font-mono text-xs text-on-surface-variant">{item.canonical_sku || item.external_sku} · {[item.color_description || item.variant_color, item.variant_size].filter(Boolean).join(' · ')}</span>{item.barcode ? <span className="mt-1 block font-mono text-xs text-graphite">Barcode {item.barcode}</span> : null}</div><StatusBadge tone={state.tone}>{state.label}</StatusBadge></div><dl className="grid grid-cols-2 gap-x-3 gap-y-2 border-t border-outline-variant/50 pt-3 text-xs"><Quantity label="Trong kho" value={q.onHand} /><Quantity label="Đã giữ" value={q.reserved} /><Quantity label="Có thể bán" value={q.available} strong /><Quantity label="Trên cửa hàng" value={q.store} /></dl></article>;
}

function Quantity({ label, value, strong = false }: { label: string; value: number | null | undefined; strong?: boolean }) { return <div><dt className="text-graphite">{label}</dt><dd className={`mt-1 tabular-nums ${strong ? 'font-semibold text-on-surface' : 'text-on-surface'}`}>{quantity(value)}</dd></div>; }

function getQuantities(item: ChannelMapping) {
  const onHand = item.core_on_hand ?? item.legacy_on_hand ?? item.pushed_on_hand;
  const reserved = item.core_reserved;
  const buffer = item.core_safety_buffer ?? 0;
  const available = item.target_quantity ?? (onHand == null ? null : Math.max(0, onHand - (reserved ?? 0) - buffer));
  const store = item.reported_quantity ?? item.reported_on_hand;
  return { onHand, reserved, available, store };
}

function getState(item: ChannelMapping, quantities: ReturnType<typeof getQuantities>) {
  if (item.latest_sync_status === 'BLOCKED') return { label: 'Cần kiểm tra', tone: 'warning' as const };
  if (item.drifted || item.latest_sync_status === 'MISMATCH') return { label: 'Số lượng lệch', tone: 'danger' as const };
  if (item.sync_pending || item.latest_sync_status === 'DEFERRED') return { label: 'Đang cập nhật', tone: 'warning' as const };
  if (item.latest_sync_status === 'VERIFIED' || item.mapping_status === 'verified' && quantities.store != null) return { label: 'Đã cập nhật', tone: 'success' as const };
  return { label: 'Chưa có số liệu', tone: 'neutral' as const };
}

function quantity(value?: number | null) { return value == null ? '—' : value.toLocaleString('vi-VN'); }
