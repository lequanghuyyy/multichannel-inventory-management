import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  getEbayInventoryItems,
  getEbayOffer,
  getEbayOffers,
  importEbayMappings,
  previewEbayMappings,
  type EbayInventoryItem,
  type EbayMappingPlan,
  type EbayOffer,
} from '../../../api/ebay';
import type { Channel, ChannelMapping } from '../../../api/channels';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

const PAGE_SIZE = 25;
const MAX_SELECTED = 25;

export function EbayInventoryItemsPanel({ channel, mappings, onImported, mappingEnabled = true }: {
  channel: Channel;
  mappings: ChannelMapping[];
  onImported: () => void;
  mappingEnabled?: boolean;
}) {
  const [items, setItems] = useState<EbayInventoryItem[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [offersForSku, setOffersForSku] = useState<string | null>(null);
  const [offers, setOffers] = useState<EbayOffer[]>([]);
  const [offersLoading, setOffersLoading] = useState(false);
  const [offersError, setOffersError] = useState<unknown>(null);
  const [offerDetail, setOfferDetail] = useState<EbayOffer | null>(null);
  const [offerDetailLoading, setOfferDetailLoading] = useState(false);
  const [offerDetailError, setOfferDetailError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [mappingPlan, setMappingPlan] = useState<EbayMappingPlan | null>(null);
  const [mappingAction, setMappingAction] = useState<'preview' | 'import' | null>(null);
  const [mappingError, setMappingError] = useState<string | null>(null);
  const [mappingNotice, setMappingNotice] = useState<string | null>(null);
  const epoch = useRef(0);
  const pageControllers = useRef(new Set<AbortController>());
  const offerController = useRef<AbortController | null>(null);
  const offerDetailController = useRef<AbortController | null>(null);
  const mappingController = useRef<AbortController | null>(null);

  const loadPage = useCallback((nextOffset: number, append: boolean) => {
    if (!append) {
      epoch.current += 1;
      pageControllers.current.forEach((pending) => pending.abort());
      if (nextOffset === 0) { setItems([]); setOffset(0); setTotal(0); }
    }
    const requestEpoch = epoch.current;
    const controller = new AbortController();
    pageControllers.current.add(controller);
    if (append) setLoadingMore(true); else { setLoading(true); setError(null); }
    void getEbayInventoryItems(channel.id, { limit: PAGE_SIZE, offset: nextOffset }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted || requestEpoch !== epoch.current) return;
        const inventoryItems = Array.isArray(page.inventoryItems) ? page.inventoryItems : [];
        setItems((current) => append ? [...current, ...inventoryItems] : inventoryItems);
        setTotal(page.total ?? inventoryItems.length);
        setOffset((page.offset ?? nextOffset) + inventoryItems.length);
      })
      .catch((cause: unknown) => {
        if (!controller.signal.aborted && requestEpoch === epoch.current) setError(cause);
      })
      .finally(() => {
        pageControllers.current.delete(controller);
        if (!controller.signal.aborted && requestEpoch === epoch.current) {
          setLoading(false);
          setLoadingMore(false);
        }
      });
    return controller;
  }, [channel.id]);

  useEffect(() => {
    epoch.current += 1;
    setItems([]); setOffset(0); setTotal(0); setOffersForSku(null); setOffers([]); setOfferDetail(null);
    setOffersError(null); setSelected(new Set()); setMappingPlan(null); setMappingNotice(null); setMappingAction(null);
    setMappingError(null);
    const controller = loadPage(0, false);
    return () => {
      epoch.current += 1;
      controller.abort();
      pageControllers.current.forEach((pending) => pending.abort());
      offerController.current?.abort();
      offerDetailController.current?.abort();
      mappingController.current?.abort();
    };
  }, [channel.id, loadPage]);

  const mappedBySKU = useMemo(() => new Map(mappings.map((mapping) => [mapping.external_sku, mapping])), [mappings]);
  const toggleSelected = (sku: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(sku)) next.delete(sku); else next.add(sku);
      return next;
    });
    setMappingPlan(null); setMappingError(null); setMappingNotice(null);
  };

  const showOffers = async (sku: string) => {
    offerController.current?.abort();
    offerDetailController.current?.abort();
    if (offersForSku === sku) { setOffersForSku(null); return; }
    const requestEpoch = epoch.current;
    const controller = new AbortController();
    offerController.current = controller;
    setOffersForSku(sku); setOffers([]); setOffersError(null); setOffersLoading(true); setOfferDetail(null); setOfferDetailError(null);
    try {
      const result = await getEbayOffers(channel.id, sku, { limit: 25 }, controller.signal);
      if (!controller.signal.aborted && requestEpoch === epoch.current) setOffers(result.offers);
    } catch (cause) {
      if (!controller.signal.aborted && requestEpoch === epoch.current) setOffersError(cause);
    } finally {
      if (!controller.signal.aborted && requestEpoch === epoch.current) setOffersLoading(false);
    }
  };

  const loadOfferDetail = async (offerId: string) => {
    offerDetailController.current?.abort();
    const requestEpoch = epoch.current;
    const controller = new AbortController();
    offerDetailController.current = controller;
    setOfferDetailLoading(true); setOfferDetailError(null); setOfferDetail(null);
    try {
      const detail = await getEbayOffer(channel.id, offerId, controller.signal);
      if (!controller.signal.aborted && requestEpoch === epoch.current) setOfferDetail(detail);
    } catch (cause) {
      if (!controller.signal.aborted && requestEpoch === epoch.current) setOfferDetailError(cause instanceof Error ? cause.message : 'Không thể đọc chi tiết Offer.');
    } finally {
      if (!controller.signal.aborted && requestEpoch === epoch.current) setOfferDetailLoading(false);
    }
  };

  const previewMappings = async () => {
    if (selected.size === 0 || selected.size > MAX_SELECTED || mappingAction) return;
    mappingController.current?.abort();
    const controller = new AbortController();
    mappingController.current = controller;
    const requestEpoch = epoch.current;
    setMappingAction('preview'); setMappingError(null); setMappingNotice(null); setMappingPlan(null);
    try {
      const plan = await previewEbayMappings(channel.id, [...selected], controller.signal);
      if (!controller.signal.aborted && requestEpoch === epoch.current) setMappingPlan(plan);
    } catch (cause) {
      if (!controller.signal.aborted && requestEpoch === epoch.current) setMappingError(cause instanceof Error ? cause.message : 'Không thể đọc trước kết quả mapping eBay.');
    } finally { if (!controller.signal.aborted && requestEpoch === epoch.current) setMappingAction(null); }
  };

  const commitMappings = async () => {
    if (!mappingPlan || mappingPlan.eligible === 0 || mappingAction || selected.size === 0) return;
    mappingController.current?.abort();
    const controller = new AbortController();
    mappingController.current = controller;
    const requestEpoch = epoch.current;
    setMappingAction('import'); setMappingError(null); setMappingNotice(null);
    try {
      const result = await importEbayMappings(channel.id, [...selected], controller.signal);
      if (controller.signal.aborted || requestEpoch !== epoch.current) return;
      setMappingPlan(result);
      setMappingNotice(`Đã ghi ${result.imported ?? 0} mapping vào Core. Không có thay đổi nào được gửi lên eBay.`);
      onImported();
    } catch (cause) {
      if (!controller.signal.aborted && requestEpoch === epoch.current) setMappingError(cause instanceof Error ? cause.message : 'Không thể ghi mapping vào Core.');
    } finally { if (!controller.signal.aborted && requestEpoch === epoch.current) setMappingAction(null); }
  };

  return <Card className="grid min-w-0 gap-3 p-4 sm:p-5">
    <header>
      <h2 className="font-display text-lg font-bold text-on-surface">Inventory Items trên eBay</h2>
      <p className="mt-1 text-sm leading-5 text-graphite">Đọc trực tiếp từ eBay Sandbox · {items.length.toLocaleString('vi-VN')} / {total.toLocaleString('vi-VN')} SKU đã tải.</p>
    </header>
    {mappingEnabled ? <p className="text-caption leading-5 text-graphite">Chọn tối đa 25 SKU. Xem trước chỉ đọc Inventory Item, Offer, Marketplace, Location và exact SKU match trong Core. Khi xác nhận, chỉ mapping trong Core được ghi; không ghép theo tên sản phẩm và không ghi lên eBay.</p> : null}
    {mappingEnabled ? <div className="flex flex-wrap items-center gap-2">
      <StatusBadge tone={selected.size > MAX_SELECTED ? 'danger' : 'neutral'}>{selected.size} / {MAX_SELECTED} SKU đã chọn</StatusBadge>
      <Button variant="secondary" size="sm" loading={mappingAction === 'preview'} disabled={selected.size === 0 || selected.size > MAX_SELECTED || mappingAction !== null} onClick={() => void previewMappings()}>Xem trước mapping</Button>
    </div> : null}
    {mappingEnabled && mappingError ? <p role="alert" className="rounded-control border border-error/40 bg-error/5 p-3 text-sm text-error">{mappingError}</p> : null}
    {mappingEnabled && mappingNotice ? <p role="status" className="rounded-control border border-success/40 bg-success/5 p-3 text-sm text-on-surface">{mappingNotice}</p> : null}
    {mappingEnabled && mappingPlan ? <div className="grid gap-3 rounded-control border border-outline-variant/60 bg-surface-container-low p-3" aria-live="polite">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-display text-base font-bold text-on-surface">Kết quả kiểm tra SKU</h3><p className="mt-1 text-caption text-graphite">Đủ điều kiện {mappingPlan.eligible} · Đã có mapping {mappingPlan.already_mapped} · Xung đột {mappingPlan.conflicts} · Chưa ghép {mappingPlan.unmapped}</p></div>
        {mappingPlan.eligible > 0 ? <Button loading={mappingAction === 'import'} disabled={mappingAction !== null} onClick={() => void commitMappings()}>Xác nhận nhập {mappingPlan.eligible} mapping</Button> : null}
      </div>
      <p className="text-xs leading-5 text-graphite">Khi xác nhận, backend đọc lại dữ liệu eBay và kiểm tra xung đột trong transaction trước khi ghi. SKU, Offer ID, Listing ID, Marketplace và Location vẫn là các định danh riêng.</p>
      <ul className="grid gap-2">{mappingPlan.items.map((item) => <li key={`${item.external_sku}-${item.marketplace_id}`} className="flex min-w-0 flex-wrap items-center justify-between gap-2 rounded-control border border-outline-variant/50 bg-pure-white p-2 text-xs">
        <span className="min-w-0"><code className="break-all font-mono font-semibold text-on-surface">{item.external_sku}</code>{item.canonical_sku ? <span className="ml-2 text-graphite">→ Core {item.canonical_sku}</span> : null}{item.reason ? <span className="ml-2 text-error">{mappingReason(item.reason)}</span> : null}</span>
        <StatusBadge tone={item.status === 'eligible' ? 'success' : item.status === 'already_mapped' || item.status === 'imported' ? 'neutral' : 'danger'}>{item.status === 'eligible' ? 'Sẵn sàng' : item.status === 'already_mapped' || item.status === 'imported' ? 'Đã nhập' : 'Cần xử lý'}</StatusBadge>
      </li>)}</ul>
    </div> : null}
    {loading ? <LoadingState label="Đang tải Inventory Items eBay…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => loadPage(0, false)} /> : null}
    {!loading && !error && total === 0 ? <EmptyState title="Seller chưa có Inventory Item" detail="API eBay Sandbox trả về không có SKU. Không có mapping nào được tạo tự động." /> : null}
    {!loading && !error && items.length > 0 ? <>
      <div className="hidden overflow-x-auto md:block"><table className="w-full min-w-[760px] border-collapse text-left"><caption className="sr-only">eBay Sandbox Inventory Items theo SKU</caption><thead><tr className="h-10 bg-surface-container-low text-caption font-semibold uppercase tracking-wider text-graphite">{mappingEnabled ? <th className="px-3">Chọn</th> : null}<th className="px-3">eBay SKU</th><th className="px-3">Sản phẩm</th><th className="px-3">eBay quantity</th><th className="px-3">Core mapping</th><th className="px-3">Offers</th></tr></thead><tbody className="divide-y divide-surface-container">{items.map((item) => <tr key={item.sku} className="text-sm">{mappingEnabled ? <td className="px-3 py-3"><input disabled={mappingAction !== null} aria-label={`Chọn SKU ${item.sku}`} type="checkbox" checked={selected.has(item.sku)} onChange={() => toggleSelected(item.sku)} /></td> : null}<td className="px-3 py-3"><code className="break-all font-mono text-on-surface">{item.sku}</code></td><td className="max-w-72 px-3 py-3"><span className="line-clamp-2 break-words">{item.product?.title || 'Không có tiêu đề'}</span><span className="mt-1 block text-caption text-graphite">{item.condition || 'Chưa khai báo tình trạng'}</span></td><td className="px-3 py-3 tabular-nums">{item.availability?.shipToLocationAvailability?.quantity ?? '—'}</td><td className="px-3 py-3">{mappedBySKU.has(item.sku) ? <StatusBadge tone="success">{mappedBySKU.get(item.sku)?.canonical_sku}</StatusBadge> : <StatusBadge tone="neutral">Chưa ghép</StatusBadge>}</td><td className="px-3 py-3"><Button variant="ghost" size="sm" onClick={() => void showOffers(item.sku)}>{offersForSku === item.sku ? 'Ẩn Offer' : 'Xem Offer'}</Button></td></tr>)}</tbody></table></div>
      <div className="grid gap-2 md:hidden">{items.map((item) => <article key={item.sku} className="grid min-w-0 gap-2 rounded-control border border-outline-variant/50 p-3"><div className="flex min-w-0 items-start justify-between gap-2">{mappingEnabled ? <label className="flex min-w-0 items-start gap-2"><input disabled={mappingAction !== null} aria-label={`Chọn SKU ${item.sku}`} type="checkbox" checked={selected.has(item.sku)} onChange={() => toggleSelected(item.sku)} /><code className="break-all font-mono text-sm font-semibold text-on-surface">{item.sku}</code></label> : <code className="break-all font-mono text-sm font-semibold text-on-surface">{item.sku}</code>}{mappedBySKU.has(item.sku) ? <StatusBadge tone="success">Đã ghép</StatusBadge> : <StatusBadge>Chưa ghép</StatusBadge>}</div><p className="break-words text-sm text-on-surface">{item.product?.title || 'Không có tiêu đề'}</p><p className="text-caption text-graphite">eBay quantity: {item.availability?.shipToLocationAvailability?.quantity ?? '—'}</p><Button variant="secondary" size="sm" onClick={() => void showOffers(item.sku)}>{offersForSku === item.sku ? 'Ẩn Offer' : 'Xem Offer'}</Button></article>)}</div>
      {offersForSku ? <div className="grid gap-2 rounded-control border border-outline-variant/50 bg-surface-container-low p-3" aria-live="polite"><h3 className="text-sm font-semibold text-on-surface">Offer của {offersForSku}</h3>{offersLoading ? <LoadingState label="Đang đọc Offer…" /> : null}{!offersLoading && offersError ? <ErrorState error={offersError} retry={() => void showOffers(offersForSku)} /> : null}{!offersLoading && !offersError && offers.length === 0 ? <p className="text-sm text-graphite">eBay không trả về Offer nào cho SKU này.</p> : null}{offers.map((offer) => <div key={offer.offerId} className="grid min-w-0 gap-1 border-t border-outline-variant/50 pt-2 text-xs sm:grid-cols-2"><span>Marketplace: <strong>{offer.marketplaceId}</strong></span><span>Trạng thái: <strong>{offer.listing?.listingStatus || offer.status || 'Chưa đăng'}</strong></span><span>Offer ID: <code className="break-all">{offer.offerId}</code></span><span>Listing ID: <code className="break-all">{offer.listing?.listingId || 'Chưa có'}</code></span><span>Location: <code className="break-all">{offer.merchantLocationKey || 'Chưa có'}</code></span><span>Giá: <strong>{offer.pricingSummary?.price?.value ?? '—'} {offer.pricingSummary?.price?.currency ?? ''}</strong></span><Button variant="ghost" size="sm" onClick={() => void loadOfferDetail(offer.offerId)}>Đọc chi tiết Offer</Button></div>)}{offerDetailLoading ? <LoadingState label="Đang đọc chi tiết Offer…" /> : null}{offerDetailError ? <p role="alert" className="text-xs text-error">{offerDetailError}</p> : null}{offerDetail ? <details open className="rounded-control border border-outline-variant/50 bg-pure-white p-3"><summary className="cursor-pointer text-xs font-semibold text-on-surface">Chi tiết {offerDetail.offerId}</summary><dl className="mt-2 grid gap-2 text-xs sm:grid-cols-2"><Fact label="Marketplace / status" value={`${offerDetail.marketplaceId} · ${offerDetail.status || 'Chưa có trạng thái'}`} /><Fact label="Category" value={offerDetail.categoryId || '—'} /><Fact label="Merchant location key" value={offerDetail.merchantLocationKey || '—'} /><Fact label="Listing ID" value={offerDetail.listing?.listingId || '—'} /><Fact label="Listing description" value={offerDetail.listingDescription || '—'} /><Fact label="Fulfillment policy ID" value={offerDetail.listingPolicies?.fulfillmentPolicyId || '—'} /><Fact label="Payment policy ID" value={offerDetail.listingPolicies?.paymentPolicyId || '—'} /><Fact label="Return policy ID" value={offerDetail.listingPolicies?.returnPolicyId || '—'} /></dl></details> : null}</div> : null}
      {offset < total ? <div className="flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={() => loadPage(offset, true)}>Tải thêm Inventory Item</Button></div> : null}
    </> : null}
  </Card>;
}

function mappingReason(reason: string): string {
  const labels: Record<string, string> = {
    invalid_sku: 'SKU không hợp lệ', duplicate_ebay_sku: 'SKU eBay bị trùng', remote_item_missing: 'Inventory Item không còn trên eBay',
    core_sku_missing: 'Không tìm thấy Canonical SKU chính xác trong Core', core_sku_duplicate: 'Canonical SKU Core không duy nhất',
    core_product_not_active: 'Sản phẩm Core chưa hoạt động', mapping_conflict: 'Xung đột với mapping khác',
    offer_missing: 'Không có Offer cho Marketplace này', marketplace_mismatch: 'Marketplace không khớp', location_missing: 'Không xác minh được Inventory Location',
  };
  return labels[reason] ?? reason;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-graphite">{label}</dt><dd className="mt-0.5 break-all text-on-surface">{value}</dd></div>;
}
