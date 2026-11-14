import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../../../app/routes';
import { listOrders, type Order } from '../../../api/orders';
import type { Channel } from '../../../api/channels';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { formatMinor } from '../../../lib/money';

type OrderFilter = 'all' | Order['status'];
const statuses: Array<{ id: OrderFilter; label: string }> = [
  { id: 'all', label: 'Tất cả' }, { id: 'placed', label: 'Mới' }, { id: 'confirmed', label: 'Đã xác nhận' },
  { id: 'packed', label: 'Đang soạn' }, { id: 'shipped', label: 'Đang giao' }, { id: 'delivered', label: 'Đã giao' }, { id: 'cancelled', label: 'Đã hủy' },
];
const orderState: Record<string, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  placed: { label: 'Mới', tone: 'warning' }, confirmed: { label: 'Đã xác nhận', tone: 'success' }, packed: { label: 'Đang soạn', tone: 'neutral' },
  shipped: { label: 'Đang giao', tone: 'neutral' }, delivered: { label: 'Đã giao', tone: 'success' }, cancelled: { label: 'Đã hủy', tone: 'danger' },
};

export function ChannelOrdersTab({ channel }: { channel: Channel; canManage?: boolean }) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [selectedStatus, setSelectedStatus] = useState<OrderFilter>('all');
  const [query, setQuery] = useState('');
  const activeRequest = useRef(0);
  const nextController = useRef<AbortController | null>(null);

  const refresh = useCallback(() => {
    const generation = ++activeRequest.current;
    nextController.current?.abort();
    const controller = new AbortController();
    nextController.current = controller;
    setLoading(true); setLoadingMore(false); setError(null); setOrders([]); setTotalCount(0); setStatusCounts({}); setCursor(null);
    void listOrders({ limit: 25, channel: channel.code, ...(selectedStatus === 'all' ? {} : { status: selectedStatus }) }, controller.signal).then((page) => {
      if (!controller.signal.aborted && generation === activeRequest.current) { setOrders(page.items); setTotalCount(page.totalCount ?? page.items.length); setStatusCounts(page.statusCounts ?? {}); setCursor(page.nextCursor); }
    }).catch((cause: unknown) => { if (!controller.signal.aborted && generation === activeRequest.current) setError(cause); }).finally(() => { if (!controller.signal.aborted && generation === activeRequest.current) setLoading(false); });
  }, [channel.code, selectedStatus]);

  useEffect(() => { refresh(); return () => { activeRequest.current += 1; nextController.current?.abort(); }; }, [refresh]);

  const loadMore = () => {
    if (!cursor || loadingMore) return;
    const generation = activeRequest.current;
    const controller = new AbortController(); nextController.current?.abort(); nextController.current = controller; setLoadingMore(true);
    void listOrders({ limit: 25, channel: channel.code, ...(selectedStatus === 'all' ? {} : { status: selectedStatus }), cursor }, controller.signal).then((page) => {
      if (controller.signal.aborted || generation !== activeRequest.current) return;
      setOrders((current) => [...current, ...page.items.filter((item) => !current.some((old) => old.id === item.id))]); setCursor(page.nextCursor);
    }).catch((cause: unknown) => { if (!controller.signal.aborted && generation === activeRequest.current) setError(cause); }).finally(() => { if (!controller.signal.aborted && generation === activeRequest.current) setLoadingMore(false); });
  };

  const filtered = orders.filter((order) => !query.trim() || `${order.reference} ${order.external_id ?? ''} ${order.customer_name ?? ''} ${order.customer_phone ?? ''}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')));

  return <div className="grid min-w-0 gap-5">
    <header className="flex flex-wrap items-end justify-between gap-3"><h2 className="font-display text-xl font-bold text-on-surface">Đơn hàng</h2><Button variant="secondary" size="sm" onClick={refresh} loading={loading} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">refresh</span>}>Làm mới</Button></header>
    <Card className="grid min-w-0 gap-4 p-4 sm:p-5">
      <Input label="Tìm đơn hàng" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Mã đơn, tên hoặc số điện thoại khách" leading={<span className="material-symbols-outlined text-xl" aria-hidden="true">search</span>} />
      <div className="flex min-w-0 gap-2 overflow-x-auto" role="group" aria-label="Lọc theo tình trạng đơn hàng">{statuses.map((item) => {
        const count = item.id === 'all' ? totalCount : statusCounts[item.id] ?? 0;
        const active = selectedStatus === item.id;
        return <button key={item.id} type="button" aria-pressed={active} onClick={() => setSelectedStatus(item.id)} className={`min-h-9 shrink-0 rounded-full px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown ${active ? 'bg-carbon text-pure-white' : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'}`}>{item.label}<span className="ml-2 tabular-nums opacity-70">{loading ? '—' : count.toLocaleString('vi-VN')}</span></button>;
      })}</div>
    </Card>

    {loading ? <LoadingState label="Đang tải đơn hàng…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={refresh} /> : null}
    {!loading && !error && filtered.length === 0 ? <EmptyState title={query || totalCount ? 'Không tìm thấy đơn hàng' : 'Chưa có đơn hàng'} detail={query ? 'Hãy kiểm tra từ khóa hoặc chọn tình trạng khác.' : 'Đơn hàng của cửa hàng sẽ hiển thị tại đây.'} /> : null}
    {!loading && !error && filtered.length > 0 ? <Card className="min-w-0 overflow-hidden p-0">
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[980px] border-collapse text-left"><caption className="sr-only">Đơn hàng trên {channel.name}</caption><thead><tr className="h-12 border-b border-outline-variant/50 bg-surface-container-low text-xs font-semibold text-graphite"><th className="px-5">Đơn hàng</th><th className="px-3">Khách hàng</th><th className="px-3 text-center">Sản phẩm</th><th className="px-3 text-right">Tổng tiền</th><th className="px-3">Thanh toán</th><th className="px-3">Giao hàng</th><th className="px-5">Ngày đặt</th></tr></thead><tbody className="divide-y divide-surface-container">{filtered.map((order) => <OrderRow key={order.id} order={order} />)}</tbody></table></div>
      <div className="grid gap-2 p-3 md:hidden">{filtered.map((order) => <OrderCard key={order.id} order={order} />)}</div>
      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/50 px-5 py-3 text-xs text-graphite"><span>Đang hiển thị {filtered.length} / {totalCount.toLocaleString('vi-VN')} đơn hàng</span>{cursor ? <Button variant="ghost" size="sm" loading={loadingMore} onClick={loadMore}>Xem thêm</Button> : null}</footer>
    </Card> : null}
  </div>;
}

