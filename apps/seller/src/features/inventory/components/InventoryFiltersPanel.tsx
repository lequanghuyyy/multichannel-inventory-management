import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { cn } from '../../../lib/cn';
import type { DataSource } from '../../shared/useApiPage';
import type { InventoryFilters, InventoryLedgerRow, InventoryQuickFilter } from '../inventory.types';

const quickFilters: { value: InventoryQuickFilter; label: string; count: string }[] = [
  { value: 'all', label: 'Tất cả SKU', count: '1.842' },
  { value: 'low', label: 'Sắp hết hàng', count: '14' },
  { value: 'out', label: 'Hết hàng', count: '6' },
  { value: 'conflict', label: 'Lệch đồng bộ', count: '0' },
  { value: 'custom', label: 'Tồn đệm riêng', count: '38' },
];

export interface InventoryFiltersPanelProps {
  filters: InventoryFilters;
  rows: InventoryLedgerRow[];
  onChange: (filters: InventoryFilters) => void;
  source: DataSource;
}

export function InventoryFiltersPanel({ filters, onChange, rows, source }: InventoryFiltersPanelProps) {
  const products = [...new Set(rows.map((row) => row.productName))];

  // Over API rows the counts are counted, not quoted. "14 sắp hết hàng" beside a ledger the
  // reader can see all of is a number about a catalogue that is not the one on screen; a
  // count of 2 next to 2 visible low-stock rows is the same number twice, which is what a
  // filter count is supposed to be.
  const counts = new Map<InventoryQuickFilter, number>([
    ['all', rows.length],
    ['low', rows.filter((row) => row.status === 'low_stock').length],
    ['out', rows.filter((row) => row.status === 'out_of_stock').length],
    ['conflict', rows.filter((row) => row.syncConflict).length],
    ['custom', rows.filter((row) => row.customBuffer).length],
  ]);

  return (
    <Card className="grid gap-4 p-4">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-[2fr_repeat(4,1fr)]">
        <Input label="Tìm kiếm" value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="SKU, sản phẩm hoặc mã vạch…" leading={<span className="material-symbols-outlined text-xl">search</span>} />
        <Select label="Sản phẩm" value={filters.product} onChange={(event) => onChange({ ...filters, product: event.target.value })}><option value="all">Tất cả sản phẩm</option>{products.map((product) => <option key={product} value={product}>{product}</option>)}</Select>
        <Select label="Trạng thái tồn" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as InventoryFilters['status'] })}><option value="all">Tất cả trạng thái</option><option value="in_stock">Còn hàng</option><option value="low_stock">Sắp hết hàng</option><option value="out_of_stock">Hết hàng</option><option value="reserved_only">Có hàng đang giữ</option></Select>
        <Select label="Kênh" value={filters.channel} onChange={(event) => onChange({ ...filters, channel: event.target.value as InventoryFilters['channel'] })}><option value="all">Tất cả kênh</option><option value="shopee">Shopee</option><option value="tiktok">TikTok Shop</option><option value="lazada">Lazada</option><option value="web">Website bán hàng</option><option value="pos">Bán tại quầy</option></Select>
        <Select label="Vị trí" value={filters.location} onChange={(event) => onChange({ ...filters, location: event.target.value as InventoryFilters['location'] })}><option value="all">Tất cả vị trí</option><option value="central">Kho trung tâm</option><option value="east">Kho phía Đông</option><option value="west">Kho trung chuyển phía Tây</option></Select>
      </div>
      <div className="flex max-w-full gap-2 overflow-x-auto pb-1" role="group" aria-label="Bộ lọc nhanh tồn kho">
        {quickFilters.map((filter) => <button key={filter.value} type="button" aria-pressed={filters.quick === filter.value} onClick={() => onChange({ ...filters, quick: filter.value })} className={cn('min-h-9 shrink-0 rounded-full px-3 font-body text-caption font-semibold transition-colors', filters.quick === filter.value ? 'bg-carbon text-pure-white' : 'bg-surface-container-low text-on-surface hover:bg-surface-container')}><span>{filter.label}</span><span className={cn('ml-2 rounded-full px-1.5 py-0.5 tabular-nums', filters.quick === filter.value ? 'bg-pure-white/15' : 'bg-pure-white text-graphite')}>{source === 'api' ? new Intl.NumberFormat('vi-VN').format(counts.get(filter.value) ?? 0) : filter.count}</span></button>)}
      </div>
    </Card>
  );
}
