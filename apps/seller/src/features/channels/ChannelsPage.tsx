import { useContext, useDeferredValue, useEffect, useMemo, useState } from 'react';
import { href, navigate } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { listChannels, type Channel } from '../../api/channels';
import { getChannels, type DemoMode } from '../../mocks/mock-api';
import { useApiPage } from '../shared/useApiPage';
import { ChannelApiGrid } from './components/ChannelApiGrid';
import { ChannelFiltersPanel } from './components/ChannelFiltersPanel';
import { ChannelGrid } from './components/ChannelGrid';
import { ChannelsHeader } from './components/ChannelsHeader';
import { getEbayStatus, startEbayOAuth } from '../../api/ebay';
import { AuthContext } from '../auth/AuthProvider';
import { connectWooCommerceStore, getWooCommerceStatus, type WooCommerceStatus } from '../../api/woocommerce';
import { getLazadaStatus, startLazadaOAuth, type LazadaStatus } from '../../api/lazada';
import type { ChannelFilters } from './channel.types';
import { filterChannels, initialChannelFilters } from './channel.utils';
import type { SalesChannel } from './channel.types';

export function ChannelsPage({ mode }: { mode: DemoMode }) {
  const auth = useContext(AuthContext);
  const loadFixture = useMemo(() => getChannels, []);
  const page = useApiPage<Channel, SalesChannel>(
    async (cursor, signal) => {
      const response = await listChannels({ limit: 100, ...(cursor === null ? {} : { cursor }) }, signal);
      return { items: response.items, nextCursor: response.nextCursor };
    },
    loadFixture,
    mode,
    100,
    { fallbackOnError: false, pendingUntilResolved: true },
  );
  const [filters, setFilters] = useState<ChannelFilters>(initialChannelFilters);
  const [ebayEnabled, setEbayEnabled] = useState(false);
  const [ebayConnections, setEbayConnections] = useState(0);
  const [ebayStatusError, setEbayStatusError] = useState<string | null>(null);
  const [ebayConnecting, setEbayConnecting] = useState(false);
  const [ebayConnectError, setEbayConnectError] = useState<string | null>(null);
  const [woocommerceStatus, setWooCommerceStatus] = useState<WooCommerceStatus | null>(null);
  const [woocommerceStatusError, setWooCommerceStatusError] = useState<string | null>(null);
  const [woocommerceConnecting, setWooCommerceConnecting] = useState(false);
  const [woocommerceConnectError, setWooCommerceConnectError] = useState<string | null>(null);
  const [lazadaStatus, setLazadaStatus] = useState<LazadaStatus | null>(null);
  const [lazadaError, setLazadaError] = useState<string | null>(null);
  const [lazadaConnecting, setLazadaConnecting] = useState(false);
  const [oauthResult] = useState(() => new URLSearchParams(window.location.search).get('ebay_oauth'));
  const [lazadaOAuthResult] = useState(() => new URLSearchParams(window.location.search).get('lazada_oauth'));
  const deferredQuery = useDeferredValue(filters.query);

  useEffect(() => {
    if (mode !== 'default') return;
    const controller = new AbortController();
    void getEbayStatus(controller.signal).then((status) => {
      if (controller.signal.aborted) return;
      setEbayEnabled(status.enabled);
      setEbayConnections(status.connections.length);
      setEbayStatusError(null);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setEbayStatusError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái eBay Sandbox.');
    });
    return () => controller.abort();
  }, [mode]);

  useEffect(() => {
    if (mode !== 'default') return;
    const controller = new AbortController();
    void getLazadaStatus(controller.signal).then((status) => {
      if (!controller.signal.aborted) { setLazadaStatus(status); setLazadaError(null); }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setLazadaError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái Lazada.');
    });
    return () => controller.abort();
  }, [mode, lazadaOAuthResult]);

  useEffect(() => {
    if (mode !== 'default') return;
    const controller = new AbortController();
    void getWooCommerceStatus(controller.signal).then((status) => {
      if (controller.signal.aborted) return;
      setWooCommerceStatus(status);
      setWooCommerceStatusError(null);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setWooCommerceStatusError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái WooCommerce.');
    });
    return () => controller.abort();
  }, [mode]);

  useEffect(() => {
    if (!oauthResult) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('ebay_oauth');
    params.delete('channel_id');
    const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ''}${window.location.hash}`;
    window.history.replaceState(window.history.state, '', next);
  }, [oauthResult]);

  useEffect(() => {
    if (!lazadaOAuthResult) return;
    const params = new URLSearchParams(window.location.search);
    params.delete('lazada_oauth'); params.delete('channel_id');
    window.history.replaceState(window.history.state, '', `${window.location.pathname}${params.size ? `?${params}` : ''}${window.location.hash}`);
    void page.refresh();
  }, [lazadaOAuthResult]);

  const connectLazada = async () => {
    if (auth?.user?.role !== 'ADMIN' || !lazadaStatus?.enabled || lazadaConnecting) return;
    setLazadaConnecting(true); setLazadaError(null);
    try { window.location.assign(await startLazadaOAuth()); }
    catch (cause) { setLazadaError(cause instanceof Error ? cause.message : 'Không thể mở trang ủy quyền Lazada.'); setLazadaConnecting(false); }
  };

  const connectEbay = async () => {
    if (auth?.user?.role !== 'ADMIN' || !ebayEnabled || ebayConnecting) return;
    setEbayConnecting(true);
    setEbayConnectError(null);
    try {
      const result = await startEbayOAuth();
      window.location.assign(result.authorization_url);
    } catch (cause) {
      setEbayConnectError(cause instanceof Error ? cause.message : 'Không thể bắt đầu kết nối eBay Sandbox.');
      setEbayConnecting(false);
    }
  };

  const connectWooCommerce = async () => {
    if (auth?.user?.role !== 'ADMIN' || !woocommerceStatus?.enabled || !woocommerceStatus.configured || woocommerceConnecting) return;
    setWooCommerceConnecting(true);
    setWooCommerceConnectError(null);
    try {
      const result = await connectWooCommerceStore();
      setWooCommerceStatus(result);
      await page.refresh();
      if (result.channel_id) navigate(href({ name: 'channel-detail', id: result.channel_id }));
    } catch (cause) {
      setWooCommerceConnectError(cause instanceof Error ? cause.message : 'Không thể xác minh WooCommerce.');
    } finally {
      setWooCommerceConnecting(false);
    }
  };

  // The channel endpoint exposes keyset pagination but no aggregate endpoint. Walk its
  // bounded pages so the overview metrics describe the whole live channel set.
  useEffect(() => {
    if (mode === 'default' && page.hasMore && !page.loadingMore && !page.error) page.loadMore();
  }, [mode, page.error, page.hasMore, page.loadMore, page.loadingMore]);

  const isApi = page.source === 'api';
  const isFixture = page.source === 'fixture';
  const apiChannels = isApi ? (page.rows as Channel[]) : [];
  const fixtureChannels = isFixture ? (page.rows as SalesChannel[]) : [];

  // The prototype filter vocabulary is a different set of values from the API's two columns,
  // so it is applied only to the fixture. A live filter panel offers the API's own axes below.
  const filteredFixture = filterChannels(fixtureChannels, { ...filters, query: deferredQuery });
  const filteredApi = useMemo(() => {
    const query = deferredQuery.trim().toLocaleLowerCase('vi');
    return apiChannels.filter((channel) => {
      const matchesQuery = !query || [channel.code, channel.name, channel.type, channel.environment]
        .some((value) => value.toLocaleLowerCase('vi').includes(query));
      const matchesKind = filters.kind === 'all' || channel.type === filters.kind;
      const matchesEnvironment = filters.environment === 'all' ||
        (filters.environment === 'simulation' ? channel.environment === 'simulated' : channel.environment === filters.environment);
      const matchesConnection = filters.connection === 'all' ||
        (filters.connection === 'pending_authorization' ? channel.status === 'disconnected' : channel.status === filters.connection);
      return matchesQuery && matchesKind && matchesEnvironment && matchesConnection;
    });
  }, [apiChannels, deferredQuery, filters]);

  const shown = isApi ? filteredApi : filteredFixture;
  const filtersActive = filters.query.trim() !== '' || filters.kind !== 'all' || filters.environment !== 'all' || filters.connection !== 'all';
  const resetFilters = () => setFilters(initialChannelFilters);

  return <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-6 py-8">
    <ChannelsHeader onRefresh={page.refresh} refreshing={page.loading || page.loadingMore} canManage={auth?.user?.role === 'ADMIN'} ebayEnabled={ebayEnabled} ebayConnections={ebayConnections} ebayConnecting={ebayConnecting} onConnectEbay={() => void connectEbay()} woocommerceStatus={mode === 'default' ? woocommerceStatus : null} woocommerceStatusError={woocommerceStatusError} woocommerceConnecting={woocommerceConnecting} onConnectWooCommerce={() => void connectWooCommerce()} onOpenWooCommerce={() => woocommerceStatus?.channel_id && navigate(href({ name: 'channel-detail', id: woocommerceStatus.channel_id }))} lazadaStatus={mode === 'default' ? lazadaStatus : null} lazadaConnecting={lazadaConnecting} onConnectLazada={() => void connectLazada()} onOpenLazada={() => lazadaStatus?.connection?.channel_id && navigate(href({ name: 'channel-detail', id: lazadaStatus.connection.channel_id }))} />
    {lazadaOAuthResult ? <Card role="status" className="border border-outline-variant/50 p-3 text-sm text-on-surface">{lazadaOAuthResult === 'connected' ? 'Lazada VN đã ủy quyền. Hãy mở kênh để xác minh quyền đọc sản phẩm.' : `Kết nối Lazada chưa hoàn tất (${lazadaOAuthResult}). Kiểm tra seller whitelist, callback và quyền ứng dụng.`}</Card> : null}
    {lazadaError ? <p role="alert" className="rounded-control border border-error/40 bg-error/5 p-3 text-sm text-error">{lazadaError}</p> : null}
    {oauthResult ? <Card role="status" className={`border p-3 text-sm leading-5 ${oauthResult === 'connected' ? 'border-success/40 bg-success/5 text-on-surface' : 'border-apricot/60 bg-apricot/5 text-on-surface'}`}>{oauthResult === 'connected' ? 'eBay Sandbox đã hoàn tất ủy quyền. Danh sách kênh đang được tải lại.' : oauthResult === 'denied' ? 'Bạn đã từ chối quyền eBay. Có thể bắt đầu kết nối lại bất cứ lúc nào.' : `Kết nối eBay chưa hoàn tất (${oauthResult}). Kiểm tra RuName, quyền ứng dụng và cấu hình Sandbox rồi thử lại.`}</Card> : null}
    {ebayStatusError && mode === 'default' ? <p role="status" className="text-caption text-graphite">Chưa đọc được trạng thái kết nối eBay: {ebayStatusError}</p> : null}
    {ebayConnectError ? <p role="alert" className="rounded-control border border-error/40 bg-error/5 p-3 text-sm text-error">{ebayConnectError}</p> : null}
    {woocommerceStatusError && mode === 'default' ? <p role="status" className="text-caption text-graphite">Chưa đọc được trạng thái WooCommerce: {woocommerceStatusError}</p> : null}
    {woocommerceConnectError ? <p role="alert" className="rounded-control border border-error/40 bg-error/5 p-3 text-sm text-error">{woocommerceConnectError}</p> : null}
    {isFixture ? <Card className="border border-apricot/40 p-3 text-sm text-on-surface" variant="muted" role="status">Đang xem dữ liệu demo. Trạng thái này không chứng minh Shopify đã kết nối.</Card> : null}
    {isFixture && !page.loading && !page.fixtureError && fixtureChannels.length > 0 ? (
      <section aria-label="Chỉ số kênh bán" className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Card className="p-4 sm:p-5">
          <span className="text-sm text-graphite">Tổng số kênh</span>
          <strong className="mt-2 block font-display text-2xl font-bold text-on-surface">
            {fixtureChannels.length}
          </strong>
          <p className="mt-1 text-xs text-graphite">Kết nối và quản lý các nền tảng bán hàng của cửa hàng.</p>
        </Card>
        <Card className="p-4 sm:p-5">
          <span className="text-sm text-graphite">Kết nối hợp lệ</span>
          <strong className="mt-2 block font-display text-2xl font-bold text-success">
            {fixtureChannels.filter((c) => c.connectionStatus === 'connected').length}
          </strong>
        </Card>
        <Card className="p-4 sm:p-5">
          <span className="text-sm text-graphite">Kênh cần xử lý</span>
          <strong className="mt-2 block font-display text-2xl font-bold text-error">
            {fixtureChannels.filter((c) => c.connectionStatus === 'error' || c.connectionStatus === 'pending_authorization').length}
          </strong>
        </Card>
      </section>
    ) : null}
    <ChannelFiltersPanel filters={filters} onChange={setFilters} />
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="font-body text-body-sm text-graphite"><strong className="text-on-surface">{shown.length}</strong> {isApi && (page.hasMore || page.loadingMore) ? 'kênh đã tải phù hợp' : 'kênh phù hợp'}</p>
      {filtersActive ? <Button variant="ghost" size="sm" onClick={resetFilters}>Đặt lại bộ lọc</Button> : null}
    </div>
    {page.loading ? <LoadingState label={'Đang tải kênh bán…'} /> : null}
    {!page.loading && page.loadingMore ? <p className="min-h-6 truncate text-sm text-graphite" role="status">Đang tải các kênh còn lại để cập nhật chỉ số…</p> : null}
    {!page.loading && page.fixtureError ? <ErrorState error={page.fixtureError} retry={page.refresh} /> : null}
    {/* Two different empty states on purpose. "There are no channels" and "your filters
        excluded all of them" are different facts, and collapsing them tells an operator their
        shop has no channels when it has five. */}
    {!page.loading && !page.fixtureError && shown.length === 0 && (page.rows?.length ?? 0) === 0
      ? <EmptyState title="Chưa có kênh bán" detail="Cửa hàng chưa kết nối kênh bán nào." />
      : null}
    {!page.loading && !page.fixtureError && shown.length === 0 && (page.rows?.length ?? 0) > 0
      ? <div className="grid gap-3"><EmptyState title="Không có kênh phù hợp" detail="Thử đổi loại kênh, môi trường hoặc trạng thái kết nối." /><Button variant="secondary" onClick={resetFilters} className="justify-self-start">Đặt lại bộ lọc</Button></div>
      : null}
    {!page.loading && !page.fixtureError && shown.length > 0 && isApi
      ? <ChannelApiGrid channels={filteredApi} onOpen={(id) => navigate(href({ name: 'channel-detail', id }))} />
      : null}
    {!page.loading && !page.fixtureError && shown.length > 0 && isFixture
      ? <ChannelGrid channels={filteredFixture} onOpen={(id) => navigate(href({ name: 'channel-detail', id }))} />
      : null}
    {isApi && page.error ? <ErrorState error={page.error} retry={page.refresh} /> : null}
  </section>;
}
