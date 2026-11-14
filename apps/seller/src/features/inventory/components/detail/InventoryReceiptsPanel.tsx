import { useEffect, useState } from 'react';
import { useInventorySKUReceipts } from '../../hooks/useInventorySKUReceipts';
import { href, navigate } from '../../../../app/routes';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { ErrorState, LoadingState } from '../../../../components/common/ScreenState';

const statusLabel: Record<string, string> = {
  DRAFT: 'Bản nháp',
  PARTIALLY_RECEIVED: 'Đang nhận',
  RECEIVED: 'Đã nhận đủ',
  CLOSED_SHORT: 'Đã đóng thiếu',
  CANCELLED: 'Đã hủy',
};

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

export function InventoryReceiptsPanel({ sku, canCreate = true, refreshToken = 0 }: { sku: string; canCreate?: boolean; refreshToken?: number }) {
  const ledger = useInventorySKUReceipts(sku);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => { if (refreshToken > 0) ledger.revalidate(); }, [refreshToken]);
  const visibleItems = showAll ? ledger.items : ledger.items.slice(0, 3);

  return (
    <Card className="grid gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-lg font-bold text-on-surface">Phiếu nhập liên quan</h2><p className="mt-1 font-body text-caption text-graphite">Lượng chấp nhận mới làm tăng tồn; lượng từ chối được theo dõi riêng.</p></div>
        {canCreate ? <Button size="sm" onClick={() => navigate(`/receipts/new?sku=${encodeURIComponent(sku)}`)}>Tạo phiếu nhập</Button> : null}
      </header>
      <Button variant="secondary" size="sm" onClick={ledger.refresh} loading={ledger.state === 'loading'} className="justify-self-start">Làm mới</Button>

      {ledger.state === 'loading' && ledger.items.length === 0 ? <LoadingState label="Đang tải phiếu nhập…" /> : null}
      {ledger.state === 'error' && ledger.items.length === 0 ? <ErrorState error={ledger.error} retry={ledger.refresh} /> : null}
      {ledger.state === 'success' && ledger.items.length === 0 ? <p className="rounded-control bg-surface-container-low p-3 font-body text-caption text-graphite">Chưa có phiếu nhập nào chứa SKU này.</p> : null}

      {visibleItems.length > 0 ? <div className="grid gap-2">{visibleItems.map((receipt) => <article key={receipt.id} className="grid gap-3 rounded-control bg-surface-container-low p-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0"><Button variant="ghost" size="sm" className="h-auto min-h-0 justify-start px-0 py-0 font-mono font-bold" onClick={() => navigate(href({ name: 'receipt-detail', id: receipt.id }))}>{receipt.receipt_number}</Button><p className="truncate font-body text-caption text-graphite">{receipt.supplier_name}</p></div>
          <span className="shrink-0 rounded-full bg-surface-container-high px-2 py-1 font-body text-[10px] font-semibold text-on-surface-variant">{statusLabel[receipt.status] ?? receipt.status}</span>
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 font-body text-caption">
          <dt className="text-graphite">Dự kiến</dt><dd className="text-right font-mono text-on-surface">{receipt.expected_quantity.toLocaleString('vi-VN')}</dd>
          <dt className="text-graphite">Đã nhập kho</dt><dd className="text-right font-mono text-badge-progress-text">{receipt.accepted_quantity.toLocaleString('vi-VN')}</dd>
          <dt className="text-graphite">Bị từ chối</dt><dd className="text-right font-mono text-error">{receipt.rejected_quantity.toLocaleString('vi-VN')}</dd>
          <dt className="text-graphite">Còn chờ nhận</dt><dd className="text-right font-mono text-on-surface">{receipt.pending_quantity.toLocaleString('vi-VN')}</dd>
        </dl>
        <p className="font-body text-[11px] text-graphite">{receipt.received_at ? `Nhận gần nhất ${formatDate(receipt.received_at)}` : `Tạo ngày ${formatDate(receipt.created_at)}`}{receipt.status === 'CLOSED_SHORT' ? ' · đã đóng, không còn lượng dự kiến sẽ nhận' : receipt.status === 'DRAFT' ? ' · bản nháp chưa cộng tồn' : ''}</p>
      </article>)}</div> : null}

      {ledger.items.length > 3 || ledger.nextCursor ? <Button variant="ghost" onClick={() => setShowAll((value) => !value)}>{showAll ? 'Thu gọn' : 'Xem tất cả phiếu nhập'}</Button> : null}
      {showAll && ledger.nextCursor ? <Button variant="secondary" onClick={ledger.loadMore} loading={ledger.loadingMore}>Tải thêm phiếu nhập</Button> : null}
      {ledger.error && ledger.items.length > 0 ? <p role="status" className="font-body text-caption text-amber-800">Không tải được dữ liệu mới hơn. Các phiếu đã tải vẫn được giữ lại.</p> : null}
    </Card>
  );
}
