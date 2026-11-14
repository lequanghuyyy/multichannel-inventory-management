import { navigate } from '../../../app/routes';
import { PageIntroFrame } from '../../../components/common/PageIntroFrame';
import { Button } from '../../../components/ui/Button';

export interface InventoryHeaderProps {
  canUseLiveActions: boolean;
  selectedCount: number;
  busy: boolean;
  onExportAll: () => void;
  onExportSelected: () => void;
  onBulkAdjust: () => void;
}

export function InventoryHeader({ canUseLiveActions, selectedCount, busy, onExportAll, onExportSelected, onBulkAdjust }: InventoryHeaderProps) {
  return (
    <PageIntroFrame>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <h1 className="whitespace-nowrap font-display text-2xl sm:text-3xl lg:text-headline-md font-bold tracking-tight text-on-surface">Quản lý tồn kho</h1>
          <p className="mt-3 max-w-3xl font-body text-body-sm leading-6 text-on-surface-variant">Theo dõi tồn kho theo từng SKU, tồn đệm an toàn và số lượng đang đăng bán trên các kênh.</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <Button variant="secondary" disabled={!canUseLiveActions || busy} loading={busy} title={!canUseLiveActions ? 'Chỉ khả dụng khi dữ liệu tồn kho từ máy chủ' : undefined} onClick={onExportAll} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">download</span>}>Xuất tất cả</Button>
          <Button variant="secondary" disabled={!canUseLiveActions || selectedCount === 0 || selectedCount > 100 || busy} title={selectedCount > 100 ? 'Xuất tối đa 100 SKU đã chọn' : undefined} onClick={onExportSelected}>Xuất {selectedCount > 0 ? `${selectedCount} đã chọn` : 'đã chọn'}</Button>
          <Button variant="secondary" disabled={!canUseLiveActions || selectedCount === 0 || busy} title={!canUseLiveActions ? 'Chỉ khả dụng khi dữ liệu tồn kho từ máy chủ' : undefined} onClick={onBulkAdjust} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">tune</span>}>Điều chỉnh hàng loạt</Button>
          <Button onClick={() => navigate('/receipts')} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">local_shipping</span>}>Nhập hàng</Button>
        </div>
      </div>
    </PageIntroFrame>
  );
}
