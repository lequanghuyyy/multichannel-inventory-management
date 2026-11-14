import { useEffect, useState, type FormEvent } from 'react';
import { presentApiError } from '../../../../core/api-error';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';

export interface AdjustmentFormValue {
	countedOnHand: number;
	expectedVersion: number;
  reason: string;
}

interface InventoryAdjustmentModalProps {
  open: boolean;
  sku: string;
  submitting: boolean;
  error: unknown;
	currentOnHand: number;
	version: number;
  onClose: () => void;
  onSubmit: (value: AdjustmentFormValue) => void;
}

export function InventoryAdjustmentModal({ currentOnHand, error, onClose, onSubmit, open, sku, submitting, version }: InventoryAdjustmentModalProps) {
	const [counted, setCounted] = useState('');
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState<{ quantity?: string; reason?: string }>({});

  useEffect(() => {
    if (!open) return;
	setCounted('');
    setReason('');
    setValidation({});
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
	const countedOnHand = Number(counted);
    const nextValidation: typeof validation = {};
	if (!Number.isSafeInteger(countedOnHand) || countedOnHand < 0) nextValidation.quantity = 'Nhập số nguyên từ 0 trở lên.';
    if (!reason.trim()) nextValidation.reason = 'Lý do là bắt buộc.';
	if (version < 1) nextValidation.quantity = 'Chưa có phiên bản tồn kho hợp lệ để kiểm kê.';
	if (countedOnHand === currentOnHand) nextValidation.quantity = 'Số kiểm đếm bằng tồn hệ thống, không cần điều chỉnh.';
    setValidation(nextValidation);
    if (Object.keys(nextValidation).length > 0) return;
	onSubmit({ countedOnHand, expectedVersion: version, reason: reason.trim() });
  };

  const apiPresentation = error ? presentApiError(error) : null;

  return (
	<Modal open={open} onClose={submitting ? () => undefined : onClose} title="Điều chỉnh tồn sau kiểm kê" description={`SKU ${sku}. Chỉ dùng số lượng đã kiểm đếm thực tế; nhập hàng và bán hàng vẫn thực hiện ở quy trình riêng.`}>
      <form className="grid gap-4" onSubmit={submit} noValidate>
        {apiPresentation ? <div className="rounded-control border border-error/20 bg-error-container/40 p-3 font-body text-body-sm text-error" role="alert"><strong className="block">{apiPresentation.title}</strong><span className="mt-1 block">{apiPresentation.detail}</span>{apiPresentation.requestId ? <code className="mt-2 block text-caption">Mã yêu cầu: {apiPresentation.requestId}</code> : null}</div> : null}
			<div className="grid grid-cols-3 gap-3 rounded-control bg-surface-container-low p-3 text-center font-body text-caption"><div><span className="block text-graphite">Tồn hệ thống</span><strong className="mt-1 block font-mono text-lg text-on-surface">{currentOnHand}</strong></div><div><span className="block text-graphite">Chênh lệch</span><strong className={`mt-1 block font-mono text-lg ${Number(counted) - currentOnHand < 0 ? 'text-error' : 'text-badge-progress-text'}`}>{counted === '' || !Number.isFinite(Number(counted)) ? '—' : `${Number(counted) - currentOnHand > 0 ? '+' : ''}${Number(counted) - currentOnHand}`}</strong></div><div><span className="block text-graphite">Tồn dự kiến</span><strong className="mt-1 block font-mono text-lg text-on-surface">{counted === '' || !Number.isSafeInteger(Number(counted)) ? '—' : Number(counted)}</strong></div></div>
			<Input label="Số lượng kiểm đếm thực tế" type="number" min="0" step="1" inputMode="numeric" value={counted} onChange={(event) => setCounted(event.target.value)} error={validation.quantity} disabled={submitting} placeholder={`Hiện tại ${currentOnHand}`} />
			<Input label="Nguyên nhân kiểm kê" value={reason} onChange={(event) => setReason(event.target.value)} error={validation.reason} disabled={submitting} placeholder="Ví dụ: Thiếu hàng khi kiểm đếm kệ A2" maxLength={500} />
			<p className="font-body text-caption leading-5 text-graphite">Phiên bản tồn {version}. Máy chủ sẽ từ chối nếu số liệu đã thay đổi trước lúc xác nhận.</p>
			<div className="mt-2 flex flex-wrap justify-end gap-3 border-t border-outline-variant/60 pt-4"><Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>Hủy</Button><Button type="submit" loading={submitting} disabled={submitting || counted === '' || Number(counted) === currentOnHand}>{submitting ? 'Đang ghi nhận…' : 'Xác nhận kiểm kê'}</Button></div>
      </form>
    </Modal>
  );
}
