import { formatMinor } from '../../../lib/money';
import { Card } from '../../../components/ui/Card';
import type { ProductCatalogItem } from '../product.types';

export function ProductSummaryGrid({ product }: { product: ProductCatalogItem }) {
  const currency = product.currency ?? 'VND';
  return (
    <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-5" aria-label="Tóm tắt sản phẩm">
      <Card className="rounded-lg border border-metric-ink bg-metric-paper shadow-metric ring-0 xl:col-span-1">
        <span className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">SKU gốc</span>
        <strong className="mt-5 block font-display text-lg font-bold text-on-surface">{product.masterSku}</strong>
        <span className="mt-1 block font-body text-caption text-graphite">{product.category}</span>
      </Card>
      <Card className="rounded-lg border border-metric-ink bg-metric-paper shadow-metric ring-0">
        <span className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">Giá bán cơ sở</span>
        <strong className="mt-5 block font-display text-lg font-bold text-on-surface">{product.basePrice ? formatMinor(product.basePrice, currency) : 'Chưa cấu hình'}</strong>
        <span className="mt-1 block font-body text-caption text-graphite">Giá niêm yết ({currency})</span>
      </Card>
      <Card className="rounded-lg border border-metric-ink bg-metric-paper shadow-metric ring-0">
        <span className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">Số SKU</span>
        <strong className="mt-5 block font-display text-lg font-bold text-on-surface">{product.variants.length}</strong>
        <span className="mt-1 block font-body text-caption text-graphite">{new Set(product.variants.map((variant) => variant.color)).size} màu · {new Set(product.variants.map((variant) => variant.size)).size} kích cỡ</span>
      </Card>
      <Card className="rounded-lg border border-metric-ink bg-metric-paper shadow-metric ring-0 sm:col-span-2 xl:col-span-2">
        <div className="flex items-start justify-between gap-4"><span className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">Tồn kho toàn hệ thống</span><strong className="font-body text-body-sm text-badge-progress-text">{product.inventory.sellableRate}% có thể bán</strong></div>
        <strong className="mt-4 block font-display text-2xl font-bold text-on-surface">{product.inventory.available.toLocaleString('vi-VN')} <span className="text-sm font-medium text-graphite">có thể bán</span></strong>
        <dl className="mt-4 grid grid-cols-3 gap-2 font-body text-caption">
          <div><dt className="text-graphite">Tồn kho</dt><dd className="mt-1 font-semibold tabular-nums text-on-surface">{product.inventory.total}</dd></div>
          <div><dt className="text-graphite">Đang giữ</dt><dd className="mt-1 font-semibold tabular-nums text-on-surface">{product.inventory.reserved}</dd></div>
          <div><dt className="text-graphite">Tồn đệm</dt><dd className="mt-1 font-semibold tabular-nums text-on-surface">{product.inventory.safetyBuffer}</dd></div>
        </dl>
      </Card>
    </section>
  );
}
