import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { ProductThumbnail } from '../../../components/common/ProductThumbnail';
import { cn } from '../../../lib/cn';
import type { DataSource } from '../../shared/useApiPage';
import type { InventoryLedgerRow, InventoryStatus, InventorySyncState } from '../inventory.types';

const statusPresentation: Record<InventoryStatus, { label: string; tone: 'success' | 'warning' | 'danger' }> = {
  in_stock: { label: 'Còn hàng', tone: 'success' },
  low_stock: { label: 'Sắp hết', tone: 'warning' },
  out_of_stock: { label: 'Hết hàng', tone: 'danger' },
};

const syncPresentation: Record<InventorySyncState, { label: string; dot: string }> = {
  synced: { label: 'Đã đồng bộ', dot: 'bg-traffic-maximize' },
  paused: { label: 'Tạm dừng', dot: 'bg-traffic-minimize' },
  unavailable: { label: 'Chưa đồng bộ', dot: 'bg-outline' },
};

function ChannelBadges({ row }: { row: InventoryLedgerRow }) {
  return <div className="flex flex-wrap gap-1" aria-label={`Kênh của ${row.sku}`}>{row.channels.map((channel) => <span key={channel.id} title={channel.label} className={cn('grid min-h-7 min-w-7 place-items-center rounded px-1.5 font-body text-[9px] font-bold text-pure-white', channel.colorClass, row.syncState !== 'synced' ? 'opacity-45' : null)}>{channel.shortLabel}</span>)}</div>;
}

function SyncLabel({ state }: { state: InventorySyncState }) {
  const item = syncPresentation[state];
  return <span className="mt-1 flex items-center gap-1.5 font-body text-[10px] text-graphite"><span className={cn('size-1.5 rounded-full', item.dot)} aria-hidden="true" />{item.label}</span>;
}

function ProductCell({ row }: { row: InventoryLedgerRow }) {
  return <div className="flex min-w-56 items-center gap-3"><ProductThumbnail productId={row.productId} mediaId={row.primaryMediaId} fallbackIcon={row.icon} className="size-10" /><span><strong className="block font-body text-body-sm text-on-surface">{row.productName}</strong><span className="mt-0.5 block font-body text-caption text-graphite">{row.variantLabel}</span></span></div>;
}

export interface InventoryLedgerProps {
  rows: InventoryLedgerRow[];
  totalRows: number;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: unknown;
  /** The cursor pager ("Tải thêm" / end-of-list note) only applies to live API rows. */
  source: DataSource;
  onLoadMore: () => void;
  currentPage: number;
  totalPages: number;
  canGoForward: boolean;
  onPageChange: (page: number) => void;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onInspect: (sku: string) => void;
  onOpenDetail: (sku: string) => void;
  /** Omitted when no visible row carries a price; the whole column disappears with it. */
  priceLabel?: (row: InventoryLedgerRow) => string;
}

