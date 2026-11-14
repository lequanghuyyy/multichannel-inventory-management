import { Button } from '../../../components/ui/Button';
import { formatOrderTime } from '../order.utils';
import type { Order } from '../order.types';
import { OrderChannelBadge, OrderFulfillmentBadge, OrderStatusBadge } from './OrderParts';

export function OrderFixtureInlinePreview({ order, onOpenDetail }: { order: Order; onOpenDetail: () => void }) {
  return (
    <section className="grid min-w-0 gap-4 rounded-card border border-outline-variant/60 bg-pure-white p-4 sm:p-5" aria-label={`Xem nhanh ${order.reference}`}>
      <header className="flex min-w-0 flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">Xem nhanh đơn hàng · dữ liệu minh họa</p>
          <h3 className="mt-1 break-all font-display text-lg font-bold text-on-surface">{order.reference}</h3>
          <code className="block break-all font-mono text-caption text-graphite">{order.marketplaceReference || order.externalId || 'Chưa có mã từ kênh'}</code>
        </div>
        <OrderStatusBadge order={order} />
      </header>
      <dl className="grid min-w-0 gap-3 font-body text-caption sm:grid-cols-2 lg:grid-cols-3">
        <div><dt className="text-graphite">Kênh bán</dt><dd className="mt-1"><OrderChannelBadge order={order} /></dd></div>
        <div><dt className="text-graphite">Ngày đặt</dt><dd className="mt-1 break-words text-on-surface">{formatOrderTime(order.placedAt)}</dd></div>
        <div><dt className="text-graphite">Khách hàng</dt><dd className="mt-1 break-words font-semibold text-on-surface">{order.customer.name || 'Không có tên khách'}</dd></div>
        <div><dt className="text-graphite">Thanh toán</dt><dd className="mt-1 break-words text-on-surface">{order.paymentStatus}</dd></div>
        <div><dt className="text-graphite">Giao hàng</dt><dd className="mt-1"><OrderFulfillmentBadge order={order} /></dd></div>
      </dl>
      <section className="grid min-w-0 gap-2" aria-labelledby={`fixture-preview-items-${order.id}`}>
        <div className="flex items-center justify-between gap-3">
          <h4 id={`fixture-preview-items-${order.id}`} className="font-display text-base font-bold text-on-surface">Dòng hàng</h4>
          <strong className="shrink-0 font-mono tabular-nums text-on-surface">{order.total.formatted}</strong>
        </div>
        {order.items.length ? order.items.map((item) => (
          <article key={item.sku} className="grid min-w-0 gap-2 rounded-control bg-surface-container-low p-3 sm:grid-cols-[minmax(0,1fr)_auto]">
            <div className="min-w-0">
              <strong className="block break-words font-body text-body-sm text-on-surface">{item.name}</strong>
              <p className="mt-1 font-body text-caption text-graphite">Số lượng: {item.quantity}</p>
              <code className="mt-1 block break-all font-mono text-caption text-on-surface">{item.sku}</code>
            </div>
            <span className="font-mono tabular-nums text-body-sm font-semibold text-on-surface">{item.total.formatted}</span>
          </article>
        )) : <p className="font-body text-caption text-graphite">Chưa có dòng hàng trong dữ liệu minh họa.</p>}
      </section>
      <div className="flex justify-end border-t border-outline-variant/50 pt-3">
        <Button variant="secondary" size="sm" onClick={onOpenDetail}>Mở chi tiết đơn</Button>
      </div>
    </section>
  );
}
