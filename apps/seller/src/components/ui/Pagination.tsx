import { Button } from './Button';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  ariaLabel?: string;
}

export function Pagination({ ariaLabel = 'Phân trang', onPageChange, page, totalPages }: PaginationProps) {
  const safeTotal = Math.max(1, totalPages);
  const safePage = Math.min(Math.max(1, page), safeTotal);

  return (
    <nav className="flex items-center justify-between gap-4" aria-label={ariaLabel}>
      <p className="font-body text-caption text-graphite">Trang {safePage} / {safeTotal}</p>
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} aria-label="Trang trước">
          <span className="material-symbols-outlined text-lg" aria-hidden="true">chevron_left</span>
        </Button>
        <Button variant="secondary" size="sm" disabled={safePage >= safeTotal} onClick={() => onPageChange(safePage + 1)} aria-label="Trang sau">
          <span className="material-symbols-outlined text-lg" aria-hidden="true">chevron_right</span>
        </Button>
      </div>
    </nav>
  );
}
