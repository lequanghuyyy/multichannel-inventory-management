import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';
import { CopyButton } from './CopyButton';
import { formatOrderTime } from '../order.utils';
import {
  apiFulfillmentLabels,
  apiStatusPresentation,
  channelName,
  getChannelSyncState,
  paymentLabel,
  unifiedShippingStatusLabels,
  type ApiOrderTransitionTarget,
  type OrderApiRow,
} from '../order.api';

export interface OrderDetailHeaderProps {
  order: OrderApiRow;
  onNextAction: (target: ApiOrderTransitionTarget) => void;
  onPrintSale: () => void;
  onPrintPacking: () => void;
  canPrintPacking: boolean;
  busy?: boolean;
}

function getNextActionTarget(status: OrderApiRow['status']): {
  target: ApiOrderTransitionTarget;
  label: string;
} | null {
  switch (status) {
    case 'placed':
      return { target: 'confirmed', label: 'Xác nhận đơn' };
    case 'confirmed':
      return { target: 'packed', label: 'Chuẩn bị & Đóng gói' };
    case 'packed':
      return { target: 'shipped', label: 'Bàn giao vận chuyển' };
    case 'shipped':
      return { target: 'delivered', label: 'Xác nhận đã giao hàng' };
    default:
      return null;
  }
}

