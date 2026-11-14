import { useEffect, useRef } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../lib/cn';
import type { ProductCatalogItem } from '../product.types';
import { formatProductUpdatedAt } from '../product.utils';
import { ProductChannelBadges, ProductIdentity, ProductInventorySummary, ProductStatusBadge } from './ProductCatalogParts';

export interface ProductTableProps {
  products: readonly ProductCatalogItem[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onToggleAll: () => void;
  onOpen: (id: string) => void;
}

export function ProductTable({ onOpen, onToggle, onToggleAll, products, selectedIds }: ProductTableProps) {
  const selectAllRef = useRef<HTMLInputElement>(null);
  const selectedVisible = products.filter((product) => selectedIds.has(product.id)).length;
  const allSelected = products.length > 0 && selectedVisible === products.length;

  useEffect(() => {
    if (selectAllRef.current) selectAllRef.current.indeterminate = selectedVisible > 0 && !allSelected;
  }, [allSelected, selectedVisible]);

  return (
    <Card className="overflow-hidden p-0">
      <div className="w-full overflow-x-auto">
        <table className="min-w-[1080px] w-full border-collapse text-left">
          <caption className="sr-only">Danh sách master product và phân bổ tồn kho</caption>
          <thead>
            <tr className="h-11 border-b border-outline-variant/50 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
              <th className="w-12 px-3 text-center" scope="col"><input ref={selectAllRef} type="checkbox" checked={allSelected} onChange={onToggleAll} aria-label="Chọn tất cả sản phẩm đang hiển thị" className="size-4 accent-carbon" /></th>
              <th className="min-w-[270px] px-3" scope="col">Sản phẩm &amp; Master SKU</th>
              <th className="w-36 px-3" scope="col">Danh mục</th>
              <th className="w-28 px-3" scope="col">Variant / SKU</th>
              <th className="w-56 px-3" scope="col">Tồn &amp; phân bổ</th>
              <th className="min-w-[170px] px-3" scope="col">Kênh bán</th>
              <th className="w-28 px-3" scope="col">Trạng thái</th>
              <th className="w-36 px-3" scope="col">Cập nhật</th>
              <th className="w-28 px-3 text-right" scope="col">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container font-body text-body-sm">
            {products.map((product) => {
              const selected = selectedIds.has(product.id);
              return (
                <tr key={product.id} className={cn('transition-colors hover:bg-surface-container-low/60', selected ? 'bg-badge-neutral-bg/35' : null)}>
                  <td className="px-3 py-3 text-center"><input type="checkbox" checked={selected} onChange={() => onToggle(product.id)} aria-label={`Chọn ${product.name}`} className="size-4 accent-carbon" /></td>
                  <td className="px-3 py-3"><ProductIdentity product={product} /></td>
                  <td className="px-3 py-3 text-on-surface-variant">{product.category}</td>
                  <td className="px-3 py-3"><strong className="tabular-nums text-on-surface">{product.variants.length}</strong><span className="block text-caption text-graphite">SKU</span></td>
                  <td className="px-3 py-3"><ProductInventorySummary product={product} /></td>
                  <td className="px-3 py-3"><ProductChannelBadges product={product} /></td>
                  <td className="px-3 py-3"><ProductStatusBadge status={product.status} /></td>
                  <td className="px-3 py-3"><time className="text-caption leading-4 text-graphite" dateTime={product.updatedAt}>{formatProductUpdatedAt(product.updatedAt)}</time></td>
                  <td className="px-3 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => onOpen(product.id)} className="px-2">Chi tiết <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}
