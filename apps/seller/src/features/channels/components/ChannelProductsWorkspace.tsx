import { useCallback, useEffect, useRef, useState } from 'react';
import type { Channel } from '../../../api/channels';
import { listChannelProducts, type ChannelProduct, type ChannelProductState } from '../../../api/channel-operations';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { listProducts } from '../../../api/products';
import { ChannelProductPublishingWizard } from './ChannelProductPublishingWizard';
import { ChannelProductImage } from './ChannelProductImage';
import { ChannelProductPrice } from './ChannelProductPrice';

type Filter = ChannelProductState;
const filters: Array<{ id: Filter; label: string }> = [
  { id: 'all', label: 'Tất cả' },
  { id: 'not_published', label: 'Chưa đăng' },
  { id: 'draft', label: 'Bản nháp' },
  { id: 'syncing', label: 'Đang xử lý' },
  { id: 'active', label: 'Đang bán' },
  { id: 'needs_attention', label: 'Cần xử lý' },
  { id: 'stopped', label: 'Đã ngừng bán' },
];
const statStates: Array<Exclude<Filter, 'all'>> = ['active', 'not_published', 'draft', 'syncing', 'needs_attention', 'stopped'];

export function ChannelProductsWorkspace({ channel, canManage, canPublish, publishBlockedReason, onSettings }: { channel: Channel; canManage: boolean; canPublish?: boolean; publishBlockedReason?: string; onSettings?: () => void }) {
  const mayPublish = canPublish ?? canManage;
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ChannelProduct[]>([]);
  const [counts, setCounts] = useState<Partial<Record<Filter, number>>>({});
  const [cursor, setCursor] = useState('');
  const cursorRef = useRef('');
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>();
  const [refreshToken, setRefreshToken] = useState(0);
  const [coreHasProducts, setCoreHasProducts] = useState<boolean | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [managedProduct, setManagedProduct] = useState<ChannelProduct | null>(null);
  const [wizardSession, setWizardSession] = useState(0);

  const loadPage = useCallback(async (signal?: AbortSignal, append = false, quiet = false) => {
    if (append) setLoadingMore(true); else if (!quiet) setLoading(true);
    if (!append && !quiet) { cursorRef.current = ''; setCursor(''); setProducts([]); }
    if (!quiet) setError(undefined);
    try {
      const page = await listChannelProducts(channel.id, {
        state: filter,
        q: query.trim() || undefined,
        limit: 25,
        ...(append && cursorRef.current ? { cursor: cursorRef.current } : {}),
      }, signal);
      if (signal?.aborted) return;
      setProducts((current) => append ? [...current, ...page.products] : page.products);
      cursorRef.current = page.next_cursor ?? '';
      setCursor(page.next_cursor ?? '');
      setTotal(page.total_count);
      setError(undefined);
    } catch (cause) {
      if (!signal?.aborted && !quiet) setError(cause);
    } finally {
      if (!signal?.aborted && !quiet) { setLoading(false); setLoadingMore(false); }
    }
  }, [channel.id, filter, query]);

  useEffect(() => {
    const controller = new AbortController();
    void loadPage(controller.signal);
    const timer = channel.code === 'woocommerce' ? window.setInterval(() => { void loadPage(controller.signal, false, true); }, 15000) : undefined;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [channel.code, loadPage, refreshToken]);

  useEffect(() => {
    const controller = new AbortController();
    const readCounts = () => { void Promise.all(statStates.map(async (state) => {
      const page = await listChannelProducts(channel.id, { state, limit: 1 }, controller.signal);
      return [state, page.total_count] as const;
    })).then((entries) => {
      if (!controller.signal.aborted) setCounts(Object.fromEntries(entries));
    }).catch(() => {}); };
    readCounts();
    const timer = channel.code === 'woocommerce' ? window.setInterval(readCounts, 15000) : undefined;
    return () => { controller.abort(); if (timer) window.clearInterval(timer); };
  }, [channel.code, channel.id, refreshToken]);

  useEffect(() => {
    setCoreHasProducts(null);
    if (loading || products.length || filter !== 'not_published' || query.trim()) return;
    const controller = new AbortController();
    void listProducts({}, controller.signal).then((page) => {
      if (!controller.signal.aborted) setCoreHasProducts(page.items.length > 0 || (page.totalCount ?? 0) > 0);
    }).catch(() => {
      if (!controller.signal.aborted) setCoreHasProducts(null);
    });
    return () => controller.abort();
  }, [filter, loading, products.length, query, refreshToken]);

  const openManage = (product: ChannelProduct) => {
    setManagedProduct(product);
    setWizardOpen(true);
  };
  const openAdd = () => {
    sessionStorage.removeItem(`octoflow:channel-product-wizard:${channel.id}`);
    setManagedProduct(null);
    setWizardSession((current) => current + 1);
    setWizardOpen(true);
  };
  const closeWizard = () => setWizardOpen(false);
  const refreshAfterPublish = () => setRefreshToken((value) => value + 1);

  return <div className="grid min-w-0 gap-5">
    <header className="flex flex-wrap items-end justify-between gap-4 rounded-lg border border-metric-ink bg-channel-paper p-5 shadow-metric sm:p-6">
      <div className="max-w-2xl"><p className="font-body text-[10px] font-bold uppercase tracking-[.16em] text-octo-ember">DANH MỤC · KÊNH BÁN</p><h2 className="mt-1 font-display text-2xl font-extrabold tracking-[-.035em] text-on-surface sm:text-3xl">Sản phẩm trên {channel.name}</h2><p className="mt-2 text-sm leading-5 text-graphite">Theo dõi sản phẩm đã gửi lên kênh và thêm sản phẩm từ danh mục OctoFlow.</p></div>
      <div className="flex flex-wrap items-center gap-2"><StatusBadge tone={channel.status === 'connected' ? 'success' : channel.status === 'error' ? 'danger' : 'warning'}>{connectionLabel(channel.status)}</StatusBadge><StatusBadge tone="neutral">{environmentLabel(channel.environment)}</StatusBadge></div>
      <div className="flex w-full flex-wrap gap-2 sm:w-auto"><Button disabled={!mayPublish || channel.status !== 'connected'} onClick={openAdd} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">add</span>}>Thêm sản phẩm từ OctoFlow</Button>{channel.code !== 'woocommerce' ? <Button variant="secondary" onClick={() => setRefreshToken((value) => value + 1)} loading={loading} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}>Làm mới trạng thái</Button> : null}</div>
      {!mayPublish && publishBlockedReason ? <p role="status" className="w-full rounded-control border border-outline-variant bg-warm-alabaster p-3 text-sm leading-5 text-graphite">{publishBlockedReason}</p> : null}
      {channel.status !== 'connected' && onSettings ? <Button variant="secondary" onClick={onSettings}>Đi đến cài đặt kết nối</Button> : null}
      {channel.last_sync ? <p className="w-full text-xs text-graphite">Cập nhật gần nhất: {formatTime(channel.last_sync)}</p> : null}
    </header>

    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Tóm tắt sản phẩm trên kênh">
      <Metric label="Đang bán" value={counts.active} icon="storefront" tone="success" />
      <Metric label="Chưa đăng" value={counts.not_published} icon="add_box" />
      <Metric label="Bản nháp" value={counts.draft} icon="draft" tone="info" />
      <Metric label="Cần xử lý" value={counts.needs_attention} icon="error_outline" tone="warning" />
    </section>

    <Card className="grid min-w-0 gap-4 p-4 sm:p-5">
      <Input label="Tìm sản phẩm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên sản phẩm hoặc SKU" leading={<span className="material-symbols-outlined" aria-hidden="true">search</span>} />
      <div className="flex min-w-0 gap-2 overflow-x-auto pb-1" role="group" aria-label="Lọc trạng thái sản phẩm">
        {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-9 shrink-0 rounded-full border px-3 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-octo-ember ${filter === item.id ? 'border-carbon bg-tab-paper text-on-surface shadow-[2px_2px_0_#000]' : 'border-outline-variant bg-pure-white text-on-surface-variant hover:bg-warm-alabaster'}`}>{item.label}{counts[item.id] !== undefined ? <span className="ml-2 text-xs tabular-nums text-graphite">{counts[item.id]?.toLocaleString('vi-VN')}</span> : null}</button>)}
      </div>
    </Card>

    {loading ? <LoadingState label="Đang tải danh sách sản phẩm trên kênh…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => setRefreshToken((value) => value + 1)} /> : null}
    {!loading && !error && products.length === 0 ? <div className="grid gap-3"><EmptyState title={filter === 'not_published' && !query.trim() && coreHasProducts === false ? 'Bạn chưa có sản phẩm trong OctoFlow' : query || filter !== 'all' ? 'Không tìm thấy sản phẩm' : 'Kênh chưa có sản phẩm'} detail={filter === 'not_published' && !query.trim() && coreHasProducts === false ? 'Tạo sản phẩm trong danh mục OctoFlow trước, sau đó quay lại đây để đăng lên kênh bán.' : emptyDetail(channel, filter, canManage)} />{filter === 'not_published' && coreHasProducts === false ? <a className="min-h-11 justify-self-start rounded-control border border-carbon bg-tab-paper px-4 py-2 text-sm font-semibold text-on-surface shadow-[2px_2px_0_#000]" href="/products">Tạo sản phẩm trong OctoFlow</a> : null}{filter === 'not_published' && canManage && coreHasProducts !== false && channel.status === 'connected' ? <Button size="sm" className="justify-self-start" onClick={openAdd} disabled={!mayPublish}>Thêm sản phẩm đầu tiên</Button> : null}</div> : null}
    {!loading && !error && products.length > 0 ? <Card className="min-w-0 overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[960px] border-collapse text-left"><caption className="sr-only">Sản phẩm trên {channel.name}</caption>
        <thead><tr className="h-12 border-b border-outline-variant/60 bg-tab-paper text-xs font-semibold text-graphite"><th className="px-5">Sản phẩm</th><th className="px-3">Mẫu mã</th><th className="px-3">Trạng thái</th><th className="px-3">Thông tin</th><th className="px-3">Đồng bộ</th><th className="px-5 text-right">Thao tác</th></tr></thead>
        <tbody className="divide-y divide-outline-variant/40">{products.map((product) => <tr key={product.product_id} className="transition-colors hover:bg-warm-alabaster">
          <td className="max-w-[26rem] px-5 py-4"><div className="flex items-center gap-3"><ChannelProductImage productId={product.product_id} /><span className="min-w-0"><strong className="block truncate text-sm font-semibold text-on-surface">{product.name}</strong><span className="mt-1 block truncate font-mono text-xs text-graphite">{product.master_sku || 'Chưa có SKU'}{product.category ? ` · ${product.category}` : ''}</span></span></div></td>
          <td className="px-3 py-4 text-sm tabular-nums text-on-surface">{product.eligible_variant_count}/{product.variant_count}<span className="mt-1 block text-xs text-graphite">mẫu mã sẵn sàng</span></td>
          <td className="px-3 py-4"><StatusBadge tone={statusTone(product.state)}>{productStateLabel(product.state)}</StatusBadge>{product.listing_count ? <span className="mt-1 block text-xs text-graphite">{product.listing_count} listing</span> : null}{product.listing_origin ? <span className="mt-1 block text-xs text-graphite">{listingOriginLabel(product.listing_origin)}</span> : null}</td>
          <td className="px-3 py-4 text-xs leading-5 text-graphite">Ghép SKU: {mappingLabel(product.mapping_state)}<br/>Giá trên kênh: <ChannelProductPrice productId={product.product_id} channelId={channel.id} variantCount={product.variant_count} /><br/>Đồng bộ giá: {syncLabel(product.price_sync_state)}</td>
          <td className="px-3 py-4 text-xs leading-5 text-graphite">Danh mục: {syncLabel(product.catalog_sync_state)}<br/>Tồn kho: {syncLabel(product.inventory_sync_state)}<br/>{product.last_successful_sync_at ? formatTime(product.last_successful_sync_at) : 'Chưa xác minh'}{product.last_error_code ? <span className="mt-1 block text-badge-blocked-text">{productIssueMessage(product.last_error_code)}</span> : null}<a className="mt-1 inline-block font-semibold text-octo-ember underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-octo-ember" href={`/products/${product.product_id}?tab=operations&allocation=1`}>Xem phân bổ tồn</a></td>
          <td className="px-5 py-4 text-right"><Button size="sm" variant="secondary" onClick={() => openManage(product)}>{productActionLabel(product)}</Button></td>
        </tr>)}</tbody>
      </table></div>
      <div className="grid divide-y divide-outline-variant/50 md:hidden">{products.map((product) => <article key={product.product_id} className="grid gap-3 p-4"><div className="flex min-w-0 items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><ChannelProductImage productId={product.product_id} className="size-12" /><div className="min-w-0"><strong className="block break-words text-sm font-semibold text-on-surface">{product.name}</strong><span className="mt-1 block break-all font-mono text-xs text-graphite">{product.master_sku || 'Chưa có SKU'}</span></div></div><StatusBadge tone={statusTone(product.state)}>{productStateLabel(product.state)}</StatusBadge></div><p className="text-xs leading-5 text-graphite">{product.eligible_variant_count}/{product.variant_count} mẫu mã sẵn sàng · Ghép SKU {mappingLabel(product.mapping_state)}{product.listing_origin ? ` · ${listingOriginLabel(product.listing_origin)}` : ''}</p><p className="text-xs text-graphite">Giá đã xác minh: <ChannelProductPrice productId={product.product_id} channelId={channel.id} variantCount={product.variant_count} /></p><p className="text-xs text-graphite">Danh mục {syncLabel(product.catalog_sync_state)} · Giá {syncLabel(product.price_sync_state)} · Tồn kho {syncLabel(product.inventory_sync_state)}</p>{product.last_error_code ? <p className="text-xs leading-5 text-badge-blocked-text">{productIssueMessage(product.last_error_code)}</p> : null}<a className="justify-self-start text-xs font-semibold text-octo-ember underline underline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-octo-ember" href={`/products/${product.product_id}?tab=operations&allocation=1`}>Xem phân bổ tồn</a><Button size="sm" variant="secondary" className="justify-self-start" onClick={() => openManage(product)}>{productActionLabel(product)}</Button></article>)}</div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/60 px-5 py-3 text-xs text-graphite"><span>Đang hiển thị {products.length} / {total.toLocaleString('vi-VN')} sản phẩm</span>{cursor ? <Button size="sm" variant="ghost" loading={loadingMore} onClick={() => void loadPage(undefined, true)}>Xem thêm</Button> : null}</footer>
    </Card> : null}

    <ChannelProductPublishingWizard key={`${managedProduct?.product_id ?? 'new'}:${wizardSession}`} channel={channel} open={wizardOpen} canWrite={mayPublish} initialProduct={managedProduct} onClose={closeWizard} onCompleted={refreshAfterPublish} />
  </div>;
}

function Metric({ label, value, icon, tone = 'neutral' }: { label: string; value?: number; icon: string; tone?: 'neutral' | 'success' | 'info' | 'warning' }) {
  const iconTone = tone === 'success' ? 'bg-badge-progress-bg text-badge-progress-text' : tone === 'warning' ? 'bg-badge-blocked-bg text-badge-blocked-text' : tone === 'info' ? 'bg-badge-info-bg text-badge-info-text' : 'bg-tab-paper text-on-surface';
  return <Card className="grid min-h-[118px] grid-cols-[44px_minmax(0,1fr)] items-center gap-3 rounded-lg border border-carbon bg-metric-paper p-4 shadow-metric ring-0">
    <span className={`grid size-11 place-items-center rounded-lg ${iconTone}`}><span className="material-symbols-outlined" aria-hidden="true">{icon}</span></span>
    <div className="min-w-0"><p className="text-xs font-semibold text-graphite">{label}</p><p className="mt-1 font-display text-2xl font-extrabold tabular-nums tracking-tight text-on-surface">{value?.toLocaleString('vi-VN') ?? '—'}</p><p className="mt-1 text-[11px] text-graphite">trên {label === 'Đang bán' ? 'kênh này' : 'danh mục kênh'}</p></div>
  </Card>;
}

function productStateLabel(state: string) { return ({ not_published: 'Chưa đăng', not_exported: 'Chưa đăng', draft: 'Bản nháp', syncing: 'Đang xử lý', sync_pending: 'Đang xử lý', active: 'Đang bán', needs_attention: 'Cần xử lý', stopped: 'Đã ngừng bán', unpublished: 'Đã ngừng bán', published: 'Đang bán', preflight_failed: 'Cần bổ sung' } as Record<string, string>)[state] ?? 'Đang cập nhật'; }
function statusTone(state: string): 'neutral' | 'success' | 'warning' | 'danger' { if (['active', 'published', 'verified'].includes(state)) return 'success'; if (['syncing', 'sync_pending', 'draft', 'needs_attention', 'verification_pending'].includes(state)) return 'warning'; if (['sync_failed', 'conflict', 'blocked', 'preflight_failed'].includes(state)) return 'danger'; return 'neutral'; }
function productActionLabel(product: ChannelProduct) {
  if (product.state === 'draft') return 'Tiếp tục thiết lập';
  if (product.state === 'syncing') return 'Theo dõi tiến trình';
  if (product.state === 'needs_attention') return 'Xem và xử lý';
  if (product.listing_origin === 'imported') return 'Đối soát listing Lazada';
  if (product.state === 'active' || product.state === 'stopped') return 'Quản lý sản phẩm';
  return product.listing_count ? 'Quản lý sản phẩm' : 'Đăng sản phẩm';
}
function listingOriginLabel(origin: string) {
  return origin === 'octoflow' ? 'OctoFlow tạo' : origin === 'imported' ? 'Listing Lazada có sẵn' : '';
}
function mappingLabel(state: string) { return ({ mapped: 'Đã xác minh', verified: 'Đã xác minh', unmapped: 'Chưa ghép', conflict: 'Cần kiểm tra', verification_pending: 'Đang xác minh' } as Record<string, string>)[state] ?? 'Đang cập nhật'; }
function syncLabel(state: string) { return ({ verified: 'Đã xác minh', not_synced: 'Chưa gửi', sync_pending: 'Đang chờ', syncing: 'Đang cập nhật', sync_failed: 'Cần xử lý', conflict: 'Xung đột', blocked: 'Bị chặn', drifted: 'Lệch dữ liệu', verification_pending: 'Chờ đọc lại' } as Record<string, string>)[state] ?? 'Đang cập nhật'; }
function productIssueMessage(code: string) {
  const messages: Record<string, string> = {
    CHANNEL_NOT_CONNECTED: 'Kênh chưa kết nối hoặc chưa được xác minh.',
    CHANNEL_CONNECTION_ERROR: 'Kết nối kênh đang gặp sự cố. Hãy kiểm tra kết nối.',
    MAPPING_CONFLICT: 'Liên kết SKU đang có xung đột. Cần kiểm tra trước khi đồng bộ tiếp.',
    PUBLISHED_PRODUCT_REQUIRES_REVIEW: 'Sản phẩm vẫn đang bán trên WooCommerce nhưng liên kết SKU chưa được xác minh. Kiểm tra trên cửa hàng trước khi tạo bản nháp.',
    PUBLISHED_LISTING_MAPPING_INCOMPLETE: 'Sản phẩm đang bán nhưng một số SKU chưa có listing đã xác minh.',
    PRODUCT_OWNERSHIP_CONFLICT: 'Sản phẩm WooCommerce cùng mã định danh không thuộc liên kết OctoFlow hiện tại.',
    PRODUCT_MAPPING_TARGET_MISSING: 'ID sản phẩm WooCommerce đã lưu không còn tồn tại; kiểm tra trước khi tạo lại để tránh trùng.',
    REMOTE_OWNERSHIP_CONFLICT: 'Không thể xác minh sản phẩm này đang thuộc đúng liên kết trên kênh.',
    PRODUCT_PUBLIC_IMAGE_URL_REQUIRED: 'Ảnh cần có đường dẫn công khai để kênh có thể đọc.',
    PRODUCT_VARIANTS_INCOMPLETE: 'Một số mẫu mã còn thiếu SKU hoặc giá.',
    PRODUCT_NOT_PUBLISHABLE: 'Sản phẩm đang ngừng kinh doanh trong OctoFlow.',
  };
  return messages[code] ?? 'Thao tác gần nhất chưa được xác minh. Mở sản phẩm để xem điều kiện cần xử lý.';
}
function connectionLabel(state: string) { return ({ connected: 'Đã kết nối', disconnected: 'Chưa kết nối', error: 'Cần xử lý', syncing: 'Đang kết nối' } as Record<string, string>)[state] ?? 'Chưa xác minh'; }
function environmentLabel(state: string) { return ({ sandbox: 'Môi trường thử nghiệm', development: 'Cửa hàng phát triển', production: 'Môi trường thật', simulated: 'Mô phỏng' } as Record<string, string>)[state] ?? 'Chưa rõ môi trường'; }
function formatTime(value?: string) { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
function emptyDetail(channel: Channel, filter: Filter, canManage: boolean) {
  if (channel.status !== 'connected') return 'Kênh chưa kết nối hoặc chưa xác minh. Hãy xử lý kết nối trước khi gửi sản phẩm.';
  if (filter === 'not_published' && canManage) return 'Chưa có sản phẩm mới trong danh sách. Bạn có thể chọn sản phẩm từ danh mục OctoFlow để bắt đầu.';
  if (filter === 'active') return 'Chưa có sản phẩm nào được xác minh là đang bán trên kênh này.';
  return 'Không có sản phẩm phù hợp với bộ lọc hiện tại.';
}
