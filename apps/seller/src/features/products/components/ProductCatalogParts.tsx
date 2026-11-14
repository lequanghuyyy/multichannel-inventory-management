import { StatusBadge } from '../../../components/common/StatusBadge';
import { cn } from '../../../lib/cn';
import type { ProductCatalogItem, ProductStatus } from '../product.types';
import { inventoryPercentage } from '../product.utils';

const statusPresentation: Record<ProductStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  active: { label: 'Đang bán', tone: 'success' },
  draft: { label: 'Bản nháp', tone: 'neutral' },
  under_review: { label: 'Đang duyệt', tone: 'warning' },
  archived: { label: 'Đã lưu trữ', tone: 'neutral' },
  // Not the same as archived: the product is live and sellable, it simply has nothing to sell.
  // Badged as danger so a catalogue full of these is obvious at a glance.
  out_of_stock: { label: 'Hết hàng', tone: 'danger' },
};

const inventoryTone = {
  healthy: 'bg-traffic-maximize',
  low: 'bg-traffic-minimize',
  critical: 'bg-on-tertiary-container',
  out_of_stock: 'bg-error',
} as const;

export function ProductIdentity({ product }: { product: ProductCatalogItem }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span className="grid size-11 shrink-0 place-items-center rounded-control bg-surface-container-low text-graphite" aria-hidden="true"><span className="material-symbols-outlined">{product.icon}</span></span>
      <span className="min-w-0">
        <strong className="block truncate font-body text-body-sm text-on-surface" title={product.name}>{product.name}</strong>
        <span className="mt-1 block font-mono text-caption text-graphite">{product.masterSku}</span>
        <span className="block font-body text-[10px] text-graphite">{product.brand}</span>
      </span>
    </div>
  );
}

export function ProductInventorySummary({ product }: { product: ProductCatalogItem }) {
  const percentage = inventoryPercentage(product);
  return (
    <div className="grid min-w-36 gap-1.5">
      <div className="flex justify-between gap-3 font-body text-caption"><span className="text-graphite">Có thể bán</span><strong className="tabular-nums text-on-surface">{product.inventory.available.toLocaleString('vi-VN')} / {product.inventory.total.toLocaleString('vi-VN')}</strong></div>
      <div className="h-1.5 overflow-hidden rounded-full bg-surface-container"><span className={cn('block h-full rounded-full', inventoryTone[product.inventory.state])} style={{ width: `${percentage}%` }} /></div>
      <span className="font-body text-[10px] leading-4 text-graphite">{percentage}% · {product.inventory.note}</span>
    </div>
  );
}

export function ProductChannelBadges({ product }: { product: ProductCatalogItem }) {
  return (
    <div className="flex flex-wrap gap-1.5" aria-label={`Kênh bán của ${product.name}`}>
      {product.channels.map((channel) => (
        <span
          key={channel.id}
          title={`${channel.label}: ${channel.state === 'active' ? 'đang hoạt động' : channel.state === 'paused' ? 'tạm dừng' : 'đã gỡ'}`}
          className={cn('grid min-h-7 min-w-7 place-items-center rounded px-1.5 font-body text-[9px] font-bold text-pure-white', channel.colorClass, channel.state !== 'active' ? 'opacity-45 line-through' : null)}
        >
          {channel.shortLabel}
        </span>
      ))}
    </div>
  );
}

export function ProductStatusBadge({ status }: { status: ProductStatus }) {
  const presentation = statusPresentation[status];
  return <StatusBadge tone={presentation.tone}>{presentation.label}</StatusBadge>;
}
