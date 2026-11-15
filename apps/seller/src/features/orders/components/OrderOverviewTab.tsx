import { useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { CopyButton } from './CopyButton';
import { OrderItemsTable } from './OrderItemsTable';
import { OrderFinancialPaymentSection } from './OrderFinancialPaymentSection';
import { OrderUnifiedShippingSection } from './OrderUnifiedShippingSection';
import { ShopifyFulfillmentPanel } from './ShopifyFulfillmentPanel';
import { EbayFulfillmentPanel } from './EbayFulfillmentPanel';
import { WooCommerceOrderLifecyclePanel } from './WooCommerceOrderLifecyclePanel';
import { formatOrderTime } from '../order.utils';
import {
  channelName,
  type ApiOrderStatus,
  type ApiOrderTransitionTarget,
  type OrderApiRow,
} from '../order.api';

export interface OrderOverviewTabProps {
  order: OrderApiRow;
  onNextAction: (target: ApiOrderTransitionTarget) => void;
  /** Cancels with the typed reason; resolves to whether the server accepted it. */
  onCancel: (reason: string) => Promise<boolean>;
  onOpenPaymentModal: () => void;
  onShopifyUpdated?: () => void;
  busy?: boolean;
}

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
        description: 'Kiểm tra mặt hàng và xác nhận đơn để chuyển bộ phận kho chuẩn bị hàng.',
        target: 'confirmed' as ApiOrderTransitionTarget,
      };
    case 'confirmed':
      return {
        label: 'Chuẩn bị & Đóng gói',
        description: 'Lấy hàng từ vị trí kho, kiểm tra số lượng và đóng gói niêm phong kiện hàng.',
        target: 'packed' as ApiOrderTransitionTarget,
      };
    case 'packed':
      return {
        label: isPos ? 'Bàn giao cho khách tại quầy' : 'Bàn giao vận chuyển',
        description: isPos
          ? 'Kiện hàng đã chuẩn bị xong, tiến hành bàn giao trực tiếp cho khách mua tại quầy.'
          : order.channelCode === 'shopify' || order.channelCode === 'ebay'
          ? 'Đã đóng gói hoàn tất. Bạn có thể bàn giao đơn vị vận chuyển hoặc gửi yêu cầu fulfillment lên sàn.'
          : 'Bàn giao kiện hàng cho đơn vị vận chuyển và xác nhận xuất kho.',
        target: 'shipped' as ApiOrderTransitionTarget,
      };
    case 'shipped':
      return {
        label: isPos ? 'Hoàn tất đơn hàng' : 'Xác nhận đã giao hàng',
        description: isPos
          ? 'Khách hàng đã nhận đủ sản phẩm và hoàn tất đơn tại quầy.'
          : 'Xác nhận kiện hàng đã được giao thành công đến tay người nhận.',
        target: 'delivered' as ApiOrderTransitionTarget,
      };
    default:
      return null;
  }
}