export function InventoryLedger({ onInspect, onOpenDetail, onToggle, onToggleAll, onPageChange, priceLabel, rows, totalRows, selectedIds, hasMore, loadingMore, loadMoreError, source, onLoadMore, currentPage, totalPages, canGoForward }: InventoryLedgerProps) {
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));
  return (
    <Card className="overflow-hidden p-0">
      <header className="flex flex-col justify-between gap-3 border-b border-outline-variant/50 px-5 py-4 sm:flex-row sm:items-center">
        <div className="min-w-0"><h2 className="whitespace-nowrap font-display text-lg font-bold text-on-surface">Danh sách tồn kho</h2><p className="mt-1 font-body text-caption text-graphite">{`${rows.length} / ${totalRows} biến thể${hasMore ? ' đã tải' : ''}`}</p></div>
        <Button variant="secondary" size="sm" disabled title="Chưa có" className="shrink-0">{selectedIds.size > 0 ? `${selectedIds.size} SKU đã chọn` : 'Chọn SKU để thao tác'}</Button>
      </header>
      <div className="hidden w-full overflow-x-auto lg:block">
        <table className="w-full min-w-[1180px] border-collapse text-left">
          <caption className="sr-only">{'Danh sách tồn kho theo SKU'}</caption>
          <thead><tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
            <th className="w-12 px-4" scope="col"><Checkbox label={<span className="sr-only">Chọn tất cả SKU đang hiển thị</span>} checked={allVisibleSelected} onChange={onToggleAll} /></th><th className="px-3" scope="col">Sản phẩm & biến thể</th><th className="px-3" scope="col">SKU</th><th className="px-3 text-right" scope="col">Tồn kho</th><th className="px-3 text-right" scope="col">Đang giữ</th><th className="px-3 text-right" scope="col">Tồn đệm</th><th className="px-3 text-right" scope="col">Có thể bán</th>{priceLabel ? <th className="px-3 text-right" scope="col">Giá</th> : null}<th className="px-3" scope="col">Kênh</th><th className="px-3" scope="col">Trạng thái</th><th className="px-3" scope="col">Cập nhật</th><th className="px-4 text-right" scope="col">Thao tác</th>
          </tr></thead>
          <tbody className="divide-y divide-surface-container">
            {rows.map((row) => {
              const status = statusPresentation[row.status];
              return <tr key={row.id} className={cn('font-body text-body-sm hover:bg-surface-container-low/60', row.status === 'low_stock' ? 'bg-badge-blocked-bg/20' : null)}>
                <td className="px-4 py-3"><Checkbox label={<span className="sr-only">Chọn {row.sku}</span>} checked={selectedIds.has(row.id)} onChange={() => onToggle(row.id)} /></td>
                <td className="px-3 py-3"><ProductCell row={row} /></td>
                <td className="px-3 py-3"><code className="font-mono text-caption font-semibold text-on-surface">{row.sku}</code>{row.barcode ? <span className="mt-1 block font-mono text-[10px] text-graphite">{row.barcode}</span> : null}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-on-surface">{row.onHand}</td>
                <td className="px-3 py-3 text-right"><span className="font-semibold tabular-nums text-on-surface" title={row.reservedNote}>{row.reserved}</span>{row.reservedNote ? <span className="material-symbols-outlined ml-1 align-middle text-sm text-graphite" aria-hidden="true">info</span> : null}</td>
                <td className="px-3 py-3 text-right"><span className="font-semibold tabular-nums text-on-surface">{row.safetyBuffer}</span></td>
                <td className="px-3 py-3 text-right"><strong className={cn('font-display text-lg tabular-nums', row.availableToSell === 0 ? 'text-error' : row.status === 'low_stock' ? 'text-badge-blocked-text' : 'text-on-surface')}>{row.availableToSell}</strong><span className="block text-caption text-graphite">sản phẩm</span></td>
                {priceLabel ? <td className="px-3 py-3 text-right font-semibold tabular-nums text-on-surface">{priceLabel(row)}</td> : null}
                <td className="px-3 py-3"><ChannelBadges row={row} /><SyncLabel state={row.syncState} /></td>
                <td className="px-3 py-3"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                <td className="px-3 py-3 text-caption text-graphite">{row.updatedLabel}</td>
                <td className="px-4 py-3 text-right"><div className="flex justify-end gap-1"><Button variant="ghost" size="sm" onClick={() => onInspect(row.sku)} className="px-2" aria-label="Tra cứu nhanh"><span className="material-symbols-outlined text-base" aria-hidden="true">database</span></Button><Button variant="ghost" size="sm" onClick={() => onOpenDetail(row.sku)} className="px-2">Chi tiết <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button></div></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-4 lg:hidden">
        {rows.map((row) => {
          const status = statusPresentation[row.status];
          return <article key={row.id} className={cn('grid min-w-0 gap-4 rounded-card bg-surface-container-low p-4', row.status === 'low_stock' ? 'bg-badge-blocked-bg/30' : null)}>
            <div className="flex items-start gap-3"><Checkbox label={<span className="sr-only">Chọn {row.sku}</span>} checked={selectedIds.has(row.id)} onChange={() => onToggle(row.id)} /><ProductThumbnail productId={row.productId} mediaId={row.primaryMediaId} fallbackIcon={row.icon} className="size-12" /><div className="min-w-0 flex-1"><strong className="block font-body text-body-sm text-on-surface">{row.productName}</strong><span className="font-body text-caption text-graphite">{row.variantLabel}</span><code className="mt-1 block break-all font-mono text-caption font-semibold text-on-surface">{row.sku}</code></div><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
            <dl className="grid grid-cols-4 gap-1 rounded-control bg-pure-white p-3 text-center"><div><dt className="font-body text-[9px] text-graphite">Tồn</dt><dd className="mt-1 font-display font-bold tabular-nums">{row.onHand}</dd></div><div><dt className="font-body text-[9px] text-graphite">Giữ</dt><dd className="mt-1 font-display font-bold tabular-nums">{row.reserved}</dd></div><div><dt className="font-body text-[9px] text-graphite">Đệm</dt><dd className="mt-1 font-display font-bold tabular-nums">{row.safetyBuffer}</dd></div><div><dt className="font-body text-[9px] text-graphite">Bán</dt><dd className={cn('mt-1 font-display font-bold tabular-nums', row.availableToSell === 0 ? 'text-error' : 'text-badge-progress-text')}>{row.availableToSell}</dd></div></dl>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><ChannelBadges row={row} /><SyncLabel state={row.syncState} /></div><div className="flex gap-2"><Button variant="secondary" size="sm" onClick={() => onInspect(row.sku)}>Tra cứu nhanh</Button><Button size="sm" onClick={() => onOpenDetail(row.sku)}>Chi tiết</Button></div></div>
          </article>;
        })}
      </div>
      <footer className="flex flex-col justify-between gap-3 border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4 sm:flex-row sm:items-center">
        <div className="grid gap-1">
          <p className="font-body text-caption text-graphite">Trang này hiển thị tối đa 50 SKU.</p>
          {/* Cursor-pager states are live-API facts. The fixture's pager is a stub, so it
              never claims an end of list it did not walk to. */}
          {source === 'api' && !hasMore && !loadMoreError ? <p className="font-body text-caption text-graphite">Đã hiển thị hết.</p> : null}
          {loadMoreError ? <p role="alert" className="font-body text-caption text-error">Không tải thêm được. Các dòng ở trên vẫn đúng.</p> : null}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3 sm:justify-end">
          {source === 'api' && hasMore ? (
            <Button
              variant="secondary"
              size="sm"
              disabled={loadingMore}
              loading={loadingMore}
              loadingLabel="Đang tải…"
              onClick={onLoadMore}
            >
              Tải thêm
            </Button>
          ) : null}
          <nav className="flex items-center justify-between gap-3 sm:justify-end" aria-label="Phân trang tồn kho">
            <Button variant="secondary" size="sm" disabled={currentPage <= 1 || loadingMore} onClick={() => onPageChange(currentPage - 1)} aria-label="Trang trước">← Trước</Button>
            <span className="min-w-max font-body text-caption font-semibold text-on-surface" aria-live="polite">Trang {currentPage}{hasMore ? ' · còn dữ liệu' : ` / ${totalPages}`}</span>
            {/* In live mode a "Sau" button with nothing behind it is indistinguishable from
                "the next page has not loaded yet" — omitting next_cursor ends the walk, so
                the control goes away. The fixture keeps its stub pager, disabled at both ends. */}
            {source === 'api' && !canGoForward ? null : (
              <Button variant="secondary" size="sm" disabled={!canGoForward || loadingMore} loading={loadingMore} loadingLabel="Đang tải…" onClick={() => onPageChange(currentPage + 1)} aria-label="Trang sau">Sau →</Button>
            )}
          </nav>
        </div>
      </footer>
    </Card>
  );
}
