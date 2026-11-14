import { Button } from '../../../components/ui/Button';
import { ProductThumbnail } from '../../../components/common/ProductThumbnail';
import { href, navigate } from '../../../app/routes';
import { cn } from '../../../lib/cn';
import type { PosProductFixture } from '../pos.types';

const statusClasses = {
  instock: 'bg-badge-progress-bg text-badge-progress-text',
  low: 'bg-badge-blocked-bg text-badge-blocked-text',
  out: 'bg-surface-container text-graphite',
  'pos-empty': 'bg-amber-50 text-amber-950',
  transitioning: 'bg-badge-progress-bg text-badge-progress-text',
  unavailable: 'bg-amber-50 text-amber-950',
} as const;

const statusLabels = {
  instock: 'Còn hàng',
  low: 'Tồn kho thấp',
  out: 'Hết hàng',
  'pos-empty': 'Hết quota POS',
  transitioning: 'Đang chuyển quota',
  unavailable: 'Chưa đọc được quota POS',
} as const;

export function ProductCard({
  product,
  onAdd,
  interactionDisabled = false,
  canManageAllocation = false,
}: {
  product: PosProductFixture;
  onAdd: (product: PosProductFixture) => void;
  interactionDisabled?: boolean;
  canManageAllocation?: boolean;
}) {
  const posMode = product.posMode ?? 'shared';
  const coreAts = product.coreAts ?? product.ats;
  const posTransitionState = product.posTransitionState ?? 'stable';
  const outOfStock = product.ats <= 0;
  const missingPrice = product.priceValue === null;
  const disabled = outOfStock || missingPrice || interactionDisabled;
  return (
    <article className={cn('overflow-hidden rounded-card border border-outline-variant/60 bg-pure-white shadow-card', disabled ? 'opacity-70' : null)}>
      <div className={cn('grid h-32 place-items-center overflow-hidden bg-surface-container', disabled ? 'grayscale' : null)} role="img" aria-label={product.imageAlt}>
        <ProductThumbnail
          productId={product.productId}
          mediaId={product.primaryMediaId}
          fallbackIcon="inventory_2"
          className="size-full rounded-none bg-surface-container text-outline-variant [&_.material-symbols-outlined]:text-5xl"
        />
      </div>
      <div className="grid gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="font-display text-lg font-bold text-on-surface">{product.name}</h3>
            <p className="mt-1 font-body text-caption text-graphite">{product.variant}</p>
            <code className="mt-2 block truncate font-mono text-caption font-semibold text-on-surface">{product.sku}</code>
          </div>
          <span className={cn('shrink-0 rounded-full px-2.5 py-1 font-body text-caption font-bold', statusClasses[product.status])}>
            {product.status === 'out' && posMode === 'dedicated' ? 'Kho Core hết hàng' : statusLabels[product.status]} ({product.ats})
          </span>
        </div>
        <p className="font-display text-xl font-bold text-on-surface">{product.priceDisplay}</p>
        <p className="font-body text-caption text-graphite">{posMode === 'dedicated' ? 'POS riêng · quota còn hiệu lực' : posMode === 'shared' ? 'Dùng chung tồn · POS chưa được bảo vệ bằng quota riêng' : 'Chưa đọc được chế độ POS từ máy chủ.'}</p>
        <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-control bg-outline-variant/50 sm:grid-cols-5" aria-label={`Tồn kho ${product.sku}`}>
          {[
            ['Tồn vật lý', product.onHand],
            ['Đang giữ', product.reserved],
            ['Safety buffer', product.buffer],
            ['Core ATS', coreAts],
            [posMode === 'dedicated' ? 'POS được phép bán' : 'Có thể bán · dùng chung', product.ats],
          ].map(([label, value]) => (
            <div className="bg-surface-container-low p-2 text-center" key={label}>
              <dt className="font-body text-[10px] font-bold uppercase tracking-[0.08em] text-graphite">{label}</dt>
              <dd className={cn('mt-1 font-mono text-sm font-bold', String(label).startsWith('POS được phép') || String(label).startsWith('Có thể bán') ? (product.status === 'instock' ? 'text-badge-progress-text' : product.status === 'low' ? 'text-badge-blocked-text' : 'text-error') : 'text-on-surface')}>{value}</dd>
            </div>
          ))}
        </dl>
        {posTransitionState === 'pending' ? <p role="status" className="rounded-control bg-amber-50 px-3 py-2 font-body text-caption text-amber-950">SKU đang chuyển quota. POS tạm thời chưa thể bán cho đến khi các kênh được xác minh.</p> : null}
        {product.status === 'unavailable' ? <p role="alert" className="rounded-control bg-amber-50 px-3 py-2 font-body text-caption text-amber-950">Không đọc được trạng thái POS quota từ máy chủ. Sản phẩm đang bị khóa bán tại quầy; hãy tải lại danh mục.</p> : null}
        {product.status === 'pos-empty' ? <div className="grid gap-2 rounded-control bg-amber-50 px-3 py-2 font-body text-caption text-amber-950">
          <p>POS đã hết tồn được phân bổ. Kho trung tâm vẫn còn hàng dành cho các kênh khác.</p>
          {canManageAllocation && product.productId ? <Button size="sm" variant="secondary" onClick={() => navigate(href({ name: 'product-detail', id: product.productId! }))}>Mở phân bổ tồn POS</Button> : null}
        </div> : null}
        <Button
          disabled={disabled}
          aria-label={product.status === 'pos-empty' ? `Hết quota POS ${product.sku}` : product.status === 'transitioning' ? `Đang chuyển quota ${product.sku}` : product.status === 'unavailable' ? `Chưa đọc được quota POS ${product.sku}` : outOfStock ? `Hết hàng ${product.sku}` : missingPrice ? `Chưa có giá cho ${product.sku}` : `Thêm ${product.sku} vào giỏ`}
          onClick={() => onAdd(product)}
        >
          {product.status === 'pos-empty' ? 'Hết quota POS' : product.status === 'transitioning' ? 'Đang chuyển quota' : product.status === 'unavailable' ? 'Chưa đọc được quota POS' : outOfStock ? 'Hết hàng' : missingPrice ? 'Chưa có giá' : 'Thêm vào giỏ'}
        </Button>
      </div>
    </article>
  );
}
