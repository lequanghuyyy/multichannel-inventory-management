import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { href, navigate } from '../../app/routes';
import { listProducts, type ProductQuery, type ProductStatus, type ProductSummary } from '../../api/products';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { getProducts, type DemoMode } from '../../mocks/mock-api';
import { useApiPage } from '../shared/useApiPage';
import { useSystemSnapshot } from '../shared/useSystemSnapshot';
import { CreateProductPanel } from './components/CreateProductPanel';
import { InventoryGuardBanner } from './components/InventoryGuardBanner';
import { ProductApiTable } from './components/ProductApiTable';
import { ProductFiltersPanel } from './components/ProductFiltersPanel';
import { ProductGrid } from './components/ProductGrid';
import { ProductImportPanel } from './components/ProductImportPanel';
import { ProductMetricGrid } from './components/ProductMetricGrid';
import { ProductTable } from './components/ProductTable';
import { ProductToolbar, type ProductViewMode } from './components/ProductToolbar';
import { ProductsHeader } from './components/ProductsHeader';
import { downloadProductCsv, walkProductExport, type ProductExportRecord } from './product.export';
import { toProductApiRow, type ProductApiRow } from './product.api';
import type { ProductCatalogItem, ProductFilters } from './product.types';
import { filterProducts } from './product.utils';

const initialFilters: ProductFilters = { query: '', category: 'all', status: 'all', channel: 'all', inventory: 'all' };

function exportRecord(row: ProductApiRow): ProductExportRecord {
  return {
    name: row.name, master_sku: row.masterSku, category: row.category, brand: row.brand, status: row.status,
    variant_count: row.variantCount, on_hand: row.onHand, reserved: row.reserved,
    safety_buffer: row.safetyBuffer, available_to_sell: row.availableToSell,
  };
}

