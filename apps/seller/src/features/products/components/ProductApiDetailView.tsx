import { categoryLabel } from '../../../lib/category';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { MetricCard } from '../../../components/common/MetricCard';
import { href, navigate } from '../../../app/routes';
import { useState } from 'react';
import type { Metric } from '../../../types/metric';
import { priceLabel, type ProductApiDetail, type ProductApiVariant, variantLabel } from '../product.detail.api';

const statusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  active: 'success',
  draft: 'warning',
  archived: 'neutral',
  out_of_stock: 'danger',
};

const statusLabels: Record<string, string> = {
  active: 'Đang bán',
  draft: 'Bản nháp',
  archived: 'Lưu trữ',
  out_of_stock: 'Hết hàng',
};

export function ProductApiDetailView({ product, onEditVariant }: { product: ProductApiDetail; onEditVariant: (variantId: string) => void }) {
  const metrics: Metric[] = [
    { id: 'onhand', label: 'Tồn kho', value: product.onHand.toLocaleString('vi-VN'), detail: 'Tổng của mọi biến thể', icon: 'inventory_2', tone: 'neutral' },
    { id: 'reserved', label: 'Đang giữ', value: product.reserved.toLocaleString('vi-VN'), detail: 'Tổng reservation ACTIVE', icon: 'lock_clock', tone: 'warning' },
    { id: 'buffer', label: 'Tồn đệm an toàn', value: product.safetyBuffer.toLocaleString('vi-VN'), detail: 'Phần giữ lại, không bán', icon: 'shield', tone: 'neutral' },
    { id: 'ats', label: 'Có thể bán', value: product.availableToSell.toLocaleString('vi-VN'), detail: 'Tồn kho − đang giữ − tồn đệm', icon: 'sell', tone: 'success' },
  ];

  return (
    <div className="grid gap-6">
      <Card className="grid gap-3 p-5" variant="muted">
        <h2 className="font-display text-xl font-bold text-on-surface">{product.name}</h2>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={statusTone[product.status] ?? 'neutral'}>{statusLabels[product.status] ?? product.status}</StatusBadge>
          <span className="font-body text-caption text-graphite">{categoryLabel(product.category)}</span>
          {product.brand ? <span className="font-body text-caption text-graphite">{product.brand}</span> : null}
          {product.masterSku ? <code className="font-mono text-caption text-graphite">{product.masterSku}</code> : <span className="font-body text-caption text-graphite">Chưa có SKU gốc</span>}
        </div>
        {product.description ? <p className="font-body text-body-sm leading-6 text-on-surface-variant">{product.description}</p> : null}
      </Card>

      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Tổng tồn kho của sản phẩm">
        {metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </section>

      <Card className="overflow-hidden p-0">
        <header className="border-b border-outline-variant/50 px-5 py-4">
          <h2 className="font-display text-lg font-bold text-on-surface">Các biến thể</h2>
          <p className="mt-1 font-body text-caption text-graphite">
            {product.variantCount} biến thể
          </p>
        </header>
        {product.variants.length === 0 ? <p className="p-5 font-body text-body-sm text-graphite">Sản phẩm chưa có biến thể.</p> : null}
        {product.variants.length > 0 ? <div className="hidden overflow-x-auto lg:block">
          <table className="w-full min-w-[920px] border-collapse text-left">
            <caption className="sr-only">Danh sách biến thể</caption>
            <thead>
              <tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
                <th className="px-5">SKU</th>
                <th className="px-3">Thuộc tính</th>
                <th className="px-3">Giá</th>
                <th className="px-3 text-right">Tồn kho</th>
                <th className="px-3 text-right">Đang giữ</th>
                <th className="px-3 text-right">Tồn đệm</th>
                <th className="px-5 text-right">Có thể bán</th>
                <th className="px-5 text-right">Kho</th>
                <th className="px-5 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {product.variants.length === 0 ? <tr><td colSpan={9} className="px-5 py-8 text-center font-body text-body-sm text-graphite">Sản phẩm chưa có biến thể.</td></tr> : product.variants.map((variant) => <VariantRow key={variant.id} variant={variant} currency={product.currency} onEdit={() => onEditVariant(variant.id)} />)}
            </tbody>
          </table>
        </div> : null}
        {product.variants.length > 0 ? <div className="grid gap-3 p-4 lg:hidden">{product.variants.map((variant) => <VariantCard key={variant.id} variant={variant} currency={product.currency} onEdit={() => onEditVariant(variant.id)} />)}</div> : null}
      </Card>
    </div>
  );
}

function VariantRow({ variant, currency, onEdit }: { variant: ProductApiVariant; currency: string; onEdit: () => void }) {
  const [copyMessage, setCopyMessage] = useState('');

  const copySku = async () => {
    try {
      if (!navigator.clipboard) throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(variant.sku);
      setCopyMessage(`Đã sao chép ${variant.sku}`);
    } catch {
      setCopyMessage(`Không thể sao chép ${variant.sku}`);
    }
  };

  return (
    <tr className="font-body text-body-sm">
      <td className="px-5 py-3">
        <div className="flex items-center gap-1">
          <code className="font-mono text-on-surface">{variant.sku}</code>
          <button
            type="button"
            aria-label={`Sao chép ${variant.sku}`}
            onClick={() => void copySku()}
            className="grid size-8 place-items-center rounded-control text-graphite hover:bg-surface-container hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">content_copy</span>
          </button>
        </div>
        <span className="sr-only" aria-live="polite">{copyMessage}</span>
        {!variant.variantIsActive ? <span className="ml-2 font-body text-[10px] uppercase text-graphite">ngừng bán</span> : !variant.isActive ? <span className="ml-2 font-body text-[10px] uppercase text-graphite">sản phẩm ngừng bán</span> : null}
        {variant.barcode ? <span className="mt-1 block font-mono text-[10px] text-graphite">{variant.barcode}</span> : null}
      </td>
      <td className="px-3 py-3 text-on-surface-variant">
        {variantLabel(variant)}
        {variant.colorDescription ? <span className="mt-1 block text-caption text-graphite">{variant.colorDescription}</span> : null}
      </td>
      <td className="px-3 py-3 tabular-nums text-on-surface-variant">{priceLabel(variant, currency)}</td>
      <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{variant.onHand.toLocaleString('vi-VN')}</td>
      <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{variant.reserved.toLocaleString('vi-VN')}</td>
      <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{variant.safetyBuffer.toLocaleString('vi-VN')}</td>
       <td className="px-5 py-3 text-right font-semibold tabular-nums text-on-surface"><button type="button" className="underline" onClick={() => navigate(href({ name: 'inventory-detail', id: variant.sku }))}>{variant.availableToSell.toLocaleString('vi-VN')}</button></td>
      <td className="px-5 py-3 text-right"><button type="button" className="font-body text-caption font-semibold underline" onClick={() => navigate(href({ name: 'inventory-detail', id: variant.sku }))}>Xem tồn</button></td>
      <td className="px-5 py-3 text-right"><button type="button" className="font-body text-caption font-semibold text-primary underline" onClick={onEdit}>Sửa SKU</button></td>
    </tr>
  );
}

function VariantCard({ variant, currency, onEdit }: { variant: ProductApiVariant; currency: string; onEdit: () => void }) {
  const [message, setMessage] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(variant.sku); setMessage(`Đã sao chép ${variant.sku}`); }
    catch { setMessage(`Không thể sao chép ${variant.sku}`); }
  };
  return <article className="grid gap-3 rounded-card bg-surface-container-low p-4">
    <div className="flex items-center justify-between gap-2"><code className="font-mono text-body-sm font-semibold">{variant.sku}</code><button type="button" aria-label={`Sao chép ${variant.sku}`} onClick={() => void copy()} className="underline">Sao chép</button></div>
    <span className="sr-only" aria-live="polite">{message}</span>
    <p className="font-body text-caption text-graphite">{variantLabel(variant)} · {priceLabel(variant, currency)}</p>
    <dl className="grid grid-cols-4 gap-2 text-center"><div><dt className="text-[10px]">OH</dt><dd>{variant.onHand}</dd></div><div><dt className="text-[10px]">RES</dt><dd>{variant.reserved}</dd></div><div><dt className="text-[10px]">BUF</dt><dd>{variant.safetyBuffer}</dd></div><div><dt className="text-[10px]">ATS</dt><dd>{variant.availableToSell}</dd></div></dl>
    <div className="flex flex-wrap gap-4"><button type="button" className="font-body text-caption font-semibold underline" onClick={() => navigate(href({ name: 'inventory-detail', id: variant.sku }))}>Xem tồn</button><button type="button" className="font-body text-caption font-semibold text-primary underline" onClick={onEdit}>Sửa SKU</button></div>
  </article>;
}
