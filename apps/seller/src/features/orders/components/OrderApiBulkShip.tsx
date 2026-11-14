import { useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { bulkShipOrders } from '../../../api/orders';
import type { OrderApiRow } from '../order.api';

async function batchKey(ids: string[]): Promise<string> {
  const payload = new TextEncoder().encode([...ids].sort().join('\n') + '\npacked>shipped');
  const digest = await crypto.subtle.digest('SHA-256', payload);
  return `bulk-${[...new Uint8Array(digest)].map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

export function OrderApiBulkShip({ open, orders, onClose, onApplied }: { open: boolean; orders: OrderApiRow[]; onClose: () => void; onApplied: (count: number) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<number | null>(null);
  useEffect(() => { if (open) { setError(null); setSuccess(null); } }, [open]);
  const eligible = orders.filter((order) => order.status === 'packed');
  const ineligible = orders.filter((order) => order.status !== 'packed');
  const submit = async () => {
    setBusy(true); setError(null); setSuccess(null);
    try {
      const key = await batchKey(orders.map((order) => order.id));
      const result = await bulkShipOrders(orders.map((order) => order.id), key);
      setSuccess(result.orders.length);
      onApplied(result.orders.length);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Không thể giao hàng loạt.');
    } finally { setBusy(false); }
  };
  return <Modal open={open} onClose={() => !busy && onClose()} title="Giao hàng loạt" description="Ghi nhận thủ công việc bàn giao các đơn đã đóng gói. Không tạo vận đơn hoặc mã theo dõi."
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Đóng</Button><Button loading={busy} loadingLabel="Đang cập nhật…" disabled={orders.length===0 || ineligible.length>0 || orders.length>50} onClick={() => void submit()}>Ghi nhận bàn giao</Button></>}>
    <div className="grid gap-3">
      <p className="font-body text-body-sm text-on-surface">Đã chọn <strong>{orders.length}</strong> đơn · đủ điều kiện <strong>{eligible.length}</strong>. Chỉ đơn ở trạng thái Đã đóng gói được chuyển sang Đang giao.</p>
      {ineligible.length ? <ul className="max-h-40 overflow-y-auto rounded-control border border-outline-variant p-3 font-body text-caption text-on-surface-variant">{ineligible.map((order) => <li key={order.id}>{order.reference}: hiện ở trạng thái {order.status}</li>)}</ul> : null}
      {orders.length>50 ? <p className="font-body text-caption text-error">Mỗi lần chỉ được chọn tối đa 50 đơn.</p> : null}
      <p className="font-body text-caption text-graphite">Nếu một đơn không còn đủ điều kiện khi xác nhận, toàn bộ thao tác sẽ bị từ chối và không đơn nào đổi trạng thái.</p>
      {error ? <p role="alert" className="rounded-control bg-error-container p-3 font-body text-body-sm text-on-error-container">{error}</p> : null}
      {success!==null ? <p role="status" className="font-body text-body-sm text-on-surface">Đã ghi nhận bàn giao cho {success} đơn.</p> : null}
    </div>
  </Modal>;
}
