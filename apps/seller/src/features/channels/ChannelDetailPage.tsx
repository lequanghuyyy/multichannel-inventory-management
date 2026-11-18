import { useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { navigate, parseRoute } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { StatusBadge } from '../../components/common/StatusBadge';
import { Card } from '../../components/ui/Card';
import { getChannel as getChannelFromApi, listChannelMappings, type Channel, type ChannelMapping, type ChannelMappingIssue } from '../../api/channels';
import { getShopifyStatus, type ShopifyStatus } from '../../api/shopify';
import { getChannel, getOrders, type DemoMode } from '../../mocks/mock-api';
import { useRealtimeRefresh } from '../realtime/RealtimeProvider';
import { ChannelWorkspaceTabs, isChannelWorkspaceTab, type ChannelWorkspaceTab } from './components/ChannelWorkspaceTabs';
import { ChannelOverviewTab } from './components/ChannelOverviewTab';
import { ChannelBrandIcon } from '../../components/common/ChannelBrandIcon';
import { ChannelOrderIngestion, ChannelActivityHistory, ChannelCapabilitiesSettings } from './components/ChannelOperations';
import { ChannelSettingsTab } from './components/ChannelSettingsTab';
import { ShopifyCapabilityPanel } from './components/ShopifyCapabilityPanel';
import { ShopifyIntegrationPanel } from './components/ShopifyIntegrationPanel';
import { WooCommerceSettingsPanel } from './components/WooCommerceSettingsPanel';
import { WooCommerceMappingPanel } from './components/WooCommerceMappingPanel';
import { LazadaPanel } from './components/LazadaPanel';
import { LazadaOrdersPanel } from './components/LazadaOrdersPanel';
import { ChannelApiProductsTab } from './components/ChannelApiProductsTab';
import { ChannelApiMappingLedger } from './components/ChannelApiMappingLedger';
import { ChannelMappingLedger } from './components/ChannelMappingLedger';
import type { SalesChannel } from './channel.types';
import { AuthContext } from '../auth/AuthProvider';
import type { Order as FixtureOrder } from '../orders/order.types';

const PAGE_SIZE = 100;
const tabsNeedingMappings = new Set<ChannelWorkspaceTab>(['overview', 'products', 'inventory']);
function readTab(): ChannelWorkspaceTab {
  const value = new URLSearchParams(window.location.search).get('tab');
  return isChannelWorkspaceTab(value) ? value : 'overview';
}

export function ChannelDetailPage({ id, mode }: { id: string; mode: DemoMode }) {
  const auth = useContext(AuthContext);
  const [activeTab, setActiveTab] = useState<ChannelWorkspaceTab>(readTab);
  const [channel, setChannel] = useState<Channel | null>(null);
  const [fixtureChannel, setFixtureChannel] = useState<SalesChannel | null>(null);
  const [loadedId, setLoadedId] = useState<string | null>(null);
  const [mappings, setMappings] = useState<ChannelMapping[]>([]);
  const [mappingCursor, setMappingCursor] = useState<string | null>(null);
  const [mappingTotal, setMappingTotal] = useState(0);
  const [mappingLoading, setMappingLoading] = useState(false);
  const [mappingLoadingMore, setMappingLoadingMore] = useState(false);
  const [mappingError, setMappingError] = useState<unknown>(null);
  const [issues, setIssues] = useState<ChannelMappingIssue[]>([]);
  const [issueCount, setIssueCount] = useState(0);
  const [loadedMappingKey, setLoadedMappingKey] = useState<string | null>(null);
  const [channelLoading, setChannelLoading] = useState(true);
  const [channelError, setChannelError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [shopifyStatus, setShopifyStatus] = useState<ShopifyStatus | null>(null);
  const [shopifyStatusLoading, setShopifyStatusLoading] = useState(false);
  const [shopifyStatusError, setShopifyStatusError] = useState<string | null>(null);
  const requestEpoch = useRef(0);
  const channelRef = useRef(channel);
  const fixtureRef = useRef(fixtureChannel);
  channelRef.current = channel;
  fixtureRef.current = fixtureChannel;

  useEffect(() => {
    const update = () => {
      const route = parseRoute(window.location.pathname);
      if (route.name === 'channel-detail' && route.id === id) setActiveTab(readTab());
    };
    window.addEventListener('popstate', update);
    update();
    return () => window.removeEventListener('popstate', update);
  }, [id]);

  const selectTab = (tab: ChannelWorkspaceTab) => {
    setActiveTab(tab);
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    navigate(`${url.pathname}${url.search}${url.hash}`);
  };

  useEffect(() => {
    const epoch = ++requestEpoch.current;
    const controller = new AbortController();
    const keepingCurrent = loadedId === id && (mode === 'default' ? channelRef.current?.id === id : fixtureRef.current?.id === id);
    if (!keepingCurrent) {
      setChannelLoading(true);
      setLoadedId(null);
      setChannel(null);
      setFixtureChannel(null);
      setShopifyStatus(null);
      setMappings([]);
      setMappingCursor(null);
      setMappingTotal(0);
      setMappingLoading(false);
      setMappingLoadingMore(false);
      setMappingError(null);
      setIssues([]);
      setIssueCount(0);
      setLoadedMappingKey(null);
    }
    setChannelError(null);

    if (mode !== 'default') {
      void Promise.resolve().then(() => getChannel(id, mode)).then((value) => {
        if (controller.signal.aborted || requestEpoch.current !== epoch) return;
        setFixtureChannel(value ?? null);
        setLoadedId(id);
      }).catch((cause: unknown) => {
        if (!controller.signal.aborted && requestEpoch.current === epoch) { setChannelError(cause); setLoadedId(id); }
      }).finally(() => { if (!controller.signal.aborted && requestEpoch.current === epoch) setChannelLoading(false); });
      return () => { controller.abort(); requestEpoch.current += 1; };
    }

    void Promise.resolve().then(() => getChannelFromApi(id, controller.signal)).then((value) => {
      if (controller.signal.aborted || requestEpoch.current !== epoch) return;
      if (value.id !== id) throw new Error('API returned a different channel than requested.');
      setChannel(value);
      setLoadedId(id);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && requestEpoch.current === epoch) { setChannelError(cause); setLoadedId(id); }
    }).finally(() => { if (!controller.signal.aborted && requestEpoch.current === epoch) setChannelLoading(false); });

    return () => { controller.abort(); requestEpoch.current += 1; };
  }, [attempt, id, mode]);

  const currentChannel = loadedId === id ? channel : null;
  const currentFixture = loadedId === id ? fixtureChannel : null;

  const loadMoreMappings = useCallback(async () => {
    if (!currentChannel || !mappingCursor || mappingLoadingMore) return;
    const controller = new AbortController();
    setMappingLoadingMore(true);
    try {
      const page = await listChannelMappings(
        currentChannel.id,
        { limit: PAGE_SIZE, cursor: mappingCursor },
        controller.signal,
      );
      setMappings((prev) => [...prev, ...page.items]);
      setMappingCursor(page.nextCursor ?? null);
      if (page.totalCount !== undefined && page.totalCount !== null) {
        setMappingTotal(page.totalCount);
      }
    } catch (cause) {
      setMappingError(cause);
    } finally {
      setMappingLoadingMore(false);
    }
  }, [currentChannel, mappingCursor, mappingLoadingMore]);

  const refreshMappings = useCallback(() => {
    if (!currentChannel) return;
    const controller = new AbortController();
    setMappingLoading(true);
    setMappingError(null);
    void listChannelMappings(currentChannel.id, { limit: PAGE_SIZE }, controller.signal)
      .then((page) => {
        setMappings(page.items);
        setMappingCursor(page.nextCursor ?? null);
        setMappingTotal(page.totalCount ?? currentChannel.mapping_count ?? page.items.length);
        setIssues(page.issues ?? []);
        setIssueCount(page.issueCount ?? 0);
      })
      .catch((cause) => {
        setMappingError(cause);
      })
      .finally(() => {
        setMappingLoading(false);
      });
  }, [currentChannel]);

  useEffect(() => {
    if (mode !== 'default' || !currentChannel || !tabsNeedingMappings.has(activeTab)) return;
    const key = `${id}:${attempt}`;
    if (loadedMappingKey === key) return;
    const controller = new AbortController();
    const epoch = requestEpoch.current;
    setMappingLoading(true);
    setMappingError(null);
    void listChannelMappings(id, { limit: PAGE_SIZE }, controller.signal).then((page) => {
      if (controller.signal.aborted || epoch !== requestEpoch.current) return;
      setMappings(page.items);
      setMappingCursor(page.nextCursor ?? null);
      setMappingTotal(page.totalCount ?? currentChannel.mapping_count ?? page.items.length);
      setIssues(page.issues ?? []);
      setIssueCount(page.issueCount ?? 0);
      setLoadedMappingKey(key);
    }).catch((cause: unknown) => {
      if (controller.signal.aborted || epoch !== requestEpoch.current) return;
      console.warn('Channel mappings could not be loaded.', cause);
      setMappingError(cause);
      setLoadedMappingKey(key);
    }).finally(() => {
      if (!controller.signal.aborted && epoch === requestEpoch.current) {
        setMappingLoading(false);
      }
    });
    return () => controller.abort();
  }, [activeTab, attempt, currentChannel?.id, currentChannel?.mapping_count, id, loadedMappingKey, mode]);

  useEffect(() => {
    setShopifyStatus(null);
    setShopifyStatusLoading(mode === 'default' && currentChannel?.code === 'shopify');
    setShopifyStatusError(null);
    if (mode !== 'default' || currentChannel?.code !== 'shopify') {
      setShopifyStatusLoading(false);
      return;
    }
    const controller = new AbortController();
    void getShopifyStatus(controller.signal).then((status) => {
      if (controller.signal.aborted || currentChannel.id !== id) return;
      setShopifyStatus(status.channel_id === id ? status : null);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setShopifyStatusError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái Shopify.');
    }).finally(() => { if (!controller.signal.aborted) setShopifyStatusLoading(false); });
    return () => controller.abort();
  }, [attempt, currentChannel?.code, currentChannel?.id, id, mode]);

  const refresh = useCallback(() => {
    setChannelError(null);
    setAttempt((value) => value + 1);
  }, []);

  useRealtimeRefresh(['inventory'], () => {
    const route = parseRoute(window.location.pathname);
    if (mode === 'default' && route.name === 'channel-detail' && route.id === id && loadedId === id && channel?.id === id) refresh();
  }, { refreshOnResync: false });

  if (channelLoading || loadedId !== id) return <ChannelWorkspaceFrame activeTab={activeTab} onChange={selectTab}><LoadingState label="Đang tải kênh bán…" /></ChannelWorkspaceFrame>;
  if (channelError) return <ChannelWorkspaceFrame activeTab={activeTab} onChange={selectTab}><ErrorState error={channelError} retry={refresh} /></ChannelWorkspaceFrame>;
  if (!currentChannel && !currentFixture) return <ChannelWorkspaceFrame activeTab={activeTab} onChange={selectTab}><EmptyState title="Không tìm thấy kênh" detail="Kênh này không tồn tại trong dữ liệu đang xem." /></ChannelWorkspaceFrame>;

  const canManage = auth?.user?.role === 'ADMIN';
  const fixture = Boolean(currentFixture);
  const displayChannel: Channel = currentChannel ?? {
    id: currentFixture!.id,
    code: currentFixture!.kind === 'simulator' ? 'simulator' : currentFixture!.name.toLocaleLowerCase('vi').replace(/[^a-z0-9]+/g, '-'),
    name: currentFixture!.name,
    type: currentFixture!.kind === 'simulator' ? 'simulator' : currentFixture!.kind,
    environment: currentFixture!.environment === 'simulation' ? 'simulated' : currentFixture!.environment === 'planned' ? 'sandbox' : currentFixture!.environment,
    status: currentFixture!.connectionStatus === 'connected' ? 'connected' : currentFixture!.connectionStatus === 'error' ? 'error' : 'disconnected',
    last_sync: currentFixture!.lastSyncAt ?? undefined,
    last_error: currentFixture!.lastError,
    mapping_count: currentFixture!.mappings.mapped,
  };

  return <ChannelWorkspaceFrame channelName={displayChannel.name} channelIcon={<ChannelBrandIcon code={displayChannel.code} simulated={displayChannel.type === 'simulator' || displayChannel.environment === 'simulated'} />} activeTab={activeTab} onChange={selectTab} lastSync={displayChannel.last_sync}>
    <h1 className="sr-only" id="channel-detail-title">{displayChannel.name}</h1>
    <div id={`channel-workspace-panel-${activeTab}`} role="tabpanel" tabIndex={0} aria-labelledby="channel-detail-title" className="min-w-0 outline-none">
      {fixture ? (
        <Card className="mb-5 border border-apricot/40 p-3 text-sm text-on-surface" variant="muted" role="status">
          Đang xem dữ liệu demo. Trạng thái này không chứng minh kênh đã kết nối.
        </Card>
      ) : null}
      {fixture && currentFixture ? <FixtureTab tab={activeTab} channel={currentFixture} mode={mode} /> : null}
      {!fixture && currentChannel && activeTab === 'overview' ? <ChannelOverviewTab key={`${currentChannel.id}:${attempt}`} channel={currentChannel} shopifyStatus={shopifyStatus} mappings={mappings} issues={issues} issueCount={issueCount} onNavigate={selectTab} /> : null}
      {!fixture && currentChannel && activeTab === 'products' ? currentChannel.code === 'lazada'
        ? <LazadaPanel key={`${currentChannel.id}:${attempt}`} channel={currentChannel} tab="products" canManage={canManage} onUpdated={refresh} onSettings={() => selectTab('settings')} />
        : currentChannel.code === 'woocommerce'
        ? <WooCommerceMappingPanel key={`${currentChannel.id}:${attempt}`} channel={currentChannel} canManage={canManage} onUpdated={refreshMappings} />
        : <ChannelApiProductsTab
            channel={currentChannel}
            mappings={mappings}
            totalCount={mappingTotal}
            loading={mappingLoading}
            error={mappingError}
            loadingMore={mappingLoadingMore}
            hasMore={Boolean(mappingCursor)}
            onLoadMore={loadMoreMappings}
            onRefresh={refreshMappings}
          /> : null}
      {!fixture && currentChannel && activeTab === 'inventory' ? (
        mappingLoading && mappings.length === 0 ? (
          <LoadingState label="Đang tải dữ liệu đối soát…" />
        ) : mappingError && mappings.length === 0 ? (
          <ErrorState error={mappingError} retry={refreshMappings} />
        ) : mappings.length === 0 ? (
          <EmptyState
            title="Chưa có listing để đối soát"
            detail="Kênh bán chưa có listing hoặc biến thể nào được cấu hình đối soát."
          />
        ) : (
          <ChannelApiMappingLedger
            mappings={mappings}
            totalCount={mappingTotal}
            issues={issues}
            issueCount={issueCount}
            shopify={currentChannel.code === 'shopify'}
            ebay={currentChannel.code === 'ebay'}
            woocommerce={currentChannel.code === 'woocommerce'}
            hasMore={Boolean(mappingCursor)}
            loadingMore={mappingLoadingMore}
            onLoadMore={loadMoreMappings}
          />
        )
      ) : null}
      {!fixture && currentChannel && activeTab === 'orders' ? currentChannel.code === 'lazada'
        ? <LazadaOrdersPanel key={`${currentChannel.id}:${attempt}`} channelId={currentChannel.id} canManage={canManage} connected={currentChannel.status === 'connected'} />
        : <ChannelOrderIngestion key={`${currentChannel.id}:${attempt}`} channel={currentChannel} canManage={canManage} /> : null}
      {!fixture && currentChannel && activeTab === 'history' ? <ChannelActivityHistory key={`${currentChannel.id}:${attempt}`} channel={currentChannel} /> : null}
      {!fixture && currentChannel && activeTab === 'settings' ? <div className="grid gap-5">
        {currentChannel.code === 'shopify' ? (
          <ShopifyIntegrationPanel canManage={canManage} channelId={currentChannel.id} onUpdated={refresh} />
        ) : currentChannel.code === 'lazada' ? (
          <LazadaPanel key={`${currentChannel.id}:${attempt}`} channel={currentChannel} tab="settings" canManage={canManage} onUpdated={refresh} />
        ) : currentChannel.code === 'woocommerce' ? (
          <WooCommerceSettingsPanel key={`${currentChannel.id}:${attempt}`} channel={currentChannel} canManage={canManage} onUpdated={refresh} />
        ) : (
          <ChannelSettingsTab key={`${currentChannel.id}:${attempt}`} channel={currentChannel} canManage={canManage} status={shopifyStatus} statusLoading={shopifyStatusLoading} statusError={shopifyStatusError} onStatusChange={setShopifyStatus} onUpdated={refresh} />
        )}
        {currentChannel.code === 'shopify' ? <ShopifyCapabilityPanel channelId={currentChannel.id} canManage={canManage} /> : null}
        <ChannelCapabilitiesSettings channel={currentChannel} />
      </div> : null}
    </div>
  </ChannelWorkspaceFrame>;
}

function ChannelWorkspaceFrame({
  channelName, channelIcon, activeTab, onChange, lastSync, children,
}: {
  channelName?: string;
  channelIcon?: ReactNode;
  activeTab: ChannelWorkspaceTab;
  onChange: (tab: ChannelWorkspaceTab) => void;
  lastSync?: string;
  children: ReactNode;
}) {
  return <div className="channel-workspace-shell min-h-dvh bg-surface-container-low text-on-surface md:grid md:grid-cols-[236px_minmax(0,1fr)]">
    <aside className="sticky top-0 hidden h-dvh flex-col border-r border-outline-variant/50 bg-pure-white px-4 py-6 md:flex" aria-label="Điều hướng quản lý kênh">
      <div className="flex min-w-0 items-center gap-3 px-2 py-1">
        <span className="grid size-10 shrink-0 place-items-center" aria-hidden="true">{channelIcon ?? <span className="material-symbols-outlined">storefront</span>}</span>
        <span className="min-w-0"><strong className="block truncate font-display text-xl font-extrabold leading-5 tracking-tight text-carbon">{channelName ?? 'Đang tải kênh'}</strong><span className="mt-1 block truncate font-body text-[9px] font-semibold uppercase tracking-[0.12em] text-graphite">Kênh bán</span></span>
      </div>
      <div className="mt-8"><ChannelWorkspaceTabs value={activeTab} onChange={onChange} /></div>
      <button type="button" onClick={() => navigate('/channels')} className="mt-auto flex min-h-11 items-center gap-3 rounded-control px-3 text-left text-sm font-semibold text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown">
        <span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_back</span>
        Tất cả kênh
      </button>
    </aside>
    <main className="channel-workspace-main min-w-0 w-full max-w-none p-0">
      <div className="sticky top-0 z-20 flex min-h-16 items-center justify-between gap-3 border-b border-outline-variant/50 bg-pure-white px-4 sm:px-6 xl:px-9">
        <div className="flex min-w-0 items-center gap-2 text-sm">
          <button type="button" onClick={() => navigate('/channels')} className="shrink-0 rounded-control px-2 py-2 font-semibold text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brown">Kênh bán</button>
          <span className="text-outline" aria-hidden="true">/</span>
          <span className="truncate font-semibold text-on-surface">{channelName ?? 'Đang tải kênh'}</span>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {lastSync ? <span className="hidden text-caption text-graphite lg:inline">Cập nhật {formatTime(lastSync)}</span> : null}
        </div>
      </div>
      <div className="md:hidden"><ChannelWorkspaceTabs value={activeTab} onChange={onChange} placement="mobile" /></div>
      <div className="mx-auto grid min-w-0 w-full max-w-[1480px] content-start gap-0 px-4 py-5 sm:px-6 md:px-7 md:py-6 xl:px-9">{children}</div>
    </main>
  </div>;
}

function FixtureTab({ tab, channel, mode }: { tab: ChannelWorkspaceTab; channel: SalesChannel; mode: DemoMode }) {
  if (tab === 'overview') return <div className="grid min-w-0 gap-5">
    <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      {[["Sản phẩm trên kênh", channel.mappings.mapped.toLocaleString('vi-VN')], ["Cần kiểm tra", (channel.mappings.unmapped + channel.mappings.conflicts).toLocaleString('vi-VN')], ["Đang hoạt động", channel.connectionStatus === 'connected' ? 'Có' : 'Chưa'], ["Cập nhật gần nhất", channel.lastSyncAt ? formatTime(channel.lastSyncAt) : 'Chưa có']].map(([label, value]) => <Card key={label} className="p-4 sm:p-5"><span className="text-sm text-graphite">{label}</span><strong className="mt-3 block break-words font-display text-xl font-bold text-on-surface">{value}</strong></Card>)}
    </section>
    <Card className="grid gap-3 p-5"><h2 className="font-display text-lg font-bold text-on-surface">Cửa hàng</h2><div className="flex flex-wrap items-center justify-between gap-3"><p className="text-sm text-graphite">{channel.name}</p><StatusBadge tone={channel.connectionStatus === 'connected' ? 'success' : channel.connectionStatus === 'error' ? 'danger' : 'neutral'}>{channel.connectionStatus === 'connected' ? 'Đang hoạt động' : channel.connectionStatus === 'error' ? 'Cần kiểm tra' : 'Chưa kết nối'}</StatusBadge></div></Card>
  </div>;
  if (tab === 'products') return <ChannelMappingLedger channel={channel} />;
  if (tab === 'inventory') return <div className="grid gap-5"><header><h2 className="font-display text-xl font-bold text-on-surface">Tồn kho</h2></header><EmptyState title="Chưa có dữ liệu tồn kho" detail="Số lượng sản phẩm sẽ hiển thị khi cửa hàng được kết nối." /></div>;
  if (tab === 'orders') return <FixtureOrders channel={channel} mode={mode} />;
  if (tab === 'history') return <div className="grid gap-5"><header><h2 className="font-display text-xl font-bold text-on-surface">Lịch sử hoạt động</h2></header><EmptyState title="Chưa có hoạt động" detail="Các thay đổi của cửa hàng sẽ hiển thị tại đây." /></div>;
  return <Card className="grid gap-5 p-5 sm:p-6"><header><h2 className="font-display text-xl font-bold text-on-surface">Cấu hình cửa hàng</h2><p className="mt-1 text-sm text-graphite">Thông tin cửa hàng và trạng thái kết nối.</p></header><dl className="grid gap-4 border-t border-outline-variant/50 pt-4 sm:grid-cols-2"><div><dt className="text-xs text-graphite">Tên cửa hàng</dt><dd className="mt-1 text-sm font-semibold text-on-surface">{channel.name}</dd></div><div><dt className="text-xs text-graphite">Nền tảng</dt><dd className="mt-1 text-sm font-semibold capitalize text-on-surface">{channel.kind === 'simulator' ? 'TikTok Shop' : channel.kind}</dd></div><div><dt className="text-xs text-graphite">Kết nối</dt><dd className="mt-1 text-sm font-semibold text-on-surface">{channel.connectionStatus === 'connected' ? 'Đang hoạt động' : channel.connectionStatus === 'error' ? 'Cần kiểm tra' : 'Chưa kết nối'}</dd></div><div><dt className="text-xs text-graphite">Cập nhật gần nhất</dt><dd className="mt-1 text-sm font-semibold text-on-surface">{channel.lastSyncAt ? formatTime(channel.lastSyncAt) : 'Chưa có dữ liệu'}</dd></div></dl></Card>;
}

function FixtureOrders({ channel, mode }: { channel: SalesChannel; mode: DemoMode }) {
  const [orders, setOrders] = useState<FixtureOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    setLoading(true); setError(null);
    void getOrders(mode).then((all) => { if (active) setOrders(all.filter((item) => channelKey(channel) === item.channel.id)); }).catch((cause: unknown) => { if (active) setError(cause); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [channel, mode]);
  return <div className="grid min-w-0 gap-5"><header><h2 className="font-display text-xl font-bold text-on-surface">Đơn hàng</h2><p className="mt-1 text-sm text-graphite">Đơn hàng từ {channel.name}</p></header>{loading ? <LoadingState label="Đang tải đơn hàng…" /> : null}{!loading && error ? <ErrorState error={error} retry={() => { setLoading(true); void getOrders(mode).then((all) => setOrders(all.filter((item) => channelKey(channel) === item.channel.id))).catch(setError).finally(() => setLoading(false)); }} /> : null}{!loading && !error && orders.length === 0 ? <EmptyState title="Chưa có đơn hàng" detail="Đơn hàng của cửa hàng sẽ hiển thị tại đây." /> : null}{!loading && !error && orders.length ? <Card className="min-w-0 overflow-hidden p-0"><div className="overflow-x-auto"><table className="w-full min-w-[760px] border-collapse text-left"><thead><tr className="h-12 border-b border-outline-variant/50 bg-surface-container-low text-xs font-semibold text-graphite"><th className="px-5">Đơn hàng</th><th className="px-3">Khách hàng</th><th className="px-3">Sản phẩm</th><th className="px-3 text-right">Tổng tiền</th><th className="px-3">Tình trạng</th><th className="px-5">Ngày đặt</th></tr></thead><tbody className="divide-y divide-surface-container">{orders.map((order) => <tr key={order.id} className="text-sm"><td className="px-5 py-4 font-semibold text-on-surface">{order.reference}<span className="mt-1 block text-xs font-normal text-graphite">{order.marketplaceReference}</span></td><td className="px-3 py-4 text-on-surface">{order.customer.name}</td><td className="px-3 py-4 tabular-nums text-on-surface">{order.itemCount}</td><td className="px-3 py-4 text-right font-semibold tabular-nums text-on-surface">{order.total.formatted}</td><td className="px-3 py-4"><StatusBadge tone={order.status === 'completed' ? 'success' : order.status === 'cancelled' ? 'danger' : 'warning'}>{fixtureOrderStatus(order.status)}</StatusBadge></td><td className="px-5 py-4 text-xs text-graphite">{formatTime(order.placedAt)}</td></tr>)}</tbody></table></div></Card> : null}</div>;
}

function channelKey(channel: SalesChannel): string { if (channel.kind === 'pos') return 'pos'; if (channel.kind === 'simulator') return 'tiktok'; const normalized = channel.name.toLocaleLowerCase('vi'); return normalized.includes('shopee') ? 'shopee' : normalized.includes('lazada') ? 'lazada' : normalized.includes('tiktok') ? 'tiktok' : 'web'; }
function fixtureOrderStatus(status: string) { return ({ pending: 'Mới', reserved: 'Đang xử lý', confirmed: 'Đã xác nhận', completed: 'Hoàn tất', cancelled: 'Đã hủy', returned: 'Đã hoàn' } as Record<string, string>)[status] ?? status; }

function formatTime(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}
