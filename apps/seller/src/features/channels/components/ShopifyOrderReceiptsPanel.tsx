import { useCallback, useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { createShopifyFulfillment, getShopifyFulfillmentStatus, getShopifyOrderReceipts, getShopifyStatus, reprocessShopifyOrderReceipt, type ShopifyFulfillmentView, type ShopifyOrderReceipt, type ShopifyOrderReceiptFilters } from '../../../api/shopify';
import { useAuth } from '../../auth/AuthProvider';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

const pageSize = 25;

function time(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('vi-VN');
}

function statusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'processed' || status === 'imported') return 'success';
  if (status === 'processing' || status === 'received' || status === 'failed') return 'warning';
  if (status === 'quarantined' || status === 'dead') return 'danger';
  return 'neutral';
}

function ShopifyFulfillmentAction({ orderId, canManage }: { orderId: string; canManage: boolean }) {
  const [view, setView] = useState<ShopifyFulfillmentView | null>(null);
  const [shopDomain, setShopDomain] = useState('');
  const [company, setCompany] = useState('');
  const [number, setNumber] = useState('');
  const [url, setURL] = useState('');
  const [loading, setLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);

  const check = async () => {
    setLoading(true); setError(null);
    try {
      const [status] = await Promise.all([getShopifyFulfillmentStatus(orderId), getShopifyStatus().then((item) => { setShopDomain(item.shop_domain ?? ''); })]);
      setView(status);
    } catch (cause) { setError(cause); }
    finally { setLoading(false); }
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSubmitting(true); setError(null);
    try { setView(await createShopifyFulfillment(orderId, { tracking_company: company.trim(), tracking_number: number.trim(), ...(url.trim() ? { tracking_url: url.trim() } : {}) })); }
    catch (cause) { setError(cause); }
    finally { setSubmitting(false); }
  };
  const orderNumericID = view?.shopify_order_id.split('/').pop();
  const shopifyURL = shopDomain.endsWith('.myshopify.com') && orderNumericID && /^\d+$/.test(orderNumericID)
    ? `https://${shopDomain}/admin/orders/${orderNumericID}` : undefined;

  return <section className="mt-3 grid gap-2 border-t border-outline-variant/50 pt-3">
    <div className="flex flex-wrap items-center justify-between gap-2"><strong className="text-xs text-on-surface">Shopify fulfillment</strong><Button size="sm" variant="ghost" loading={loading} onClick={() => void check()}>{view ? 'Đọc lại điều kiện' : 'Kiểm tra điều kiện'}</Button></div>
    {view ? <dl className="grid gap-2 text-xs sm:grid-cols-3">
      <div><dt className="text-graphite">Core order</dt><dd className="mt-1 font-semibold text-on-surface">{view.core_status} · {view.core_fulfillment_status}</dd></div>
      <div><dt className="text-graphite">Shopify fulfillment</dt><dd className="mt-1 font-semibold text-on-surface">{view.shopify_fulfillment_status || 'UNKNOWN'}</dd></div>
      <div><dt className="text-graphite">Điều kiện</dt><dd className="mt-1"><StatusBadge tone={view.eligible ? 'success' : view.record_state === 'succeeded' ? 'success' : 'warning'}>{view.record_state === 'succeeded' ? 'Đã xác minh' : view.eligible ? 'Sẵn sàng' : view.blocked_reason || 'Chưa đủ điều kiện'}</StatusBadge></dd></div>
      {view.tracking_number ? <div><dt className="text-graphite">Tracking</dt><dd className="mt-1 break-all font-mono text-on-surface">{view.tracking_company} · {view.tracking_number}</dd></div> : null}
      {view.remote_fulfillment_id ? <div><dt className="text-graphite">Shopify Fulfillment GID</dt><dd className="mt-1 break-all font-mono text-on-surface">{view.remote_fulfillment_id}</dd></div> : null}
      {view.verified_at ? <div><dt className="text-graphite">Read-back</dt><dd className="mt-1 text-on-surface">{time(view.verified_at)}</dd></div> : null}
    </dl> : null}
    {view?.record_state === 'succeeded' && shopifyURL ? <a className="text-xs font-semibold text-secondary underline" href={shopifyURL} target="_blank" rel="noreferrer">Mở đơn hàng trên Shopify</a> : null}
    {view?.eligible && canManage && view.record_state !== 'succeeded' ? <form className="grid gap-2 rounded-control bg-surface-container-low p-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Đơn vị vận chuyển<input required maxLength={128} className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={company} onChange={(event) => setCompany(event.target.value)} placeholder="DHL / UPS / đơn vị khác" /></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Mã vận đơn<input required maxLength={128} className="rounded-control border border-outline-variant bg-surface p-2 font-mono text-xs" value={number} onChange={(event) => setNumber(event.target.value)} /></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface sm:col-span-2">Tracking URL (HTTPS, nếu có)<input type="url" className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={url} onChange={(event) => setURL(event.target.value)} placeholder="https://…" /></label>
      <p className="text-xs leading-5 text-graphite sm:col-span-2">Lệnh chỉ gửi khi Core đã giao hàng, Shopify còn số lượng phù hợp và location/mapping khớp. Shopify kiểm tra thêm quyền <code>fulfill_and_ship_orders</code>; hệ thống chỉ đánh dấu thành công sau read-back.</p>
      <div className="sm:col-span-2"><Button type="submit" size="sm" loading={submitting}>Tạo fulfillment Shopify</Button></div>
    </form> : null}
    {view?.safe_error_code ? <p className="text-xs text-danger">{view.safe_error_code}</p> : null}
    {error ? <p role="alert" className="text-xs text-danger">{error instanceof Error ? error.message : 'Shopify fulfillment failed'}</p> : null}
  </section>;
}