function OrderRow({ order }: { order: Order }) {
  const state = orderState[order.status] ?? { label: order.status, tone: 'neutral' as const };
  return <tr className="text-sm transition-colors hover:bg-surface-container-low/60"><td className="px-5 py-4"><button type="button" onClick={() => navigate(`/orders/${encodeURIComponent(order.id)}`)} className="font-semibold text-on-surface underline decoration-outline-variant underline-offset-4 hover:text-secondary">{order.reference}</button>{order.external_id ? <span className="mt-1 block text-xs text-graphite">{order.external_id}</span> : null}<span className="mt-2 inline-flex"><StatusBadge tone={state.tone}>{state.label}</StatusBadge></span></td><td className="px-3 py-4"><span className="block text-on-surface">{order.customer_name || 'Khách hàng'}</span><span className="mt-1 block text-xs text-graphite">{order.customer_phone || 'Chưa có số điện thoại'}</span></td><td className="px-3 py-4 text-center tabular-nums text-on-surface">{order.item_count}</td><td className="px-3 py-4 text-right font-semibold tabular-nums text-on-surface">{formatMinor(order.total_minor, order.currency)}</td><td className="px-3 py-4"><StatusBadge tone={paymentTone(order.payment_status)}>{paymentLabel(order.payment_status)}</StatusBadge></td><td className="px-3 py-4 text-on-surface">{fulfillmentLabel(order.fulfillment_status)}</td><td className="px-5 py-4 text-xs text-graphite">{formatTime(order.placed_at)}</td></tr>;
}

function OrderCard({ order }: { order: Order }) {
  const state = orderState[order.status] ?? { label: order.status, tone: 'neutral' as const };
  return <article className="grid gap-3 rounded-control border border-outline-variant/50 p-4"><div className="flex items-start justify-between gap-2"><div><button type="button" onClick={() => navigate(`/orders/${encodeURIComponent(order.id)}`)} className="text-left text-sm font-semibold text-on-surface underline underline-offset-4">{order.reference}</button><span className="mt-1 block text-xs text-graphite">{order.customer_name || 'Khách hàng'}</span></div><StatusBadge tone={state.tone}>{state.label}</StatusBadge></div><div className="grid grid-cols-2 gap-3 border-t border-outline-variant/50 pt-3 text-xs"><div><span className="text-graphite">Tổng tiền</span><strong className="mt-1 block text-sm tabular-nums text-on-surface">{formatMinor(order.total_minor, order.currency)}</strong></div><div><span className="text-graphite">Sản phẩm</span><strong className="mt-1 block text-sm text-on-surface">{order.item_count}</strong></div><div><span className="text-graphite">Thanh toán</span><strong className="mt-1 block text-on-surface">{paymentLabel(order.payment_status)}</strong></div><div><span className="text-graphite">Ngày đặt</span><strong className="mt-1 block font-medium text-on-surface">{formatTime(order.placed_at)}</strong></div></div><Button variant="ghost" size="sm" onClick={() => navigate(`/orders/${encodeURIComponent(order.id)}`)} className="justify-self-start">Xem đơn hàng</Button></article>;
}

function paymentLabel(value: string) { return ({ pending: 'Chờ thanh toán', paid: 'Đã thanh toán', refunded: 'Đã hoàn tiền', failed: 'Thanh toán lỗi' } as Record<string, string>)[value] ?? 'Chưa cập nhật'; }
function paymentTone(value: string): 'neutral' | 'success' | 'warning' | 'danger' { return value === 'paid' ? 'success' : value === 'failed' ? 'danger' : value === 'pending' ? 'warning' : 'neutral'; }
function fulfillmentLabel(value: string) { return ({ pending: 'Chờ xử lý', picking: 'Đang soạn hàng', shipped: 'Đang giao', delivered: 'Đã giao', returned: 'Đã hoàn về' } as Record<string, string>)[value] ?? 'Chưa cập nhật'; }
function formatTime(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
