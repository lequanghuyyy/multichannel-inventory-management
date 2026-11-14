import { categoryLabel } from '../../../lib/category';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { cn } from '../../../lib/cn';
import type { ProductApiRow } from '../product.api';
import type { ProductStatus } from '../product.types';
import { ProductThumbnail } from '../../../components/common/ProductThumbnail';
import type { ProductViewMode } from './ProductToolbar';

const statusPresentation: Record<ProductStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  active: { label: 'Đang bán', tone: 'success' },
  draft: { label: 'Bản nháp', tone: 'neutral' },
  under_review: { label: 'Đang duyệt', tone: 'warning' },
  archived: { label: 'Đã lưu trữ', tone: 'neutral' },
  out_of_stock: { label: 'Hết hàng', tone: 'danger' },
};

export interface ProductApiTableProps {
  rows: ProductApiRow[];
  totalRows: number;
  selectedIds: Set<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: unknown;
  onLoadMore: () => void;
  viewMode: ProductViewMode;
}

/**
 * The API-backed catalogue as its contract actually describes it.
 *
 * A REPLACEMENT for `ProductTable`, not a merge. That table renders variants, prices, channel
 * bindings, a sellable-rate bar and a last-updated timestamp; `ProductSummary` has none of
 * those fields, so reusing it would mean one detail request per row for prices and SKUs, and
 * blank cells for everything the contract does not carry even after that. The screen shows a
 * product, its four SQL-summed totals and its status — which is exactly what it can honestly
 * claim to know.
 *
 * The navigation target is unchanged, and that is deliberate: `ProductDetailPage` still reads
 * the prototype dossier, which is correct for now because it shows velocity, movement history
 * and procurement — none of which the backend has.
 */
