import { navigate, href } from '../../../../app/routes';
import { Breadcrumbs } from '../../../../components/common/Breadcrumbs';
import { ProductThumbnail } from '../../../../components/common/ProductThumbnail';
import { StatusBadge } from '../../../../components/common/StatusBadge';
import { Button } from '../../../../components/ui/Button';
import { categoryLabel } from '../../../../lib/category';
import type { InventoryDetailIdentity } from '../../inventory-detail.types';

const productStatusLabels: Record<string, string> = {
  draft: 'Bản nháp', active: 'Đang kinh doanh', out_of_stock: 'Hết hàng', archived: 'Đã lưu trữ',
};

export function InventoryDetailHeader({ detail, source, onAdjust, adjustmentDisabled, canAdjust, canCreateReceipt }: { detail: InventoryDetailIdentity; source: 'core' | 'fixture'; onAdjust: () => void; adjustmentDisabled: boolean; canAdjust: boolean; canCreateReceipt: boolean }) {
  const displayCategory = categoryLabel(detail.category);
  const badgeTone = source === 'core' ? 'success' : 'neutral';
  const status = detail.productStatus ? productStatusLabels[detail.productStatus] ?? detail.productStatus : null;
  const statusTone = detail.productStatus === 'out_of_stock' ? 'warning' : detail.productStatus === 'active' && detail.isActive ? 'success' : 'neutral';
  return (
    <header className="grid gap-5">
      <div className="flex flex-col justify-between gap-3 border-b border-outline-variant/50 pb-4 md:flex-row md:items-center">
        <Breadcrumbs items={[{ label: 'Kho', onSelect: () => navigate('/inventory') }, { label: displayCategory }, { label: detail.productName }, { label: detail.sku }]} className="mb-0" />
        <div className="flex flex-wrap gap-2"><StatusBadge tone={badgeTone}>{source === 'core' ? 'Dữ liệu Core' : 'Thông tin mẫu'}</StatusBadge>{status ? <StatusBadge tone={statusTone}>{status}</StatusBadge> : null}</div>
      </div>
      <div className="relative flex flex-col justify-between gap-5 rounded-lg border border-metric-ink bg-channel-paper p-5 shadow-metric lg:flex-row lg:items-center sm:p-6">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 rounded-l-lg bg-channel-accent" />
        <div className="flex min-w-0 items-start gap-4 sm:items-center">
          <span role="img" aria-label={`Ảnh sản phẩm ${detail.productName}`} className="size-20 shrink-0 overflow-hidden rounded-card bg-surface-container-low"><ProductThumbnail productId={detail.productId} mediaId={detail.primaryMediaId} fallbackIcon={detail.icon} className="size-full rounded-none bg-surface-container-low text-graphite [&_.material-symbols-outlined]:text-4xl" /></span>
          <div className="min-w-0"><div className="flex flex-wrap items-center gap-x-3 gap-y-2"><h1 className="font-display text-[clamp(1.5rem,4vw,2.25rem)] font-bold tracking-tight text-on-surface">{detail.productName}</h1><code className="rounded bg-surface-container-high px-2 py-1 font-mono text-caption font-bold text-on-surface">{detail.sku}</code></div><p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 font-body text-body-sm text-graphite"><span>Màu <strong className="text-on-surface">{detail.color}</strong></span><span>Cỡ <strong className="text-on-surface">{detail.size}</strong></span><span>Danh mục <strong className="text-on-surface">{displayCategory}</strong></span>{typeof detail.isActive === 'boolean' ? <span>Biến thể <strong className="text-on-surface">{detail.isActive ? 'Đang hoạt động' : 'Tạm ngừng'}</strong></span> : null}</p>
            {detail.productId || detail.variantId ? <details className="mt-2 font-body text-caption text-graphite"><summary className="w-fit cursor-pointer rounded-sm underline decoration-outline-variant underline-offset-2 focus-visible:outline-2 focus-visible:outline-primary">Chi tiết kỹ thuật</summary><dl className="mt-2 grid gap-1 sm:grid-cols-2">{detail.productId ? <div><dt className="inline">Mã sản phẩm: </dt><dd className="inline break-all font-mono text-on-surface">{detail.productId}</dd></div> : null}{detail.variantId ? <div><dt className="inline">Mã biến thể: </dt><dd className="inline break-all font-mono text-on-surface">{detail.variantId}</dd></div> : null}</dl></details> : null}
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">{canCreateReceipt ? <Button variant="secondary" onClick={() => navigate(`/receipts/new?sku=${encodeURIComponent(detail.sku)}`)}>Tạo phiếu nhập</Button> : null}{detail.productId ? <Button variant="secondary" onClick={() => navigate(href({ name: 'product-detail', id: detail.productId! }))}>Xem sản phẩm</Button> : null}{canAdjust ? <Button onClick={onAdjust} disabled={adjustmentDisabled} title={adjustmentDisabled ? 'Chờ tải xong tồn kho hoặc đang xử lý' : undefined}>Điều chỉnh kiểm kê</Button> : null}</div>
      </div>
    </header>
  );
}
