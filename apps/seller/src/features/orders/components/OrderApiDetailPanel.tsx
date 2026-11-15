import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import {
  apiFulfillmentLabels,
  apiStatusPresentation,
  channelName,
  getChannelSyncState,
  paymentLabel,
  unifiedShippingStatusLabels,
  type OrderApiRow,
} from '../order.api';
import { formatOrderTime } from '../order.utils';
import { CopyButton } from './CopyButton';
import { OrderCustomerDeliverySection } from './OrderCustomerDeliverySection';
import { OrderFinancialPaymentSection } from './OrderFinancialPaymentSection';
import { OrderUnifiedShippingSection } from './OrderUnifiedShippingSection';

export function OrderApiDetailPanel({ order, onOpenDetail }: { order: OrderApiRow; onOpenDetail?: () => void }) {
  const externalLines = order.externalLines ?? [];
  const syncState = getChannelSyncState(order);
  const deliveryStatusKey = order.unifiedShipping?.delivery_status ?? 'pending_preparation';
  const deliveryStatusLabel = unifiedShippingStatusLabels[deliveryStatusKey]?.label ?? apiFulfillmentLabels[order.fulfillmentStatus];

  return (
    <Card className="grid gap-6 border border-metric-ink p-0 shadow-metric ring-0" aria-label={`Chi tiết ${order.reference}`}>
      {/* Header */}
      <header className="grid gap-4 border-b border-outline-variant/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <span className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">
              {onOpenDetail ? 'Xem nhanh đơn hàng' : 'Thông tin đơn hàng'}
            </span>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="font-display text-2xl font-bold text-on-surface">{order.reference}</h2>
              <CopyButton text={order.reference} label="Sao chép mã đơn hàng" />
            </div>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-caption text-graphite">
              <span>Mã kênh:</span>
              {order.externalId ? (
                <>
                  <code className="font-semibold text-on-surface">{order.externalId}</code>
                  <CopyButton text={order.externalId} label="Sao chép mã đơn kênh" />
                </>
              ) : (
                <span className="italic">Chưa có thông tin</span>
              )}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge tone={apiStatusPresentation[order.status].tone}>
              {apiStatusPresentation[order.status].label}
            </StatusBadge>
            {onOpenDetail ? (
              <Button variant="secondary" size="sm" onClick={onOpenDetail}>
                Mở trang chi tiết
              </Button>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-2 rounded-control bg-surface-container-low px-2.5 py-1">
            <span className="grid min-h-6 min-w-6 place-items-center rounded bg-carbon px-1 font-body text-[10px] font-bold text-pure-white">
              {order.channelCode}
            </span>
            <span>
              <strong className="block font-body text-caption text-on-surface">{channelName(order.channelCode)}</strong>
            </span>
          </span>
        </div>

        <dl className="grid grid-cols-2 gap-3 font-body text-caption sm:grid-cols-3 lg:grid-cols-6">
          <div className="rounded-control bg-surface-container-low p-2.5">
            <dt className="text-graphite">Xử lý đơn (Core)</dt>
            <dd className="mt-1 font-semibold text-on-surface">{apiStatusPresentation[order.status].label}</dd>
          </div>
          <div className="rounded-control bg-surface-container-low p-2.5">
            <dt className="text-graphite">Thanh toán Core</dt>
            <dd className="mt-1 font-semibold text-on-surface">{paymentLabel(order.paymentStatus)}</dd>
          </div>
          <div className="rounded-control bg-surface-container-low p-2.5">
            <dt className="text-graphite">Vận chuyển</dt>
            <dd className="mt-1 font-semibold text-on-surface">{deliveryStatusLabel}</dd>
          </div>
          <div className="rounded-control bg-surface-container-low p-2.5">
            <dt className="text-graphite">Đồng bộ sàn</dt>
            <dd className="mt-1 font-semibold text-on-surface">{syncState.label}</dd>
          </div>
          <div className="rounded-control bg-surface-container-low p-2.5">
            <dt className="text-graphite">Ngày đặt</dt>
            <dd className="mt-1 font-medium text-on-surface">{formatOrderTime(order.placedAt)}</dd>
          </div>
          <div className="rounded-control bg-surface-container-low p-2.5">
            <dt className="text-graphite">Cập nhật lần cuối</dt>
            <dd className="mt-1 font-medium text-on-surface">{formatOrderTime(order.updatedAt)}</dd>
          </div>
        </dl>

        {order.cancelledReason ? (
          <div className="rounded-control border border-danger/30 bg-danger/10 p-3 font-body text-caption text-on-surface">
            Lý do hủy đơn: <strong className="text-danger">{order.cancelledReason}</strong>
          </div>
        ) : null}
      </header>

      {/* Customer & Delivery Section */}
      <div className="px-5 sm:px-6">
        <OrderCustomerDeliverySection
          customerName={order.customerName}
          customerPhone={order.customerPhone}
          customerEmail={order.customerEmail}
          recipientName={order.recipientName}
          recipientPhone={order.recipientPhone}
          deliveryAddress={order.deliveryAddress}
          deliveryNote={order.deliveryNote}
          deliveryMethod={order.deliveryMethod}
          channelCode={order.channelCode}
        />
      </div>

      {/* Unified Shipping & Fulfillment Section */}
      <div className="px-5 sm:px-6">
        <OrderUnifiedShippingSection order={order} />
      </div>

      {/* Order items as a compact list: the ledger renders the preview inside its own table,
          so a nested <table> here would make "the orders table" ambiguous. The full sortable
          table lives on the detail page. */}
      <div className="px-5 sm:px-6">
        <section className="grid gap-2" aria-label="Dòng hàng trong đơn">
          <h4 className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">
            Dòng hàng ({order.items.length})
          </h4>
          {order.items.length === 0 ? (
            <p className="font-body text-caption text-graphite">Không có thông tin dòng sản phẩm.</p>
          ) : (
            <ul className="grid gap-2">
              {order.items.map((item, index) => (
                <li
                  key={`${item.sku}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container-low p-3 font-body text-caption"
                >
                  <div className="min-w-0">
                    <strong className="block break-words text-on-surface">{item.name}</strong>
                    <span className="text-graphite">{item.sku} · SL {item.quantity}</span>
                  </div>
                  <span className="font-medium text-on-surface">{item.lineTotalFormatted}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <div className="px-5 sm:px-6"><OrderFinancialPaymentSection order={order} /></div>

      {/* Status history: the summary payload carries no timeline, so the panel states that
          plainly instead of drawing a lifecycle journey the server has not shown here. */}
      <section className="grid gap-2 border-t border-outline-variant/50 p-5 sm:p-6" aria-label="Lịch sử trạng thái đơn hàng">
        <h4 className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">
          Lịch sử trạng thái
        </h4>
        <p className="font-body text-body-sm text-graphite">Chưa có lịch sử thay đổi trạng thái của đơn này.</p>
        <p className="font-body text-caption text-graphite">Dòng thời gian đầy đủ hiển thị ở trang chi tiết đơn hàng.</p>
      </section>

      {externalLines.length > 0 ? (
        <section className="grid gap-3 border-t border-outline-variant/50 p-5 sm:p-6" aria-label="Dòng hàng đã quan sát trên sàn">
          <div className="grid gap-2">
            <h4 className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">
              Dòng hàng đã quan sát trên sàn
            </h4>
            <div className="grid gap-2">
              {externalLines.map((line, index) => (
                <article
                  key={`${line.external_line_id}-${line.observed_at}-${index}`}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container-low p-3 font-body text-caption"
                >
                  <div>
                    <strong className="block text-on-surface">{line.product_name ?? line.sku ?? line.external_line_id}</strong>
                    <span className="text-graphite">Số lượng: {line.quantity}</span>
                  </div>
                  <span className="font-medium text-on-surface">
                    {line.final_line_total == null ? (
                      <span className="italic text-graphite/70">Chưa có thông tin</span>
                    ) : (
                      `${line.final_line_total} ${line.currency}`
                    )}
                  </span>
                </article>
              ))}
            </div>
          </div>
        </section>
      ) : null}
    </Card>
  );
}
