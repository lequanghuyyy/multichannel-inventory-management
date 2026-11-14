import { MetricCard } from '../../../components/common/MetricCard';
import type { Metric } from '../../../types/metric';

const metrics: Metric[] = [
  { id: 'runtime', label: 'Trợ lý AI', value: 'Chưa triển khai', detail: 'Chưa có mô hình hoạt động', icon: 'power_settings_new', tone: 'warning' },
  { id: 'insights', label: 'Đề xuất mẫu', value: '4 đề xuất', detail: 'Chỉ để xem', icon: 'neurology', tone: 'neutral' },
  { id: 'reviews', label: 'Chờ xem xét', value: '2 mục', detail: 'Cần người duyệt', icon: 'fact_check', tone: 'warning' },
  { id: 'actions', label: 'Thao tác tự động', value: '0 đang bật', detail: 'Chưa có chính sách áp dụng', icon: 'shield', tone: 'success' },
];

export function AIMetricGrid() {
  return <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số AI">{metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}</section>;
}
