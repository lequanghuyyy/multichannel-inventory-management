import { Fragment } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { cn } from '../../../lib/cn';
import { apiFulfillmentLabels, apiStatusPresentation, type OrderApiRow, channelName, paymentLabel } from '../order.api';
import { formatOrderTime } from '../order.utils';
import { OrderApiInlinePreview } from './OrderApiInlinePreview';

export interface OrderApiLedgerProps {
  orders: OrderApiRow[];
  totalRows: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError?: unknown;
  onLoadMore: () => void;
  selectedIds: Set<string>;
  activeId?: string;
  previewRevision: number;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onExportSelected: () => void;
  onBulkSelected: () => void;
  onPreview: (id: string) => void;
  onOpen: (id: string) => void;
}

/** This list shows only facts returned by GET /api/v1/orders. */
function missingItemsLabel(order: OrderApiRow): string {
  return order.itemCount > 0 ? `${order.itemCount} dòng · chưa tải chi tiết` : 'Chưa có dòng hàng';
}

function StatusCell({ order }: { order: OrderApiRow }) {
  const status = apiStatusPresentation[order.status];
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
}

function FulfillmentCell({ order }: { order: OrderApiRow }) {
  const tone = order.fulfillmentStatus === 'delivered'
    ? 'success'
    : order.fulfillmentStatus === 'returned'
      ? 'danger'
      : 'neutral';
  return <StatusBadge tone={tone}>{apiFulfillmentLabels[order.fulfillmentStatus]}</StatusBadge>;
}

