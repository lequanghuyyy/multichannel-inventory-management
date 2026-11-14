import { useMemo, useState } from 'react';
import { navigate } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { PageHeader } from '../../components/common/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { getProduct as getProductFromApi, type ProductDetail } from '../../api/products';
import { getProduct, type DemoMode } from '../../mocks/mock-api';
import { useApiPage } from '../shared/useApiPage';
import { useSystemSnapshot } from '../shared/useSystemSnapshot';
import { toProductApiDetail, type ProductApiDetail } from './product.detail.api';
import type { ProductCatalogItem } from './product.types';
import { ChannelMappingPreview } from './components/ChannelMappingPreview';
import { ProductApiDetailView } from './components/ProductApiDetailView';
import { ProductDetailHeader } from './components/ProductDetailHeader';
import { ProductDetailTabs, type ProductDetailTab } from './components/ProductDetailTabs';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { ProductImportPanel } from './components/ProductImportPanel';
import { AddProductVariantPanel } from './components/AddProductVariantPanel';
import { ProductLifecycle } from './components/ProductLifecycle';
import { VariantEditor } from './components/VariantEditor';
import { ProductSummaryGrid } from './components/ProductSummaryGrid';
import { VariantMatrix } from './components/VariantMatrix';
import { ProductCatalogEditor } from './components/ProductCatalogEditor';
import { ProductPriceEditor } from './components/ProductPriceEditor';
import { ProductMediaManager } from './components/ProductMediaManager';
import { ProductPublicationPanel } from './components/ProductPublicationPanel';
import { LazadaProductDetailPanel } from './components/LazadaProductDetailPanel';
import { WooCommerceProductPanel } from './components/WooCommerceProductPanel';
import { EbayProductPanel } from './components/EbayProductPanel';
import { ChannelPriceManager } from './components/ChannelPriceManager';
import { ProductAllocationPanel } from '../inventory/components/ProductAllocationPanel';

type ApiProductTab = 'product' | 'operations';
const apiProductTabs: readonly TabItem<ApiProductTab>[] = [
  { value: 'product', label: 'Thông tin sản phẩm' },
  { value: 'operations', label: 'Kênh bán & quản lý' },
];

/** The inventory detail screen links straight to allocation, so the tab must honour it. */
function readApiProductTab(): ApiProductTab {
  const params = new URLSearchParams(window.location.search);
  return params.get('tab') === 'operations' || params.get('allocation') === '1' ? 'operations' : 'product';
}

function readAllocationDeepLink(): boolean {
  return new URLSearchParams(window.location.search).get('allocation') === '1';
}

