import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { href, navigate } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { listInventory } from '../../api/inventory';
import { exportInventory } from '../../api/inventory';
import { getInventoryManagementRows, type DemoMode } from '../../mocks/mock-api';
import { useRealtimeRefresh } from '../realtime/RealtimeProvider';
import { useApiPage } from '../shared/useApiPage';
import { useInventoryLookup } from './hooks/useInventoryLookup';
import { InventoryAllocationBanner } from './components/InventoryAllocationBanner';
import { InventoryFiltersPanel } from './components/InventoryFiltersPanel';
import { InventoryHeader } from './components/InventoryHeader';
import { InventoryBulkAdjustmentModal } from './components/InventoryBulkAdjustmentModal';
import { InventoryLedger } from './components/InventoryLedger';
import { InventoryMetricGrid } from './components/InventoryMetricGrid';
import { InventorySnapshotInspector } from './components/InventorySnapshotInspector';
import { toInventoryLedgerRow } from './inventory.api';
import type { InventoryFilters, InventoryLedgerRow } from './inventory.types';
import { filterInventoryRows, initialInventoryFilters } from './inventory.utils';

const INVENTORY_PAGE_SIZE = 20;

export function InventoryPage({ mode = 'default' }: { mode?: DemoMode }) {
  // The loader is inline on purpose: useApiPage holds it in a ref, so its identity changing
  // on every render is what keeps it out of the fetch effect's dependency list.
  const loadFixture = useMemo(() => getInventoryManagementRows, []);
  // The page is generic over the LEDGER row, not over the API row: the projection from
  // GET /api/v1/inventory to something the table can render happens inside the loader, so
  // `rows` has one type whichever source won and nothing downstream needs a cast to say
  // which shape it is holding.
  const page = useApiPage<InventoryLedgerRow>(
    async (cursor, signal) => {
      const response = await listInventory({ limit: INVENTORY_PAGE_SIZE, ...(cursor === null ? {} : { cursor }) }, signal);
      return { items: response.items.map((row) => toInventoryLedgerRow(row, 'api')), nextCursor: response.nextCursor };
    },
    loadFixture,
    mode,
    INVENTORY_PAGE_SIZE,
  );

  useRealtimeRefresh(['inventory'], page.revalidate, { pollWhileDegradedMs: 15_000 });

  const [filters, setFilters] = useState<InventoryFilters>(initialInventoryFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [bulkOpen, setBulkOpen] = useState(false);
  const [exportBusy, setExportBusy] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [pendingPage, setPendingPage] = useState<number | null>(null);
  const deferredQuery = useDeferredValue(filters.query);
  const lookup = useInventoryLookup(new URLSearchParams(window.location.search).get('sku') ?? '');

  const source = page.source;
  const rows = page.rows;
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));

  const downloadCsv = async (scope: 'all' | 'selected') => {
    setExportBusy(true);
    setActionMessage(null);
    try {
      const blob = await exportInventory(scope, scope === 'selected' ? selectedRows.map((row) => row.id) : []);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = 'inventory.csv';
      document.body.append(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      setActionMessage(`Đã xuất ${scope === 'selected' ? selectedRows.length : 'toàn bộ'} tồn kho.`);
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : 'Không thể xuất tồn kho.');
    } finally { setExportBusy(false); }
  };

  // Filtering is client-side over the rows already loaded. The cursor API has no random
  // access, so the next page is fetched only when the operator moves beyond loaded rows.
  const filteredRows = filterInventoryRows(rows, { ...filters, query: deferredQuery });
  const totalPages = Math.max(1, Math.ceil(filteredRows.length / INVENTORY_PAGE_SIZE));
  const visibleRows = filteredRows.slice((currentPage - 1) * INVENTORY_PAGE_SIZE, currentPage * INVENTORY_PAGE_SIZE);
  const filtersActive = filters.query.trim() !== '' || filters.product !== 'all' || filters.status !== 'all' || filters.channel !== 'all' || filters.location !== 'all' || filters.quick !== 'all';

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  useEffect(() => {
    if (pendingPage === null || page.loadingMore) return;
    const firstRowForTarget = (pendingPage - 1) * INVENTORY_PAGE_SIZE;
    if (filteredRows.length > firstRowForTarget) {
      setCurrentPage(pendingPage);
      setPendingPage(null);
    } else if (page.hasMore && !page.error) {
      page.loadMore();
    } else {
      setPendingPage(null);
    }
  }, [filteredRows.length, page.error, page.hasMore, page.loadMore, page.loadingMore, pendingPage]);

  const changePage = (targetPage: number) => {
    if (targetPage < 1 || targetPage === currentPage) return;
    if (targetPage <= totalPages) {
      setCurrentPage(targetPage);
      setPendingPage(null);
      return;
    }
    if (targetPage === totalPages + 1 && page.hasMore) {
      setPendingPage(targetPage);
      page.loadMore();
    }
  };

  const toggleRow = (id: string) => setSelectedIds((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const toggleAll = () => setSelectedIds((current) => {
    const next = new Set(current);
    const allSelected = visibleRows.length > 0 && visibleRows.every((row) => next.has(row.id));
    for (const row of visibleRows) {
      if (allSelected) next.delete(row.id); else next.add(row.id);
    }
    return next;
  });

  const resetFilters = () => {
    setFilters(initialInventoryFilters);
    setSelectedIds(new Set());
    setCurrentPage(1);
    setPendingPage(null);
  };

  const inspectSku = (sku: string) => {
    void lookup.lookup(sku);
    window.requestAnimationFrame(() => {
      const inspector = document.getElementById('api-snapshot-inspector');
      if (typeof inspector?.scrollIntoView === 'function') inspector.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const recordLabel = 'biến thể';
  // Decided by what the rows actually carry, not by the source label: a price column whose
  // cells all read "Chưa có giá" is worse than no column, and "do we have a price" is a
  // property of the rows rather than of the mode.
  const showPrice = rows.some((row) => row.priceLabel !== undefined);

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 py-8">
      <InventoryHeader canUseLiveActions={source === 'api'} selectedCount={selectedIds.size} busy={exportBusy} onExportAll={() => void downloadCsv('all')} onExportSelected={() => void downloadCsv('selected')} onBulkAdjust={() => { setActionMessage(null); setBulkOpen(true); }} />
      {actionMessage ? <p role="status" className="font-body text-body-sm text-on-surface-variant">{actionMessage}</p> : null}
      <InventoryBulkAdjustmentModal open={bulkOpen} rows={selectedRows} onClose={() => setBulkOpen(false)} onCommitted={() => { setBulkOpen(false); setSelectedIds(new Set()); page.refresh(); }} />
      <InventoryAllocationBanner />
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center">
        {/* Offered only when we KNOW the API failed, not whenever the fixture is on screen:
            a retry button that appears on a screen that never tried the API would invite the
            reader to wait for a live read that was never going to happen. */}
        {source === 'fixture' && page.error ? <Button variant="secondary" size="sm" onClick={page.refresh} loading={page.loading}>Thử lại</Button> : null}
      </div>
      <InventoryMetricGrid rows={visibleRows} source={source} />
      <InventoryFiltersPanel filters={filters} rows={rows} source={source} onChange={(next) => { setFilters(next); setCurrentPage(1); setPendingPage(null); }} />
      <div className="flex flex-wrap items-center justify-between gap-3"><p className="font-body text-body-sm text-graphite"><strong className="text-on-surface">{filteredRows.length}{page.hasMore ? '+' : ''}</strong> {recordLabel} phù hợp{page.hasMore ? ' đã tải' : ''}</p>{filtersActive ? <Button variant="ghost" size="sm" onClick={resetFilters}>Đặt lại bộ lọc</Button> : null}</div>
      {page.loading ? <LoadingState label={'Đang tải tồn kho…'} /> : null}
      {/* Only the fixture's own failure is fatal enough for a page-level error block. When the
          API failed and the fixture answered, the fallback is on screen and a full ErrorState
          above it would contradict the numbers below it. And when the API answered, a failed
          retry is not a broken screen — `useApiPage` keeps those two apart for this reason. */}
      {!page.loading && page.fixtureError ? <ErrorState error={page.fixtureError} retry={page.refresh} /> : null}
      {!page.loading && !page.fixtureError && rows.length === 0 ? <EmptyState title="Chưa có SKU nào" detail="Cửa hàng chưa có sản phẩm hay biến thể nào trong kho." /> : null}
      {!page.loading && !page.fixtureError && rows.length > 0 && filteredRows.length === 0 ? <div className="grid gap-3"><EmptyState title="Không có SKU phù hợp" detail="Thử đổi từ khoá, vị trí hoặc bộ lọc nhanh." /><Button variant="secondary" onClick={resetFilters} className="justify-self-start">Đặt lại bộ lọc</Button></div> : null}
      {!page.loading && !page.fixtureError && filteredRows.length > 0 ? (
        <InventoryLedger
          rows={visibleRows}
          totalRows={filteredRows.length}
          hasMore={page.hasMore}
          loadingMore={page.loadingMore}
          loadMoreError={page.loadingMore ? null : page.error}
          currentPage={currentPage}
          totalPages={totalPages}
          canGoForward={currentPage < totalPages || page.hasMore}
          onPageChange={changePage}
          priceLabel={showPrice ? (row) => row.priceLabel ?? '—' : undefined}
          selectedIds={selectedIds}
          onToggle={toggleRow}
          onToggleAll={toggleAll}
          onInspect={inspectSku}
          onOpenDetail={(sku) => navigate(href({ name: 'inventory-detail', id: sku }))}
        />
      ) : null}
      <InventorySnapshotInspector sku={lookup.sku} submittedSku={lookup.submittedSku} state={lookup.state} snapshot={lookup.snapshot} error={lookup.error} onSkuChange={lookup.setSku} onLookup={(sku) => void lookup.lookup(sku)} />
    </section>
  );
}