export function OrderApiLedger(props: OrderApiLedgerProps) {
  const { activeId, hasMore, loadMoreError, loadingMore, onLoadMore, onOpen, onPreview, onToggle, onToggleAll, onExportSelected, onBulkSelected, orders, previewRevision, selectedIds, totalRows } = props;
  const allSelected = orders.length > 0 && orders.every((order) => selectedIds.has(order.id));
  return (
    <Card className="min-w-0 overflow-hidden p-0">
      <header className="flex min-w-0 flex-col justify-between gap-3 border-b border-outline-variant/50 px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0">
          <h2 className="font-display text-lg font-bold text-on-surface">Danh sách đơn hàng</h2>
          <p className="mt-1 font-body text-caption text-graphite">{orders.length} / {totalRows} đơn hàng</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled={selectedIds.size === 0} onClick={onExportSelected}>Xuất {selectedIds.size} đơn đã chọn</Button>
          <Button variant="secondary" size="sm" disabled={selectedIds.size === 0} onClick={onBulkSelected}>Giao hàng loạt</Button>
        </div>
      </header>

      <div className="hidden max-w-full overflow-x-auto xl:block">
        <table className="w-full min-w-[1080px] border-collapse text-left">
          <caption className="sr-only">Danh sách đơn hàng</caption>
          <thead>
            <tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
              <th className="w-12 px-4"><Checkbox label={<span className="sr-only">Chọn tất cả đơn đang hiển thị</span>} checked={allSelected} onChange={onToggleAll} /></th>
              <th className="px-3">Đơn / kênh</th>
              <th className="px-3">Khách hàng</th>
              <th className="px-3">Dòng hàng</th>
              <th className="px-3">Tổng / thanh toán</th>
              <th className="px-3">Trạng thái</th>
              <th className="px-3">Giao hàng</th>
              <th className="px-4 text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {orders.map((order) => {
              const expanded = activeId === order.id;
              const previewId = `api-order-preview-${order.id}`;
              const toggle = () => onPreview(order.id);
              return (
                <Fragment key={order.id}>
                  <tr className={cn('font-body text-body-sm hover:bg-surface-container-low/60', expanded ? 'bg-secondary-fixed/60' : null)}>
                    <td className="px-4 py-3"><Checkbox label={<span className="sr-only">Chọn {order.reference}</span>} checked={selectedIds.has(order.id)} onChange={() => onToggle(order.id)} /></td>
                    <td className="max-w-64 px-3 py-3">
                      <strong className="block break-all text-on-surface">{order.reference}</strong>
                      <code className="block break-all font-mono text-[10px] text-graphite">{order.externalId || '—'}</code>
                      <div className="mt-2"><span className="inline-flex min-h-7 min-w-7 place-items-center rounded bg-carbon px-1.5 font-body text-[9px] font-bold text-pure-white">{channelName(order.channelCode)}</span></div>
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      <strong className="block break-words text-on-surface">{order.customerName || 'Không có tên khách'}</strong>
                      {order.cancelledReason ? <span className="mt-1 block break-words text-caption text-graphite">Lý do hủy: {order.cancelledReason}</span> : null}
                    </td>
                    <td className="max-w-56 px-3 py-3">
                      {order.items[0] ? <><strong className="block break-words text-on-surface" title={order.items[0].name}>{order.items[0].name}</strong><span className="block text-caption text-graphite">SL {order.items[0].quantity}</span><code className="break-all font-mono text-[10px] text-graphite">{order.items[0].sku}</code></> : <span className="block text-caption text-graphite">{missingItemsLabel(order)}</span>}
                    </td>
                    <td className="px-3 py-3"><strong className="block whitespace-nowrap tabular-nums text-on-surface">{order.totalFormatted}</strong><span className="mt-1 block text-caption text-graphite">{paymentLabel(order.paymentStatus)}</span></td>
                    <td className="px-3 py-3"><StatusCell order={order} /></td>
                    <td className="px-3 py-3"><FulfillmentCell order={order} /><time className="mt-1 block whitespace-nowrap text-[10px] text-graphite">{formatOrderTime(order.updatedAt)}</time></td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="sm" onClick={toggle} aria-expanded={expanded} aria-controls={previewId} aria-label={`${expanded ? 'Thu gọn xem nhanh' : 'Xem nhanh'} ${order.reference}`} className="px-2"><span className="material-symbols-outlined text-base" aria-hidden="true">{expanded ? 'expand_less' : 'preview'}</span></Button>
                        <Button variant="ghost" size="sm" onClick={() => onOpen(order.id)} className="px-2">Chi tiết <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button>
                      </div>
                    </td>
                  </tr>
                  <tr className={expanded ? 'bg-surface-container-low/40' : 'hidden'}>
                    <td colSpan={8} className="p-3">
                      <div id={previewId} hidden={!expanded}>
                        {expanded ? <OrderApiInlinePreview key={order.id} order={order} revision={previewRevision} onOpenDetail={() => onOpen(order.id)} /> : null}
                      </div>
                    </td>
                  </tr>
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="grid min-w-0 gap-3 p-4 xl:hidden">
        {orders.map((order) => {
          const expanded = activeId === order.id;
          const previewId = `api-order-card-preview-${order.id}`;
          return (
            <article key={order.id} className={cn('grid min-w-0 gap-4 rounded-card bg-surface-container-low p-4', expanded ? 'ring-2 ring-carbon' : null)}>
              <div className="flex min-w-0 items-start gap-3">
                <Checkbox label={<span className="sr-only">Chọn {order.reference}</span>} checked={selectedIds.has(order.id)} onChange={() => onToggle(order.id)} />
                <div className="min-w-0 flex-1"><strong className="block break-all font-body text-body-sm text-on-surface">{order.reference}</strong><span className="break-words font-body text-caption text-graphite">{channelName(order.channelCode)}</span></div>
                <StatusCell order={order} />
              </div>
              <div className="flex min-w-0 items-center justify-between gap-3"><span className="min-w-0 break-words font-body text-caption text-graphite">{order.customerName || 'Không có tên khách'}</span><strong className="shrink-0 font-display text-lg tabular-nums text-on-surface">{order.totalFormatted}</strong></div>
              <div className="grid min-w-0 gap-1 font-body text-caption">
                {order.items[0] ? <><span className="break-words text-graphite">{order.items[0].name} · SL {order.items[0].quantity}</span><code className="break-all font-mono text-graphite">{order.items[0].sku}</code></> : <span className="text-graphite">{missingItemsLabel(order)}</span>}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
                <FulfillmentCell order={order} />
                <div className="flex flex-wrap gap-2">
                  <Button variant="secondary" size="sm" onClick={() => onPreview(order.id)} aria-expanded={expanded} aria-controls={previewId} aria-label={`${expanded ? 'Thu gọn xem nhanh' : 'Xem nhanh'} ${order.reference}`}>{expanded ? 'Thu gọn' : 'Xem nhanh'}</Button>
                  <Button size="sm" onClick={() => onOpen(order.id)}>Chi tiết</Button>
                </div>
              </div>
              <div id={previewId} hidden={!expanded}>
                {expanded ? <OrderApiInlinePreview key={order.id} order={order} revision={previewRevision} onOpenDetail={() => onOpen(order.id)} /> : null}
              </div>
            </article>
          );
        })}
      </div>

      <footer className="flex min-w-0 flex-col justify-between gap-3 border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4 sm:flex-row sm:items-center">
        <p className="font-body text-caption text-graphite">Đang hiển thị {orders.length} trên {totalRows} đơn phù hợp trong toàn bộ kết quả. Bấm “Tải thêm” để xem các đơn cũ hơn.</p>
        <Button variant="secondary" size="sm" disabled={!hasMore} loading={loadingMore} onClick={onLoadMore}>Tải thêm</Button>
      </footer>
      {loadMoreError ? <p className="border-t border-outline-variant/50 px-5 py-3 font-body text-caption text-danger" role="alert">Không tải thêm được. Hãy thử lại.</p> : null}
    </Card>
  );
}
