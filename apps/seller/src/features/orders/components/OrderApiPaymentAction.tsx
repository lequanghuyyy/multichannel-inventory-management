import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { confirmOrderPayment } from '../../../api/orders';
import { paymentLabel } from '../order.api';
import type { OrderApiRow } from '../order.api';

export function OrderApiPaymentAction({ order, onApplied, onError }: { order: OrderApiRow; onApplied: () => void; onError: (error: unknown) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState('');
  const marketplaceOrder = Boolean(order.channelId);
  const canConfirm = !marketplaceOrder && order.paymentStatus === 'pending' && order.status !== 'cancelled';
  const submit = async () => {
    setBusy(true);
    try {
      await confirmOrderPayment(order.id, note.trim(), `payment-ui-${order.id}`);
      setOpen(false);
      onApplied();
    } catch (error) {
      onError(error);
    } finally { setBusy(false); }
  };
  return <>
    <Card className="grid gap-3 p-5" aria-label="Thanh toán đơn hàng">
      <h2 className="font-display text-base font-bold text-on-surface">Thanh toán</h2>
      <p className="font-body text-caption text-graphite">Trạng thái hiện tại: <strong>{paymentLabel(order.paymentStatus)}</strong></p>
      {canConfirm ? <Button size="sm" className="justify-self-start" onClick={() => setOpen(true)}>Ghi nhận đã thu tiền</Button> : null}
      {marketplaceOrder ? <p className="font-body text-[11px] text-graphite">Đơn marketplace không nhận xác nhận thanh toán thủ công tại Core. Trạng thái thanh toán ngoài và bằng chứng settlement được hiển thị riêng khi nguồn cung cấp.</p> : <p className="font-body text-[11px] text-graphite">Xác nhận thủ công của nhân viên; không phải xác minh từ ngân hàng hoặc cổng thanh toán.</p>}
    </Card>
    <Modal open={open} onClose={() => !busy && setOpen(false)} title="Xác nhận thanh toán thủ công" description="Chỉ xác nhận khi đã nhận tiền ngoài hệ thống. Thao tác này không thay đổi tồn kho hoặc trạng thái giao hàng."
      footer={<><Button variant="secondary" disabled={busy} onClick={() => setOpen(false)}>Quay lại</Button><Button loading={busy} loadingLabel="Đang ghi nhận…" onClick={() => void submit()}>Xác nhận đã thu</Button></>}>
      <label className="grid gap-2 font-body text-caption font-semibold text-on-surface" htmlFor={`payment-note-${order.id}`}>
        Ghi chú (không bắt buộc)
        <textarea id={`payment-note-${order.id}`} maxLength={500} value={note} onChange={(event) => setNote(event.target.value)} disabled={busy} rows={3} className="rounded-control border border-outline-variant bg-pure-white p-3 text-sm font-normal" />
      </label>
    </Modal>
  </>;
}
