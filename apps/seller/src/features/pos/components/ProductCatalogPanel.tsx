import { useMemo, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { cn } from '../../../lib/cn';
import type { PosCategory, PosProductFixture } from '../pos.types';
import { ProductCard } from './ProductCard';

const categoryLabels: ReadonlyArray<{ value: 'all' | PosCategory; label: string }> = [
  { value: 'all', label: 'Tất cả' },
  { value: 'shoes', label: 'Giày' },
  { value: 'bags', label: 'Túi & Da' },
  { value: 'apparel', label: 'Thời trang' },
  { value: 'accessories', label: 'Phụ kiện' },
];

export function ProductCatalogPanel({
  products,
  search,
  onSearchChange,
  onAdd,
  interactionDisabled = false,
  canManageAllocation = false,
  hasMore,
  loadingMore,
  loadMoreError,
  onLoadMore,
}: {
  products: PosProductFixture[];
  search: string;
  onSearchChange: (value: string) => void;
  onAdd: (product: PosProductFixture) => void;
  interactionDisabled?: boolean;
  canManageAllocation?: boolean;
  hasMore: boolean;
  loadingMore: boolean;
  loadMoreError: unknown;
  onLoadMore: () => void;
}) {
  const [category, setCategory] = useState<'all' | PosCategory>('all');
  const [color, setColor] = useState('all');
  const [size, setSize] = useState('all');

  const colors = useMemo(() => Array.from(new Set(products.map((product) => product.color))), [products]);
  const sizes = useMemo(() => Array.from(new Set(products.map((product) => product.size))), [products]);
  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const product of products) counts.set(product.category, (counts.get(product.category) ?? 0) + 1);
    return counts;
  }, [products]);
  const filtered = products.filter((product) => {
    const query = search.trim().toLocaleLowerCase('vi');
    const matchesSearch = !query || [product.name, product.sku, product.variant].some((value) => value.toLocaleLowerCase('vi').includes(query));
    return matchesSearch
      && (category === 'all' || product.category === category)
      && (color === 'all' || product.color === color)
      && (size === 'all' || product.size === size);
  });

  return (
    <section className="grid min-w-0 gap-5" aria-label="Danh mục sản phẩm" aria-busy={loadingMore}>
      <div className="grid min-w-0 gap-4 rounded-lg border border-sandstone bg-pure-white p-4 shadow-card sm:p-5">
        <label className="relative block min-w-0">
          <span className="sr-only">Tìm sản phẩm theo SKU hoặc tên</span>
          <span className="material-symbols-outlined pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-lg text-graphite" aria-hidden="true">search</span>
          <input
            aria-label="Tìm sản phẩm theo SKU hoặc tên"
            className="min-h-11 w-full min-w-0 rounded-control border border-outline-variant bg-pure-white pl-10 pr-3 font-body text-body-sm text-on-surface outline-none focus:border-carbon focus:ring-2 focus:ring-carbon/20"
            maxLength={64}
            placeholder="Tìm theo tên sản phẩm hoặc SKU…"
            type="search"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <div className="flex max-w-full gap-2 overflow-x-auto pb-1" aria-label="Lọc theo loại sản phẩm">
          {categoryLabels.filter((option) => option.value === 'all' || (categoryCounts.get(option.value) ?? 0) > 0).map((option) => (
            <button
              aria-pressed={category === option.value}
              className={cn('min-h-10 shrink-0 rounded-full px-3 font-body text-caption font-bold transition-colors', category === option.value ? 'bg-carbon text-pure-white' : 'bg-surface-container-low text-graphite hover:text-on-surface')}
              key={option.value}
              type="button"
              onClick={() => setCategory(option.value)}
            >
              {option.label} ({option.value === 'all' ? products.length : categoryCounts.get(option.value) ?? 0})
            </button>
          ))}
        </div>
        <div className="grid min-w-0 gap-3 sm:grid-cols-2">
          <Select label="Màu sắc" value={color} onChange={(event) => setColor(event.target.value)}>
            <option value="all">Tất cả màu</option>
            {colors.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
          <Select label="Kích thước" value={size} onChange={(event) => setSize(event.target.value)}>
            <option value="all">Tất cả kích thước</option>
            {sizes.map((value) => <option key={value} value={value}>{value}</option>)}
          </Select>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-caption text-graphite">Đang hiển thị {products.length} biến thể đã tải · {filtered.length} phù hợp bộ lọc</p>
        {hasMore ? <span className="font-body text-caption text-graphite">Còn trang sản phẩm chưa tải</span> : null}
      </div>

      {filtered.length > 0 ? (
        <div className="grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2">
          {filtered.map((product) => <ProductCard key={product.id} product={product} onAdd={onAdd} interactionDisabled={interactionDisabled} canManageAllocation={canManageAllocation} />)}
        </div>
      ) : (
        <div className="rounded-card bg-surface-container-low p-6 font-body text-body-sm text-graphite">
          {hasMore ? 'Chưa có sản phẩm phù hợp trong các trang đã tải. Tải thêm để tìm tiếp.' : 'Không có sản phẩm phù hợp với bộ lọc hiện tại.'}
        </div>
      )}

      {hasMore ? <Button variant="secondary" disabled={loadingMore} loading={loadingMore} onClick={onLoadMore}>Tải thêm sản phẩm</Button> : null}
      {loadMoreError ? <p className="rounded-control bg-error-container p-3 font-body text-caption text-on-error-container" role="alert">Không tải được trang sản phẩm tiếp theo. Giỏ hàng hiện tại vẫn được giữ nguyên.</p> : null}
    </section>
  );
}