export function ShopifyOrderReceiptsPanel({ channelId }: { channelId: string }) {
  const auth = useAuth();
  const canReprocess = auth?.user?.role === 'ADMIN';
  const [rows, setRows] = useState<ShopifyOrderReceipt[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filters, setFilters] = useState<ShopifyOrderReceiptFilters>({ channel_id: channelId, limit: pageSize });
  const [draft, setDraft] = useState({ shopify_order_id: '', core_order_id: '', source: '', status: '', payment_status: '', fulfillment_status: '', safe_error_code: '' });
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [error, setError] = useState<unknown>(null);
  const active = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const load = useCallback(async (nextPage: number, append: boolean, nextFilters: ShopifyOrderReceiptFilters) => {
    const generation = ++active.current;
    controller.current?.abort();
    const request = new AbortController();
    controller.current = request;
    if (append) setLoadingMore(true);
    else { setLoading(true); setRows([]); }
    setError(null);
    try {
      const response = await getShopifyOrderReceipts({ ...nextFilters, channel_id: channelId, page: nextPage, limit: pageSize }, request.signal);
      if (request.signal.aborted || generation !== active.current) return;
      setRows((current) => append ? [...current, ...response.items.filter((item) => !current.some((old) => old.id === item.id))] : response.items);
      setTotal(response.total);
      setPage(nextPage);
    } catch (cause) {
      if (!request.signal.aborted && generation === active.current) setError(cause);
    } finally {
      if (!request.signal.aborted && generation === active.current) { setLoading(false); setLoadingMore(false); }
    }
  }, [channelId]);

  useEffect(() => {
    void load(1, false, { channel_id: channelId, limit: pageSize });
    return () => { active.current += 1; controller.current?.abort(); };
  }, [channelId, load]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextFilters: ShopifyOrderReceiptFilters = { channel_id: channelId, limit: pageSize };
    for (const key of ['shopify_order_id', 'core_order_id', 'source', 'status', 'payment_status', 'fulfillment_status', 'safe_error_code'] as const) {
      const value = draft[key].trim();
      if (value) Object.assign(nextFilters, { [key]: value });
    }
    setFilters(nextFilters);
    void load(1, false, nextFilters);
  };

  const reprocess = async (id: string) => {
    setRetrying(id);
    try {
      await reprocessShopifyOrderReceipt(id);
      await load(1, false, filters);
    } catch (cause) {
      setError(cause);
    } finally {
      setRetrying(null);
    }
  };

  return <Card className="grid min-w-0 gap-4 p-4 sm:p-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div><h2 className="font-display text-lg font-bold text-on-surface">Shopify order recovery</h2><p className="mt-1 text-sm text-graphite">Receipt webhook và polling · {rows.length.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')} sự kiện</p></div>
      <Button variant="secondary" size="sm" onClick={() => void load(1, false, filters)} loading={loading}>Làm mới</Button>
    </header>
    <form className="grid gap-2 rounded-control bg-surface-container-low p-3 sm:grid-cols-2 xl:grid-cols-4" onSubmit={submit}>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Shopify Order GID<input className="rounded-control border border-outline-variant bg-surface p-2 font-mono text-xs" value={draft.shopify_order_id} onChange={(event) => setDraft({ ...draft, shopify_order_id: event.target.value })} placeholder="gid://shopify/Order/…" /></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Core Order UUID<input className="rounded-control border border-outline-variant bg-surface p-2 font-mono text-xs" value={draft.core_order_id} onChange={(event) => setDraft({ ...draft, core_order_id: event.target.value })} placeholder="UUID" /></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Nguồn<select className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={draft.source} onChange={(event) => setDraft({ ...draft, source: event.target.value })}><option value="">Tất cả</option><option value="webhook">Webhook</option><option value="polling">Polling</option></select></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Receipt status<input className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value })} placeholder="processed / quarantined…" /></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Payment status<input className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={draft.payment_status} onChange={(event) => setDraft({ ...draft, payment_status: event.target.value })} placeholder="PAID / PENDING" /></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Fulfillment status<input className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={draft.fulfillment_status} onChange={(event) => setDraft({ ...draft, fulfillment_status: event.target.value })} placeholder="FULFILLED / UNFULFILLED" /></label>
      <label className="grid gap-1 text-xs font-semibold text-on-surface">Safe error code<input className="rounded-control border border-outline-variant bg-surface p-2 text-xs" value={draft.safe_error_code} onChange={(event) => setDraft({ ...draft, safe_error_code: event.target.value })} placeholder="MAPPING_MISSING" /></label>
      <div className="flex items-end"><Button type="submit" size="sm" loading={loading}>Lọc receipt</Button></div>
    </form>
    {loading ? <LoadingState label="Đang tải Shopify order receipts…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => void load(1, false, filters)} /> : null}
    {!loading && !error && rows.length === 0 ? <EmptyState title="Chưa có receipt phù hợp" detail="Webhook và polling receipts được hiển thị mà không tải payload khách hàng." /> : null}
    {!loading && !error && rows.length > 0 ? <div className="grid min-w-0 gap-2" role="list" aria-label="Shopify order receipts">
      {rows.map((row) => <details key={`${row.source}-${row.id}`} className="min-w-0 rounded-control border border-outline-variant/50 p-3">
        <summary className="grid cursor-pointer list-none gap-2 sm:grid-cols-[minmax(0,1.4fr)_minmax(0,0.9fr)_auto_auto] sm:items-center">
          <span className="min-w-0"><strong className="block break-all font-mono text-xs text-on-surface">{row.shopify_order_id}</strong><span className="mt-1 block text-caption text-graphite">Core: {row.core_order_id || 'Chưa có đơn Core'}</span></span>
          <span className="flex flex-wrap items-center gap-2"><StatusBadge>{row.source === 'webhook' ? 'Webhook' : 'Polling'}</StatusBadge><StatusBadge tone={statusTone(row.status)}>{row.status}</StatusBadge></span>
          <span className="text-xs text-graphite">{row.safe_error_code || '—'}</span>
          <time className="text-xs text-graphite">{time(row.last_seen_at)}</time>
        </summary>
        <dl className="mt-3 grid gap-2 border-t border-outline-variant/50 pt-3 text-xs sm:grid-cols-3">
          <div><dt className="text-graphite">Payment</dt><dd className="mt-1 font-semibold text-on-surface">{row.payment_status}</dd></div>
          <div><dt className="text-graphite">Fulfillment</dt><dd className="mt-1 font-semibold text-on-surface">{row.fulfillment_status}</dd></div>
          <div><dt className="text-graphite">Mapping / Core order</dt><dd className="mt-1 font-semibold text-on-surface">{row.core_order_id ? 'Đã liên kết đơn Core' : 'Chưa liên kết đơn Core'}</dd></div>
          <div><dt className="text-graphite">Số lần xử lý</dt><dd className="mt-1 font-semibold text-on-surface">{row.attempt_count}</dd></div>
          <div><dt className="text-graphite">Thời gian xử lý</dt><dd className="mt-1 font-semibold text-on-surface">{row.processing_time_ms == null ? 'Đang chờ / chưa ghi nhận' : `${row.processing_time_ms} ms`}</dd></div>
          <div><dt className="text-graphite">Lần xử lý gần nhất</dt><dd className="mt-1 font-semibold text-on-surface">{time(row.processed_at)}</dd></div>
        </dl>
        {row.safe_error_code ? <p className="mt-2 text-xs text-danger">Mã xử lý: <code>{row.safe_error_code}</code></p> : null}
        {canReprocess && row.reprocessable ? <Button className="mt-3" size="sm" variant="secondary" loading={retrying === row.id} onClick={() => void reprocess(row.id)}>Reprocess an toàn</Button> : null}
        {row.core_order_id ? <ShopifyFulfillmentAction orderId={row.core_order_id} canManage={canReprocess} /> : null}
      </details>)}
    </div> : null}
    {!loading && rows.length < total ? <div className="flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={() => void load(page + 1, true, filters)}>Tải thêm receipt</Button></div> : null}
    <p className="border-t border-outline-variant/50 pt-3 text-xs leading-5 text-graphite">Payload webhook và dữ liệu khách hàng không được gửi xuống danh sách này. Retry giữ nguyên khóa dedupe của Shopify/Core.</p>
  </Card>;
}
