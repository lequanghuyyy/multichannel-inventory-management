import { useCallback, useEffect, useRef, useState } from 'react';
import { navigate } from '../../../app/routes';
import { getWooCommerceOrderDetail, getWooCommerceOrders, retryWooCommerceOrder, type WooCommerceOrderDetail, type WooCommerceOrderReceipt } from '../../../api/woocommerce';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';

export function WooCommerceOrdersPanel({ channelId, canManage }: { channelId: string; canManage: boolean }) {
  const [items, setItems] = useState<WooCommerceOrderReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);
  const [selected, setSelected] = useState<WooCommerceOrderReceipt | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [detailID, setDetailID] = useState<string | null>(null);
  const [detail, setDetail] = useState<WooCommerceOrderDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const detailRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try { const result = await getWooCommerceOrders(channelId, signal); if (!signal?.aborted) setItems(result); }
    catch (cause) { if (!signal?.aborted) setError(messageOf(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [channelId]);

  useEffect(() => { const controller = new AbortController(); void load(controller.signal); return () => { controller.abort(); detailRequest.current?.abort(); }; }, [load]);
  useEffect(() => {
    detailRequest.current?.abort();
    setDetailID(null); setDetail(null); setDetailError(null); setDetailLoading(false);
  }, [channelId, canManage]);

  const retry = async () => {
    if (!selected || !canManage || retrying) return;
    const orderId = selected.external_order_id;
    setRetrying(orderId); setError(null); setSuccess(null);
    try {
      await retryWooCommerceOrder(channelId, orderId);
      setSuccess(`Đã xếp hàng retry cho WooCommerce order ${orderId}. Worker sẽ đọc lại trạng thái mới nhất.`);
      setSelected(null);
      await load();
    } catch (cause) { setError(messageOf(cause)); }
    finally { setRetrying(null); }
  };

  const openDetail = async (externalOrderId: string) => {
    if (!canManage) return;
    detailRequest.current?.abort();
    const controller = new AbortController();
    detailRequest.current = controller;
    setDetailID(externalOrderId); setDetail(null); setDetailError(null); setDetailLoading(true);
    try {
      const result = await getWooCommerceOrderDetail(channelId, externalOrderId, controller.signal);
      if (!controller.signal.aborted) setDetail(result);
    } catch (cause) { if (!controller.signal.aborted) setDetailError(messageOf(cause)); }
    finally { if (!controller.signal.aborted) setDetailLoading(false); }
  };

  return <div className="grid min-w-0 gap-4">
    <Card className="grid min-w-0 gap-3 p-5"><header className="flex flex-wrap items-end justify-between gap-2"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Order ingestion</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">WooCommerce order receipts</h2><p className="mt-1 text-caption text-graphite">Một dòng trên mỗi external order ID; webhook và polling dùng chung identity Core nên không tạo đơn hoặc trừ tồn lặp.</p></div><Button variant="secondary" size="sm" onClick={() => void load()} loading={loading}>Làm mới</Button></header>
      {loading ? <LoadingState label="Đang tải WooCommerce order receipts…" /> : null}
      {!loading && error ? <ErrorState error={error} retry={() => void load()} /> : null}
      {success ? <p role="status" className="rounded-control bg-surface-container-low p-3 text-sm text-on-surface">{success}</p> : null}
      {!loading && !error && items.length === 0 ? <EmptyState title="Chưa có WooCommerce order receipt" detail="Webhook hoặc recovery poller sẽ thêm receipt khi có order." /> : null}
      {items.length ? <ul className="grid gap-2">{items.map((item) => {
        const tone = item.import_result === 'imported' || item.import_result === 'processed' ? 'success' : ['dead', 'failed', 'quarantined'].includes(item.import_result) ? 'danger' : item.import_result === 'observed' ? 'neutral' : 'warning';
        const retryable = ['dead', 'failed', 'quarantined'].includes(item.import_result);
        return <li key={item.external_order_id} className="grid min-w-0 gap-3 rounded-control border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)_auto] sm:items-center">
          <div className="min-w-0"><strong className="block break-all font-mono text-sm text-on-surface">WooCommerce #{item.external_order_id}</strong><span className="mt-1 block break-all text-caption text-graphite">Core {item.core_order_id ? item.core_order_id.slice(0, 12) : 'chưa tạo'} · {item.source}</span><span className="mt-1 block text-caption text-graphite">Cập nhật {formatTime(item.last_modified_at || item.last_seen_at)}</span></div>
          <div className="flex min-w-0 flex-wrap items-center gap-2"><StatusBadge>{item.woocommerce_status || 'Chưa có status'}</StatusBadge>{item.core_status ? <StatusBadge tone="neutral">Core · {item.core_status}</StatusBadge> : null}<StatusBadge tone={tone}>{item.import_result}</StatusBadge></div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end"><span className="text-caption text-graphite">{item.retry_count} lần thử · {item.manual_retry_count} retry tay</span>{canManage ? <Button variant="ghost" size="sm" onClick={() => void openDetail(item.external_order_id)}>Chi tiết WooCommerce</Button> : null}{item.core_order_id ? <Button variant="ghost" size="sm" onClick={() => navigate(`/orders/${encodeURIComponent(item.core_order_id!)}`)}>Mở đơn Core</Button> : null}{retryable && canManage ? <Button variant="secondary" size="sm" disabled={retrying !== null} loading={retrying === item.external_order_id} onClick={() => setSelected(item)}>Retry</Button> : null}</div>
          {item.quarantine_reason ? <p className="break-all text-xs text-error sm:col-span-3">Lý do / error code: {item.quarantine_reason}</p> : null}
        </li>;
      })}</ul> : null}
      {!canManage ? <p className="text-xs leading-5 text-graphite">STAFF chỉ xem receipts. ADMIN mới được queue manual retry.</p> : null}
      <Button variant="ghost" onClick={() => navigate('/orders')} className="justify-self-start">Mở quản lý đơn hàng</Button>
    </Card>

    <Modal open={Boolean(selected)} onClose={() => setSelected(null)} title="Queue manual retry?" description={selected ? `WooCommerce order ${selected.external_order_id}` : undefined} footer={<><Button variant="ghost" disabled={Boolean(retrying)} onClick={() => setSelected(null)}>Hủy</Button><Button loading={Boolean(retrying)} onClick={() => void retry()}>Xác nhận retry</Button></>}>
      <p className="text-sm leading-6 text-graphite">Worker sẽ gọi WooCommerce để đọc trạng thái mới nhất rồi xử lý lại receipt. Retry được ghi audit, không tạo payment hoặc hoàn tiền.</p>
    </Modal>

    <Modal open={detailID !== null} onClose={() => { detailRequest.current?.abort(); detailRequest.current = null; setDetailID(null); setDetail(null); setDetailError(null); setDetailLoading(false); }} title="Chi tiết đơn WooCommerce" description={detailID ? `Đơn #${detailID} · dữ liệu đọc trực tiếp từ WooCommerce` : undefined} className="max-w-4xl">
      {detailLoading ? <LoadingState label="Đang đọc chi tiết đơn từ WooCommerce…" /> : null}
      {detailError ? <ErrorState error={detailError} retry={() => detailID && void openDetail(detailID)} /> : null}
      {detail ? <WooOrderDetails detail={detail} /> : null}
    </Modal>
  </div>;
}

function WooOrderDetails({ detail }: { detail: WooCommerceOrderDetail }) {
  const { order } = detail;
  const money = (value: string) => `${value || '0'} ${order.currency}`;
  const customer = [order.billing.first_name, order.billing.last_name].filter(Boolean).join(' ') || '—';
  return <div className="grid gap-5 text-sm">
    <section className="grid gap-2 rounded-control bg-surface-container-low p-3 sm:grid-cols-2 xl:grid-cols-4">
      <Fact label="Trạng thái" value={order.status} /><Fact label="Ngày tạo" value={formatTime(order.date_created_gmt)} />
      <Fact label="Tổng đơn" value={money(order.total)} /><Fact label="Thanh toán" value={order.payment_method_title || order.payment_method || '—'} />
    </section>
    <section className="grid gap-3 sm:grid-cols-2">
      <Address title="Thanh toán" name={customer} address={order.billing} />
      <Address title="Giao hàng" name={[order.shipping.first_name, order.shipping.last_name].filter(Boolean).join(' ') || '—'} address={order.shipping} />
    </section>
    <section className="grid gap-2">
      <h3 className="font-display font-bold text-on-surface">Sản phẩm</h3>
      {order.line_items.length ? <ul className="grid gap-2">{order.line_items.map((line) => <li key={line.id} className="grid gap-1 rounded-control border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0"><strong className="block text-on-surface">{line.name}</strong><span className="text-xs text-graphite">SKU {line.sku || '—'} · SL {line.quantity} · đơn giá {money(line.price)}</span></div>
        <div className="text-sm font-semibold sm:text-right">{money(line.total)}<span className="block text-xs font-normal text-graphite">Thuế {money(line.total_tax)} · trước giảm {money(line.subtotal)}</span></div>
      </li>)}</ul> : <p className="text-graphite">Không có dòng sản phẩm.</p>}
    </section>
    <section className="grid gap-2 rounded-control border border-outline-variant/50 p-3 sm:grid-cols-2">
      <Fact label="Giảm giá" value={`−${money(order.discount_total)}`} />
      <Fact label="Thuế giỏ hàng" value={money(order.cart_tax)} />
      <Fact label="Thuế đơn" value={money(order.total_tax)} />
      <Fact label="Phí giao hàng" value={`${money(order.shipping_total)} · thuế ${money(order.shipping_tax)}`} />
      <Fact label="Thuế giảm giá" value={money(order.discount_tax)} />
      <Fact label="Ghi chú khách hàng" value={order.customer_note || '—'} />
    </section>
    {order.shipping_lines.length || order.coupon_lines.length || order.fee_lines.length || order.tax_lines.length ? <section className="grid gap-2">
      <h3 className="font-display font-bold text-on-surface">Phí, mã giảm giá và thuế</h3>
      {order.shipping_lines.map((line) => <p key={`ship-${line.id}`} className="text-xs text-graphite">Giao hàng · {line.method_title}: {money(line.total)} · thuế {money(line.total_tax)}</p>)}
      {order.coupon_lines.map((line) => <p key={`coupon-${line.id}`} className="text-xs text-graphite">Coupon {line.code}: −{money(line.discount)} · thuế giảm {money(line.discount_tax)}</p>)}
      {order.fee_lines.map((line) => <p key={`fee-${line.id}`} className="text-xs text-graphite">Phí {line.name}: {money(line.total)} · thuế {money(line.total_tax)}</p>)}
      {order.tax_lines.map((line) => <p key={`tax-${line.id}`} className="text-xs text-graphite">Thuế {line.label || line.rate_code}: {money(line.tax_total)} · thuế giao hàng {money(line.shipping_tax_total)}</p>)}
    </section> : null}
    <section className="grid gap-2 border-t border-outline-variant/50 pt-3">
      <h3 className="font-display font-bold text-on-surface">Order notes</h3>
      {!detail.notes_available ? <p className="text-xs text-graphite">WooCommerce không cung cấp được ghi chú lần này.</p> : null}
      {detail.notes_available && detail.notes.length === 0 ? <p className="text-xs text-graphite">Không có ghi chú.</p> : null}
      {detail.notes.map((note) => <p key={note.id} className="rounded-control bg-surface-container-low p-3 text-xs leading-5">{note.note}<span className="mt-1 block text-graphite">{note.customer_note ? 'Ghi chú khách hàng' : 'Ghi chú nội bộ'} · {formatTime(note.date_created_gmt)}</span></p>)}
    </section>
    <p className="text-[11px] leading-5 text-graphite">Địa chỉ và thông tin liên hệ chỉ được tải trong phiên chi tiết ADMIN này; order receipts lưu bền không chứa thông tin cá nhân.</p>
  </div>;
}

function Address({ title, name, address }: { title: string; name: string; address: WooCommerceOrderDetail['order']['billing'] }) {
  const lines = [address.company, address.address_1, address.address_2, [address.city, address.state, address.postcode].filter(Boolean).join(' '), address.country].filter(Boolean);
  return <div className="rounded-control border border-outline-variant/50 p-3"><h3 className="font-display font-bold text-on-surface">{title}</h3><p className="mt-1 font-semibold">{name}</p>{lines.map((line, index) => <p key={`${index}-${line}`} className="text-xs leading-5 text-graphite">{line}</p>)}{address.email ? <p className="mt-1 break-all text-xs text-graphite">{address.email}</p> : null}{address.phone ? <p className="text-xs text-graphite">{address.phone}</p> : null}</div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-[11px] uppercase tracking-wide text-graphite">{label}</p><p className="mt-1 break-words font-semibold text-on-surface">{value}</p></div>;
}

function formatTime(value?: string | null): string { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Không thể tải order recovery receipts.'; }
