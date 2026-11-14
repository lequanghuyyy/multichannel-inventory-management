import { useMemo, useRef, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { commitBulkInventoryAdjustment, previewBulkInventoryAdjustment, type BulkAdjustLineInput, type BulkPreviewResponse } from '../../../api/inventory';
import type { InventoryLedgerRow } from '../inventory.types';

export interface InventoryBulkAdjustmentModalProps {
  open: boolean;
  rows: InventoryLedgerRow[];
  onClose: () => void;
  onCommitted: () => void;
}

function newIdempotencyKey(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `bulk-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function InventoryBulkAdjustmentModal({ open, rows, onClose, onCommitted }: InventoryBulkAdjustmentModalProps) {
  const [deltas, setDeltas] = useState<Record<string, string>>({});
  const [reason, setReason] = useState('');
  const [preview, setPreview] = useState<BulkPreviewResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const idempotencyKey = useRef<string | null>(null);
  const inputs = useMemo<BulkAdjustLineInput[]>(() => rows.map((row) => ({ sku: row.sku, delta: Number(deltas[row.id] ?? 0), expected_version: row.version ?? 0 })), [deltas, rows]);
  const validInput = rows.length > 0 && rows.length <= 100 && reason.trim().length > 0 && inputs.every((item) => Number.isInteger(item.delta) && item.delta !== 0 && item.expected_version > 0);

  const runPreview = async () => {
    setBusy(true); setError(null); setSaved(false);
    idempotencyKey.current = null;
    try { setPreview(await previewBulkInventoryAdjustment({ reason, items: inputs })); }
    catch (cause) { setPreview(null); setError(cause instanceof Error ? cause.message : 'Không thể xem trước điều chỉnh.'); }
    finally { setBusy(false); }
  };

  const commit = async () => {
    if (!preview?.valid) return;
    setBusy(true); setError(null);
    try {
      idempotencyKey.current ??= newIdempotencyKey();
      await commitBulkInventoryAdjustment({ reason, items: inputs }, idempotencyKey.current);
      idempotencyKey.current = null;
      setSaved(true); onCommitted();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể lưu điều chỉnh.');
      if (cause instanceof Error && /thay đổi|stale|version|changed/i.test(cause.message)) { setPreview(null); idempotencyKey.current = null; }
    } finally { setBusy(false); }
  };

  return <Modal open={open} onClose={busy ? () => undefined : onClose} title="Điều chỉnh tồn kho hàng loạt" description="Xem trước số tồn mới trước khi xác nhận. Tất cả SKU được lưu trong một giao dịch." className="max-w-3xl"
    footer={<><Button variant="secondary" disabled={busy} onClick={onClose}>Đóng</Button>{preview?.valid && !saved ? <Button disabled={busy} loading={busy} onClick={() => void commit()}>Xác nhận điều chỉnh</Button> : <Button disabled={!validInput || busy} loading={busy} onClick={() => void runPreview()}>Xem trước</Button>}</>}>
    <div className="grid gap-4">
      {rows.length > 100 ? <p role="alert" className="rounded-control bg-error-container p-3 text-body-sm text-error">Chỉ có thể điều chỉnh tối đa 100 SKU mỗi lần. Hãy bỏ bớt lựa chọn.</p> : null}
      <div className="grid max-h-72 gap-2 overflow-auto rounded-control border border-outline-variant p-3">
        {rows.map((row) => <div key={row.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 border-b border-outline-variant/50 pb-2 last:border-0 last:pb-0">
          <div className="min-w-0"><strong className="block truncate text-body-sm">{row.productName}</strong><code className="text-caption text-graphite">{row.sku} · hiện có {row.onHand}</code></div>
          <Input aria-label={`Điều chỉnh số lượng ${row.sku}`} type="number" step="1" value={deltas[row.id] ?? ''} placeholder="± số lượng" onChange={(event) => { setDeltas((current) => ({ ...current, [row.id]: event.target.value })); setPreview(null); setSaved(false); idempotencyKey.current = null; }} />
        </div>)}
      </div>
      <Input label="Lý do điều chỉnh" value={reason} maxLength={500} placeholder="Ví dụ: kiểm kê kho ngày…" onChange={(event) => { setReason(event.target.value); setPreview(null); setSaved(false); idempotencyKey.current = null; }} />
      {preview ? <div className="grid gap-2 rounded-control bg-surface-container-low p-3" aria-live="polite"><strong className="text-body-sm">{preview.valid ? 'Có thể áp dụng toàn bộ thay đổi' : 'Cần sửa các dòng chưa hợp lệ'}</strong>{preview.items.map((item) => <p key={item.sku} className="text-caption text-graphite"><code>{item.sku}</code>: {item.current_on_hand} → {item.projected_on_hand} {item.valid ? '· hợp lệ' : `· ${item.errors.join('; ')}`}</p>)}</div> : null}
      {error ? <p role="alert" className="text-body-sm text-error">{error}</p> : null}
      {saved ? <p role="status" className="text-body-sm text-success">Đã điều chỉnh thành công. Danh sách tồn kho đã được làm mới.</p> : null}
    </div>
  </Modal>;
}
