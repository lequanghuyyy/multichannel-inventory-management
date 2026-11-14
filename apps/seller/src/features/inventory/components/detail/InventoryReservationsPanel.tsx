import { useEffect, useState } from 'react';
import { useInventoryReservations } from '../../hooks/useInventoryReservations';
import { navigate, href } from '../../../../app/routes';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { ErrorState, LoadingState } from '../../../../components/common/ScreenState';

function statusLabel(status: string, due: boolean, held: boolean): string {
  if (status === 'ACTIVE' && due) return 'Quá hạn · vẫn đang giữ';
  if (status === 'ACTIVE' && held) return 'Đang giữ';
  return status;
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

export function InventoryReservationsPanel({ sku, variantId, reserved, refreshToken = 0 }: { sku: string; variantId: string; reserved: number; refreshToken?: number }) {
  const ledger = useInventoryReservations(variantId);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { if (refreshToken > 0) ledger.revalidate(); }, [refreshToken]);

  const visibleItems = showAll ? ledger.items : ledger.items.slice(0, 3);

  return (
    <Card className="grid gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-on-surface">Hàng đang giữ</h2>
          <p className="mt-1 font-body text-caption text-graphite">Reservation hoạt động cho SKU {sku}; số giữ lấy từ tồn Core phía trên.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={ledger.refresh} loading={ledger.state === 'loading'}>Làm mới</Button>
      </header>

      <dl className="grid grid-cols-2 gap-3 rounded-control bg-surface-container-low p-3 font-body">
        <div><dt className="text-caption text-graphite">Số lượng đang giữ</dt><dd className="mt-1 font-display text-xl font-bold tabular-nums text-on-surface">{reserved.toLocaleString('vi-VN')} chiếc</dd></div>
        <div><dt className="text-caption text-graphite">Reservation hoạt động</dt><dd className="mt-1 font-display text-xl font-bold tabular-nums text-on-surface">{typeof ledger.activeCount === 'number' ? ledger.activeCount.toLocaleString('vi-VN') : '—'}</dd></div>
      </dl>

      {ledger.state === 'loading' && ledger.items.length === 0 ? <LoadingState label="Đang tải reservation…" /> : null}
      {ledger.state === 'error' && ledger.items.length === 0 ? <ErrorState error={ledger.error} retry={ledger.refresh} /> : null}
      {ledger.state === 'success' && ledger.items.length === 0 ? <p className="rounded-control bg-surface-container-low p-3 font-body text-caption text-graphite">Không có reservation hoạt động cho SKU này.</p> : null}

      {visibleItems.length > 0 ? <div className="grid gap-2">{visibleItems.map((hold) => {
        const label = statusLabel(hold.status, hold.is_due, hold.is_held);
        const order = hold.has_order && hold.order_reference && hold.order_id;
        return <article key={hold.id} className="grid gap-2 rounded-control bg-surface-container-low p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <strong className="block truncate font-body text-body-sm text-on-surface">{order ? <button type="button" onClick={() => navigate(href({ name: 'order-detail', id: hold.order_id }))} className="underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">{hold.order_reference}</button> : 'Chưa liên kết đơn hàng'}</strong>
              <span className="font-mono text-caption text-graphite">{hold.quantity} chiếc</span>
            </div>
            <span className={`rounded-full px-2 py-1 text-right font-body text-[10px] font-semibold ${hold.is_held ? 'bg-badge-progress-bg text-badge-progress-text' : 'bg-amber-100 text-amber-900'}`}>{label}</span>
          </div>
          <div className="flex items-center justify-between gap-3 font-body text-caption text-graphite"><span>Hết hạn</span><time dateTime={hold.expires_at}>{formatDate(hold.expires_at)}</time></div>
        </article>;
      })}</div> : null}

      {ledger.items.length > 3 || ledger.nextCursor ? <Button variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Thu gọn' : `Xem tất cả${typeof ledger.activeCount === 'number' ? ` (${ledger.activeCount})` : ''}`}</Button> : null}
      {showAll && ledger.nextCursor ? <Button variant="secondary" onClick={ledger.loadMore} loading={ledger.loadingMore}>Tải thêm reservation</Button> : null}
      {ledger.error && ledger.items.length > 0 ? <p role="status" className="font-body text-caption text-amber-800">Không tải được dữ liệu mới hơn. Các reservation đã tải vẫn được giữ lại.</p> : null}
    </Card>
  );
}
