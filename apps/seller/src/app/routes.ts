export type RouteName = 'login' | 'dashboard' | 'products' | 'product-detail' | 'inventory' | 'inventory-detail' | 'receipts' | 'receipt-create' | 'receipt-detail' | 'orders' | 'order-detail' | 'pos' | 'channels' | 'channel-detail' | 'sync' | 'reports' | 'ai' | 'ai-detail' | 'settings' | 'simulator' | 'not-found';

export interface Route {
  name: RouteName;
  id?: string;
}

export function parseRoute(pathname: string): Route {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length === 0) return { name: 'dashboard' };
  const [section, id] = parts;
  if (parts.length === 1 && section === 'login') return { name: 'login' };
  if (parts.length === 1 && section === 'products') return { name: 'products' };
  if (parts.length === 2 && section === 'products' && id) return { name: 'product-detail', id };
  if (parts.length === 1 && section === 'inventory') return { name: 'inventory' };
  if (parts.length === 2 && section === 'inventory' && id) return { name: 'inventory-detail', id };
  if (parts.length === 1 && section === 'receipts') return { name: 'receipts' };
  if (parts.length === 2 && section === 'receipts' && id === 'new') return { name: 'receipt-create' };
  if (parts.length === 2 && section === 'receipts' && id) return { name: 'receipt-detail', id };
  if (parts.length === 1 && section === 'orders') return { name: 'orders' };
  if (parts.length === 2 && section === 'orders' && id) return { name: 'order-detail', id };
  if (parts.length === 1 && section === 'pos') return { name: 'pos' };
  if (parts.length === 1 && section === 'channels') return { name: 'channels' };
  if (parts.length === 2 && section === 'channels' && id) return { name: 'channel-detail', id };
  if (parts.length === 1 && section === 'sync') return { name: 'sync' };
  if (parts.length === 1 && section === 'reports') return { name: 'reports' };
  if (parts.length === 1 && section === 'ai') return { name: 'ai' };
  if (parts.length === 2 && section === 'ai' && id) return { name: 'ai-detail', id };
  if (parts.length === 1 && section === 'settings') return { name: 'settings' };
  if (parts.length === 2 && section === 'simulator' && id === 'orders') return { name: 'simulator' };
  return { name: 'not-found' };
}

export function href(route: Route): string {
  if (route.name === 'dashboard') return '/';
  if (route.name === 'login') return '/login';
  if (route.name === 'products') return '/products';
  if (route.name === 'product-detail' && route.id) return `/products/${route.id}`;
  if (route.name === 'inventory') return '/inventory';
  if (route.name === 'inventory-detail' && route.id) return `/inventory/${encodeURIComponent(route.id)}`;
  if (route.name === 'receipts') return '/receipts';
  if (route.name === 'receipt-create') return '/receipts/new';
  if (route.name === 'receipt-detail' && route.id) return `/receipts/${encodeURIComponent(route.id)}`;
  if (route.name === 'orders') return '/orders';
  if (route.name === 'order-detail' && route.id) return `/orders/${route.id}`;
  if (route.name === 'pos') return '/pos';
  if (route.name === 'channels') return '/channels';
  if (route.name === 'channel-detail' && route.id) return `/channels/${route.id}`;
  if (route.name === 'sync') return '/sync';
  if (route.name === 'reports') return '/reports';
  if (route.name === 'ai') return '/ai';
  if (route.name === 'ai-detail' && route.id) return `/ai/${route.id}`;
  if (route.name === 'settings') return '/settings';
  if (route.name === 'simulator') return '/simulator/orders';
  return '/';
}

export function navigate(to: string): void {
  window.history.pushState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

// replaceNavigate exists for the login hand-off specifically: sending someone to /login by
// push would leave the page they were on in the back stack, and the browser Back button
// would then bounce them straight back to a screen they have no session for.
export function replaceNavigate(to: string): void {
  window.history.replaceState({}, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
