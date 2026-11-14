import type { Route } from '../app/routes';
import type { AuthUser } from '../features/auth/auth.api';

export type NavigationRouteName = 'dashboard' | 'products' | 'inventory' | 'receipts' | 'orders' | 'pos' | 'channels' | 'sync' | 'reports' | 'ai' | 'settings' | 'simulator';

export interface NavigationItem {
  name: NavigationRouteName;
  label: string;
  icon: string;
  adminOnly?: boolean;
}

export const navigationItems: readonly NavigationItem[] = [
  { name: 'dashboard', label: 'Tổng quan', icon: 'space_dashboard' },
  { name: 'products', label: 'Sản phẩm', icon: 'inventory_2' },
  { name: 'inventory', label: 'Kho', icon: 'warehouse' },
  { name: 'receipts', label: 'Nhập hàng', icon: 'local_shipping' },
  { name: 'orders', label: 'Đơn hàng', icon: 'receipt_long' },
  { name: 'pos', label: 'Bán tại quầy', icon: 'point_of_sale' },
  { name: 'channels', label: 'Kênh bán', icon: 'hub' },
  { name: 'sync', label: 'Đồng bộ', icon: 'sync_alt' },
  { name: 'reports', label: 'Báo cáo', icon: 'monitoring' },
  { name: 'ai', label: 'Trợ lý AI', icon: 'neurology' },
  { name: 'settings', label: 'Cài đặt', icon: 'settings' },
  { name: 'simulator', label: 'Giả lập livestream', icon: 'bolt', adminOnly: true },
];

export function visibleNavigationItems(user?: AuthUser): readonly NavigationItem[] {
  return navigationItems.filter((item) => !item.adminOnly || user?.role === 'ADMIN');
}

const parentRoutes: Partial<Record<Route['name'], NavigationRouteName>> = {
  'product-detail': 'products',
  'inventory-detail': 'inventory',
  'receipt-create': 'receipts',
  'receipt-detail': 'receipts',
  'order-detail': 'orders',
  'channel-detail': 'channels',
  'ai-detail': 'ai',
};

export function isNavigationActive(route: Route, name: NavigationRouteName): boolean {
  return route.name === name || parentRoutes[route.name] === name;
}

export function currentNavigationLabel(route: Route): string {
  return navigationItems.find((item) => isNavigationActive(route, item.name))?.label ?? 'Không tìm thấy';
}
