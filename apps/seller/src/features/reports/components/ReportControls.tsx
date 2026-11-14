import { Button } from '../../../components/ui/Button';
import { Select } from '../../../components/ui/Select';
import { cn } from '../../../lib/cn';
import type { ReportFilters, ReportPeriod } from '../report.types';

const periods: ReadonlyArray<{ value: ReportPeriod; label: string }> = [{ value: 'today', label: 'Hôm nay' }, { value: '7d', label: '7 ngày qua' }, { value: '30d', label: '30 ngày qua' }];

export interface ReportControlsProps {
  period: ReportPeriod;
  filters: ReportFilters;
  onPeriodChange: (period: ReportPeriod) => void;
  onFiltersChange: (filters: ReportFilters) => void;
  onReset: () => void;
  filtersActive: boolean;
}

export function ReportControls({ filters, filtersActive, onFiltersChange, onPeriodChange, onReset, period }: ReportControlsProps) {
  return (
    <section className="grid gap-4 rounded-card border border-outline-variant/60 bg-pure-white p-4 shadow-card xl:grid-cols-[auto_1fr] xl:items-end" aria-label="Bộ lọc báo cáo">
      <div><span className="mb-2 block font-body text-caption font-semibold text-on-surface">Khoảng thời gian</span><div className="flex max-w-full gap-1 overflow-x-auto rounded-control bg-surface-container-low p-1" aria-label="Khoảng thời gian báo cáo">{periods.map((item) => <button aria-pressed={period === item.value} className={cn('min-h-11 shrink-0 rounded-md px-3 font-body text-body-sm font-semibold transition-colors', period === item.value ? 'bg-carbon text-pure-white shadow-sm' : 'text-graphite hover:text-on-surface')} key={item.value} onClick={() => onPeriodChange(item.value)} type="button">{item.label}</button>)}</div></div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-[1fr_1fr_auto]">
        <Select label="Kênh" value={filters.channel} onChange={(event) => onFiltersChange({ ...filters, channel: event.target.value as ReportFilters['channel'] })}><option value="all">Tất cả kênh</option><option value="shopee">Shopee</option><option value="tiktok">TikTok Shop</option><option value="pos">Bán tại quầy</option><option value="lazada">Lazada</option></Select>
        <Select label="Nhóm sản phẩm" value={filters.category} onChange={(event) => onFiltersChange({ ...filters, category: event.target.value as ReportFilters['category'] })}><option value="all">Tất cả nhóm</option><option value="footwear">Giày dép</option><option value="leather">Đồ da</option><option value="apparel">Quần áo</option><option value="accessories">Phụ kiện</option></Select>
        <Button className="self-end" variant="ghost" disabled={!filtersActive} onClick={onReset}>Đặt lại bộ lọc</Button>
      </div>
      <p className="font-body text-caption leading-5 text-graphite xl:col-span-full">Đổi khoảng thời gian sẽ đổi các chỉ số chính. Bộ lọc kênh và nhóm chỉ thu hẹp danh sách kênh và SKU bên dưới.</p>
    </section>
  );
}
