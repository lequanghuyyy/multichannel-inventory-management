import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import {
  cancelOrderReturn,
  createOrderReturn,
  getOrderReturns,
  inspectOrderReturn,
  receiveOrderReturn,
  rejectOrderReturn,
  type OrderReturn,
  type ReturnReceiveInput,
  type ReturnsSummary,
} from '../../../api/orders';
import { channelName } from '../order.api';
import { formatOrderTime } from '../order.utils';

const statusLabel: Record<OrderReturn['status'], string> = {
  requested: 'Chờ tiếp nhận',
  received: 'Đã tiếp nhận',
  completed: 'Đã kiểm tra',
  rejected: 'Đã từ chối',
  cancelled: 'Đã hủy',
};

const statusTone: Record<OrderReturn['status'], 'neutral' | 'success' | 'warning' | 'danger'> = {
  requested: 'warning',
  received: 'neutral',
  completed: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
};

async function createKey(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return `return-ui-${[...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function refundStatusLabel(status: string): string {
  const labels: Record<string, string> = {
    recorded: 'Nền tảng ghi nhận giao dịch hoàn',
    refunded: 'Nền tảng ghi nhận đã hoàn tiền',
    success: 'Nền tảng ghi nhận giao dịch thành công',
    succeeded: 'Nền tảng ghi nhận giao dịch thành công',
    pending: 'Đang chờ nền tảng xử lý',
    failure: 'Nền tảng ghi nhận giao dịch thất bại',
    failed: 'Nền tảng ghi nhận giao dịch thất bại',
  };
  return labels[status.toLowerCase()] ?? `Trạng thái nguồn: ${status}`;
}

function refundStatusTone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  const normalized = status.toLowerCase();
  if (normalized === 'success' || normalized === 'succeeded' || normalized === 'refunded') return 'success';
  if (normalized === 'pending') return 'warning';
  if (normalized === 'failure' || normalized === 'failed') return 'danger';
  return 'neutral';
}

export function OrderApiReturns({
  orderId,
  orderStatus,
  channelCode,
}: {
  orderId: string;
  orderStatus: string;
  channelCode: string;
}) {
  const [summary, setSummary] = useState<ReturnsSummary | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [receiveTarget, setReceiveTarget] = useState<OrderReturn | null>(null);
  const [received, setReceived] = useState<Record<string, number>>({});
  const [inspectTarget, setInspectTarget] = useState<OrderReturn | null>(null);
  const [sellable, setSellable] = useState<Record<string, number>>({});
  const [condition, setCondition] = useState<Record<string, string>>({});
  const [closeTarget, setCloseTarget] = useState<{ orderReturn: OrderReturn; action: 'cancel' | 'reject' } | null>(null);
  const [closeReason, setCloseReason] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    setSummary(null);
    setError(null);
    void getOrderReturns(orderId, controller.signal)
      .then(setSummary)
      .catch((err: unknown) => { if (!controller.signal.aborted) setError(err); });
    return () => controller.abort();
  }, [orderId, attempt]);

  const refresh = async () => {
    const next = await getOrderReturns(orderId);
    setSummary(next);
  };

  const createRequest = async () => {
    if (!summary) return;
    const items = summary.returnable_items.flatMap((item) => {
      const quantity = quantities[item.order_item_id] ?? 0;
      return quantity > 0 ? [{ order_item_id: item.order_item_id, quantity }] : [];
    });
    if (items.length === 0 || !reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const trimmedReason = reason.trim();
      await createOrderReturn(orderId, { reason: trimmedReason, items }, await createKey({ orderId, reason: trimmedReason, items }));
      setReason('');
      setQuantities({});
      setCreateOpen(false);
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const openReceive = (ret: OrderReturn) => {
    setReceived(Object.fromEntries(ret.items.map((item) => [item.id, 0])));
    setReceiveTarget(ret);
  };

  const confirmReceive = async () => {
    if (!receiveTarget) return;
    const items = receiveTarget.items.map((item) => ({
      return_item_id: item.id,
      received_quantity: received[item.id] ?? 0,
    }));
    if (!items.some((item) => item.received_quantity > 0)) return;
    const body: ReturnReceiveInput = { items };
    setBusy(true);
    setError(null);
    try {
      await receiveOrderReturn(receiveTarget.id, body, await createKey({ returnId: receiveTarget.id, items }));
      setReceiveTarget(null);
      setReceived({});
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const inspect = async () => {
    if (!inspectTarget) return;
    const items = inspectTarget.items.map((item) => ({
      return_item_id: item.id,
      sellable_quantity: sellable[item.id] ?? 0,
      condition_note: condition[item.id]?.trim() ?? '',
    }));
    setBusy(true);
    setError(null);
    try {
      await inspectOrderReturn(inspectTarget.id, { items }, await createKey({ returnId: inspectTarget.id, items }));
      setInspectTarget(null);
      setSellable({});
      setCondition({});
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const closeReturn = async () => {
    if (!closeTarget || !closeReason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const input = { reason: closeReason.trim() };
      const key = await createKey({ returnId: closeTarget.orderReturn.id, action: closeTarget.action, ...input });
      if (closeTarget.action === 'cancel') await cancelOrderReturn(closeTarget.orderReturn.id, input, key);
      else await rejectOrderReturn(closeTarget.orderReturn.id, input, key);
      setCloseTarget(null);
      setCloseReason('');
      await refresh();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  const canRequest = orderStatus === 'delivered' && Boolean(summary?.returnable_items.some((item) => item.remaining_quantity > 0));

  return (
    <div className="grid gap-5">
      <Card className="grid gap-4 p-5 sm:p-6" aria-label="Hoàn tiền">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-on-surface">Hoàn tiền</h2>
            <p className="mt-1 font-body text-caption text-graphite">Theo dõi bằng chứng do nền tảng cung cấp riêng với việc nhận hàng và nhập lại kho.</p>
          </div>
        </div>
        {summary === null ? (
          <p className="font-body text-caption text-graphite">{error ? 'Không tải được bằng chứng hoàn tiền từ nền tảng.' : 'Đang tải bằng chứng hoàn tiền…'}</p>
        ) : summary.refund_observations.length ? (
          <div className="grid gap-2">
            {summary.refund_observations.map((refund, index) => (
              <article key={`${refund.external_refund_id}-${refund.observed_at}-${index}`} className="grid gap-2 rounded-control border border-outline-variant/60 bg-surface-container-low/40 p-3 sm:grid-cols-[1fr_auto] sm:items-center">
                <div className="grid gap-1">
                  <StatusBadge tone={refundStatusTone(refund.status)}>{refundStatusLabel(refund.status)}</StatusBadge>
                  <p className="font-body text-caption text-graphite">
                    Nguồn: <strong className="text-on-surface">{channelName(channelCode)}</strong> · {refund.source === 'webhook' ? 'Webhook' : refund.source === 'polling' ? 'Đồng bộ API' : 'Mô phỏng'} · {formatOrderTime(refund.observed_at)}
                  </p>
                </div>
                <p className="font-body text-body-sm font-semibold tabular-nums text-on-surface">
                  {refund.amount == null ? 'Nguồn chưa cung cấp số tiền' : `${refund.amount} ${refund.currency}`}
                </p>
              </article>
            ))}
            <p className="font-body text-caption text-graphite">Trạng thái hoàn tiền do nền tảng cung cấp không xác minh tiền đã chuyển về tài khoản người bán. Core không tự tạo lệnh hoàn tiền.</p>
          </div>
        ) : (
          <div className="grid gap-1 rounded-control bg-surface-container-low/50 p-3 font-body text-caption text-graphite">
            <p>Chưa có bằng chứng hoàn tiền từ nền tảng được ghi nhận cho đơn này.</p>
            <p>Chức năng hoàn tiền trực tiếp chưa được hỗ trợ.</p>
          </div>
        )}
      </Card>

      <Card className="grid gap-4 p-5 sm:p-6" aria-label="Yêu cầu trả hàng">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="font-display text-base font-bold text-on-surface">Trả hàng</h2>
            <p className="mt-1 font-body text-caption text-graphite">Hàng được nhập lại kho sau bước kiểm tra; việc đó không đồng nghĩa với đã hoàn tiền.</p>
          </div>
          {canRequest && summary?.returns.length ? (
            <Button size="sm" variant="secondary" onClick={() => setCreateOpen(true)} disabled={busy}>Tạo yêu cầu trả hàng</Button>
          ) : null}
        </div>

        {summary === null && !error ? <LoadingState label="Đang tải thông tin trả hàng…" /> : null}
        {error && summary === null ? <ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /> : null}
        {error && summary !== null ? <p role="alert" className="rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">{error instanceof Error ? error.message : 'Thao tác chưa hoàn tất.'}</p> : null}

        {summary ? (
          <>
            {summary.returns.length === 0 ? (
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-container-low/50 p-3">
                <p className="font-body text-caption text-graphite">Chưa có yêu cầu trả hàng.</p>
                {canRequest ? <Button size="sm" onClick={() => setCreateOpen(true)} disabled={busy}>Tạo yêu cầu trả hàng</Button> : null}
                {orderStatus !== 'delivered' ? <span className="font-body text-caption text-graphite">Chỉ đơn đã giao mới đủ điều kiện trả hàng.</span> : null}
                {orderStatus === 'delivered' && !canRequest ? <span className="font-body text-caption text-graphite">Không còn số lượng đủ điều kiện yêu cầu trả.</span> : null}
              </div>
            ) : null}

            {summary.returns.map((ret) => (
              <section key={ret.id} className="grid gap-4 rounded-card border border-outline-variant/60 p-4 sm:p-5" aria-label={`Yêu cầu trả hàng ${ret.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h3 className="font-body text-body-sm font-semibold text-on-surface">Yêu cầu trả hàng</h3>
                    <p className="mt-1 font-body text-caption text-graphite">Tạo lúc {formatOrderTime(ret.created_at)} · Lý do: {ret.reason}</p>
                  </div>
                  <StatusBadge tone={statusTone[ret.status]}>{statusLabel[ret.status]}</StatusBadge>
                </div>

                <ol className="grid gap-2 sm:grid-cols-3" aria-label="Các bước xử lý hàng trả">
                  {[
                    { label: '1. Tạo yêu cầu', done: true },
                    { label: '2. Tiếp nhận thực tế', done: ret.status !== 'requested' && ret.status !== 'cancelled' },
                    { label: '3. Kiểm tra chất lượng', done: ret.status === 'completed' },
                  ].map((step) => (
                    <li key={step.label} className={`rounded-control border p-2.5 font-body text-caption ${step.done ? 'border-success/40 bg-success/5 text-on-surface' : 'border-outline-variant/50 bg-surface-container-low/40 text-graphite'}`}>
                      <span className="mr-1.5 material-symbols-outlined align-middle text-[16px]" aria-hidden="true">{step.done ? 'check_circle' : 'radio_button_unchecked'}</span>{step.label}
                    </li>
                  ))}
                </ol>

                <div className="grid gap-2">
                  {ret.items.map((item) => {
                    const notSellable = item.received_quantity - item.sellable_quantity;
                    return (
                      <article key={item.id} className="grid gap-2 rounded-control bg-surface-container-low/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start">
                        <div>
                          <strong className="font-body text-caption text-on-surface">{item.name} · {item.sku}</strong>
                          <p className="mt-1 font-body text-caption text-graphite">
                            Yêu cầu {item.requested_quantity} · {ret.status === 'requested' || ret.status === 'cancelled' ? 'Chưa tiếp nhận' : `Thực nhận ${item.received_quantity}`}
                          </p>
                          {ret.status === 'completed' ? (
                            <p className="font-body text-caption text-graphite">Đủ điều kiện nhập lại {item.sellable_quantity} · Không đạt {notSellable} · Chưa nhận {item.requested_quantity - item.received_quantity}</p>
                          ) : null}
                          {item.condition_note ? <p className="mt-1 font-body text-caption text-graphite">Ghi chú kiểm tra: {item.condition_note}</p> : null}
                        </div>
                        {ret.status === 'completed' ? (
                          <StatusBadge tone={item.sellable_quantity > 0 ? 'success' : 'neutral'}>{item.sellable_quantity > 0 ? 'Đã nhập lại phần đạt' : 'Không nhập lại kho'}</StatusBadge>
                        ) : null}
                      </article>
                    );
                  })}
                </div>

                <div className="grid gap-1 border-t border-outline-variant/50 pt-3">
                  <h4 className="font-body text-caption font-semibold text-on-surface">Lịch sử xử lý</h4>
                  <ol className="grid gap-1 font-body text-caption text-graphite">
                    {ret.history.map((event) => (
                      <li key={event.id}>
                        {event.from_status ? `${statusLabel[event.from_status as OrderReturn['status']]} → ` : ''}{statusLabel[event.to_status as OrderReturn['status']]}
                        {' · '}{formatOrderTime(event.changed_at)} · {event.actor_email ?? `Nhân viên ${event.actor_user_id}`}
                        {event.reason ? ` · ${event.reason}` : ''}
                      </li>
                    ))}
                  </ol>
                </div>

                {ret.status === 'requested' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" variant="secondary" disabled={busy} onClick={() => openReceive(ret)}>Tiếp nhận hàng trả</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setCloseReason(''); setCloseTarget({ orderReturn: ret, action: 'cancel' }); }}>Hủy yêu cầu</Button>
                  </div>
                ) : null}
                {ret.status === 'received' ? (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" disabled={busy} onClick={() => { setInspectTarget(ret); setSellable(Object.fromEntries(ret.items.map((item) => [item.id, 0]))); setCondition({}); }}>Kiểm tra hàng trả</Button>
                    <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setCloseReason(''); setCloseTarget({ orderReturn: ret, action: 'reject' }); }}>Từ chối hàng trả</Button>
                  </div>
                ) : null}
              </section>
            ))}

            {summary.returns.length > 0 && !canRequest && orderStatus === 'delivered' ? (
              <p className="font-body text-caption text-graphite">Không còn số lượng đủ điều kiện yêu cầu trả.</p>
            ) : null}
            {orderStatus !== 'delivered' && summary.returns.length === 0 ? null : null}
          </>
        ) : null}
      </Card>

      <Modal open={createOpen} onClose={() => !busy && setCreateOpen(false)} title="Tạo yêu cầu trả hàng" description="Chọn số lượng theo từng SKU. Hệ thống không cho vượt số lượng còn đủ điều kiện trả."
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setCreateOpen(false)}>Quay lại</Button><Button loading={busy} loadingLabel="Đang tạo yêu cầu…" disabled={busy || !reason.trim() || !Object.values(quantities).some((quantity) => quantity > 0)} onClick={() => void createRequest()}>Tạo yêu cầu</Button></>}>
        <div className="grid gap-4">
          {summary?.returnable_items.filter((item) => item.remaining_quantity > 0).map((item) => (
            <label key={item.order_item_id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 font-body text-caption text-on-surface">
              <span>{item.name} · {item.sku}<small className="block text-graphite">Đã bán {item.sold_quantity} · Còn đủ điều kiện trả {item.remaining_quantity}</small></span>
              <input aria-label={`Số lượng trả ${item.sku}`} type="number" min={0} max={item.remaining_quantity} step={1} value={quantities[item.order_item_id] ?? 0} disabled={busy} onChange={(event) => setQuantities((old) => ({ ...old, [item.order_item_id]: Math.max(0, Math.min(item.remaining_quantity, Math.trunc(Number(event.target.value) || 0))) }))} className="min-h-10 w-full rounded-control border border-outline-variant px-2 text-center" />
            </label>
          ))}
          <label className="grid gap-2 font-body text-caption font-semibold text-on-surface">Lý do trả<textarea value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} disabled={busy} rows={3} className="rounded-control border border-outline-variant p-3 font-normal" /></label>
        </div>
      </Modal>

      <Modal open={receiveTarget !== null} onClose={() => !busy && setReceiveTarget(null)} title="Tiếp nhận hàng trả" description="Nhập số lượng thực nhận cho từng dòng. Phần khách chưa gửi lại không bị tính là hàng hỏng và có thể được yêu cầu trả sau."
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setReceiveTarget(null)}>Quay lại</Button><Button loading={busy} loadingLabel="Đang ghi nhận…" disabled={busy || !Object.values(received).some((quantity) => quantity > 0)} onClick={() => void confirmReceive()}>Xác nhận số lượng nhận</Button></>}>
        <div className="grid gap-3">
          {receiveTarget?.items.map((item) => (
            <label key={item.id} className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 rounded-control border border-outline-variant/60 p-3 font-body text-caption text-on-surface">
              <span>{item.name} · {item.sku}<small className="block text-graphite">Khách yêu cầu trả {item.requested_quantity}</small></span>
              <input aria-label={`Số lượng thực nhận ${item.sku}`} type="number" min={0} max={item.requested_quantity} step={1} value={received[item.id] ?? 0} disabled={busy} onChange={(event) => setReceived((old) => ({ ...old, [item.id]: Math.max(0, Math.min(item.requested_quantity, Math.trunc(Number(event.target.value) || 0))) }))} className="min-h-10 w-full rounded-control border border-outline-variant px-2 text-center" />
            </label>
          ))}
        </div>
      </Modal>

      <Modal open={inspectTarget !== null} onClose={() => !busy && setInspectTarget(null)} title="Kiểm tra chất lượng" description="Chỉ số lượng đã thực nhận mới được phân loại. Hàng không đạt không được cộng vào tồn có thể bán."
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setInspectTarget(null)}>Quay lại</Button><Button loading={busy} loadingLabel="Đang lưu kiểm tra…" onClick={() => void inspect()}>Hoàn tất kiểm tra</Button></>}>
        <div className="grid gap-4">
          {inspectTarget?.items.map((item) => (
            <div key={item.id} className="grid gap-2 rounded-control border border-outline-variant/60 p-3">
              <strong className="font-body text-caption text-on-surface">{item.name} · {item.sku} · thực nhận {item.received_quantity}</strong>
              <label className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-2 font-body text-caption">Đủ điều kiện bán lại<input aria-label={`SL bán lại ${item.sku}`} type="number" min={0} max={item.received_quantity} step={1} value={sellable[item.id] ?? 0} onChange={(event) => setSellable((old) => ({ ...old, [item.id]: Math.max(0, Math.min(item.received_quantity, Math.trunc(Number(event.target.value) || 0))) }))} className="min-h-10 rounded-control border border-outline-variant px-2 text-center" /></label>
              <label className="grid gap-1 font-body text-caption">Ghi chú tình trạng (bắt buộc nếu có hàng không đạt)<input maxLength={500} value={condition[item.id] ?? ''} onChange={(event) => setCondition((old) => ({ ...old, [item.id]: event.target.value }))} className="min-h-10 rounded-control border border-outline-variant px-3" /></label>
            </div>
          ))}
        </div>
      </Modal>

      <Modal open={closeTarget !== null} onClose={() => !busy && setCloseTarget(null)} title={closeTarget?.action === 'cancel' ? 'Hủy yêu cầu trả hàng' : 'Từ chối hàng trả'} description="Thao tác này không thay đổi tồn kho và không xác nhận hoàn tiền. Hãy ghi rõ lý do để lưu vào lịch sử."
        footer={<><Button variant="secondary" disabled={busy} onClick={() => setCloseTarget(null)}>Quay lại</Button><Button variant="danger" loading={busy} disabled={busy || !closeReason.trim()} onClick={() => void closeReturn()}>Xác nhận</Button></>}>
        <label className="grid gap-2 font-body text-caption font-semibold text-on-surface">Lý do<textarea value={closeReason} maxLength={500} onChange={(event) => setCloseReason(event.target.value)} rows={3} className="rounded-control border border-outline-variant p-3 font-normal" /></label>
      </Modal>
    </div>
  );
}
