import { MetricCard } from '../../../components/common/MetricCard';
import { dashboardMetrics } from '../dashboard.mock';

export function KpiGrid() {
  return (
    <section aria-label="Chỉ số tổng quan" className="grid grid-cols-2 gap-3.5 md:grid-cols-3 xl:grid-cols-6">
      {dashboardMetrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
    </section>
  );
}
