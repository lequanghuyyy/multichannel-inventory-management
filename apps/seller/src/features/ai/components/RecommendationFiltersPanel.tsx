import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { RecommendationFilters } from '../ai.types';

export function RecommendationFiltersPanel({ filters, onChange }: { filters: RecommendationFilters; onChange: (filters: RecommendationFilters) => void }) {
  return <Card className="grid grid-cols-1 gap-3 p-4 md:grid-cols-[2fr_1fr_1fr]"><Input label="Tìm đề xuất" value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="SKU, kênh, loại đề xuất hoặc mô hình…" leading={<span className="material-symbols-outlined text-xl">search</span>} /><Select label="Trạng thái xem xét" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as RecommendationFilters['status'] })}><option value="all">Tất cả trạng thái</option><option value="review_required">Cần xem xét</option><option value="stable">Ổn định</option><option value="ready">Xem trước chính sách</option><option value="unavailable">Không khả dụng</option></Select><Select label="Loại gợi ý" value={filters.kind} onChange={(event) => onChange({ ...filters, kind: event.target.value as RecommendationFilters['kind'] })}><option value="all">Tất cả loại</option><option value="safety_buffer">Tồn đệm an toàn</option><option value="sync_anomaly">Bất thường đồng bộ</option><option value="demand_forecast">Dự báo nhu cầu</option><option value="burst_protection">Chống đột biến đơn</option></Select></Card>;
}
