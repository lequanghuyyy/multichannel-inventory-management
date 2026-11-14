import { useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ApiRequestError } from '../../../core/api-error';
import { transitionOrder } from '../../../api/orders';
import {
  type ApiOrderStatus,
  type ApiOrderTransitionTarget,
  type OrderApiRow,
} from '../order.api';

const LIFECYCLE_STEPS: { status: ApiOrderStatus; label: string; icon: string }[] = [
  { status: 'placed', label: 'Mới đặt', icon: 'receipt_long' },
  { status: 'confirmed', label: 'Đã xác nhận', icon: 'check_circle' },
  { status: 'packed', label: 'Đã đóng gói', icon: 'inventory_2' },
  { status: 'shipped', label: 'Đang giao', icon: 'local_shipping' },
  { status: 'delivered', label: 'Đã giao', icon: 'task_alt' },
];

function stepIndex(status: ApiOrderStatus): number {
  switch (status) {
    case 'placed':
      return 0;
    case 'confirmed':
      return 1;
    case 'packed':
      return 2;
    case 'shipped':
      return 3;
    case 'delivered':
      return 4;
    case 'cancelled':
      return -1;
    default:
      return 0;
  }
}

function getNextActionMeta(order: OrderApiRow) {
  const isPos = order.channelCode === 'pos';
  switch (order.status) {
    case 'placed':
      return {
        label: 'Xác nhận đơn hàng',
        description: 'Kiểm tra thông tin khách hàng, số lượng và xác nhận để bắt đầu xử lý kho.',
        target: 'confirmed' as ApiOrderTransitionTarget,
        buttonVariant: 'primary' as const,
      };
    case 'confirmed':
      return {
        label: 'Chuẩn bị & Đóng gói',
        description: 'Lấy sản phẩm từ vị trí kho, kiểm tra số lượng và đóng gói niêm phong kiện hàng.',
        target: 'packed' as ApiOrderTransitionTarget,
        buttonVariant: 'primary' as const,
      };
    case 'packed':
      return {
        label: isPos ? 'Bàn giao cho khách tại quầy' : 'Bàn giao vận chuyển',
        description: isPos
          ? 'Kiện hàng đã chuẩn bị xong, tiến hành bàn giao trực tiếp cho khách mua tại quầy.'
          : order.channelCode === 'shopify' || order.channelCode === 'ebay'
          ? 'Đã đóng gói hoàn tất. Bạn có thể bàn giao vận chuyển nội bộ hoặc gửi yêu cầu fulfillment lên sàn.'
          : 'Bàn giao kiện hàng cho đơn vị vận chuyển và xác nhận xuất kho.',
        target: 'shipped' as ApiOrderTransitionTarget,
        buttonVariant: 'primary' as const,
      };
    case 'shipped':
      return {
        label: isPos ? 'Hoàn tất đơn hàng' : 'Xác nhận đã giao hàng',
        description: isPos
          ? 'Khách hàng đã nhận đủ sản phẩm và hoàn tất đơn tại quầy.'
          : 'Xác nhận kiện hàng đã được giao thành công đến tay người nhận.',
        target: 'delivered' as ApiOrderTransitionTarget,
        buttonVariant: 'primary' as const,
      };
    default:
      return null;
  }
}

function keyFor(orderId: string, toStatus: ApiOrderTransitionTarget): string {
  return `order-ui-${orderId}-${toStatus}`;
}

