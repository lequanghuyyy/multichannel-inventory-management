import { useCallback, useEffect, useMemo, useState } from 'react';
import { href, navigate } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { listChannels } from '../../api/channels';
import { exportOrdersCSV, listOrders, type OrderExportQuery, type OrderMetrics } from '../../api/orders';
import { getOrders, type DemoMode } from '../../mocks/mock-api';
import { useRealtimeRefresh } from '../realtime/RealtimeProvider';
import { useApiPage } from '../shared/useApiPage';
import { invalidateOrderDetailCache } from './components/OrderApiInlinePreview';
import { OrderApiLedger } from './components/OrderApiLedger';
import { OrderApiBulkShip } from './components/OrderApiBulkShip';
import { OrderApiMetricsGrid } from './components/OrderApiMetricsGrid';
import { OrderFiltersPanel, type ApiOrderFilters } from './components/OrderFiltersPanel';
import { OrderMetricsGrid } from './components/OrderMetricsGrid';
import { OrdersHeader } from './components/OrdersHeader';
import { OrdersLedger } from './components/OrdersLedger';
import { OrderStatusTabs, type OrderStatusTab, type OrderStatusTabApi } from './components/OrderStatusTabs';
import { channelName, filterOrderApiRows, toOrderApiRow, type OrderApiRow } from './order.api';
import type { Order, OrderFilters } from './order.types';
import { filterOrders, initialOrderFilters } from './order.utils';

function addUtcDay(date: string): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(value.valueOf())) return date;
  value.setUTCDate(value.getUTCDate() + 1);
  return value.toISOString().slice(0, 10);
}

