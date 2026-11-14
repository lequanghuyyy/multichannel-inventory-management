import { useMemo, useState } from 'react';
import { formatMinor } from '../../../lib/money';
import type { Channel, ChannelMapping, ChannelMappingIssue, ChannelProductSummary } from '../../../api/channels';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

type Filter = 'all' | 'selling' | 'attention' | 'unlinked';
type Row = {
  key: string;
  name: string;
  storeSku: string;
  ownSku: string;
  productCode: string;
  category: string;
  variantCount: number;
  state: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
  note?: string;
  mapping?: ChannelMapping;
};

const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tất cả' }, { id: 'selling', label: 'Đang bán' }, { id: 'attention', label: 'Cần kiểm tra' }, { id: 'unlinked', label: 'Chưa liên kết' },
];

export function ChannelProductsTab({ channel, mappings, issues, summary, totalCount, issueCount, loading, error, loadingMore, hasMore, onLoadMore, onRefresh }: {
  channel: Channel; mappings: ChannelMapping[]; issues: ChannelMappingIssue[]; summary: ChannelProductSummary; totalCount: number; issueCount: number;
  loading: boolean; error: unknown; loadingMore: boolean; hasMore: boolean; onLoadMore: () => void; onRefresh: () => void; canManage: boolean;
}) {
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const rows = useMemo(() => createRows(mappings, issues).filter((row) => {
    const search = query.trim().toLocaleLowerCase('vi');
    const searchable = `${row.name} ${row.storeSku} ${row.ownSku} ${row.productCode} ${row.category} ${row.note ?? ''} ${row.mapping?.barcode ?? ''} ${row.mapping?.variant_color ?? ''} ${row.mapping?.color_description ?? ''} ${row.mapping?.variant_size ?? ''}`;
    const matchesText = !search || searchable.toLocaleLowerCase('vi').includes(search);
    const matchesFilter = filter === 'all' || (filter === 'selling' && row.state === 'Đang bán') || (filter === 'attention' && row.state === 'Cần kiểm tra') || (filter === 'unlinked' && row.state === 'Chưa liên kết');
    return matchesText && matchesFilter;
  }), [filter, issues, mappings, query]);

  return <div className="grid min-w-0 gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-xl font-bold text-on-surface">Sản phẩm</h2><p className="mt-1 text-sm text-graphite">{summary.product_count.toLocaleString('vi-VN')} sản phẩm · {summary.variant_count.toLocaleString('vi-VN')} mẫu mã trên {channel.name}{issueCount ? ` · ${issueCount} cần kiểm tra` : ''}</p></div>
      {channel.code !== 'woocommerce' ? <Button variant="secondary" size="sm" onClick={onRefresh} loading={loading} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}>Làm mới</Button> : null}
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tóm tắt sản phẩm và tồn kho">
      <SummaryCard label="Tổng nhập" value={summary.total_received} icon="move_to_inbox" />
      <SummaryCard label="Có thể bán" value={summary.total_available_to_sell} icon="sell" strong />
      <SummaryCard label="Chờ giao" value={summary.awaiting_shipment} icon="local_shipping" />
      <SummaryCard label="Tổng tồn kho" value={summary.total_on_hand} icon="warehouse" />
    </section>
    {summary.missing_balance_count > 0 ? <p role="status" className="rounded-control border border-apricot/50 bg-apricot/10 px-4 py-3 text-sm text-on-surface">Chưa thể tính tổng tồn kho và số có thể bán vì {summary.missing_balance_count.toLocaleString('vi-VN')} mẫu mã chưa có số dư kho.</p> : null}

    <Card className="grid min-w-0 gap-4 p-4 sm:p-5">
      <Input label="Tìm sản phẩm hoặc mẫu mã" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên, mã sản phẩm, SKU, barcode" leading={<span className="material-symbols-outlined text-xl" aria-hidden="true">search</span>} />
      <div className="flex min-w-0 gap-2 overflow-x-auto" role="group" aria-label="Lọc sản phẩm">
        {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown ${filter === item.id ? 'bg-carbon text-pure-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>{item.label}</button>)}
      </div>
    </Card>

    {loading ? <LoadingState label="Đang tải sản phẩm…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={onRefresh} /> : null}
    {!loading && !error && rows.length === 0 ? <EmptyState title={query || filter !== 'all' ? 'Không tìm thấy sản phẩm' : 'Chưa có sản phẩm trên kênh'} detail={query || filter !== 'all' ? 'Hãy thử đổi từ khóa hoặc bộ lọc.' : 'Sản phẩm sẽ xuất hiện tại đây khi được liên kết với cửa hàng.'} /> : null}
    {!loading && !error && rows.length > 0 ? <Card className="min-w-0 overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[1510px] border-collapse text-left"><caption className="sr-only">Danh sách sản phẩm và mẫu mã trên {channel.name}</caption>
        <thead><tr className="h-12 border-b border-outline-variant/50 bg-surface-container-low text-xs font-semibold text-graphite"><th className="px-5">Sản phẩm</th><th className="px-3">Mẫu mã</th><th className="px-3">Barcode</th><th className="px-3 text-right">Giá bán</th><th className="px-3 text-right" title="Số lượng trong các đơn không hủy, 30 ngày gần nhất">Đơn 30 ngày</th><th className="px-3">Nhập hàng</th><th className="px-3">Tồn kho</th><th className="px-3 text-right">Chờ giao</th><th className="px-3 text-right">Đang giao</th><th className="px-3 text-right">Đang hoàn</th><th className="px-5 text-right">Trên kênh</th></tr></thead>
        <tbody className="divide-y divide-surface-container">{rows.map((row) => <ProductRow key={row.key} row={row} />)}</tbody>
      </table></div>
      <div className="grid gap-2 p-3 md:hidden">{rows.map((row) => <ProductCard key={row.key} row={row} />)}</div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/50 px-5 py-3 text-xs text-graphite"><span>Đang hiển thị {rows.length} dòng · {totalCount.toLocaleString('vi-VN')} mẫu mã đã liên kết</span>{hasMore ? <Button variant="ghost" size="sm" loading={loadingMore} onClick={onLoadMore}>Xem thêm</Button> : null}</footer>
    </Card> : null}
  </div>;
}

function SummaryCard({ label, value, icon, strong = false }: { label: string; value: number | null; icon: string; strong?: boolean }) {
  return <Card className="flex min-h-[104px] items-center gap-3 rounded-lg border border-metric-ink bg-metric-paper p-4 shadow-metric ring-0"><span className={`grid size-10 shrink-0 place-items-center rounded-control ${strong ? 'bg-success/10 text-success' : 'bg-tab-paper text-on-surface-variant'}`}><span className="material-symbols-outlined" aria-hidden="true">{icon}</span></span><div className="min-w-0"><p className="text-xs font-medium text-graphite">{label}</p><p className={`mt-1 font-display text-xl tabular-nums tracking-tight ${strong ? 'font-bold text-on-surface' : 'font-semibold text-on-surface'}`}>{quantity(value)}</p></div></Card>;
}

function ProductRow({ row }: { row: Row }) {
  const item = row.mapping;
  const onHand = item?.core_on_hand;
  const reserved = item?.core_reserved;
  const available = onHand == null || reserved == null || item?.core_safety_buffer == null
    ? null
    : Math.max(0, onHand - reserved - item.core_safety_buffer);
  return <tr className="text-sm transition-colors hover:bg-surface-container-low/60">
    <td className="max-w-[22rem] px-5 py-3.5"><div className="flex items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-container-low text-graphite" aria-hidden="true"><span className="material-symbols-outlined">inventory_2</span></span><div className="min-w-0"><strong className="block truncate font-medium text-on-surface">{row.name}</strong><span className="mt-0.5 block truncate text-xs text-graphite">{row.category || 'Chưa phân loại'}{row.productCode ? ` · Mã ${row.productCode}` : ''}{row.variantCount > 0 ? ` · ${row.variantCount} mẫu mã` : ''}</span>{row.note ? <span className="mt-1 block text-xs text-apricot">{row.note}</span> : null}</div></div></td>
    <td className="px-3 py-3.5"><span className="block font-mono text-xs font-medium text-on-surface">{row.ownSku || row.storeSku || '—'}</span>{item ? <span className="mt-1 block text-xs text-graphite">{variantLabel(item)}</span> : null}</td>
    <td className="px-3 py-3.5 font-mono text-xs text-on-surface-variant">{item?.barcode || '—'}</td>
    <td className="px-3 py-3.5 text-right tabular-nums text-on-surface">{item ? formatMinor(item.price_minor, item.currency || 'VND') : '—'}</td>
    <td className="px-3 py-3.5 text-right tabular-nums text-on-surface">{quantity(item?.units_sold_30d)}</td>
    <td className="px-3 py-3.5 text-xs tabular-nums"><span className="block text-on-surface">Đã nhập {quantity(item?.total_received)}</span><span className="mt-1 block text-graphite">Còn phải nhận {quantity(item?.pending_inbound)}</span></td>
    <td className="px-3 py-3.5 text-xs tabular-nums"><span className="block text-on-surface">Trong kho {quantity(onHand)}</span><span className="mt-1 block text-graphite">Đã giữ {quantity(reserved)}</span><span className="mt-1 block font-semibold text-on-surface">Có thể bán {quantity(available)}</span></td>
    <td className="px-3 py-3.5 text-right tabular-nums text-on-surface">{quantity(item?.awaiting_shipment)}</td>
    <td className="px-3 py-3.5 text-right tabular-nums text-on-surface">{quantity(item?.in_transit)}</td>
    <td className="px-3 py-3.5 text-right tabular-nums text-on-surface">{quantity(item?.pending_return)}</td>
    <td className="px-5 py-3.5 text-right"><StatusBadge tone={row.tone}>{row.state}</StatusBadge></td>
  </tr>;
}

function ProductCard({ row }: { row: Row }) {
  const item = row.mapping;
  const onHand = item?.core_on_hand;
  const reserved = item?.core_reserved;
  const available = onHand == null || reserved == null || item?.core_safety_buffer == null ? null : Math.max(0, onHand - reserved - item.core_safety_buffer);
  return <article className="grid gap-3 rounded-control border border-outline-variant/50 p-4">
    <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-container-low text-graphite" aria-hidden="true"><span className="material-symbols-outlined">inventory_2</span></span><div className="min-w-0"><strong className="block break-words text-sm font-semibold text-on-surface">{row.name}</strong><span className="mt-1 block text-xs text-graphite">{row.category || 'Chưa phân loại'}{row.productCode ? ` · ${row.productCode}` : ''}</span></div></div><StatusBadge tone={row.tone}>{row.state}</StatusBadge></div>
    <p className="break-words border-t border-outline-variant/50 pt-3 font-mono text-xs text-on-surface">{row.ownSku || row.storeSku || 'Chưa có mã mẫu'}{item ? ` · ${variantLabel(item)}` : ''}</p>
    {row.note ? <p className="text-xs text-apricot">{row.note}</p> : null}
    <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-t border-outline-variant/50 pt-3 text-xs"><Fact label="Barcode" value={item?.barcode || '—'} /><Fact label="Giá bán" value={item ? formatMinor(item.price_minor, item.currency || 'VND') : '—'} /><Fact label="Trong kho" value={quantity(onHand)} /><Fact label="Đã giữ" value={quantity(reserved)} /><Fact label="Có thể bán" value={quantity(available)} /><Fact label="Đã nhập / còn phải nhận" value={`${quantity(item?.total_received)} / ${quantity(item?.pending_inbound)}`} /><Fact label="Đơn 30 ngày" value={quantity(item?.units_sold_30d)} /><Fact label="Chờ giao / đang giao" value={`${quantity(item?.awaiting_shipment)} / ${quantity(item?.in_transit)}`} /><Fact label="Đang hoàn" value={quantity(item?.pending_return)} /></dl>
  </article>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-graphite">{label}</dt><dd className="mt-1 break-words tabular-nums text-on-surface">{value}</dd></div>; }

function createRows(mappings: ChannelMapping[], issues: ChannelMappingIssue[]): Row[] {
  const mappedVariants = new Set(mappings.map((item) => item.external_variant_id).filter(Boolean));
  const mapped = mappings.map((item) => {
    const issue = issues.find((candidate) => candidate.external_variant_id === item.external_variant_id);
    const state = issue || item.mapping_status === 'needs_attention' || item.mapping_status === 'stale' ? 'Cần kiểm tra' : !item.variant_is_active ? 'Ngừng bán' : item.mapping_status !== 'verified' ? 'Chưa cập nhật' : item.listed ? 'Đang bán' : 'Chưa đăng bán';
    const tone = state === 'Cần kiểm tra' ? 'warning' as const : state === 'Đang bán' ? 'success' as const : 'neutral' as const;
    return { key: item.id, name: item.product_name || issue?.product_title || item.canonical_sku || item.external_sku || 'Sản phẩm', storeSku: item.external_sku, ownSku: item.canonical_sku, productCode: item.product_code ?? '', category: item.product_category || '', variantCount: item.product_variant_count ?? 0, state, tone, note: issue ? issueLabel(issue.reason) : undefined, mapping: item };
  });
  const notLinked = issues.filter((item) => !mappedVariants.has(item.external_variant_id)).map((item) => ({ key: `issue:${item.external_variant_id}`, name: item.product_title || item.sku || 'Sản phẩm chưa liên kết', storeSku: item.sku ?? '', ownSku: '', productCode: '', category: '', variantCount: 0, state: 'Chưa liên kết', tone: 'warning' as const, note: issueLabel(item.reason) }));
  return [...mapped, ...notLinked];
}

function variantLabel(item: ChannelMapping) {
  const color = item.color_description || item.variant_color;
  const attributes = [color, item.variant_size].filter(Boolean).join(' · ');
  return `${attributes ? `${attributes} · ` : ''}SKU kênh ${item.external_sku || '—'}`;
}

function quantity(value?: number | null) { return value == null ? '—' : value.toLocaleString('vi-VN'); }
function issueLabel(reason: string) { const labels: Record<string, string> = { missing_sku: 'Chưa có mã SKU trên cửa hàng.', duplicate_shopify_sku: 'SKU đang được dùng cho nhiều sản phẩm.', core_sku_missing: 'Chưa tìm thấy sản phẩm tương ứng trong danh mục.', core_sku_duplicate: 'SKU bị trùng trong danh mục sản phẩm.', inventory_not_tracked: 'Sản phẩm chưa bật theo dõi số lượng.', location_missing: 'Sản phẩm chưa gắn với kho hàng.', mapping_conflict: 'Thông tin sản phẩm chưa khớp.', product_not_active: 'Sản phẩm trên cửa hàng đang tắt.', core_product_not_active: 'Sản phẩm trong danh mục đang ngừng bán.', invalid_sku: 'Mã sản phẩm chưa hợp lệ.', duplicate_ebay_sku: 'SKU đang được dùng cho nhiều sản phẩm.', remote_item_missing: 'Sản phẩm không còn trên cửa hàng.', offer_missing: 'Sản phẩm chưa được đăng bán.', marketplace_mismatch: 'Sản phẩm đang thuộc gian hàng khác.' }; return labels[reason] ?? 'Thông tin sản phẩm cần được kiểm tra.'; }