export function OrderApiLifecycleActions({
  order,
  onApplied,
  onError,
}: {
  order: OrderApiRow;
  onApplied: () => void;
  onError: (error: unknown) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [reasonError, setReasonError] = useState('');

  const currentStep = stepIndex(order.status);
  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';
  const nextAction = getNextActionMeta(order);

  // Cancellation guard from read model or fallback
  const guard = order.cancellationGuard;
  const canCancel = guard ? guard.can_cancel : (order.status === 'placed' || order.status === 'confirmed' || order.status === 'packed');

  const move = async (toStatus: ApiOrderTransitionTarget, withReason?: string) => {
    setBusy(true);
    try {
      await transitionOrder(
        order.id,
        withReason ? { status: toStatus, reason: withReason } : { status: toStatus },
        keyFor(order.id, toStatus),
      );
      setCancelModalOpen(false);
      setReason('');
      setReasonError('');
      onApplied();
    } catch (error) {
      onError(error instanceof ApiRequestError ? error : new Error((error as Error).message));
    } finally {
      setBusy(false);
    }
  };

  const handleConfirmCancel = () => {
    const trimmed = reason.trim();
    if (!trimmed) {
      setReasonError('Vui lòng nhập lý do hủy đơn (bắt buộc).');
      return;
    }
    if (trimmed.length > 500) {
      setReasonError('Lý do hủy không được vượt quá 500 ký tự.');
      return;
    }
    setReasonError('');
    void move('cancelled', trimmed);
  };

  return (
    <Card className="grid gap-5 border border-metric-ink p-5 shadow-metric ring-0 sm:p-6" aria-label="Hành động tiếp theo">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/40 pb-4">
        <div>
          <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">
            Quy trình xử lý đơn
          </span>
          <h2 className="mt-1 font-display text-xl font-bold text-on-surface">
            Hành động tiếp theo
          </h2>
        </div>
        <StatusBadge tone={isCancelled ? 'danger' : isDelivered ? 'success' : 'neutral'}>
          {isCancelled ? 'Đã hủy đơn' : isDelivered ? 'Đã hoàn tất' : `Bước ${currentStep + 1}/5`}
        </StatusBadge>
      </div>

      {/* Visual Stepper for active orders */}
      {!isCancelled ? (
        <nav aria-label="Tiến trình xử lý đơn hàng" className="pt-1 pb-2">
          <ol className="grid grid-cols-5 gap-2 text-center font-body text-caption">
            {LIFECYCLE_STEPS.map((step, idx) => {
              const isPast = currentStep > idx;
              const isCurrent = currentStep === idx;
              return (
                <li key={step.status} className="flex flex-col items-center">
                  <div
                    className={`grid size-9 place-items-center rounded-full border text-sm transition-colors ${
                      isCurrent
                        ? 'border-channel-accent bg-channel-accent text-pure-white font-bold ring-4 ring-channel-accent/20'
                        : isPast
                        ? 'border-carbon bg-carbon text-pure-white'
                        : 'border-outline-variant bg-surface-container text-graphite'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                      {isPast ? 'check' : step.icon}
                    </span>
                  </div>
                  <span
                    className={`mt-2 block text-[11px] leading-tight font-medium ${
                      isCurrent
                        ? 'font-bold text-on-surface'
                        : isPast
                        ? 'text-on-surface'
                        : 'text-graphite/70'
                    }`}
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      ) : (
        <div className="flex items-start gap-3 rounded-control border border-danger/40 bg-danger/10 p-4 text-on-surface">
          <span className="material-symbols-outlined text-[22px] text-danger" aria-hidden="true">
            cancel
          </span>
          <div className="font-body text-caption">
            <strong className="block font-bold text-danger">Đơn hàng đã được hủy</strong>
            <p className="mt-1 text-on-surface">
              Lý do hủy: <span className="font-semibold">{order.cancelledReason || 'Không ghi nhận lý do'}</span>
            </p>
            <p className="mt-0.5 text-graphite">
              Toàn bộ {order.itemCount} sản phẩm đã được tự động hoàn trả lại tồn kho khả dụng (ATS).
            </p>
          </div>
        </div>
      )}

      {/* Contextual Next Primary Action */}
      {nextAction ? (
        <div className="rounded-control border border-channel-accent/30 bg-channel-accent/5 p-4 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="max-w-md">
              <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">
                Bước kế tiếp cần thực hiện
              </span>
              <h3 className="mt-0.5 font-display text-base font-bold text-on-surface">
                {nextAction.label}
              </h3>
              <p className="mt-1 font-body text-caption text-graphite leading-relaxed">
                {nextAction.description}
              </p>
            </div>
            <Button
              variant="primary"
              size="md"
              loading={busy}
              disabled={busy}
              onClick={() => void move(nextAction.target)}
              className="shrink-0 font-semibold"
            >
              {nextAction.label} →
            </Button>
          </div>
        </div>
      ) : null}

      {/* Terminal Delivered message */}
      {isDelivered ? (
        <div className="rounded-control border border-outline-variant/60 bg-surface-container-low p-4 font-body text-caption text-graphite">
          <div className="flex items-center gap-2 font-semibold text-on-surface">
            <span className="material-symbols-outlined text-[18px] text-carbon" aria-hidden="true">
              task_alt
            </span>
            <span>Đơn hàng đã hoàn tất giao hàng</span>
          </div>
          <p className="mt-1.5 leading-relaxed">
            Mọi nghĩa vụ xử lý và vận chuyển đã hoàn thành. Nếu khách hàng có yêu cầu bảo hành hoặc khiếu nại, vui lòng tạo phiếu tiếp nhận ở phần <strong>Đổi/Trả hàng</strong> bên dưới.
          </p>
        </div>
      ) : null}

      {/* Secondary Action: Cancellation Area */}
      {!isCancelled && !isDelivered ? (
        <div className="border-t border-outline-variant/40 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="block font-body text-caption font-semibold text-on-surface">
                Hủy đơn hàng
              </span>
              <p className="mt-0.5 font-body text-caption text-graphite">
                {canCancel
                  ? 'Chỉ thực hiện khi khách yêu cầu hủy hoặc không thể giao dịch.'
                  : 'Không thể hủy đơn hàng ở trạng thái hiện tại.'}
              </p>
            </div>
            <div>
              <Button
                variant="secondary"
                size="sm"
                disabled={busy || !canCancel}
                onClick={() => setCancelModalOpen(true)}
              >
                Hủy đơn hàng...
              </Button>
            </div>
          </div>

        </div>
      ) : null}

      {/* Dedicated Cancellation Modal */}
      <Modal
        open={cancelModalOpen}
        onClose={() => {
          if (!busy) {
            setCancelModalOpen(false);
            setReasonError('');
          }
        }}
        title={`Xác nhận hủy đơn hàng ${order.reference}`}
        description="Thao tác hủy đơn sẽ hoàn trả số lượng hàng về kho và không thể hoàn tác."
        footer={
          <div className="flex flex-wrap justify-end gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              disabled={busy}
              onClick={() => {
                setCancelModalOpen(false);
                setReasonError('');
              }}
            >
              Hủy bỏ
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              disabled={busy || reason.trim().length === 0}
              onClick={handleConfirmCancel}
            >
              Xác nhận hủy đơn
            </Button>
          </div>
        }
      >
        <div className="grid gap-4">
          {/* Inventory Impact Alert */}
          <div className="flex items-start gap-3 rounded-control border border-warning/40 bg-warning/10 p-3.5 text-on-surface">
            <span className="material-symbols-outlined text-[20px] text-warning" aria-hidden="true">
              warning
            </span>
            <div className="font-body text-caption leading-relaxed">
              <strong className="block font-semibold text-warning">
                Cảnh báo tác động tồn kho:
              </strong>
              <p className="mt-0.5">
                Toàn bộ <strong>{order.itemCount} sản phẩm</strong> ({order.items.length} mặt hàng) đã giữ chỗ sẽ được tự động <strong>HOÀN TRẢ LẠI TỒN KHO KHẢ DỤNG (ATS)</strong>.
              </p>
              <p className="mt-1 text-graphite">
                Thao tác này sẽ ghi nhận lý do vào nhật ký kiểm toán và kích hoạt đồng bộ tồn kho tới các kênh bán đã kết nối.
              </p>
            </div>
          </div>

          {/* Reason Input */}
          <div className="grid gap-1.5">
            <div className="flex items-center justify-between">
              <label htmlFor={`cancel-modal-reason-${order.id}`} className="font-body text-caption font-semibold text-on-surface">
                Lý do hủy đơn <span className="text-danger">*</span>
              </label>
              <span className="font-mono text-[11px] text-graphite">
                {reason.length}/500
              </span>
            </div>
            <textarea
              id={`cancel-modal-reason-${order.id}`}
              className="min-h-24 w-full rounded-control border border-outline-variant bg-pure-white p-3 font-body text-sm text-on-surface outline-none focus:border-channel-accent focus:ring-1 focus:ring-channel-accent"
              value={reason}
              onChange={(e) => {
                setReason(e.target.value);
                if (reasonError && e.target.value.trim().length > 0) {
                  setReasonError('');
                }
              }}
              placeholder="Nhập lý do chi tiết: Khách yêu cầu hủy, hết hàng tại kho, sai lệch thông tin địa chỉ..."
              maxLength={500}
              disabled={busy}
            />
            {reasonError ? (
              <span className="font-body text-caption text-danger">{reasonError}</span>
            ) : null}
          </div>
        </div>
      </Modal>
    </Card>
  );
}
