import type { Metric } from '../../types/metric';
import type { DashboardAlert, InventoryHealthSegment, SalesChannel, SalesMetric, SalesPoint, SyncEvent } from './dashboard.types';

export const dashboardMetrics: readonly Metric[] = [
  { id: 'products', label: 'Tổng sản phẩm', value: '428', detail: '+12 trong tuần', icon: 'category', tone: 'success' },
  { id: 'skus', label: 'Tổng SKU', value: '1.842', detail: 'Trên 5 kênh', icon: 'qr_code_2' },
  { id: 'available', label: 'Có thể bán', value: '34.290', detail: '98,2% tại các kho đang hoạt động', icon: 'inventory', tone: 'success' },
  { id: 'orders', label: 'Đơn hôm nay', value: '184', detail: '370,5 triệu đ doanh thu', icon: 'shopping_cart', tone: 'success' },
  { id: 'low-stock', label: 'SKU sắp hết', value: '14', detail: 'Cần chú ý', icon: 'warning', tone: 'warning' },
  { id: 'sync', label: 'Lỗi đồng bộ', value: '0', detail: 'Mọi kênh đã đồng bộ', icon: 'verified', tone: 'success' },
];

export const salesChannels: readonly SalesChannel[] = [
  { id: 'tiktok', label: 'TikTok Shop', shortLabel: 'TT', total: '156 triệu đ', percentage: 42, colorClass: 'bg-primary-container' },
  { id: 'shopee', label: 'Shopee', shortLabel: 'SP', total: '103,8 triệu đ', percentage: 28, colorClass: 'bg-on-tertiary-container' },
  { id: 'web', label: 'Website bán hàng', shortLabel: 'WS', total: '63 triệu đ', percentage: 17, colorClass: 'bg-badge-neutral-text' },
  { id: 'lazada', label: 'Lazada', shortLabel: 'LZ', total: '29,5 triệu đ', percentage: 8, colorClass: 'bg-apricot' },
  { id: 'pos', label: 'Bán tại quầy', shortLabel: 'POS', total: '18,3 triệu đ', percentage: 5, colorClass: 'bg-secondary' },
];

export const salesMetricLabels: Readonly<Record<SalesMetric, string>> = {
  revenue: 'Doanh thu',
  orders: 'Đơn hàng',
  units: 'Sản phẩm',
};

export const salesPoints: Readonly<Record<SalesMetric, readonly SalesPoint[]>> = {
  revenue: [
    { label: '18/10', values: [42, 28, 18, 12, 8] },
    { label: '19/10', values: [48, 32, 16, 10, 10] },
    { label: '20/10', values: [55, 36, 24, 14, 6] },
    { label: '21/10', values: [60, 40, 22, 16, 8] },
    { label: '22/10', values: [52, 35, 20, 12, 9] },
    { label: '23/10', values: [68, 45, 26, 15, 11] },
    { label: 'Hôm nay', today: true, values: [74, 48, 30, 16, 12] },
  ],
  orders: [
    { label: '18/10', values: [34, 22, 15, 8, 7] },
    { label: '19/10', values: [38, 24, 14, 8, 8] },
    { label: '20/10', values: [42, 29, 18, 9, 6] },
    { label: '21/10', values: [47, 31, 17, 10, 7] },
    { label: '22/10', values: [40, 28, 16, 8, 7] },
    { label: '23/10', values: [53, 35, 20, 10, 9] },
    { label: 'Hôm nay', today: true, values: [58, 37, 23, 12, 10] },
  ],
  units: [
    { label: '18/10', values: [46, 30, 20, 13, 9] },
    { label: '19/10', values: [52, 34, 18, 11, 11] },
    { label: '20/10', values: [59, 39, 26, 15, 7] },
    { label: '21/10', values: [64, 43, 24, 17, 9] },
    { label: '22/10', values: [56, 37, 22, 13, 10] },
    { label: '23/10', values: [72, 48, 28, 16, 12] },
    { label: 'Hôm nay', today: true, values: [78, 51, 32, 18, 13] },
  ],
};

export const recentSyncEvents: readonly SyncEvent[] = [
  { id: 'sync-1', channel: 'TikTok Shop', channelCode: 'TT', channelColorClass: 'bg-primary-container', sku: 'SHOE-001-BLK-42', description: 'Giảm tồn kho (-1)', status: 'success', time: '2 phút trước' },
  { id: 'sync-2', channel: 'Shopee', channelCode: 'SP', channelColorClass: 'bg-on-tertiary-container', sku: 'TEE-OVS-CREAM-L', description: 'Cập nhật giá (850.000 → 950.000 đ)', status: 'success', time: '5 phút trước' },
  { id: 'sync-3', channel: 'Lazada', channelCode: 'LZ', channelColorClass: 'bg-apricot', sku: 'TEE-OVS-WHT-M', description: 'Giữ chỗ đơn hàng (2)', status: 'pending', time: '12 phút trước' },
  { id: 'sync-4', channel: 'Website bán hàng', channelCode: 'WS', channelColorClass: 'bg-badge-neutral-text', sku: 'BAG-DUFFLE-OLV', description: 'Điều chỉnh tồn đệm an toàn (+5)', status: 'success', time: '18 phút trước' },
  { id: 'sync-5', channel: 'Bán tại quầy', channelCode: 'SQ', channelColorClass: 'bg-secondary', sku: 'CAP-CORDUROY-NVY', description: 'Bán tại cửa hàng (-3)', status: 'success', time: '24 phút trước' },
];

export const dashboardAlerts: readonly DashboardAlert[] = [
  { id: 'alert-1', label: 'Sắp hết hàng', source: 'TikTok', title: 'Ultra Lightweight Runner', sku: 'SHOE-001-BLK-42', detail: 'Chỉ còn 3 sản phẩm có thể bán; 8 sản phẩm đã bán trong 2 giờ.', tone: 'critical' },
  { id: 'alert-2', label: 'Sai lệch giữ chỗ', source: 'Lazada', title: 'Classic Heavyweight Tee', sku: 'TEE-OVS-WHT-M', detail: '2 sản phẩm đang được giữ chỗ quá 90 phút và chờ thanh toán.', tone: 'warning' },
  { id: 'alert-3', label: 'Độ trễ kênh', source: 'Shopee', detail: 'Kênh phản hồi chậm khoảng 450 ms; chưa có yêu cầu nào thất bại.', tone: 'neutral' },
];

export const inventoryHealth: readonly InventoryHealthSegment[] = [
  { id: 'healthy', label: 'Tồn kho tốt', percentage: 84, count: 1548, colorClass: 'bg-traffic-maximize' },
  { id: 'low', label: 'Sắp hết hàng', percentage: 11, count: 202, colorClass: 'bg-traffic-minimize' },
  { id: 'out', label: 'Hết hàng', percentage: 3, count: 55, colorClass: 'bg-error' },
  { id: 'reserved', label: 'Đã giữ chỗ', percentage: 2, count: 37, colorClass: 'bg-badge-neutral-text' },
];
