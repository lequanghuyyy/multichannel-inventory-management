import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { RootLayout } from '../layouts/RootLayout';
import { parseRoute, type Route } from './routes';
import { demoMode } from '../mocks/mock-api';
import { DashboardPage } from '../features/dashboard/DashboardPage';
import { ProductsPage } from '../features/products/ProductsPage';
import { ProductDetailPage } from '../features/products/ProductDetailPage';
import { InventoryPage } from '../features/inventory/InventoryPage';
import { InventoryDetailPage } from '../features/inventory/InventoryDetailPage';
import { ReceiptsPage } from '../features/receipts/ReceiptsPage';
import { ReceiptCreatePage } from '../features/receipts/ReceiptCreatePage';
import { ReceiptDetailPage } from '../features/receipts/ReceiptDetailPage';
import { OrdersPage } from '../features/orders/OrdersPage';
import { OrderDetailPage } from '../features/orders/OrderDetailPage';
import { ChannelsPage } from '../features/channels/ChannelsPage';
import { ChannelDetailPage } from '../features/channels/ChannelDetailPage';
import { AIPage } from '../features/ai/AIPage';
import { RecommendationDetailPage } from '../features/ai/RecommendationDetailPage';
import { LoadingState, ErrorState } from '../components/common/ScreenState';
import { navigate, replaceNavigate } from './routes';
import { useAuth } from '../features/auth/AuthProvider';
import { LoginPage } from '../features/auth/LoginPage';
import type { DemoMode } from '../mocks/mock-api';
import { PortalVisibilityProvider } from '../components/ui/PortalVisibilityContext';

const SettingsPage = lazy(async () => {
  const module = await import('../features/settings/SettingsPage');
  return { default: module.SettingsPage };
});

const SyncPage = lazy(async () => {
  const module = await import('../features/sync/SyncPage');
  return { default: module.SyncPage };
});

const ReportsPage = lazy(async () => {
  const module = await import('../features/reports/ReportsPage');
  return { default: module.ReportsPage };
});

const POSPage = lazy(async () => {
  const module = await import('../features/pos/POSPage');
  return { default: module.POSPage };
});

const LivestreamSimulatorPage = lazy(async () => {
  const module = await import('../features/order-load/LivestreamSimulatorPage');
  return { default: module.LivestreamSimulatorPage };
});

function currentRoute(): Route {
  return parseRoute(window.location.pathname);
}

function safeNext(): string {
  const candidate = new URLSearchParams(window.location.search).get('next') ?? '/';
  const target = new URL(candidate, window.location.origin);
  return target.origin === window.location.origin && target.pathname !== '/login' ? `${target.pathname}${target.search}${target.hash}` : '/';
}

function NotFoundPage() {
  return <section className="page"><div className="screen-state"><span className="state-mark">?</span><h1>Không tìm thấy màn hình</h1><p>Đường dẫn này không tồn tại.</p><button className="button-primary" type="button" onClick={() => navigate('/')}>Về Tổng quan</button></div></section>;
}

