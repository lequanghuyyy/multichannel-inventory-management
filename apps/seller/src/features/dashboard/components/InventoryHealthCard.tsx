import { Card } from '../../../components/ui/Card';
import { inventoryHealth } from '../dashboard.mock';

export function InventoryHealthCard() {
  return (
    <Card className="flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex items-center justify-between gap-3">
        <h2 className="whitespace-nowrap font-display text-lg font-bold tracking-tight text-on-surface">Sức khỏe tồn kho</h2>
        <span className="shrink-0 font-body text-caption font-semibold text-badge-progress-text">Ổn định</span>
      </div>
      <div>
        <div className="flex h-3 w-full overflow-hidden rounded-full bg-surface-container" aria-label="Phân bố tình trạng của 1.842 SKU">
          {inventoryHealth.map((segment) => <span key={segment.id} className={`h-full ${segment.colorClass}`} style={{ width: `${segment.percentage}%` }} title={`${segment.label} ${segment.percentage}%`} />)}
        </div>
        <div className="mt-1.5 flex justify-between font-body text-caption text-graphite"><span>0%</span><span>1.842 SKU được theo dõi</span><span>100%</span></div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        {inventoryHealth.map((segment) => (
          <div className="rounded-control bg-surface-container-low p-2.5" key={segment.id}>
            <div className="flex items-center gap-1.5 font-body text-caption font-medium text-graphite"><span className={`size-2 rounded-full ${segment.colorClass}`} aria-hidden="true" />{segment.label}</div>
            <strong className="mt-1 block font-body text-body-sm text-on-surface">{segment.percentage}% <span className="font-normal text-graphite">({segment.count.toLocaleString('vi-VN')})</span></strong>
          </div>
        ))}
      </div>
    </Card>
  );
}
