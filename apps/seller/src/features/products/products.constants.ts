import type { Metric } from '../../types/metric';
import type { InventoryState, ProductChannelId, ProductStatus } from './product.types';

export const productMetrics: readonly Metric[] = [
  { id: 'master-sku', label: 'SKU gốc', value: '1.482', detail: '+14 trong tuần', icon: 'qr_code_2', tone: 'success' },
  { id: 'listings', label: 'SKU đang đăng bán', value: '4.120', detail: '96,8% ổn định', icon: 'storefront' },
  { id: 'low-stock', label: 'Cảnh báo sắp hết', value: '24', detail: 'Cần nhập thêm', icon: 'warning', tone: 'warning' },
  { id: 'out-of-stock', label: 'Tồn đệm đã hết', value: '9', detail: 'Kênh đã tạm dừng', icon: 'block', tone: 'danger' },
];

/**
 * `categoryOptions` is the PROTOTYPE's list: Vietnamese display names.
 *
 * GET /api/v1/products has no category query parameter and returns the stored enum verbatim —
 * `FOOTWEAR`, `APPAREL`, `ACCESSORIES` — which are different strings. So this list drives
 * the fixture dropdown only; `ProductApiTable` filters API rows with a list built from the
 * rows themselves, and mixing the two would make every API row vanish the moment a category
 * filter was touched.
 */
export const categoryOptions = ['all', 'Giày thể thao', 'Áo', 'Áo khoác', 'Đồ da', 'Phụ kiện'] as const;

export const statusOptions: readonly { value: ProductStatus | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả trạng thái' },
  { value: 'active', label: 'Đang bán' },
  { value: 'draft', label: 'Bản nháp' },
  { value: 'under_review', label: 'Đang duyệt' },
  { value: 'archived', label: 'Đã lưu trữ' },
  { value: 'out_of_stock', label: 'Hết hàng' },
];

export const channelOptions: readonly { value: ProductChannelId | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả kênh' },
  { value: 'shopee', label: 'Shopee' },
  { value: 'tiktok', label: 'TikTok Shop' },
  { value: 'lazada', label: 'Lazada' },
  { value: 'web', label: 'Website bán hàng' },
  { value: 'pos', label: 'Bán tại quầy' },
];

export const inventoryOptions: readonly { value: InventoryState | 'all'; label: string }[] = [
  { value: 'all', label: 'Tất cả mức tồn' },
  { value: 'healthy', label: 'Tồn kho tốt' },
  { value: 'low', label: 'Sắp hết hàng' },
  { value: 'critical', label: 'Tồn kho nguy cấp' },
  { value: 'out_of_stock', label: 'Hết hàng' },
];