export function ProductDetailPage({ id, mode, canManageCatalog = false }: { id: string; mode: DemoMode; canManageCatalog?: boolean }) {
  const loadFixture = useMemo(() => getProduct, []);
  const page = useApiPage<ProductApiDetail, ReturnType<typeof getProduct> extends Promise<infer T> ? NonNullable<T> : never>(
    async (_cursor, signal) => {
      const detail: ProductDetail = await getProductFromApi(id, signal);
      return { items: [toProductApiDetail(detail)], nextCursor: null };
    },
    (currentMode) => loadFixture(id, currentMode).then((product) => (product ? [product] : [])),
    mode,
    50,
     { requestKey: id, fallbackOnError: false, getRowKey: (row) => row.id, pendingUntilResolved: true },
  );
  const [activeTab, setActiveTab] = useState<ProductDetailTab>('variants');
  const [activeApiTab, setActiveApiTab] = useState<ApiProductTab>(readApiProductTab);
  const [allocationDeepLink] = useState(readAllocationDeepLink);
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [channelPriceRevision, setChannelPriceRevision] = useState(0);
  const system = useSystemSnapshot();
  const canWrite = canManageCatalog && system.snapshot?.system.catalog_write_available === true;
  const disabledReason = !canManageCatalog ? 'Chỉ ADMIN được quản lý danh mục.'
    : system.loading ? 'Đang kiểm tra khả năng ghi catalog.'
      : system.error ? 'Không xác minh được khả năng ghi catalog.'
        : 'Backend không mở catalog write trong môi trường này.';

  const isApi = page.source === 'api';
  // Both casts are guarded by `isApi`, which is read from the SAME `source` that decided which
  // loader produced these rows, so neither can be reached with rows of the other shape.
  // TypeScript cannot see that link; a runtime check would cost more than the comment is worth.
  const apiProduct = isApi ? (page.rows[0] as ProductApiDetail | undefined) : undefined;
  const fixtureProduct = isApi ? undefined : (page.rows[0] as ProductCatalogItem | undefined);

  const shell = (body: React.ReactNode) => (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 py-8">
      {body}
    </section>
  );

  if (page.loading) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><PageHeader eyebrow="SẢN PHẨM / CHI TIẾT" title="Chi tiết sản phẩm" description="Đang tải thông tin sản phẩm…" /><LoadingState /></section>;
  if (page.fixtureError) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><PageHeader eyebrow="SẢN PHẨM / CHI TIẾT" title="Chi tiết sản phẩm" description="Không thể đọc thông tin sản phẩm." /><ErrorState error={page.fixtureError} retry={page.refresh} /></section>;
  if (!isApi && !fixtureProduct) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><Button variant="ghost" onClick={() => navigate('/products')} className="justify-self-start">← Sản phẩm</Button><EmptyState title="Không tìm thấy sản phẩm" detail="Sản phẩm này không có trong dữ liệu mẫu." /></section>;
  if (isApi && !apiProduct) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><Button variant="ghost" onClick={() => navigate('/products')} className="justify-self-start">← Sản phẩm</Button><EmptyState title="Không tìm thấy sản phẩm" detail="Không có sản phẩm với mã này." /></section>;

  if (isApi && apiProduct) {
    return shell(<>
      <Tabs items={apiProductTabs} value={activeApiTab} onValueChange={setActiveApiTab} ariaLabel="Khu vực chi tiết sản phẩm" idPrefix="api-product" />
      {activeApiTab === 'product' ? <div id="api-product-panel-product" role="tabpanel" aria-labelledby="api-product-tab-product" className="grid gap-5">
        <ProductApiDetailView product={apiProduct} onEditVariant={setEditingVariantId} />
        {editingVariantId ? (() => {
          const variant = apiProduct.variants.find((item) => item.id === editingVariantId);
          return variant ? <VariantEditor key={variant.id} productId={id} productVersion={apiProduct.productVersion} currency={apiProduct.currency} variant={variant} canWrite={canWrite} disabledReason={disabledReason} onUpdated={page.refresh} onClose={() => setEditingVariantId(null)} /> : null;
        })() : null}
        <ProductCatalogEditor product={apiProduct} canWrite={canWrite} disabledReason={disabledReason} onUpdated={page.refresh} />
        <ProductPriceEditor product={apiProduct} canWrite={canWrite} disabledReason={disabledReason} onUpdated={page.revalidate} />
        <ProductMediaManager product={apiProduct} canWrite={canWrite} disabledReason={disabledReason} onUpdated={page.refresh} />
      </div> : null}
      {activeApiTab === 'operations' ? <div id="api-product-panel-operations" role="tabpanel" aria-labelledby="api-product-tab-operations" className="grid gap-4">
        <OperationDisclosure id="product-channel-publication" title="Giá và hiện diện trên kênh" description="">
          <div className="grid gap-5">
            <ChannelPriceManager productId={id} canWrite={canManageCatalog} channelCodes={['shopify', 'woocommerce', 'lazada']} onSaved={() => setChannelPriceRevision((revision) => revision + 1)} />
            <OperationDisclosure title="Shopify" description="Đăng bán, đồng bộ và lịch sử" defaultOpen>
              <ProductPublicationPanel productId={id} productVersion={apiProduct.productVersion} canWrite={canManageCatalog} channelCodeFilter="shopify" />
            </OperationDisclosure>
            <OperationDisclosure title="WooCommerce" description="Thông tin sản phẩm, bán hàng và tồn kho">
              <WooCommerceProductPanel product={apiProduct} canWrite={canManageCatalog} priceRefreshKey={channelPriceRevision} />
            </OperationDisclosure>
            <OperationDisclosure title="eBay" description="Thông tin listing, giá marketplace và lịch sử">
              <EbayProductPanel product={apiProduct} canWrite={canManageCatalog} />
            </OperationDisclosure>
            <OperationDisclosure title="Lazada" description="SKU đã ghép và trạng thái gian hàng">
              <LazadaProductDetailPanel product={apiProduct} canWrite={canManageCatalog} />
            </OperationDisclosure>
          </div>
        </OperationDisclosure>
        <OperationDisclosure title="Phân bổ tồn đa kênh" description="" defaultOpen={allocationDeepLink}>
          <ProductAllocationPanel product={apiProduct} canExecute={canManageCatalog} onRefreshProduct={page.revalidate} />
        </OperationDisclosure>
        <OperationDisclosure title="Vòng đời và tác vụ danh mục" description="Trạng thái, thêm SKU và nhập CSV">
          <div className="grid gap-5">
            <ProductLifecycle productId={id} status={apiProduct.status} availableToSell={apiProduct.availableToSell} canWrite={canWrite} disabledReason={disabledReason} onTransitioned={page.refresh} />
            <AddProductVariantPanel productId={id} canWrite={canWrite} disabledReason={disabledReason} onAdded={page.refresh} />
            <ProductImportPanel canWrite={canWrite} disabledReason={disabledReason} onCommitted={page.refresh} />
          </div>
        </OperationDisclosure>
      </div> : null}
    </>);
  }

  const product = fixtureProduct!;
  return shell(<>
    <ProductDetailHeader product={product} onShowMappings={() => setActiveTab('mappings')} />
    <ProductDetailTabs value={activeTab} variantCount={product.variants.length} onChange={setActiveTab} />
    {activeTab === 'overview' ? (
      <>
        <ProductSummaryGrid product={product} />
        <Card className="grid gap-3" variant="muted"><h2 className="font-display text-xl font-bold text-on-surface">Lưu ý</h2><p className="font-body text-body-sm leading-6 text-on-surface-variant">Thông tin sản phẩm, giá và liên kết kênh bán ở đây chỉ là dữ liệu mẫu để xem. Trang này không thay đổi tồn kho.</p></Card>
      </>
    ) : null}
    {activeTab === 'variants' ? (
      <>
        <ProductSummaryGrid product={product} />
        <VariantMatrix product={product} />
        <ChannelMappingPreview product={product} />
      </>
    ) : null}
    {activeTab === 'mappings' ? <ChannelMappingPreview product={product} /> : null}
  </>);
}

function OperationDisclosure({ id, title, description, defaultOpen = false, children }: { id?: string; title: string; description: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return <details id={id} open={open} onToggle={(event) => setOpen(event.currentTarget.open)} className="rounded-card border border-outline-variant bg-pure-white p-4 open:bg-surface-container-low">
    <summary className="flex cursor-pointer flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control font-display text-lg font-bold text-on-surface focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-primary">
      {title}{description ? <span className="font-body text-caption font-normal text-graphite">{description}</span> : null}
    </summary>
    {open ? <div className="mt-4">{children}</div> : null}
  </details>;
}
