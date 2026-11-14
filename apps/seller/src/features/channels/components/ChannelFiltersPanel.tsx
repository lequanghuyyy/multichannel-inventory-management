import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { ChannelFilters } from '../channel.types';

export function ChannelFiltersPanel({ filters, onChange }: { filters: ChannelFilters; onChange: (filters: ChannelFilters) => void }) {
  return <Card className="grid grid-cols-1 gap-3 p-4 sm:grid-cols-2 xl:grid-cols-[2fr_1fr_1fr]"><Input label="Tìm kênh" value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="Tên kênh hoặc mô tả…" leading={<span className="material-symbols-outlined text-xl">search</span>} /><Select label="Loại kênh" value={filters.kind} onChange={(event) => onChange({ ...filters, kind: event.target.value as ChannelFilters['kind'] })}><option value="all">Tất cả loại</option><option value="marketplace">Sàn thương mại điện tử</option><option value="pos">Bán tại quầy</option><option value="simulator">Giả lập</option><option value="future">Dự kiến</option></Select><Select label="Kết nối" value={filters.connection} onChange={(event) => onChange({ ...filters, connection: event.target.value as ChannelFilters['connection'] })}><option value="all">Tất cả trạng thái</option><option value="connected">Đang kết nối</option><option value="disconnected">Chưa kết nối</option><option value="pending_authorization">Dự kiến</option><option value="error">Cần xử lý</option></Select></Card>;
}
