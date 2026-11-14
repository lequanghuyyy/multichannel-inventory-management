import { MetricCard } from '../../../components/common/MetricCard';
import type { Metric } from '../../../types/metric';

const metrics: Metric[] = [
  { id: 'bookings', label: 'Doanh thu đặt hàng trong ngày', value: '870,3 triệu đ', detail: '+18,4% · 5 kênh', icon: 'payments', tone: 'success' },
  { id: 'reserved', label: 'Hàng đang giữ', value: '186 sản phẩm', detail: '42 giỏ hàng', icon: 'lock_clock', tone: 'warning' },
  { id: 'conflicts', label: 'Xung đột bán vượt tồn', value: '0', detail: 'Các kênh đang khớp tồn kho', icon: 'shield', tone: 'success' },
  { id: 'dispatch', label: 'Thời gian giao đi trung bình', value: '2 giờ 14 phút', detail: 'Đúng hẹn 99,4%', icon: 'local_shipping', tone: 'neutral' },
];

export function OrderMetricsGrid() {
  return <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số đơn hàng">{metrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}</section>;
}
