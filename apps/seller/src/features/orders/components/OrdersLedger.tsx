import { Fragment } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { cn } from '../../../lib/cn';
import type { Order } from '../order.types';
import { formatOrderTime } from '../order.utils';
import { OrderChannelBadge, OrderFulfillmentBadge, OrderStatusBadge } from './OrderParts';
import { OrderFixtureInlinePreview } from './OrderFixtureInlinePreview';

export interface OrdersLedgerProps {
  orders: Order[];
  selectedIds: Set<string>;
  activeId?: string;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onPreview: (id: string) => void;
  onOpen: (id: string) => void;
}

function missingItemsLabel(order: Order): string {
  return order.itemCount > 0 ? `${order.itemCount} dòng · chưa tải chi tiết` : 'Chưa có dòng hàng';
}

export function OrdersLedger({ activeId, onOpen, onPreview, onToggle, onToggleAll, orders, selectedIds }: OrdersLedgerProps) {
  const allSelected = orders.length > 0 && orders.every((order) => selectedIds.has(order.id));
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <header className="flex min-w-0 flex-col justify-between gap-3 border-b border-outline-variant/50 px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0"><h2 className="font-display text-lg font-bold text-on-surface">Danh sách đơn hàng</h2><p className="mt-1 font-body text-caption text-graphite">{orders.length} đơn hàng · dữ liệu minh họa</p></div>
        <Button variant="secondary" size="sm" disabled title="Chưa có thao tác hàng loạt trong dữ liệu minh họa" className="shrink-0">{selectedIds.size > 0 ? `${selectedIds.size} đơn đã chọn` : 'Chọn đơn để thao tác'}</Button>
      </header>
      <div className="hidden max-w-full overflow-x-auto xl:block">
        <table className="w-full min-w-[1120px] border-collapse text-left">
          <caption className="sr-only">Danh sách đơn hàng minh họa</caption>
          <thead><tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite"><th className="w-12 px-4"><Checkbox label={<span className="sr-only">Chọn tất cả đơn đang hiển thị</span>} checked={allSelected} onChange={onToggleAll} /></th><th className="px-3">Đơn / kênh</th><th className="px-3">Khách hàng</th><th className="px-3">Sản phẩm</th><th className="px-3">Tổng tiền / thanh toán</th><th className="px-3">Tồn kho</th><th className="px-3">Giao hàng</th><th className="px-4 text-right">Thao tác</th></tr></thead>
          <tbody className="divide-y divide-surface-container">
            {orders.map((order) => {
              const item = order.items[0];
              const expanded = activeId === order.id;
              const previewId = `fixture-order-preview-${order.id}`;
              return (
                <Fragment key={order.id}>
                  <tr className={cn('font-body text-body-sm hover:bg-surface-container-low/60', expanded ? 'bg-secondary-fixed/60' : null)}>
                    <td className="px-4 py-3"><Checkbox label={<span className="sr-only">Chọn {order.reference}</span>} checked={selectedIds.has(order.id)} onChange={() => onToggle(order.id)} /></td>
                    <td className="max-w-64 px-3 py-3"><strong className="block break-all text-on-surface">{order.reference}</strong><code className="block break-all font-mono text-[10px] text-graphite">{order.marketplaceReference || order.externalId}</code><div className="mt-2"><OrderChannelBadge order={order} /></div></td>
                    <td className="max-w-56 px-3 py-3"><strong className="block break-words text-on-surface">{order.customer.name}</strong><span className="mt-1 block break-words text-caption text-graphite">{order.customer.location}</span></td>
                    {item ? <td className="max-w-56 px-3 py-3"><strong className="block break-words text-on-surface" title={item.name}>{item.name}</strong><span className="block break-words text-caption text-graphite">{item.variant} · SL {item.quantity}</span><code className="break-all font-mono text-[10px] text-graphite">{item.sku}</code></td> : <td className="px-3 py-3"><span className="block text-caption text-graphite">{missingItemsLabel(order)}</span></td>}
                    <td className="px-3 py-3"><strong className="block whitespace-nowrap tabular-nums text-on-surface">{order.total.formatted}</strong><span className="mt-1 block text-caption text-graphite">{order.paymentStatus}</span></td>
                    <td className="max-w-48 px-3 py-3"><OrderStatusBadge order={order} /><span className="mt-1 block break-words text-caption leading-4 text-graphite">{order.inventoryStatus}</span></td>
                    <td className="px-3 py-3"><OrderFulfillmentBadge order={order} /><time className="mt-1 block whitespace-nowrap text-[10px] text-graphite">{formatOrderTime(order.updatedAt)}</time></td>
                    <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onPreview(order.id)} aria-expanded={expanded} aria-controls={previewId} aria-label={`${expanded ? 'Thu gọn xem nhanh' : 'Xem nhanh'} ${order.reference}`} className="px-2"><span className="material-symbols-outlined text-base" aria-hidden="true">{expanded ? 'expand_less' : 'preview'}</span></Button><Button variant="ghost" size="sm" onClick={() => onOpen(order.id)} className="px-2">Chi tiết <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button></div></td>
                  </tr>
                  <tr className={expanded ? 'bg-surface-container-low/40' : 'hidden'}><td colSpan={8} className="p-3"><div id={previewId} hidden={!expanded}>{expanded ? <OrderFixtureInlinePreview order={order} onOpenDetail={() => onOpen(order.id)} /> : null}</div></td></tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid min-w-0 gap-3 p-4 xl:hidden">
        {orders.map((order) => {
          const item = order.items[0];
          const expanded = activeId === order.id;
          const previewId = `fixture-order-card-preview-${order.id}`;
          return (
            <article key={order.id} className={cn('grid min-w-0 gap-4 rounded-card bg-surface-container-low p-4', expanded ? 'ring-2 ring-carbon' : null)}>
              <div className="flex min-w-0 items-start gap-3"><Checkbox label={<span className="sr-only">Chọn {order.reference}</span>} checked={selectedIds.has(order.id)} onChange={() => onToggle(order.id)} /><div className="min-w-0 flex-1"><strong className="block break-all font-body text-body-sm text-on-surface">{order.reference}</strong><code className="block break-all font-mono text-caption text-graphite">{order.marketplaceReference || order.externalId}</code></div><OrderStatusBadge order={order} /></div>
              <div className="flex min-w-0 items-center justify-between gap-3"><OrderChannelBadge order={order} /><strong className="shrink-0 font-display text-lg tabular-nums text-on-surface">{order.total.formatted}</strong></div>
              <div className="grid min-w-0 gap-1 font-body text-caption"><strong className="break-words text-on-surface">{order.customer.name}</strong>{item ? <><span className="break-words text-graphite">{item.name} · {item.variant} · SL {item.quantity}</span><code className="break-all font-mono text-on-surface">{item.sku}</code></> : <span className="text-graphite">{missingItemsLabel(order)}</span>}</div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3"><OrderFulfillmentBadge order={order} /><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => onPreview(order.id)} aria-expanded={expanded} aria-controls={previewId} aria-label={`${expanded ? 'Thu gọn xem nhanh' : 'Xem nhanh'} ${order.reference}`}>{expanded ? 'Thu gọn' : 'Xem nhanh'}</Button><Button size="sm" onClick={() => onOpen(order.id)}>Chi tiết</Button></div></div>
              <div id={previewId} hidden={!expanded}>{expanded ? <OrderFixtureInlinePreview order={order} onOpenDetail={() => onOpen(order.id)} /> : null}</div>
            </article>
          );
        })}
      </div>
      <footer className="border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4"><p className="font-body text-caption text-graphite">Đang hiển thị {orders.length} đơn hàng minh họa.</p></footer>
    </Card>
  );
}
