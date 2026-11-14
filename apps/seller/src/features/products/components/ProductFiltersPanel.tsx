import { categoryLabel } from '../../../lib/category';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import { Card } from '../../../components/ui/Card';
import type { DataSource } from '../../shared/useApiPage';
import { categoryOptions, channelOptions, inventoryOptions, statusOptions } from '../products.constants';
import type { ProductFilters } from '../product.types';

export interface ProductFiltersPanelProps {
  filters: ProductFilters;
  onChange: (filters: ProductFilters) => void;
  apiCategories?: readonly string[];
  source?: DataSource;
}

/**
 * The catalogue filter, and an honest one about what it can filter.
 *
 * Over API rows the list of categories is built FROM THE ROWS, because `categoryOptions` is
 * the prototype's Vietnamese display names (`Giày thể thao`) while the API returns the stored
 * enum verbatim (`FOOTWEAR`). Those are disjoint strings: pairing the prototype list with API
 * rows would drop every one of them the moment the category filter was touched, and the reader
 * would see an empty catalogue rather than an honest "no match".
 *
 * The channel and inventory selects are withdrawn entirely over API rows, for the same reason
 * and a stronger one: `ProductSummary` has no channel field and no inventory STATE field at
 * all — only four summed quantities. A select whose options match nothing is a control that
 * lies about what the screen can do, so it is removed rather than disabled. Note that
 * `inventory` is a genuine prototype state machine (healthy/low/critical) and ATS is not one
 * of its values; the API's answer to "what is this product's stock state" is derived from ATS,
 * which the metric cards already count.
 */
export function ProductFiltersPanel({ apiCategories = [], filters, onChange, source }: ProductFiltersPanelProps) {
  const isApi = source !== 'fixture';
  // `categoryOptions` already carries the leading 'all'; the API list does not, and the select
  // below writes it out separately so both paths end up with exactly one.
  const categories = isApi
    ? [...new Set([...apiCategories, ...(filters.category === 'all' ? [] : [filters.category])])].sort((a, b) => a.localeCompare(b, 'vi-VN'))
    : categoryOptions.filter((option) => option !== 'all');

  return (
    <Card className="grid gap-4 p-4">
      <Input
        label="Tìm kiếm"
        value={filters.query}
        onChange={(event) => onChange({ ...filters, query: event.target.value })}
        placeholder={isApi ? 'Tên sản phẩm, SKU, thương hiệu hoặc danh mục…' : 'Tên sản phẩm, SKU, thương hiệu hoặc danh mục…'}
        maxLength={isApi ? 64 : undefined}
        leading={<span className="material-symbols-outlined text-xl">search</span>}
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Select label="Danh mục" value={filters.category} onChange={(event) => onChange({ ...filters, category: event.target.value })}>
          {/* 'all' is written out here rather than read off `categories`, because the API list
              is built from the ROWS and a category with no row behind it simply is not in it.
              Without this the select's own default value would have no option to show. */}
          <option value="all">Tất cả danh mục</option>
          {categories.map((category) => <option key={category} value={category}>{isApi ? categoryLabel(category) : category}</option>)}
        </Select>
        <Select label="Trạng thái sản phẩm" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as ProductFilters['status'] })}>
          {statusOptions.filter((option) => !isApi || option.value !== 'under_review').map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </Select>
        {isApi ? null : (
          <Select label="Kênh bán" value={filters.channel} onChange={(event) => onChange({ ...filters, channel: event.target.value as ProductFilters['channel'] })}>
            {channelOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        )}
        {isApi ? null : (
          <Select label="Trạng thái tồn" value={filters.inventory} onChange={(event) => onChange({ ...filters, inventory: event.target.value as ProductFilters['inventory'] })}>
            {inventoryOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </Select>
        )}
      </div>
    </Card>
  );
}
