import { Button } from '../../../components/ui/Button';
import { PageIntroFrame } from '../../../components/common/PageIntroFrame';

export function ProductsHeader({ canWrite, disabledReason, onAdd, onExport, onImport }: { canWrite: boolean; disabledReason: string; onAdd: () => void; onExport: () => void; onImport: () => void }) {
  return (
    <PageIntroFrame>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 font-body text-caption">
            <span className="font-semibold uppercase tracking-[0.16em] text-channel-accent">Danh mục</span>
            <span className="size-1.5 rounded-full bg-traffic-maximize motion-safe:animate-pulse" aria-hidden="true" />
            <span className="font-semibold text-badge-progress-text">Đồng bộ đa kênh</span>
          </div>
          <h1 className="whitespace-nowrap font-display text-headline-md font-bold tracking-tight text-on-surface">Quản lý sản phẩm</h1>
          <p className="mt-1 max-w-3xl font-body text-body-sm leading-5 text-on-surface-variant">Quản lý thông tin sản phẩm, SKU, tồn kho và liên kết với các kênh bán.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" onClick={onExport} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">file_download</span>}>Xuất CSV</Button>
          <Button variant="secondary" disabled={!canWrite} title={!canWrite ? disabledReason : undefined} onClick={onImport} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">file_upload</span>}>Nhập sản phẩm</Button>
          <Button disabled={!canWrite} title={!canWrite ? disabledReason : undefined} onClick={onAdd} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>}>Thêm sản phẩm</Button>
        </div>
      </div>
    </PageIntroFrame>
  );
}