export function OrderDetailHeader({
  order,
  onNextAction,
  onPrintSale,
  onPrintPacking,
  canPrintPacking,
  busy = false,
}: OrderDetailHeaderProps) {
  const isPos = order.channelCode === 'pos';
  const nextActionMeta = getNextActionTarget(order.status);
  const nextActionLabel = nextActionMeta
    ? isPos && nextActionMeta.target === 'shipped'
      ? 'Bàn giao tại quầy'
      : isPos && nextActionMeta.target === 'delivered'
      ? 'Hoàn tất đơn hàng'
      : nextActionMeta.label
    : null;

  const syncState = getChannelSyncState(order);
  const deliveryStatusKey = order.unifiedShipping?.delivery_status ?? 'pending_preparation';
  const deliveryStatusLabel =
    unifiedShippingStatusLabels[deliveryStatusKey]?.label ??
    apiFulfillmentLabels[order.fulfillmentStatus];
  const deliveryStatusTone =
    unifiedShippingStatusLabels[deliveryStatusKey]?.tone ?? 'neutral';
  const channelOrder = !isPos && Boolean(order.channelId || order.externalId);
  const manualWooPayment = order.channelCode === 'woocommerce' ? order.paymentObservations.find((entry) =>
    entry.source === 'manual' && entry.external_status === 'paid') : undefined;
  const externalPayment = order.paymentObservations.find((entry) => entry.source === 'webhook' || entry.source === 'polling');
  const externalPaymentStatus = (manualWooPayment?.external_status ?? externalPayment?.external_status ?? order.externalSnapshot?.payment_status ?? '').toLowerCase();
  const paymentBadge = !channelOrder
    ? { label: paymentLabel(order.paymentStatus), tone: order.paymentStatus === 'paid' ? 'success' as const : order.paymentStatus === 'pending' ? 'warning' as const : 'danger' as const }
    : manualWooPayment
    ? { label: 'Đã nhận tiền · nhân viên xác nhận', tone: 'success' as const }
    : ['paid', 'success', 'succeeded'].includes(externalPaymentStatus)
    ? { label: 'Nền tảng ghi nhận đã thanh toán', tone: 'success' as const }
    : ['pending', 'on-hold', 'unpaid', 'authorized'].includes(externalPaymentStatus)
    ? { label: externalPaymentStatus === 'on-hold' ? 'Chờ xác nhận đã nhận tiền' : 'Chờ thanh toán', tone: 'warning' as const }
    : ['failed', 'failure'].includes(externalPaymentStatus)
    ? { label: 'Thanh toán lỗi', tone: 'danger' as const }
    : { label: externalPaymentStatus || 'Chưa có dữ liệu thanh toán', tone: 'neutral' as const };

  return (
    <header className="relative grid gap-5 rounded-lg border border-metric-ink bg-channel-paper p-5 shadow-metric sm:p-7">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-channel-accent"
      />

      {/* Top Bar: Navigation & Channel Brand Identity */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <a
          href="/orders"
          className="inline-flex items-center gap-1.5 font-body text-body-sm font-semibold text-graphite hover:text-on-surface"
        >
          <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
            arrow_back
          </span>
          <span>Danh sách đơn hàng</span>
        </a>

        {/* Channel Brand Tag */}
        <div className="flex items-center gap-2 rounded-control bg-pure-white/80 px-3 py-1.5 border border-outline-variant/60 shadow-sm">
          <div className="size-6 shrink-0 grid place-items-center">
            <ChannelBrandIcon code={order.channelCode} />
          </div>
          <span className="font-body text-caption font-bold text-on-surface">
            {channelName(order.channelCode)}
          </span>
          {order.shopId ? (
            <span className="font-mono text-[11px] text-graphite">
              · {order.shopId.slice(0, 8)}
            </span>
          ) : null}
        </div>
      </div>

      {/* Main Order Identity & Action Toolbar */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <span className="font-body text-caption font-bold uppercase tracking-[0.14em] text-channel-accent">
            Chi tiết đơn hàng
          </span>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="break-all font-display text-[clamp(1.75rem,3.5vw,2.75rem)] font-bold leading-tight tracking-tight text-on-surface">
              {order.reference}
            </h1>
            <CopyButton text={order.reference} label="Sao chép mã đơn hàng" className="size-8" />
          </div>

          {/* External Reference & Placed Date */}
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 font-body text-caption text-graphite">
            <div className="flex items-center gap-1.5">
              <span>Mã trên sàn:</span>
              {order.externalId ? (
                <>
                  <code className="font-mono font-bold text-on-surface">
                    {order.externalSnapshot?.external_order_number ?? order.externalId}
                  </code>
                  <CopyButton
                    text={order.externalSnapshot?.external_order_number ?? order.externalId}
                    label="Sao chép mã đơn trên sàn"
                  />
                </>
              ) : (
                <span className="italic">Không có (Đơn nội bộ)</span>
              )}
            </div>
            <span>·</span>
            <div>
              <span>Ngày đặt: </span>
              <strong className="text-on-surface">{formatOrderTime(order.placedAt)}</strong>
            </div>
            <span>·</span>
            <div>
              <span>Cập nhật: </span>
              <strong className="text-on-surface">{formatOrderTime(order.updatedAt)}</strong>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-wrap items-center gap-2.5 pt-1 lg:pt-0">
          {/* Primary Next Action */}
          {nextActionMeta ? (
            <Button
              variant="primary"
              size="md"
              loading={busy}
              disabled={busy}
              onClick={() => onNextAction(nextActionMeta.target)}
              className="font-bold shadow-sm"
            >
              <span className="material-symbols-outlined text-[18px] mr-1" aria-hidden="true">
                arrow_forward
              </span>
              {nextActionLabel}
            </Button>
          ) : null}

          {order.items.length > 0 ? <Button variant="secondary" size="md" onClick={onPrintSale} className="font-semibold">
            <span className="material-symbols-outlined text-[18px] mr-1" aria-hidden="true">print</span>
            In phiếu bán hàng
          </Button> : null}
          {canPrintPacking ? <Button variant="secondary" size="md" onClick={onPrintPacking} className="font-semibold">
            <span className="material-symbols-outlined text-[18px] mr-1" aria-hidden="true">checklist</span>
            Phiếu soạn hàng
          </Button> : null}

          {/* Cancellation lives in the overview tab as an inline form: one "Hủy đơn" control,
              disabled until a reason is typed, so a cashier cannot fire a restocking cancel
              without leaving the only record of why. */}
        </div>
      </div>

      {/* 4 Status Dimensions Grid */}
      <div className="border-t border-outline-variant/60 pt-4">
        <span className="block font-body text-[11px] font-bold uppercase tracking-wider text-graphite mb-2.5">
          Trạng thái 4 chiều nghiệp vụ
        </span>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          {/* 1. Core Order Lifecycle */}
          <div className="flex flex-col gap-1 rounded-control bg-pure-white/90 p-3 border border-outline-variant/50">
            <span className="font-body text-caption text-graphite">1. Xử lý đơn (Core)</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <StatusBadge tone={apiStatusPresentation[order.status].tone}>
                {apiStatusPresentation[order.status].label}
              </StatusBadge>
            </div>
          </div>

          {/* 2. Payment Status */}
          <div className="flex flex-col gap-1 rounded-control bg-pure-white/90 p-3 border border-outline-variant/50">
            <span className="font-body text-caption text-graphite">{channelOrder ? '2. Thanh toán nguồn' : '2. Thanh toán Core'}</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <StatusBadge tone={paymentBadge.tone}>{paymentBadge.label}</StatusBadge>
            </div>
          </div>

          {/* 3. Delivery / Unified Shipping */}
          <div className="flex flex-col gap-1 rounded-control bg-pure-white/90 p-3 border border-outline-variant/50">
            <span className="font-body text-caption text-graphite">3. Giao hàng thực tế</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <StatusBadge tone={deliveryStatusTone}>
                {deliveryStatusLabel}
              </StatusBadge>
            </div>
          </div>

          {/* 4. Channel Synchronization */}
          <div className="flex flex-col gap-1 rounded-control bg-pure-white/90 p-3 border border-outline-variant/50">
            <span className="font-body text-caption text-graphite">4. Đồng bộ kênh bán</span>
            <div className="flex items-center gap-1.5 mt-0.5">
              <StatusBadge tone={syncState.tone}>
                {syncState.label}
              </StatusBadge>
            </div>
          </div>
        </div>

        {/* Cancellation Notice if Cancelled */}
        {order.cancelledReason ? (
          <div className="mt-3 flex items-start gap-2.5 rounded-control border border-danger/40 bg-danger/10 p-3 text-on-surface">
            <span className="material-symbols-outlined text-[18px] text-danger shrink-0 mt-0.5" aria-hidden="true">
              cancel
            </span>
            <div className="font-body text-caption">
              <strong>Đơn hàng đã hủy:</strong>{' '}
              <span className="font-medium text-danger">{order.cancelledReason}</span>
              <p className="mt-0.5 text-graphite">
                Toàn bộ {order.itemCount} sản phẩm đã được tự động hoàn trả lại tồn kho khả dụng (ATS).
              </p>
            </div>
          </div>
        ) : null}

      </div>
    </header>
  );
}
