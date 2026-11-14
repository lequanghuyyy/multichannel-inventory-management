import { MetricCard } from '../../../components/common/MetricCard';
import { formatMinor } from '../../../lib/money';
import type { Metric } from '../../../types/metric';
import type { OrderMetrics } from '../../../api/orders';

function amounts(metrics: OrderMetrics | null, key: 'gross_order_value_minor' | 'manually_paid_order_value_minor' | 'cancelled_order_value_minor'): string {
  if (!metrics) return '—';
  return metrics.currency_values.map((value) => formatMinor(value[key], value.currency)).join(' · ') || '0 ₫';
}

export function OrderApiMetricsGrid({ metrics, totalRows }: { metrics: OrderMetrics | null; totalRows: number }) {
  const cancelledValue = amounts(metrics, 'cancelled_order_value_minor');
  const metricCards: Metric[] = [
    {
      id: 'gross-order-value',
      label: 'Tổng giá trị đơn',
      value: amounts(metrics, 'gross_order_value_minor'),
      detail: `Toàn bộ ${totalRows.toLocaleString('vi-VN')} đơn theo bộ lọc, gồm cả đơn hủy; không đồng nghĩa tiền đã thu`,
      icon: 'payments',
      tone: 'neutral',
    },
    {
      id: 'manually-paid-value',
      label: 'Đã xác nhận thanh toán',
      value: amounts(metrics, 'manually_paid_order_value_minor'),
      detail: 'Theo xác nhận thủ công đã lưu; không phải xác minh từ cổng thanh toán',
      icon: 'paid',
      tone: 'success',
    },
    {
      id: 'net-delivered-units',
      label: 'Sản phẩm giao ròng',
      value: metrics ? `${metrics.net_delivered_units.toLocaleString('vi-VN')} sản phẩm` : '—',
      detail: metrics ? `${metrics.delivered_units.toLocaleString('vi-VN')} đã giao − ${metrics.returned_units.toLocaleString('vi-VN')} đã tiếp nhận trả hàng` : 'Đang tải số liệu trong phạm vi lọc',
      icon: 'inventory_2',
      tone: 'neutral',
    },
    {
      id: 'cancelled-orders',
      label: 'Đơn đã hủy',
      value: metrics ? metrics.cancelled_orders.toLocaleString('vi-VN') : '—',
      detail: metrics ? `${cancelledValue} giá trị đơn hủy · ${metrics.delivered_orders.toLocaleString('vi-VN')} đơn đã giao` : 'Đang tải số liệu trong phạm vi lọc',
      icon: 'cancel',
      tone: (metrics?.cancelled_orders ?? 0) > 0 ? 'warning' : 'success',
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Chỉ số đơn hàng">
      {metricCards.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
    </section>
  );
}
