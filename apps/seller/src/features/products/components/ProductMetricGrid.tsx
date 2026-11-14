import { MetricCard } from '../../../components/common/MetricCard';
import type { DataSource } from '../../shared/useApiPage';
import type { Metric } from '../../../types/metric';
import type { ProductApiRow } from '../product.api';
import { summariseProducts } from '../product.api';
import { productMetrics } from '../products.constants';

export function ProductMetricGrid({ rows, source }: { rows: ProductApiRow[]; source: DataSource }) {
  if (source === 'pending') return null;
  if (source !== 'api') {
    return (
      <section className="grid grid-cols-2 gap-3.5 md:grid-cols-4" aria-label="Chỉ số catalog mẫu">
        {productMetrics.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
      </section>
    );
  }

  // Counted, not quoted. "1.482 master SKU" beside a 14-row catalogue is a number about a
  // different catalogue entirely, and these cards sit directly above the rows they misdescribe.
  const summary = summariseProducts(rows);
  const counter = new Intl.NumberFormat('vi-VN');
  const live: Metric[] = [
    { id: 'products', label: 'Sản phẩm đã tải', value: counter.format(summary.products), detail: `Chỉ tính ${summary.products} sản phẩm đã tải`, icon: 'inventory_2' },
    { id: 'variants', label: 'Biến thể', value: counter.format(summary.variants), detail: 'Tổng biến thể của các sản phẩm trên', icon: 'grid_view' },
    { id: 'low-stock', label: 'Sắp hết hàng', value: counter.format(summary.lowStock), detail: 'Còn bán được từ 1 đến 10 sản phẩm', icon: 'warning', tone: 'warning' },
    // Counted from available_to_sell, not from `status`: an ACTIVE product with nothing
    // sellable is exactly the row a shopkeeper needs on this card.
    { id: 'out-of-stock', label: 'Hết hàng', value: counter.format(summary.outOfStock), detail: 'Không còn sản phẩm nào để bán', icon: 'block', tone: 'danger' },
  ];

  return (
    <section className="grid grid-cols-2 gap-3.5 md:grid-cols-4" aria-label="Chỉ số sản phẩm">
      {live.map((metric) => <MetricCard key={metric.id} metric={metric} />)}
    </section>
  );
}
