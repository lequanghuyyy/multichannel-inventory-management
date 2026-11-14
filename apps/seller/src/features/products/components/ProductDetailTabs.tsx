import { Tabs, type TabItem } from '../../../components/ui/Tabs';

export type ProductDetailTab = 'overview' | 'variants' | 'mappings';

const tabs: readonly TabItem<ProductDetailTab>[] = [
  { value: 'overview', label: 'Tổng quan' },
  { value: 'variants', label: 'Biến thể' },
  { value: 'mappings', label: 'Liên kết kênh bán' },
];

export interface ProductDetailTabsProps {
  value: ProductDetailTab;
  variantCount: number;
  onChange: (value: ProductDetailTab) => void;
}

export function ProductDetailTabs({ onChange, value, variantCount }: ProductDetailTabsProps) {
  const items = tabs.map((tab) => tab.value === 'variants' ? { ...tab, label: `Biến thể (${variantCount})` } : tab);
  return <Tabs items={items} value={value} onValueChange={onChange} ariaLabel="Khu vực chi tiết sản phẩm" className="w-fit max-w-full" />;
}