export function OrdersPage({ mode }: { mode: DemoMode }) {
  const [filters, setFilters] = useState<OrderFilters>(initialOrderFilters);
  const [status, setStatus] = useState<OrderStatusTab>('all');
  const [apiStatus, setApiStatus] = useState<OrderStatusTabApi>('all');
  const [apiFilters, setApiFilters] = useState<ApiOrderFilters>({ fulfillment: 'all', placedFrom: '', placedTo: '' });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [activeId, setActiveId] = useState<string>();
  const [serverQuery, setServerQuery] = useState('');
  const [apiMetrics, setApiMetrics] = useState<OrderMetrics | null>(null);
  const [channelOptions, setChannelOptions] = useState<Array<{ code: string; label: string }>>(() => [{ code: 'pos', label: channelName('pos') }]);
  const [previewRevision, setPreviewRevision] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [bulkNotice, setBulkNotice] = useState<string | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setServerQuery(filters.query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [filters.query]);

  const requestKey = JSON.stringify({
    q: serverQuery,
    status: apiStatus,
    channel: filters.channel,
    fulfillment: apiFilters.fulfillment,
    placedFrom: apiFilters.placedFrom,
    placedTo: apiFilters.placedTo,
  });
  useEffect(() => { setApiMetrics(null); }, [requestKey, mode]);
  useEffect(() => setSelectedIds(new Set()), [requestKey]);
  const loadFixture = useMemo(() => getOrders, []);
  // The loader is inline on purpose: useApiPage holds it in a ref, so its identity changing
  // on every render is what keeps it out of the fetch effect's dependency list.
  const page = useApiPage<OrderApiRow, Order>(
    async (cursor, signal) => {
      const response = await listOrders({
        limit: 50,
        ...(cursor === null ? {} : { cursor }),
        ...(serverQuery ? { q: serverQuery } : {}),
        ...(apiStatus !== 'all' ? { status: apiStatus as OrderApiRow['status'] } : {}),
        ...(filters.channel !== 'all' ? { channel: filters.channel } : {}),
        ...(apiFilters.fulfillment !== 'all' ? { fulfillment_status: apiFilters.fulfillment as 'pending' | 'picking' | 'shipped' | 'delivered' | 'returned' } : {}),
        ...(apiFilters.placedFrom ? { placed_from: apiFilters.placedFrom } : {}),
        ...(apiFilters.placedTo ? { placed_to: addUtcDay(apiFilters.placedTo) } : {}),
      }, signal);
      if (!signal.aborted) setApiMetrics(response.metrics);
      return { items: response.items.map(toOrderApiRow), nextCursor: response.nextCursor, totalCount: response.totalCount, statusCounts: response.statusCounts };
    },
    loadFixture,
    mode,
    50,
    { requestKey, getRowKey: (row) => row.id },
  );

  const refreshOrders = useCallback(() => {
    invalidateOrderDetailCache();
    setPreviewRevision((revision) => revision + 1);
    page.revalidate();
  }, [page.revalidate]);
  useRealtimeRefresh(['orders'], refreshOrders, { pollWhileDegradedMs: 15_000 });

  // Imported marketplace orders can arrive through the server recovery poll even when
  // the live feed is unavailable in this browser session. Refresh the visible list.
  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') refreshOrders();
    }, 20_000);
    const onVisible = () => {
      if (document.visibilityState === 'visible') refreshOrders();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refreshOrders]);

  const isApi = page.source === 'api';
  // The filter must describe the shop's current connections, not a catalogue of every
  // marketplace the product could theoretically support. Walk the bounded channel pages so a
  // channel that has no orders yet is still offered, and keep POS because it is the built-in
  // till rather than an external connection.
  useEffect(() => {
    if (!isApi) return;
    const controller = new AbortController();
    const options = new Map<string, { code: string; label: string }>();
    options.set('pos', { code: 'pos', label: channelName('pos') });
    const applyOptions = () => {
      if (controller.signal.aborted) return;
      setChannelOptions([...options.values()].sort((left, right) => left.label.localeCompare(right.label, 'vi')));
    };
    void (async () => {
      let cursor: string | null = null;
      do {
        const response = await listChannels({ limit: 100, ...(cursor === null ? {} : { cursor }) }, controller.signal);
        if (controller.signal.aborted) return;
        for (const channel of response.items) {
          if (channel.status !== 'connected' || options.has(channel.code)) continue;
          options.set(channel.code, { code: channel.code, label: channel.name || channelName(channel.code) });
        }
        cursor = response.nextCursor;
      } while (cursor !== null);
      applyOptions();
    })().catch(applyOptions);
    return () => controller.abort();
  }, [isApi]);
  const loading = page.loading;
  // Only the fixture's OWN failure is fatal. When the API failed and the fixture answered,
  // the fallback is on screen and a page-level error block would contradict the numbers
  // below it — and the source of that fallback is never 'api', so gating this on `isApi`
  // would hide the error in exactly the case where there is nothing left to show.
  const error = page.loading ? null : page.fixtureError;
  const refresh = page.refresh;

  const apiRows = isApi ? (page.rows as OrderApiRow[]) : [];
  const fixtureRows = isApi ? [] : (page.rows as Order[]);
  const totalRows = page.rows?.length ?? 0;

  const filteredApi = useMemo(() => filterOrderApiRows(apiRows, { ...filters, query: serverQuery, fulfillment: 'all', date: 'all' }, apiStatus), [apiRows, apiStatus, filters, serverQuery]);
  const filteredFixture = useMemo(() => filterOrders(fixtureRows, filters, status), [fixtureRows, filters, status]);
  const filteredCount = isApi ? filteredApi.length : filteredFixture.length;
  const activeApiRow = filteredApi.find((order) => order.id === activeId);
  const activeFixture = filteredFixture.find((order) => order.id === activeId);
  const activeOrderStillVisible = isApi
    ? filteredApi.some((order) => order.id === activeId)
    : filteredFixture.some((order) => order.id === activeId);
  useEffect(() => {
    if (activeId && !activeOrderStillVisible) setActiveId(undefined);
  }, [activeId, activeOrderStillVisible]);
  useEffect(() => setActiveId(undefined), [mode]);

  const filtersActive = isApi
    ? apiStatus !== 'all' || filters.query.trim() !== '' || filters.channel !== 'all' || apiFilters.fulfillment !== 'all' || apiFilters.placedFrom !== '' || apiFilters.placedTo !== ''
    : status !== 'all' || filters.query.trim() !== '' || filters.channel !== 'all' || filters.fulfillment !== 'all' || filters.date !== 'all';

  const apiStatusCounts = useMemo(() => {
    const counts = page.statusCounts ?? {};
    const all = Object.values(counts).reduce((sum, count) => sum + count, 0);
    return { ...counts, all: page.statusCounts ? all : page.totalCount ?? filteredApi.length };
  }, [filteredApi.length, page.statusCounts, page.totalCount]);

  const toggleOrder = useCallback((id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  }), []);
  const togglePreview = useCallback((id: string) => setActiveId((current) => current === id ? undefined : id), []);
  const toggleAll = useCallback(() => setSelectedIds((current) => {
    const rows = isApi ? filteredApi : filteredFixture;
    const next = new Set(current);
    const allSelected = rows.length > 0 && rows.every((row) => next.has(row.id));
    for (const row of rows) { if (allSelected) next.delete(row.id); else next.add(row.id); }
    return next;
  }), [filteredApi, filteredFixture, isApi]);

  const resetFilters = () => { setFilters(initialOrderFilters); setStatus('all'); setApiStatus('all'); setApiFilters({ fulfillment: 'all', placedFrom: '', placedTo: '' }); setSelectedIds(new Set()); };
  const openOrder = (id: string) => navigate(href({ name: 'order-detail', id }));
  const matchingCount = isApi ? page.totalCount ?? filteredCount : filteredCount;
  const hasNoOrders = isApi ? page.totalCount === 0 && !filtersActive : totalRows === 0;
  const hasNoMatches = isApi ? page.totalCount === 0 && filtersActive : totalRows > 0 && filteredCount === 0;
  const selectedApiOrders = filteredApi.filter((order) => selectedIds.has(order.id));

  const runExport = async (ids: string[] = []) => {
    setExporting(true); setExportError(null);
    const query: OrderExportQuery = {
      ...(serverQuery ? { q: serverQuery } : {}),
      ...(apiStatus !== 'all' ? { status: apiStatus as OrderApiRow['status'] } : {}),
      ...(filters.channel !== 'all' ? { channel: filters.channel } : {}),
      ...(apiFilters.fulfillment !== 'all' ? { fulfillment_status: apiFilters.fulfillment as OrderApiRow['fulfillmentStatus'] } : {}),
      ...(apiFilters.placedFrom ? { placed_from: apiFilters.placedFrom } : {}),
      ...(apiFilters.placedTo ? { placed_to: addUtcDay(apiFilters.placedTo) } : {}),
    };
    try {
      const blob = await exportOrdersCSV(query, ids);
      const url = URL.createObjectURL(blob); const anchor = document.createElement('a');
      anchor.href = url; anchor.download = 'orders.csv'; anchor.click(); window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (error) {
      setExportError(error instanceof Error ? error.message : 'Không thể xuất dữ liệu đơn hàng.');
    } finally { setExporting(false); }
  };

  return <section className="mx-auto flex w-full max-w-[1280px] flex-col gap-7 py-8">
    <OrdersHeader onExport={() => void runExport()} onBulk={() => { setBulkNotice(null); setBulkOpen(true); }} bulkEnabled={isApi && selectedIds.size>0} exporting={exporting} exportEnabled={isApi && !loading && !exporting && (page.totalCount ?? 0) > 0} />
    {isApi ? <OrderApiMetricsGrid metrics={apiMetrics} totalRows={page.totalCount ?? totalRows} /> : <OrderMetricsGrid />}
    <OrderStatusTabs
      value={status}
      onChange={setStatus}
      isApi={isApi}
      apiValue={apiStatus}
      onApiChange={setApiStatus}
      apiCounts={apiStatusCounts}
    />
    <OrderFiltersPanel filters={filters} onChange={setFilters} isApi={isApi} channels={channelOptions} apiFilters={apiFilters} onApiChange={setApiFilters} />
    <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-body text-body-sm text-graphite"><strong className="text-on-surface">{matchingCount}</strong> đơn hàng phù hợp</p>{filtersActive ? <Button variant="ghost" size="sm" onClick={resetFilters}>Đặt lại bộ lọc</Button> : null}</div>
    {exportError ? <p role="alert" className="rounded-control bg-error-container px-4 py-3 font-body text-body-sm text-on-error-container">Xuất CSV thất bại: {exportError}</p> : null}
    {bulkNotice ? <p role="status" className="rounded-control bg-secondary-fixed px-4 py-3 font-body text-body-sm text-on-surface">{bulkNotice}</p> : null}
    {loading ? <LoadingState label={'Đang tải đơn hàng…'} /> : null}
    {!loading && error ? <ErrorState error={error} retry={refresh} /> : null}
    {!loading && !error && hasNoOrders ? <EmptyState title="Chưa có đơn hàng" detail="Chưa có đơn nào. Hãy bán một đơn ở màn Bán tại quầy trước." /> : null}
    {!loading && !error && hasNoMatches ? <div className="grid gap-3"><EmptyState title="Không có đơn phù hợp" detail="Thử đổi bộ lọc hoặc từ khóa tìm kiếm." /><Button variant="secondary" onClick={resetFilters} className="justify-self-start">Đặt lại bộ lọc</Button></div> : null}
    {!loading && !error && filteredCount > 0 && isApi ? (
      <OrderApiLedger
        orders={filteredApi}
        totalRows={page.totalCount ?? totalRows}
        hasMore={page.hasMore}
        loadingMore={page.loadingMore}
        loadMoreError={page.loadingMore ? null : page.error}
        onLoadMore={page.loadMore}
        selectedIds={selectedIds}
        activeId={activeApiRow?.id}
        previewRevision={previewRevision}
        onToggle={toggleOrder}
        onToggleAll={toggleAll}
        onExportSelected={() => void runExport([...selectedIds])}
        onBulkSelected={() => { setBulkNotice(null); setBulkOpen(true); }}
        onPreview={togglePreview}
        onOpen={openOrder}
      />
    ) : null}
    {!loading && !error && filteredCount > 0 && !isApi ? <OrdersLedger orders={filteredFixture} selectedIds={selectedIds} activeId={activeFixture?.id} onToggle={toggleOrder} onToggleAll={toggleAll} onPreview={togglePreview} onOpen={openOrder} /> : null}
    <OrderApiBulkShip open={bulkOpen} orders={selectedApiOrders} onClose={() => setBulkOpen(false)} onApplied={(count) => { setBulkOpen(false); setSelectedIds(new Set()); setBulkNotice(`Đã ghi nhận bàn giao cho ${count} đơn.`); refreshOrders(); }} />
  </section>;
}