export function App() {
  const auth = useAuth();
  const [route, setRoute] = useState(currentRoute);
  const [retainedChannelRoute, setRetainedChannelRoute] = useState<{ id: string; mode: DemoMode } | null>(null);
  useEffect(() => {
    const update = () => setRoute(currentRoute());
    window.addEventListener('popstate', update);
    return () => window.removeEventListener('popstate', update);
  }, []);
  useEffect(() => {
    if (auth.status === 'anonymous' && route.name !== 'login') {
      const next = `${window.location.pathname}${window.location.search}${window.location.hash}`;
      replaceNavigate(`/login?next=${encodeURIComponent(next)}`);
    }
    if (auth.status === 'authenticated' && route.name === 'login') {
      replaceNavigate(safeNext());
    }
  }, [auth.status, route.name]);
  const mode = demoMode(window.location.search);
  const isChannelDetailRoute = route.name === 'channel-detail' && Boolean(route.id);
  useEffect(() => {
    if (auth.status === 'authenticated' && isChannelDetailRoute && route.id) setRetainedChannelRoute({ id: route.id, mode });
  }, [auth.status, isChannelDetailRoute, mode, route.id]);

  if (auth.status === 'loading') return <main className="grid min-h-dvh place-items-center bg-surface-container-low"><LoadingState label="Đang xác minh phiên đăng nhập…" /></main>;
  if (auth.status === 'error') return <main className="grid min-h-dvh place-items-center bg-surface-container-low px-5"><ErrorState error={auth.error} retry={auth.retry} /></main>;
  if (auth.status === 'anonymous') return <LoginPage onSuccess={() => {
    replaceNavigate(safeNext());
  }} />;
  if (!auth.user || route.name === 'login') return <main className="grid min-h-dvh place-items-center bg-surface-container-low"><LoadingState label="Đang mở ứng dụng…" /></main>;
  const channelRoute = isChannelDetailRoute && route.id
    ? { id: route.id, mode }
    : retainedChannelRoute;
  let page: ReactNode;
  if (route.name === 'dashboard') page = <DashboardPage />;
  else if (route.name === 'products') page = <ProductsPage mode={mode} canManageCatalog={auth.user.role === 'ADMIN'} />;
  else if (route.name === 'product-detail' && route.id) page = <ProductDetailPage id={route.id} mode={mode} canManageCatalog={auth.user.role === 'ADMIN'} />;
  else if (route.name === 'inventory') page = <InventoryPage mode={mode} />;
  else if (route.name === 'inventory-detail' && route.id) page = <InventoryDetailPage sku={route.id} mode={mode} canAdjust={auth.user.role === 'ADMIN'} canManageChannels={auth.user.role === 'ADMIN'} canCreateReceipt={auth.user.role === 'ADMIN' || auth.user.role === 'STAFF'} />;
  else if (route.name === 'receipts') page = <ReceiptsPage />;
  else if (route.name === 'receipt-create') page = <ReceiptCreatePage />;
  else if (route.name === 'receipt-detail' && route.id) page = <ReceiptDetailPage id={route.id} />;
  else if (route.name === 'orders') page = <OrdersPage mode={mode} />;
  else if (route.name === 'order-detail' && route.id) page = <OrderDetailPage id={route.id} mode={mode} />;
  else if (route.name === 'pos') page = <POSPage mode={mode} userId={auth.user.id} canDiscount={auth.user.role === 'ADMIN'} canManageAllocation={auth.user.role === 'ADMIN'} />;
  else if (route.name === 'channels') page = <ChannelsPage mode={mode} />;
  else if (route.name === 'channel-detail') page = null;
  else if (route.name === 'sync') page = <SyncPage mode={mode} />;
  else if (route.name === 'reports') page = <ReportsPage mode={mode} />;
  else if (route.name === 'ai') page = <AIPage mode={mode} />;
  else if (route.name === 'ai-detail' && route.id) page = <RecommendationDetailPage id={route.id} mode={mode} />;
  else if (route.name === 'settings') page = <SettingsPage mode={mode} />;
  else if (route.name === 'simulator') page = auth.user.role === 'ADMIN' ? <LivestreamSimulatorPage /> : <NotFoundPage />;
  else page = <NotFoundPage />;
  const screen = <Suspense fallback={<section className="mx-auto w-full max-w-[1240px] py-8"><LoadingState label="Đang tải…" /></section>}>{page}</Suspense>;
  return <>
    {/* Keep the last channel workspace mounted so leaving and returning does not refetch it. */}
    <PortalVisibilityProvider active={isChannelDetailRoute}>
      <div hidden={!isChannelDetailRoute} aria-hidden={!isChannelDetailRoute}>
        {channelRoute ? <Suspense fallback={<section className="channel-workspace-shell min-h-dvh"><LoadingState label="Đang mở kênh bán…" /></section>}><ChannelDetailPage id={channelRoute.id} mode={channelRoute.mode} /></Suspense> : null}
      </div>
    </PortalVisibilityProvider>
    {isChannelDetailRoute ? null : <RootLayout route={route} user={auth.user} onLogout={() => void auth.logout()}>{screen}</RootLayout>}
  </>;
}
