import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { cn } from '../../../lib/cn';
import type { ProductCatalogItem } from '../product.types';
import { formatProductUpdatedAt } from '../product.utils';
import { ProductChannelBadges, ProductIdentity, ProductInventorySummary, ProductStatusBadge } from './ProductCatalogParts';

export interface ProductGridProps {
  products: readonly ProductCatalogItem[];
  selectedIds: ReadonlySet<string>;
  onToggle: (id: string) => void;
  onOpen: (id: string) => void;
}

export function ProductGrid({ onOpen, onToggle, products, selectedIds }: ProductGridProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      {products.map((product) => {
        const selected = selectedIds.has(product.id);
        return (
          <Card key={product.id} className={cn('grid gap-4 transition-colors', selected ? 'bg-badge-neutral-bg/35 ring-badge-neutral-text/25' : null)}>
            <div className="flex items-start justify-between gap-3">
              <ProductIdentity product={product} />
              <input type="checkbox" checked={selected} onChange={() => onToggle(product.id)} aria-label={`Chọn ${product.name}`} className="mt-1 size-4 shrink-0 accent-carbon" />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2"><ProductStatusBadge status={product.status} /><span className="font-body text-caption text-graphite">{product.category} · {product.variants.length} SKU</span></div>
            <ProductInventorySummary product={product} />
            <ProductChannelBadges product={product} />
            <div className="flex items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
              <time className="font-body text-caption text-graphite" dateTime={product.updatedAt}>{formatProductUpdatedAt(product.updatedAt)}</time>
              <Button variant="ghost" size="sm" onClick={() => onOpen(product.id)} className="px-2">Chi tiết <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
