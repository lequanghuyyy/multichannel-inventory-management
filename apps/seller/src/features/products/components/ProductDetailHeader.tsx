import { navigate } from '../../../app/routes';
import { Breadcrumbs } from '../../../components/common/Breadcrumbs';
import { Button } from '../../../components/ui/Button';
import { formatProductUpdatedAt } from '../product.utils';
import type { ProductCatalogItem } from '../product.types';
import { ProductStatusBadge } from './ProductCatalogParts';

export interface ProductDetailHeaderProps {
  product: ProductCatalogItem;
  onShowMappings: () => void;
}

export function ProductDetailHeader({ onShowMappings, product }: ProductDetailHeaderProps) {
  return (
    <header className="grid gap-5">
      <div className="flex flex-col justify-between gap-4 border-b border-outline-variant/50 pb-4 md:flex-row md:items-center">
        <Breadcrumbs items={[
          { label: 'Sản phẩm', onSelect: () => navigate('/products') },
          { label: product.category },
          { label: product.name },
        ]} className="mb-0" />
        <div className="flex flex-wrap items-center gap-3 font-body text-caption text-graphite">
          <ProductStatusBadge status={product.status} />
          <span>Mã sản phẩm <code className="font-mono text-on-surface">{product.canonicalId ?? product.id}</code></span>
          <time dateTime={product.createdAt ?? product.updatedAt}>Tạo {formatProductUpdatedAt(product.createdAt ?? product.updatedAt)}</time>
        </div>
      </div>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-card bg-surface-container-low text-3xl text-graphite" aria-hidden="true"><span className="material-symbols-outlined">{product.icon}</span></span>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-display text-[clamp(1.75rem,4vw,2.5rem)] font-bold tracking-tight text-on-surface">{product.name}</h1>
              <span className="material-symbols-outlined text-xl text-badge-progress-text" aria-label="Sản phẩm đã xác minh">verified</span>
            </div>
            <p className="mt-2 max-w-3xl font-body text-body-sm leading-5 text-on-surface-variant">{product.description ?? `${product.brand} · ${product.category}`}</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={onShowMappings} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">visibility</span>}>Xem trên kênh</Button>
          <Button variant="secondary" disabled title="Chưa có" leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">sync</span>}>Đồng bộ biến thể</Button>
          <Button disabled title="Chưa có" leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">save</span>}>Lưu thay đổi</Button>
        </div>
      </div>
    </header>
  );
}
