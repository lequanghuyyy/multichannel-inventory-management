import { formatMinor } from '../../../lib/money';
import { useState } from 'react';
import { navigate } from '../../../app/routes';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { cn } from '../../../lib/cn';
import type { ProductCatalogItem, ProductVariant } from '../product.types';
import { ProductChannelBadges } from './ProductCatalogParts';

function variantTone(variant: ProductVariant): 'success' | 'warning' | 'neutral' {
  if (!variant.inventory) return 'neutral';
  return variant.inventory.state === 'healthy' ? 'success' : 'warning';
}

function variantLabel(variant: ProductVariant): string {
  if (!variant.inventory) return 'Chưa có dữ liệu';
  if (variant.inventory.state === 'healthy') return 'Còn hàng';
  if (variant.inventory.state === 'out_of_stock') return 'Hết hàng';
  return 'Sắp hết hàng';
}

function StockBreakdown({ variant }: { variant: ProductVariant }) {
  if (!variant.inventory) return <span className="font-body text-caption text-graphite">Chưa có dữ liệu tồn kho</span>;
  return (
    <div className="font-body text-caption">
      <div className="grid grid-cols-3 gap-2 text-center tabular-nums">
        <span><strong className="block text-on-surface">{variant.inventory.onHand}</strong><small className="text-graphite">Tồn</small></span>
        <span><strong className="block text-on-surface">{variant.inventory.reserved}</strong><small className="text-graphite">Giữ</small></span>
        <span><strong className="block text-on-surface">{variant.inventory.safetyBuffer}</strong><small className="text-graphite">Đệm</small></span>
      </div>
    </div>
  );
}