export function ProductApiTable({ rows, totalRows, selectedIds, onToggle, onToggleAll, onOpen, hasMore, loadingMore, loadMoreError, onLoadMore, viewMode }: ProductApiTableProps) {
  const allVisibleSelected = rows.length > 0 && rows.every((row) => selectedIds.has(row.id));

  const totals = (label: string, value: React.ReactNode, className?: string) => (
    <div className="px-3 py-3 text-right">
      <span className={cn('font-display text-lg tabular-nums', className)}>{value}</span>
      <span className="block text-caption text-graphite">{label}</span>
    </div>
  );

  const header = (
    <div className="min-w-0"><h2 className="whitespace-nowrap font-display text-lg font-bold text-on-surface">Danh sách sản phẩm</h2><p className="mt-1 font-body text-caption text-graphite">{rows.length} / {totalRows} sản phẩm · tổng tồn kho của tất cả biến thể</p></div>
  );

  return (
    <Card className="overflow-hidden p-0" aria-label={viewMode === 'grid' ? 'Lưới sản phẩm API' : undefined}>
      <header className="flex flex-col justify-between gap-3 border-b border-outline-variant/50 px-5 py-4 sm:flex-row sm:items-center">{header}</header>
      <div className={cn('w-full overflow-x-auto', viewMode === 'table' ? 'hidden lg:block' : 'hidden')}>
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <caption className="sr-only">Danh sách sản phẩm</caption>
          <thead><tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
            <th className="w-12 px-4" scope="col"><Checkbox label={<span className="sr-only">Chọn tất cả sản phẩm đang hiển thị</span>} checked={allVisibleSelected} onChange={onToggleAll} /></th><th className="px-3" scope="col">Sản phẩm</th><th className="px-3" scope="col">SKU gốc</th><th className="px-3" scope="col">Danh mục</th><th className="px-3 text-right" scope="col">Biến thể</th><th className="px-3 text-right" scope="col">Tồn kho</th><th className="px-3 text-right" scope="col">Đang giữ</th><th className="px-3 text-right" scope="col">Tồn đệm</th><th className="px-3 text-right" scope="col">Có thể bán</th><th className="px-3" scope="col">Trạng thái</th><th className="px-4 text-right" scope="col">Thao tác</th>
          </tr></thead>
          <tbody className="divide-y divide-surface-container">
            {rows.map((row) => {
              const status = statusPresentation[row.status];
              return <tr key={row.id} className="font-body text-body-sm hover:bg-surface-container-low/60">
                <td className="px-4 py-3"><Checkbox label={<span className="sr-only">Chọn {row.name}</span>} checked={selectedIds.has(row.id)} onChange={() => onToggle(row.id)} /></td>
                <td className="px-3 py-3"><div className="flex min-w-56 items-center gap-3"><ProductThumbnail productId={row.id} mediaId={row.primaryMediaId} category={row.category} className="size-10" /><span className="min-w-0"><strong className="block truncate text-on-surface">{row.name}</strong>{row.brand ? <span className="block font-body text-caption text-graphite">{row.brand}</span> : null}</span></div></td>
                <td className="px-3 py-3"><code className="font-mono text-caption font-semibold text-on-surface">{row.masterSku || '—'}</code></td>
                <td className="px-3 py-3 text-caption text-graphite">{categoryLabel(row.category)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-on-surface">{row.variantCount}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-on-surface">{row.onHand}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-on-surface">{row.reserved}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums text-on-surface">{row.safetyBuffer}</td>
                <td className={cn('px-3 py-3', row.availableToSell === 0 ? 'bg-badge-blocked-bg/25' : null)}>{totals('sản phẩm', row.availableToSell, row.availableToSell === 0 ? 'text-error' : undefined)}</td>
                <td className="px-3 py-3"><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => onOpen(row.id)}>Chi tiết <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button></td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <div className={cn('grid gap-3 p-4', viewMode === 'table' ? 'lg:hidden' : 'sm:grid-cols-2 lg:grid-cols-3')}>
        {rows.map((row) => {
          const status = statusPresentation[row.status];
          return <article key={row.id} className="grid min-w-0 gap-4 rounded-card bg-surface-container-low p-4">
            <div className="flex items-start gap-3"><Checkbox label={<span className="sr-only">Chọn {row.name}</span>} checked={selectedIds.has(row.id)} onChange={() => onToggle(row.id)} /><ProductThumbnail productId={row.id} mediaId={row.primaryMediaId} category={row.category} className="size-12" /><div className="min-w-0 flex-1"><strong className="block font-body text-body-sm text-on-surface">{row.name}</strong><code className="block font-mono text-caption text-graphite">{row.masterSku || '—'}</code></div><StatusBadge tone={status.tone}>{status.label}</StatusBadge></div>
            <dl className="grid grid-cols-4 gap-1 rounded-control bg-pure-white p-3 text-center"><div><dt className="font-body text-[9px] text-graphite">Biến thể</dt><dd className="mt-1 font-display font-bold tabular-nums">{row.variantCount}</dd></div><div><dt className="font-body text-[9px] text-graphite">Tồn</dt><dd className="mt-1 font-display font-bold tabular-nums">{row.onHand}</dd></div><div><dt className="font-body text-[9px] text-graphite">Giữ</dt><dd className="mt-1 font-display font-bold tabular-nums">{row.reserved}</dd></div><div><dt className="font-body text-[9px] text-graphite">Bán</dt><dd className={cn('mt-1 font-display font-bold tabular-nums', row.availableToSell === 0 ? 'text-error' : 'text-badge-progress-text')}>{row.availableToSell}</dd></div></dl>
            <div className="flex justify-end"><Button size="sm" onClick={() => onOpen(row.id)}>Chi tiết</Button></div>
          </article>;
        })}
      </div>
      <footer className="flex flex-col justify-between gap-3 border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4 sm:flex-row sm:items-center">
        <p className="font-body text-caption text-graphite">Đang hiển thị {rows.length} sản phẩm.</p>
        {loadMoreError ? <p role="alert" className="font-body text-caption text-error">Không tải thêm được. Các dòng ở trên vẫn đúng.</p> : null}
        {hasMore ? <Button variant="secondary" size="sm" onClick={onLoadMore} loading={loadingMore} loadingLabel="Đang tải…">Tải thêm</Button> : <p className="font-body text-caption text-graphite">Đã hiển thị hết.</p>}
      </footer>
    </Card>
  );
}
