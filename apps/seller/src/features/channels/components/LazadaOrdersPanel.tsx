import { useEffect, useState } from 'react';
import { getLazadaOrders, retryLazadaOrder, type LazadaOrderReceipt } from '../../../api/lazada';
import { pollChannelOrders } from '../../../api/channel-operations';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { newIdempotencyKey } from '../../products/product.write';

const formatTime = (value: string) => new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
const coreOrderLabel: Record<string, string> = { placed: 'Mới đặt', confirmed: 'Đã xác nhận', packed: 'Đã đóng gói', shipped: 'Đang giao', delivered: 'Đã giao', cancelled: 'Đã hủy' };

export function LazadaOrdersPanel({ channelId, canManage, connected }: { channelId: string; canManage: boolean; connected: boolean }) {
  const [orders, setOrders] = useState<LazadaOrderReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [retrying, setRetrying] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getLazadaOrders(channelId, controller.signal).then((page) => { if (!controller.signal.aborted) setOrders(page.items); })
      .catch(() => { if (!controller.signal.aborted) setError('Không đọc được lịch sử nhận đơn Lazada.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channelId, revision]);

  const poll = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const job = await pollChannelOrders(channelId, newIdempotencyKey('lazada-orders-poll'));
      setMessage(`Yêu cầu ${job.job_id} đã được tiếp nhận. Đơn chỉ xuất hiện sau khi worker xử lý và Core ghi nhận.`);
    } catch { setError('Chưa tạo được yêu cầu kiểm tra đơn. Kiểm tra kết nối và quyền Order API.'); }
    finally { setBusy(false); }
  };
  const retry = async (orderId: string) => {
    setRetrying(orderId); setError(''); setMessage('');
    try { await retryLazadaOrder(channelId, orderId); setMessage(`Đã tải lại đơn ${orderId} và ghi nhận kết quả mới.`); setRevision((value) => value + 1); }
    catch { setError(`Chưa xử lý lại được đơn ${orderId}. Kiểm tra mapping và trạng thái kết nối.`); }
    finally { setRetrying(''); }
  };
  return <div className="grid min-w-0 gap-4">
    <header className="flex flex-wrap items-end justify-between gap-3"><div><h2 className="font-display text-xl font-bold text-on-surface">Đơn hàng Lazada</h2><p className="mt-1 text-sm text-graphite">Receipt và trạng thái từng order item đã đọc từ gian hàng. SKU chưa ghép sẽ cần xử lý trong Core.</p></div><div className="flex gap-2"><Button variant="secondary" size="sm" loading={loading} onClick={() => setRevision((value) => value + 1)}>Làm mới</Button>{canManage ? <Button size="sm" disabled={!connected} loading={busy} onClick={() => void poll()}>Kiểm tra đơn mới</Button> : null}</div></header>
    {message ? <p role="status" className="rounded-control bg-surface-container-low p-3 text-sm text-on-surface">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
    {loading ? <Card className="p-5 text-sm text-graphite">Đang đọc receipt đơn hàng…</Card> : null}
    {!loading && !error && orders.length === 0 ? <Card className="p-5 text-sm text-graphite">Chưa có receipt đơn hàng Lazada trong OctoFlow.</Card> : null}
    {orders.map((order) => <Card key={order.external_order_id} className="grid min-w-0 gap-3 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="font-display text-base text-on-surface">Lazada #{order.external_order_id}</strong><p className="mt-1 text-xs text-graphite">Core: {order.core_order_id || 'Chưa nhập'} · {formatTime(order.last_seen_at)}</p></div><div className="flex flex-wrap items-center gap-2"><StatusBadge tone={order.ingestion_status === 'processed' ? 'success' : order.ingestion_status === 'rejected' || order.ingestion_status === 'conflict' ? 'danger' : 'warning'}>{order.ingestion_status === 'processed' ? 'Đã nhập Core' : order.ingestion_status === 'needs_attention' || order.ingestion_status === 'quarantined' ? 'Cần xử lý' : order.ingestion_status}</StatusBadge>{canManage && connected && order.ingestion_status !== 'processed' ? <Button variant="secondary" size="sm" loading={retrying === order.external_order_id} disabled={Boolean(retrying)} onClick={() => void retry(order.external_order_id)}>Tải lại đơn</Button> : null}</div></div><div className="flex flex-wrap gap-2 text-xs"><span className="rounded-control bg-surface-container-low px-2 py-1 text-graphite">Native: {order.native_status || '—'}</span>{order.core_status ? <span className="rounded-control bg-surface-container-low px-2 py-1 text-graphite">OctoFlow: {coreOrderLabel[order.core_status] ?? order.core_status} · {order.core_fulfillment_status}</span> : null}{order.safe_error_code ? <span className="rounded-control bg-error/5 px-2 py-1 text-error">{order.safe_error_code}</span> : null}</div><ul className="divide-y divide-outline-variant/50">{order.items.map((item) => <li key={item.order_item_id} className="flex flex-wrap justify-between gap-2 py-2 text-sm"><span className="font-medium text-on-surface">{item.seller_sku} <span className="font-mono text-xs text-graphite">#{item.order_item_id}</span></span><span className="text-graphite">{item.native_status} · SKU ID {item.sku_id}</span></li>)}</ul></Card>)}
  </div>;
}