export function OrderOverviewTab({
  order,
  onNextAction,
  onCancel,
  onOpenPaymentModal,
  onShopifyUpdated,
  busy = false,
}: OrderOverviewTabProps) {
  const currentStep = stepIndex(order.status);
  const isCancelled = order.status === 'cancelled';
  const isDelivered = order.status === 'delivered';
  const nextAction = getNextActionMeta(order);
  const isPos = order.channelCode === 'pos';

  const guard = order.cancellationGuard;
  const canCancel = guard
    ? guard.can_cancel
    : order.status === 'placed' || order.status === 'confirmed' || order.status === 'packed';

  // The cancellation reason lives here, next to the button that consumes it: the reason is
  // the only record left of why stock went back on the shelf, so the form is inline and the
  // button stays disabled until it is filled.
  const [cancelReason, setCancelReason] = useState('');
  const submitCancel = async () => {
    const trimmed = cancelReason.trim();
    if (!trimmed || busy) return;
    const accepted = await onCancel(trimmed);
    if (accepted) setCancelReason('');
  };
  const cancelReasonId = `cancel-reason-input-${order.id}`;

  return (
    <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
      {/* =========================================================================
          LEFT / WIDE COLUMN (65-70% on desktop: lg:col-span-8)
          1. Order Progress Stepper & Contextual Next Action
          2. Order Items Table
          3. Financial & Payment Summary
         ========================================================================= */}
      <div className="grid gap-6 lg:col-span-8">
        {/* 1. Tiến trình xử lý đơn (Lifecycle Progress Stepper) */}
        <Card className="grid gap-4 border border-outline-variant/60 p-5 shadow-none sm:p-6" aria-label="Tiến trình xử lý đơn">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 pb-3">
            <div>
              <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">
                Tiến trình đơn hàng
              </span>
              <h2 className="mt-0.5 font-display text-base font-bold text-on-surface">
                {isCancelled ? 'Đơn hàng đã hủy' : isDelivered ? 'Đơn đã giao' : 'Đang xử lý theo quy trình'}
              </h2>
            </div>
            <StatusBadge tone={isCancelled ? 'danger' : isDelivered ? 'success' : 'neutral'}>
              {isCancelled ? 'Đã hủy đơn' : isDelivered ? 'Hoàn tất' : `Bước ${currentStep + 1}/5`}
            </StatusBadge>
          </div>

          {/* Stepper for Active Orders */}
          {!isCancelled ? (
            <nav aria-label="Các bước quy trình" className="pt-2 pb-1">
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
            <div className="flex items-start gap-3 rounded-control border border-danger/40 bg-danger/10 p-3.5 text-on-surface">
              <span className="material-symbols-outlined text-[20px] text-danger" aria-hidden="true">
                cancel
              </span>
              <div className="font-body text-caption">
                <strong className="block font-bold text-danger">Đơn hàng này đã bị hủy</strong>
                <p className="mt-0.5 text-on-surface">
                  Lý do: <span className="font-semibold">{order.cancelledReason || 'Không ghi nhận lý do'}</span>
                </p>
                <p className="mt-0.5 text-graphite">
                  Toàn bộ {order.itemCount} sản phẩm đã được tự động hoàn trả lại tồn kho khả dụng (ATS).
                </p>
              </div>
            </div>
          )}

          {/* Contextual Next Action Box */}
          {nextAction ? (
            <div className="rounded-control border border-channel-accent/30 bg-channel-accent/5 p-4 sm:p-5">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">
                    Hành động kế tiếp cần thực hiện
                  </span>
                  <h3 className="mt-0.5 font-display text-base font-bold text-on-surface">
                    {nextAction.label}
                  </h3>
                  <p className="mt-1 font-body text-caption text-graphite leading-relaxed max-w-xl">
                    {nextAction.description}
                  </p>
                </div>
                <Button
                  variant="primary"
                  size="md"
                  loading={busy}
                  disabled={busy}
                  onClick={() => onNextAction(nextAction.target)}
                  className="shrink-0 font-bold"
                >
                  {/* One static label: the header toolbar already carries the step's own
                      name, and a second button repeating it would make "which one did I
                      click" ambiguous for keyboard and screen-reader users. */}
                  Thực hiện bước này
                </Button>
              </div>
            </div>
          ) : null}

          {/* Non-cancellable states keep a plain statement; cancellable ones get the form
              below, so there is exactly one "Hủy đơn" button on the whole page. */}
          {!isCancelled && !isDelivered && !canCancel ? (
            <div className="border-t border-outline-variant/40 pt-3 font-body text-caption text-graphite">
              Không thể hủy đơn ở trạng thái hiện tại.
            </div>
          ) : null}
        </Card>

        {/* Inline cancellation form */}
        {canCancel ? (
          <Card className="grid gap-3 border border-danger/30 bg-danger/5 p-5 shadow-none" aria-label="Hủy đơn hàng">
            <div className="grid gap-1">
              <h3 className="font-display text-base font-bold text-on-surface">Hủy đơn hàng</h3>
              <p className="font-body text-caption text-graphite">
                Hủy sẽ hoàn trả toàn bộ chỗ giữ về tồn kho khả dụng (ATS) và ghi lý do vào nhật ký kiểm toán. Thao tác không thể hoàn tác.
              </p>
            </div>
            {order.status === 'packed' ? (
              <div className="flex items-start gap-2.5 rounded-control border border-warning/40 bg-warning/10 p-3 text-on-surface">
                <span className="material-symbols-outlined text-[18px] text-warning" aria-hidden="true">
                  warning
                </span>
                <p className="font-body text-caption leading-relaxed">
                  Cảnh báo khi hủy đơn đã đóng gói: hệ thống hoàn trả chỗ giữ ngay lập tức, nhưng kiện vẫn nằm tại quầy — bạn cần bóc kiện và xếp hàng trở lại kệ kho thì số lượng mới thực sự về đúng kệ.
                </p>
              </div>
            ) : null}
            <div className="grid gap-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor={cancelReasonId} className="font-body text-caption font-semibold text-on-surface">
                  Lý do hủy đơn <span className="text-danger">*</span>
                </label>
                <span className="font-mono text-[11px] text-graphite">{cancelReason.length}/500</span>
              </div>
              <textarea
                id={cancelReasonId}
                className="min-h-24 w-full rounded-control border border-outline-variant bg-pure-white p-3 font-body text-sm text-on-surface outline-none focus:border-channel-accent focus:ring-1 focus:ring-channel-accent"
                value={cancelReason}
                onChange={(event) => setCancelReason(event.target.value)}
                placeholder="Nhập lý do chi tiết: Khách yêu cầu hủy, hết hàng tại kho, sai lệch thông tin địa chỉ..."
                maxLength={500}
                disabled={busy}
              />
            </div>
            <Button
              variant="danger"
              size="sm"
              loading={busy}
              disabled={busy || cancelReason.trim().length === 0}
              onClick={() => void submitCancel()}
              className="justify-self-start"
            >
              Hủy đơn
            </Button>
          </Card>
        ) : null}

        <OrderFinancialPaymentSection order={order} onOpenPaymentModal={onOpenPaymentModal} busy={busy} />

        {/* 2. Danh sách sản phẩm (Order Items Table) */}
        <OrderItemsTable
          items={order.items}
        />
      </div>

      {/* =========================================================================
          RIGHT / SIDEBAR COLUMN (30-35% on desktop: lg:col-span-4)
          1. Customer Info
          2. Recipient & Delivery Address
          3. Unified Shipping & Fulfillment
          4. Channel & System Metadata
         ========================================================================= */}
      <div className="grid gap-6 lg:col-span-4">
        {/* 1. Khách hàng */}
        <Card className="grid gap-3 border border-outline-variant/60 p-4 shadow-none" aria-label="Khách hàng">
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2.5">
            <span className="flex items-center gap-2 font-body text-caption font-bold uppercase tracking-wider text-graphite">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                person
              </span>
              Khách hàng
            </span>
          </div>

          <dl className="grid gap-2.5 font-body text-caption">
            <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
              <dt className="text-graphite">Họ tên:</dt>
              <dd className="font-semibold text-on-surface">
                {order.customerName ? order.customerName : <span className="italic font-normal text-graphite/70">{isPos ? 'Khách lẻ tại quầy' : 'Chưa có thông tin khách hàng'}</span>}
              </dd>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
              <dt className="text-graphite">Số ĐT:</dt>
              <dd className="font-mono text-on-surface">
                {order.customerPhone ? (
                  <div className="flex items-center gap-1">
                    <a href={`tel:${order.customerPhone}`} className="hover:underline text-channel-accent font-medium">
                      {order.customerPhone}
                    </a>
                    <CopyButton text={order.customerPhone} label="Sao chép SĐT khách" />
                  </div>
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
              <dt className="text-graphite">Email:</dt>
              <dd className="break-all text-on-surface">
                {order.customerEmail ? (
                  order.customerEmail
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {/* 2. Người nhận & Địa chỉ giao hàng */}
        <Card className="grid gap-3 border border-outline-variant/60 p-4 shadow-none" aria-label="Người nhận và giao hàng">
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2.5">
            <span className="flex items-center gap-2 font-body text-caption font-bold uppercase tracking-wider text-graphite">
              <span className="material-symbols-outlined text-[18px]" aria-hidden="true">
                local_shipping
              </span>
              Người nhận & Vận chuyển
            </span>
          </div>

          <dl className="grid gap-2.5 font-body text-caption">
            <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
              <dt className="text-graphite">Người nhận:</dt>
              <dd className="font-semibold text-on-surface">
                {order.recipientName || (isPos ? order.customerName : null) || (
                  <span className="italic font-normal text-graphite/70">
                    {isPos ? 'Khách mua tại quầy' : 'Chưa có thông tin'}
                  </span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
              <dt className="text-graphite">Số ĐT:</dt>
              <dd className="font-mono text-on-surface">
                {order.recipientPhone || (isPos && order.customerPhone) ? (
                  <div className="flex items-center gap-1">
                    <span className="font-medium text-on-surface">
                      {order.recipientPhone || (isPos ? order.customerPhone : null)}
                    </span>
                    <CopyButton
                      text={order.recipientPhone || (isPos ? order.customerPhone : null) || ''}
                      label="Sao chép số điện thoại người nhận"
                    />
                  </div>
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
              <dt className="text-graphite">Hình thức:</dt>
              <dd className="font-medium text-on-surface">
                {order.deliveryMethod || (isPos ? 'Mua tại quầy' : 'Chưa có thông tin')}
              </dd>
            </div>

            <div className="grid grid-cols-[80px_1fr] items-baseline gap-2">
              <dt className="text-graphite">Địa chỉ:</dt>
              <dd className="text-on-surface">
                {order.deliveryAddress ? (
                  <div className="flex items-start gap-1">
                    <span className="break-words leading-relaxed">{order.deliveryAddress}</span>
                    <CopyButton text={order.deliveryAddress} label="Sao chép địa chỉ giao hàng" />
                  </div>
                ) : (
                  <span className="italic text-graphite/70">
                    {isPos ? 'Bán tại quầy (Không giao hàng)' : 'Chưa có địa chỉ'}
                  </span>
                )}
              </dd>
            </div>

            {order.deliveryNote ? (
              <div className="grid grid-cols-[80px_1fr] items-baseline gap-2 rounded-control bg-surface-container-low p-2.5">
                <dt className="text-graphite font-semibold">Ghi chú:</dt>
                <dd className="italic text-on-surface break-words">{order.deliveryNote}</dd>
              </div>
            ) : null}
          </dl>
        </Card>

        {/* 3. Vận chuyển & Bàn giao thực tế */}
        <OrderUnifiedShippingSection order={order} />

        {/* Marketplace Remote Fulfillment Action Controls */}
        {order.channelCode === 'shopify' ? (
          <ShopifyFulfillmentPanel orderId={order.id} coreStatus={order.status} onUpdated={onShopifyUpdated} />
        ) : null}

        {order.channelCode === 'woocommerce' ? <WooCommerceOrderLifecyclePanel orderId={order.id} coreStatus={order.status} /> : null}

        {order.channelCode === 'ebay' && order.channelId && order.externalId ? (
          <EbayFulfillmentPanel
            channelId={order.channelId}
            externalOrderId={order.externalId}
            externalLines={order.externalLines ?? []}
            coreStatus={order.status}
          />
        ) : null}

        {/* 4. Thông tin kênh bán & Mã đối soát */}
        <Card className="grid gap-2.5 border border-outline-variant/60 p-4 shadow-none font-body text-caption text-graphite" aria-label="Thông tin đối soát">
          <span className="font-bold uppercase tracking-wider text-graphite">
            Nhận diện đơn hàng
          </span>
          <div className="flex items-center justify-between">
            <span>Kênh tiếp nhận:</span>
            <strong className="text-on-surface">{channelName(order.channelCode)}</strong>
          </div>
          <div className="flex items-center justify-between">
            <span>Mã Core:</span>
            <span className="font-mono text-[11px] text-on-surface">{order.id.slice(0, 8)}…</span>
          </div>
          {order.externalId ? (
            <div className="flex items-center justify-between">
              <span>Mã sàn ngoài:</span>
              <span className="font-mono text-[11px] font-semibold text-on-surface">{order.externalId}</span>
            </div>
          ) : null}
          <div className="flex items-center justify-between border-t border-outline-variant/40 pt-2">
            <span>Đồng bộ lần cuối:</span>
            <span className="text-on-surface">{formatOrderTime(order.updatedAt)}</span>
          </div>
        </Card>
      </div>
    </div>
  );
}
