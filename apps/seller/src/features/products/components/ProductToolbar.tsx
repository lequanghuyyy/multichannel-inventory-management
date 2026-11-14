import { Button } from '../../../components/ui/Button';
import { cn } from '../../../lib/cn';

export type ProductViewMode = 'table' | 'grid';

export interface ProductToolbarProps {
  resultCount: number;
  totalCount: number;
  selectedCount: number;
  filtersActive: boolean;
  viewMode: ProductViewMode;
  onReset: () => void;
  onViewModeChange: (mode: ProductViewMode) => void;
  onExportSelected?: () => void;
  /**
   * Set only in fixture mode. The count line names the source out loud because this bar sits
   * directly above the rows, so fixture counts are named explicitly.
   */
  fixtureOnly?: boolean;
  /**
   * Hide the table/grid view toggle. The API-backed table (`ProductApiTable`) has no grid
   * variant, so showing a toggle that changes nothing is worse than hiding it.
   */
  hideViewToggle?: boolean;
}

export function ProductToolbar({ filtersActive, hideViewToggle, onExportSelected, onReset, onViewModeChange, resultCount, selectedCount, totalCount, viewMode, fixtureOnly }: ProductToolbarProps) {
  return (
    <div className="flex min-h-12 flex-col justify-between gap-3 border-t border-outline-variant/50 pt-4 sm:flex-row sm:items-center">
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="secondary" size="sm" disabled={selectedCount === 0 || !onExportSelected} title={selectedCount === 0 ? 'Chọn ít nhất một sản phẩm' : 'Xuất các sản phẩm đã chọn'} onClick={onExportSelected} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">file_download</span>}>
          {selectedCount > 0 ? `Xuất ${selectedCount} đã chọn` : 'Xuất mục đã chọn'}
        </Button>
        <span className="flex items-center gap-2 font-body text-body-sm text-graphite" aria-live="polite">
          <span className="size-2 rounded-full bg-traffic-maximize" aria-hidden="true" />
          Hiển thị <strong className="text-on-surface">{resultCount}</strong> / {totalCount} {fixtureOnly ? 'sản phẩm mẫu' : 'sản phẩm'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onReset} disabled={!filtersActive} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">restart_alt</span>}>Đặt lại</Button>
        {hideViewToggle ? null : (
          <>
            <span className="hidden h-5 w-px bg-outline-variant/60 lg:block" aria-hidden="true" />
            {(['table', 'grid'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                aria-label={mode === 'table' ? 'Xem dạng bảng' : 'Xem dạng lưới'}
                aria-pressed={viewMode === mode}
                className={cn('hidden size-10 place-items-center rounded-control transition-colors lg:grid', viewMode === mode ? 'bg-carbon text-pure-white' : 'bg-surface-container-low text-graphite hover:text-on-surface')}
                onClick={() => onViewModeChange(mode)}
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">{mode === 'table' ? 'table_rows' : 'grid_view'}</span>
              </button>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