export function VariantMatrix({ product }: { product: ProductCatalogItem }) {
  const [copyMessage, setCopyMessage] = useState('');

  const copySku = async (sku: string) => {
    try {
      if (!navigator.clipboard) throw new Error('Không sao chép được');
      await navigator.clipboard.writeText(sku);
      setCopyMessage(`Đã sao chép ${sku}`);
    } catch {
      setCopyMessage(`Không thể sao chép ${sku}`);
    }
  };

  return (
    <Card className="overflow-hidden p-0">
      <header className="flex flex-col justify-between gap-4 border-b border-outline-variant/50 px-5 py-5 sm:flex-row sm:items-center sm:px-6">
        <div>
          <h2 className="font-display text-lg font-bold text-on-surface">Bảng biến thể</h2>
          <p className="mt-1 font-body text-body-sm text-graphite">Mỗi biến thể có một SKU riêng. Số liệu tồn kho ở đây là dữ liệu mẫu.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" size="sm" disabled title="Chưa có">Tạo barcode</Button>
          <Button variant="secondary" size="sm" disabled title="Chưa có">Điều chỉnh giá</Button>
          <Button size="sm" disabled title="Chưa có">Thêm biến thể</Button>
        </div>
      </header>
      <p className="sr-only" aria-live="polite">{copyMessage}</p>
      <div className="hidden w-full overflow-x-auto lg:block">
        <table className="min-w-[1050px] w-full border-collapse text-left">
          <caption className="sr-only">Biến thể và SKU của {product.name}</caption>
          <thead><tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
            <th className="px-4" scope="col">Biến thể</th><th className="px-3" scope="col">Màu</th><th className="px-3" scope="col">Cỡ</th><th className="px-3" scope="col">SKU</th><th className="px-3" scope="col">Mã vạch</th><th className="px-3" scope="col">Giá</th><th className="px-3" scope="col">Tồn / Giữ / Đệm</th><th className="px-3" scope="col">Có thể bán</th><th className="px-3" scope="col">Kênh</th><th className="px-3" scope="col">Trạng thái</th><th className="px-4 text-right" scope="col">Thao tác</th>
          </tr></thead>
          <tbody className="divide-y divide-surface-container">
            {product.variants.map((variant) => (
              <tr key={variant.id} className={cn('font-body text-body-sm transition-colors hover:bg-surface-container-low/60', variant.inventory?.state === 'critical' ? 'bg-badge-blocked-bg/25' : null)}>
                <td className="px-4 py-3"><span className="grid size-10 place-items-center rounded-control bg-surface-container-low text-graphite" aria-hidden="true"><span className="material-symbols-outlined">{product.icon}</span></span></td>
                <td className="px-3 py-3"><strong className="text-on-surface">{variant.color}</strong><span className="mt-0.5 block text-caption text-graphite">{variant.colorDescription ?? 'Màu chuẩn'}</span></td>
                <td className="px-3 py-3 font-semibold text-on-surface">EU {variant.size}</td>
                <td className="px-3 py-3"><div className="flex items-center gap-1"><code className="font-mono text-caption font-semibold text-on-surface">{variant.sku}</code><button type="button" aria-label={`Sao chép ${variant.sku}`} onClick={() => void copySku(variant.sku)} className="grid size-9 place-items-center rounded-control text-graphite hover:bg-surface-container hover:text-on-surface"><span className="material-symbols-outlined text-base" aria-hidden="true">content_copy</span></button></div></td>
                <td className="px-3 py-3 font-mono text-caption text-graphite">{variant.barcode ?? 'Chưa có'}</td>
                <td className="px-3 py-3 font-semibold tabular-nums text-on-surface">{variant.price ? formatMinor(variant.price, 'VND') : '—'}</td>
                <td className="px-3 py-3"><StockBreakdown variant={variant} /></td>
                <td className="px-3 py-3"><strong className={cn('font-display text-lg tabular-nums', variant.inventory?.state === 'critical' ? 'text-on-tertiary-container' : 'text-on-surface')}>{variant.inventory?.available ?? '—'}</strong><span className="block text-caption text-graphite">sản phẩm</span></td>
                <td className="px-3 py-3"><ProductChannelBadges product={product} /></td>
                <td className="px-3 py-3"><StatusBadge tone={variantTone(variant)}>{variantLabel(variant)}</StatusBadge></td>
                <td className="px-4 py-3 text-right"><Button variant="ghost" size="sm" onClick={() => navigate(`/inventory?sku=${encodeURIComponent(variant.sku)}`)} className="px-2">Tra cứu tồn <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_forward</span></Button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-3 p-4 lg:hidden">
        {product.variants.map((variant) => (
          <article key={variant.id} className={cn('grid gap-4 rounded-card bg-surface-container-low p-4', variant.inventory?.state === 'critical' ? 'bg-badge-blocked-bg/35' : null)}>
            <div className="flex items-start justify-between gap-3"><div><code className="font-mono text-body-sm font-semibold text-on-surface">{variant.sku}</code><p className="mt-1 font-body text-caption text-graphite">{variant.color} · EU {variant.size}</p></div><StatusBadge tone={variantTone(variant)}>{variantLabel(variant)}</StatusBadge></div>
            <StockBreakdown variant={variant} />
            <div className="flex items-center justify-between gap-3"><div><span className="font-body text-caption text-graphite">Có thể bán</span><strong className="ml-2 font-display text-xl text-on-surface">{variant.inventory?.available ?? '—'}</strong></div><ProductChannelBadges product={product} /></div>
            <div className="flex gap-2 border-t border-outline-variant/50 pt-3"><Button variant="secondary" size="sm" onClick={() => void copySku(variant.sku)}>Sao chép SKU</Button><Button size="sm" onClick={() => navigate(`/inventory?sku=${encodeURIComponent(variant.sku)}`)}>Tra cứu tồn</Button></div>
          </article>
        ))}
      </div>
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-3 font-body text-caption text-graphite">
        <span><span className="mr-1.5 inline-block size-2 rounded-full bg-traffic-maximize" />Tự động đồng bộ · Tồn đệm mặc định 2 sản phẩm</span>
        <span>Hiển thị {product.variants.length} / {product.variants.length} SKU</span>
      </footer>
    </Card>
  );
}
