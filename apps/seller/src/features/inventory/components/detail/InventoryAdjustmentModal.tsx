import { useEffect, useState, type FormEvent } from 'react';
import { presentApiError } from '../../../../core/api-error';
import { Button } from '../../../../components/ui/Button';
import { Input } from '../../../../components/ui/Input';
import { Modal } from '../../../../components/ui/Modal';

export interface AdjustmentFormValue {
  delta: number;
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

export function InventoryAdjustmentModal({
  currentOnHand,
  error,
  onClose,
  onSubmit,
  open,
  sku,
  submitting,
  version,
}: InventoryAdjustmentModalProps) {
  const [type, setType] = useState<'increase' | 'decrease'>('increase');
  const [quantity, setQuantity] = useState('');
  const [reason, setReason] = useState('');
  const [validation, setValidation] = useState<{ quantity?: string; reason?: string }>({});

  useEffect(() => {
    if (!open) return;
    setType('increase');
    setQuantity('');
    setReason('');
    setValidation({});
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;

    const parsedQty = Number(quantity);
    const nextValidation: typeof validation = {};
    if (!quantity.trim() || !Number.isInteger(parsedQty) || parsedQty <= 0) {
      nextValidation.quantity = 'Nhập số lượng nguyên lớn hơn 0.';
    }
    if (!reason.trim()) {
      nextValidation.reason = 'Lý do là bắt buộc.';
    }
    setValidation(nextValidation);
    if (Object.keys(nextValidation).length > 0) return;

    const delta = type === 'decrease' ? -Math.abs(parsedQty) : Math.abs(parsedQty);
    onSubmit({ delta, reason: reason.trim() });
  };

  const apiPresentation = error ? presentApiError(error) : null;
  const parsedQty = Number(quantity);
  const isValidQty = quantity.trim() !== '' && Number.isInteger(parsedQty) && parsedQty > 0;
  const delta = isValidQty ? (type === 'decrease' ? -parsedQty : parsedQty) : 0;
  const projectedOnHand = isValidQty ? currentOnHand + delta : currentOnHand;

  return (
    <Modal
      open={open}
      onClose={submitting ? () => undefined : onClose}
      title="Điều chỉnh tồn kho"
      description={`SKU ${sku}. Nhập biến động tồn thực tế kèm lý do bắt buộc.`}
    >
      <form className="grid gap-4" onSubmit={submit} noValidate>
        {apiPresentation ? (
          <div className="rounded-control border border-error/20 bg-error-container/40 p-3 font-body text-body-sm text-error" role="alert">
            <strong className="block">{apiPresentation.title}</strong>
            <span className="mt-1 block">{apiPresentation.detail}</span>
            {apiPresentation.requestId ? <code className="mt-2 block text-caption">Mã yêu cầu: {apiPresentation.requestId}</code> : null}
          </div>
        ) : null}

        <div className="grid grid-cols-3 gap-3 rounded-control bg-surface-container-low p-3 text-center font-body text-caption">
          <div>
            <span className="block text-graphite">Tồn hiện tại</span>
            <strong className="mt-1 block font-mono text-lg text-on-surface">{currentOnHand}</strong>
          </div>
          <div>
            <span className="block text-graphite">Biến động</span>
            <strong className={`mt-1 block font-mono text-lg ${delta < 0 ? 'text-error' : delta > 0 ? 'text-badge-progress-text' : 'text-graphite'}`}>
              {isValidQty ? `${delta > 0 ? '+' : ''}${delta}` : '—'}
            </strong>
          </div>
          <div>
            <span className="block text-graphite">Tồn dự kiến</span>
            <strong className="mt-1 block font-mono text-lg text-on-surface">
              {isValidQty ? projectedOnHand : '—'}
            </strong>
          </div>
        </div>

        <label htmlFor="adjust-type" className="grid gap-1 font-body text-caption font-semibold text-on-surface-variant">
          Loại điều chỉnh
          <select
            id="adjust-type"
            className="min-h-10 rounded-control border border-outline-variant bg-pure-white px-3 text-body-sm text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
            value={type}
            onChange={(event) => setType(event.target.value as 'increase' | 'decrease')}
            disabled={submitting}
          >
            <option value="increase">Tăng tồn kho (+)</option>
            <option value="decrease">Giảm tồn kho (-)</option>
          </select>
        </label>

        <Input
          id="adjust-quantity"
          label="Số lượng"
          type="number"
          min="1"
          step="1"
          value={quantity}
          onChange={(event) => setQuantity(event.target.value)}
          error={validation.quantity}
          disabled={submitting}
          placeholder="Nhập số lượng"
        />

        <Input
          id="adjust-reason"
          label="Lý do"
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          error={validation.reason}
          disabled={submitting}
          placeholder="Ví dụ: Hàng lỗi, kiểm kê định kỳ"
          maxLength={255}
        />

        <p className="font-body text-caption leading-5 text-graphite">
          Phiên bản tồn {version}. Thao tác này ghi nhật ký kiểm kê và thay đổi tồn kho trực tiếp trên máy chủ.
        </p>

        <div className="mt-2 flex flex-wrap justify-end gap-3 border-t border-outline-variant/60 pt-4">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Hủy
          </Button>
          <Button type="submit" loading={submitting} disabled={submitting}>
            Xác nhận điều chỉnh
          </Button>
        </div>
      </form>
    </Modal>
  );
}