export function ProductsPage({ mode, canManageCatalog = false }: { mode: DemoMode; canManageCatalog?: boolean }) {
  const [filters, setFilters] = useState<ProductFilters>(initialFilters);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [viewMode, setViewMode] = useState<ProductViewMode>('table');
  const [showCreate, setShowCreate] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState<'all' | 'filtered' | 'selected' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);
  const [knownCategories, setKnownCategories] = useState<string[]>([]);
  const deferredQuery = useDeferredValue(filters.query.trim());
  const system = useSystemSnapshot();
  const canWrite = canManageCatalog && system.snapshot?.system.catalog_write_available === true;
  const disabledReason = !canManageCatalog
    ? 'Chỉ ADMIN được quản lý danh mục.'
    : system.loading ? 'Đang kiểm tra khả năng ghi catalog.'
      : system.error ? 'Không xác minh được khả năng ghi catalog.'
        : 'Backend không mở catalog write trong môi trường này.';

  const apiQuery = useMemo<Omit<ProductQuery, 'cursor' | 'limit'>>(() => ({
    ...(deferredQuery ? { q: deferredQuery } : {}),
    ...(filters.status !== 'all' && filters.status !== 'under_review' && filters.status !== 'out_of_stock'
      ? { status: filters.status as ProductStatus }
      : {}),
    ...(filters.category !== 'all' ? { category: filters.category } : {}),
  }), [deferredQuery, filters.category, filters.status]);
  const requestKey = JSON.stringify(apiQuery);
  const loadFixture = useMemo(() => getProducts, []);
  const apiPage = useApiPage<ProductApiRow, ProductCatalogItem>(
    async (cursor, signal) => {
      const response = await listProducts({ limit: 50, ...apiQuery, ...(cursor ? { cursor } : {}) }, signal);
      return { items: response.items.map(toProductApiRow), nextCursor: response.nextCursor };
    },
    loadFixture,
    mode,
    50,
     { requestKey, getRowKey: (row) => row.id, pendingUntilResolved: true },
  );
  const isApi = apiPage.source === 'api';
  const apiRows = isApi ? apiPage.rows as ProductApiRow[] : [];
  const fixtureRows = isApi ? [] : filterProducts(apiPage.rows as ProductCatalogItem[], { ...filters, query: deferredQuery });
  const rowsShown = isApi ? apiRows.length : fixtureRows.length;
  const filtersActive = Object.entries(filters).some(([key, value]) => key === 'query' ? value.trim() !== '' : value !== 'all');

  useEffect(() => {
    if (!isApi) return;
    setKnownCategories((current) => [...new Set([...current, ...apiRows.map((row) => row.category)])].sort((a, b) => a.localeCompare(b)));
  }, [apiRows, isApi]);

  const changeFilters = (next: ProductFilters) => {
    setFilters(next);
    setSelectedIds(new Set());
  };
  const refresh = () => { setSelectedIds(new Set()); apiPage.refresh(); };
  const toggleProduct = (id: string) => setSelectedIds((current) => {
    const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next;
  });
  const toggleAllVisible = () => setSelectedIds((current) => {
    const next = new Set(current);
    const ids = isApi ? apiRows.map((row) => row.id) : fixtureRows.map((row) => row.id);
    const remove = ids.length > 0 && ids.every((id) => next.has(id));
    ids.forEach((id) => remove ? next.delete(id) : next.add(id));
    return next;
  });
  const resetFilters = () => changeFilters(initialFilters);

  const runExport = async (scope: 'all' | 'filtered' | 'selected') => {
    setExporting(scope); setExportError(null);
    try {
      let rows: readonly ProductSummary[] | readonly ProductExportRecord[];
      if (scope === 'selected') rows = apiRows.filter((row) => selectedIds.has(row.id)).map(exportRecord);
      else rows = await walkProductExport(scope === 'filtered' ? apiQuery : {});
      if (rows.length === 0) throw new Error('Không có sản phẩm trong phạm vi xuất.');
      downloadProductCsv(rows, scope);
    } catch (cause) {
      setExportError(cause instanceof Error ? cause.message : 'Không xuất được CSV.');
    } finally {
      setExporting(null);
    }
  };

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 py-8">
      <ProductsHeader canWrite={canWrite} disabledReason={disabledReason} onAdd={() => setShowCreate(true)} onImport={() => setShowImport(true)} onExport={() => setShowExport((value) => !value)} />
      {!canWrite ? <p className="font-body text-caption text-graphite">{disabledReason}</p> : null}
      {showCreate && canWrite ? <CreateProductPanel onClose={() => setShowCreate(false)} onCreated={refresh} /> : null}
      {showImport && canWrite ? <ProductImportPanel canWrite={canWrite} disabledReason={disabledReason} onCommitted={refresh} /> : null}
      {showExport ? <section aria-label="Xuất catalog CSV" className="grid gap-3 rounded-card border border-line bg-white p-5"><div><h2 className="font-display font-bold">Phạm vi xuất CSV</h2><p className="font-body text-caption text-graphite">UTF-8 BOM, chỉ gồm các trường public của product summary. “Đang lọc” và “Tất cả” đi hết server pagination.</p></div><div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" onClick={() => void runExport('filtered')} loading={exporting === 'filtered'}>Xuất đang lọc</Button><Button size="sm" variant="secondary" onClick={() => void runExport('all')} loading={exporting === 'all'}>Xuất tất cả</Button><Button size="sm" variant="secondary" disabled={selectedIds.size === 0 || !isApi} onClick={() => void runExport('selected')} loading={exporting === 'selected'}>Xuất {selectedIds.size} đã chọn</Button></div>{exportError ? <p role="alert" className="text-error">{exportError}</p> : null}</section> : null}
      {apiPage.source === 'fixture' && apiPage.error ? <div className="flex items-center"><Button variant="secondary" size="sm" onClick={apiPage.refresh}>Thử lại</Button></div> : null}
      <ProductMetricGrid rows={apiRows} source={apiPage.source} />
       <ProductFiltersPanel filters={filters} onChange={changeFilters} apiCategories={[...new Set([...knownCategories, ...apiRows.map((row) => row.category)])]} source={apiPage.source} />
      <ProductToolbar resultCount={rowsShown} totalCount={apiPage.rows.length} selectedCount={selectedIds.size} filtersActive={filtersActive} viewMode={viewMode} fixtureOnly={apiPage.source === 'fixture'} onReset={resetFilters} onViewModeChange={setViewMode} onExportSelected={isApi ? () => void runExport('selected') : undefined} />
      {apiPage.loading ? <LoadingState label="Đang tải catalog…" /> : null}
      {!apiPage.loading && apiPage.fixtureError ? <ErrorState error={apiPage.fixtureError} retry={apiPage.refresh} /> : null}
      {!apiPage.loading && !apiPage.fixtureError && rowsShown === 0 ? <EmptyState title="Chưa có sản phẩm trong catalogue" detail={isApi ? 'API không trả sản phẩm nào cho bộ lọc hiện tại.' : 'Catalog fixture đang ở trạng thái empty.'} /> : null}
      {!apiPage.loading && !apiPage.fixtureError && isApi && apiRows.length > 0 ? <ProductApiTable rows={apiRows} totalRows={apiRows.length} selectedIds={selectedIds} onToggle={toggleProduct} onToggleAll={toggleAllVisible} onOpen={(id) => navigate(href({ name: 'product-detail', id }))} hasMore={apiPage.hasMore} loadingMore={apiPage.loadingMore} loadMoreError={apiPage.loadingMore ? null : apiPage.error} onLoadMore={apiPage.loadMore} viewMode={viewMode} /> : null}
      {!apiPage.loading && !apiPage.fixtureError && !isApi && fixtureRows.length > 0 && viewMode === 'table' ? <><div className="hidden lg:block"><ProductTable products={fixtureRows} selectedIds={selectedIds} onToggle={toggleProduct} onToggleAll={toggleAllVisible} onOpen={(id) => navigate(href({ name: 'product-detail', id }))} /></div><div className="lg:hidden"><ProductGrid products={fixtureRows} selectedIds={selectedIds} onToggle={toggleProduct} onOpen={(id) => navigate(href({ name: 'product-detail', id }))} /></div></> : null}
      {!apiPage.loading && !apiPage.fixtureError && !isApi && fixtureRows.length > 0 && viewMode === 'grid' ? <ProductGrid products={fixtureRows} selectedIds={selectedIds} onToggle={toggleProduct} onOpen={(id) => navigate(href({ name: 'product-detail', id }))} /> : null}
      <InventoryGuardBanner />
    </section>
  );
}
