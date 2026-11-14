import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  createEbayInventoryLocation,
  getEbayCategoryAspects,
  getEbayCategorySuggestions,
  getEbayCategoryTree,
  getEbayInventoryLocations,
  getEbayPolicies,
  getEbayProductJobs,
  getEbayProductState,
  getEbayStatus,
  queueEbayProductAction,
  setEbayInventoryLocationEnabled,
  type EbayCategoryAspects,
  type EbayCategorySuggestion,
  type EbayInventoryLocation,
  type EbayPolicies,
  type EbayProductAction,
  type EbayProductPublicationState,
  type EbayProductSpec,
  type EbayProductSyncJob,
  type EbayStatus,
} from '../../../api/ebay';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import type { ProductInventoryRow } from '../../../api/channel-operations';
import type { ProductApiDetail } from '../product.detail.api';
import { newIdempotencyKey } from '../product.write';
import { productWriteErrorForCode, productWriteErrorMessage } from '../product.write.messages';
import { ProductInventorySync } from './ProductInventorySync';
import { ProductChannelActionCard, ProductChannelNotice, ProductChannelProgressNotice, ProductChannelStatusGrid } from './ProductChannelUi';

type Action = EbayProductAction['operation'] | 'create_location' | 'enable_location' | null;
type EbayFormDraft = {
  productVersion: number; categoryQuery: string; categoryId: string; categoryName: string; condition: string; conditionDescription: string;
  images: string; aspects: Record<string, string[]>; variationAspects: Record<string, 'color' | 'size'>; locationKey: string;
  paymentPolicyId: string; fulfillmentPolicyId: string; returnPolicyId: string; currency: string; prices: Record<string, string>; newLocation: typeof initialNewLocation;
};
const initialNewLocation = { key: '', name: '', city: '', state: '', postal: '', country: '' };
const stateLabel: Record<string, string> = {
  not_exported: 'Chưa xuất', draft: 'Bản nháp', published: 'Đang bán', unpublished: 'Đã tạm dừng',
  sync_pending: 'Đang đồng bộ', sync_failed: 'Đồng bộ lỗi', conflict: 'Xung đột', blocked: 'Bị chặn',
  unmapped: 'Chưa mapping', verification_pending: 'Chờ xác minh', verified: 'Đã xác minh',
  pending: 'Đang chờ', processing: 'Đang chạy', retrying: 'Đang thử lại', succeeded: 'Hoàn tất', failed: 'Thất bại', superseded: 'Có phiên bản mới',
};

const currencyByMarketplace: Record<string, string> = {
  EBAY_US: 'USD', EBAY_MOTORS_US: 'USD', EBAY_CA: 'CAD', EBAY_GB: 'GBP', EBAY_AU: 'AUD',
  EBAY_DE: 'EUR', EBAY_FR: 'EUR', EBAY_IT: 'EUR', EBAY_ES: 'EUR', EBAY_NL: 'EUR', EBAY_BE: 'EUR',
  EBAY_AT: 'EUR', EBAY_IE: 'EUR', EBAY_CH: 'CHF', EBAY_HK: 'HKD', EBAY_SG: 'SGD', EBAY_MY: 'MYR',
  EBAY_PH: 'PHP', EBAY_PL: 'PLN', EBAY_TW: 'TWD',
};

export function EbayProductPanel({ product, canWrite, initialChannelId, wizardMode = false, onDraftReadinessChange, onWorkflowConfigurationChange, onDraftSubmitReady, onDraftQueued }: {
  product: ProductApiDetail;
  canWrite: boolean;
  initialChannelId?: string;
  wizardMode?: boolean;
  onDraftReadinessChange?: (ready: boolean, reason?: string) => void;
  onWorkflowConfigurationChange?: (channelId: string, spec: EbayProductSpec, ready: boolean, reason?: string) => void;
  onDraftSubmitReady?: (submit: (() => Promise<void>) | null) => void;
  onDraftQueued?: (job: EbayProductSyncJob) => void;
}) {
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [channelId, setChannelId] = useState('');
  const [state, setState] = useState<EbayProductPublicationState | null>(null);
  const [jobs, setJobs] = useState<EbayProductSyncJob[]>([]);
  const [inventoryRows, setInventoryRows] = useState<ProductInventoryRow[]>([]);
  const [locations, setLocations] = useState<EbayInventoryLocation[]>([]);
  const [policies, setPolicies] = useState<EbayPolicies | null>(null);
  const [treeId, setTreeId] = useState('');
  const [categoryAspects, setCategoryAspects] = useState<EbayCategoryAspects | null>(null);
  const [categoryAspectsLoading, setCategoryAspectsLoading] = useState(false);
  const [categoryAspectsError, setCategoryAspectsError] = useState(false);
  const [suggestions, setSuggestions] = useState<EbayCategorySuggestion[]>([]);
  const [categoryQuery, setCategoryQuery] = useState(product.category || product.name);
  const [categoryId, setCategoryId] = useState('');
  const [categoryName, setCategoryName] = useState('');
  const [condition, setCondition] = useState('NEW');
  const [conditionDescription, setConditionDescription] = useState('');
  const [images, setImages] = useState('');
  const [aspects, setAspects] = useState<Record<string, string[]>>({});
  const [variationAspects, setVariationAspects] = useState<Record<string, 'color' | 'size'>>({});
  const [locationKey, setLocationKey] = useState('');
  const [paymentPolicyId, setPaymentPolicyId] = useState('');
  const [fulfillmentPolicyId, setFulfillmentPolicyId] = useState('');
  const [returnPolicyId, setReturnPolicyId] = useState('');
  const [currency, setCurrency] = useState('');
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [newLocation, setNewLocation] = useState(initialNewLocation);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [progressRefreshing, setProgressRefreshing] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, setPending] = useState<Action>(null);
  const [historyOpen, setHistoryOpen] = useState(false);

  const activeVariants = useMemo(() => product.variants.filter((variant) => variant.isActive && variant.variantIsActive && variant.sku.trim()), [product.variants]);
  const connection = status?.connections.find((item) => item.channel_id === channelId);
  const marketplace = connection?.marketplace_id ?? status?.marketplace_id ?? '';
  const expectedCurrency = currencyByMarketplace[marketplace] ?? '';
  const selectedCurrency = currency || expectedCurrency;
  const requiredAspects = categoryAspects?.aspects.filter((aspect) => aspect.aspectConstraint?.aspectRequired) ?? [];
  const variantAxisAspects = categoryAspects?.aspects.filter((aspect) => variantAxis(aspect.localizedAspectName)) ?? [];
  const imageList = images.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const hasInvalidImageURL = imageList.some((image) => !isPublicImageURL(image));
  const draftStorageKey = channelId ? `octoflow:ebay-product-form:${channelId}:${product.id}` : '';

  const refresh = useCallback(async (signal?: AbortSignal) => {
    if (!channelId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextState, nextJobs, nextLocations, nextPolicies, tree] = await Promise.all([
        getEbayProductState(channelId, product.id, signal), getEbayProductJobs(channelId, product.id, signal),
        getEbayInventoryLocations(channelId, signal), getEbayPolicies(channelId, signal), getEbayCategoryTree(channelId, signal),
      ]);
      if (signal?.aborted) return;
      setState(nextState); setJobs(nextJobs); setLocations(nextLocations); setPolicies(nextPolicies); setTreeId(tree.categoryTreeId);
      const saved = nextState.configuration ?? {};
      let local: Partial<EbayFormDraft> = {};
      try {
        const raw = sessionStorage.getItem(`octoflow:ebay-product-form:${channelId}:${product.id}`);
        if (raw) {
          const parsed = JSON.parse(raw) as EbayFormDraft;
          if (parsed.productVersion === product.productVersion) local = parsed;
          else sessionStorage.removeItem(`octoflow:ebay-product-form:${channelId}:${product.id}`);
        }
      } catch { sessionStorage.removeItem(`octoflow:ebay-product-form:${channelId}:${product.id}`); }
      setCategoryId(local.categoryId ?? saved.category_id ?? nextState.category_id ?? '');
      setCategoryName(local.categoryName ?? '');
      setCategoryQuery(local.categoryQuery ?? product.category ?? product.name);
      setCondition(local.condition ?? saved.condition ?? 'NEW'); setConditionDescription(local.conditionDescription ?? saved.condition_description ?? '');
      setImages(local.images ?? (saved.image_urls ?? []).join('\n'));
      setAspects(local.aspects ?? saved.aspects ?? {});
      setVariationAspects(local.variationAspects ?? saved.variation_aspects ?? {});
      setLocationKey(local.locationKey ?? saved.merchant_location_key ?? nextState.merchant_location_key ?? '');
      setPaymentPolicyId(local.paymentPolicyId ?? saved.payment_policy_id ?? ''); setFulfillmentPolicyId(local.fulfillmentPolicyId ?? saved.fulfillment_policy_id ?? ''); setReturnPolicyId(local.returnPolicyId ?? saved.return_policy_id ?? '');
      setCurrency(local.currency ?? saved.price_currency ?? nextState.price_currency ?? currencyByMarketplace[marketplace] ?? '');
      setPrices(local.prices ?? saved.prices ?? {});
      setNewLocation(local.newLocation ?? initialNewLocation);
      setCategoryAspects(null);
    } catch (cause) {
      if (!signal?.aborted) setError(productWriteErrorMessage(cause, 'Không tải được trạng thái sản phẩm eBay.'));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [channelId, marketplace, product.id]);

  const refreshProgress = useCallback(async (signal?: AbortSignal, silent = false) => {
    if (!channelId) return;
    if (!silent) setProgressRefreshing(true);
    try {
      const [nextState, nextJobs] = await Promise.all([
        getEbayProductState(channelId, product.id, signal),
        getEbayProductJobs(channelId, product.id, signal),
      ]);
      if (!signal?.aborted) { setState(nextState); setJobs(nextJobs); setProgressError(null); }
    } catch (cause) {
      if (!signal?.aborted) setProgressError(productWriteErrorMessage(cause, 'Không thể tự làm mới tiến trình eBay.'));
    } finally {
      if (!signal?.aborted && !silent) setProgressRefreshing(false);
    }
  }, [channelId, product.id]);

  const receiveInventoryRows = useCallback((next: ProductInventoryRow[]) => {
    setInventoryRows((current) => current === next ? current : next);
  }, []);

  useEffect(() => {
    if (!draftStorageKey || loading) return;
    const draft: EbayFormDraft = {
      productVersion: product.productVersion, categoryQuery, categoryId, categoryName, condition, conditionDescription,
      images, aspects, variationAspects, locationKey, paymentPolicyId, fulfillmentPolicyId, returnPolicyId, currency, prices, newLocation,
    };
    try { sessionStorage.setItem(draftStorageKey, JSON.stringify(draft)); } catch { /* Storage can be unavailable in private browsing. */ }
  }, [aspects, categoryId, categoryName, categoryQuery, condition, conditionDescription, currency, draftStorageKey, fulfillmentPolicyId, images, loading, locationKey, newLocation, paymentPolicyId, prices, product.productVersion, returnPolicyId, variationAspects]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null); setState(null); setJobs([]); setNotice(null); setInventoryRows([]);
    void getEbayStatus(controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setStatus(next);
      const available = next.connections.filter((item) => item.connection_status === 'connected');
      setChannelId((current) => initialChannelId && available.some((item) => item.channel_id === initialChannelId)
        ? initialChannelId : current && available.some((item) => item.channel_id === current) ? current : available[0]?.channel_id ?? '');
    }).catch((cause) => {
      if (!controller.signal.aborted) { setError(productWriteErrorMessage(cause, 'Không đọc được kết nối eBay.')); setLoading(false); }
    });
    return () => controller.abort();
  }, [initialChannelId, product.id, product.productVersion]);

  useEffect(() => {
    if (!channelId) { setLoading(false); return; }
    const controller = new AbortController();
    setHistoryOpen(false);
    setProgressError(null);
    void refresh(controller.signal);
    return () => controller.abort();
  }, [channelId, product.productVersion, refresh]);

  useEffect(() => {
    if (!channelId || !treeId || !categoryId) { setCategoryAspects(null); setCategoryAspectsLoading(false); setCategoryAspectsError(false); return; }
    const controller = new AbortController();
    setCategoryAspects(null); setCategoryAspectsLoading(true); setCategoryAspectsError(false);
    void getEbayCategoryAspects(channelId, treeId, categoryId, controller.signal).then((value) => {
      if (!controller.signal.aborted) setCategoryAspects(value);
    }).catch(() => {
      if (!controller.signal.aborted) { setCategoryAspects(null); setCategoryAspectsError(true); }
    }).finally(() => { if (!controller.signal.aborted) setCategoryAspectsLoading(false); });
    return () => controller.abort();
  }, [channelId, treeId, categoryId]);

  useEffect(() => {
    if (activeVariants.length < 2 || !variantAxisAspects.length) return;
    setVariationAspects((current) => {
      let changed = false;
      const next = { ...current };
      for (const aspect of variantAxisAspects) {
        const axis = variantAxis(aspect.localizedAspectName);
        if (!axis || next[aspect.localizedAspectName]) continue;
        const hasValues = activeVariants.every((variant) => axis === 'color' ? Boolean(variant.color || variant.colorDescription) : Boolean(variant.size));
        if (hasValues) { next[aspect.localizedAspectName] = axis; changed = true; }
      }
      return changed ? next : current;
    });
  }, [activeVariants, variantAxisAspects]);

  const featureReady = canWrite && Boolean(status?.enabled && status.product_publish_enabled && state?.product_publish_enabled && connection?.connection_status === 'connected') && !loading && !busy;
  const mapped = state?.mapping_state === 'verified';
  const location = locations.find((item) => item.merchantLocationKey === locationKey);
  const formSpec = useMemo<EbayProductSpec>(() => ({
      category_id: categoryId.trim(), condition, condition_description: conditionDescription.trim(),
      aspects, variation_aspects: variationAspects,
      image_urls: images.split(/\r?\n/).map((line) => line.trim()).filter(Boolean), merchant_location_key: locationKey,
      payment_policy_id: paymentPolicyId, fulfillment_policy_id: fulfillmentPolicyId, return_policy_id: returnPolicyId,
      price_currency: selectedCurrency, prices: Object.fromEntries(activeVariants.map((variant) => [variant.sku, (prices[variant.sku] ?? '').trim()])),
    }), [activeVariants, aspects, categoryId, condition, conditionDescription, fulfillmentPolicyId, images, locationKey, paymentPolicyId, prices, returnPolicyId, selectedCurrency, variationAspects]);
  const catalogReady = (() => {
    if (!activeVariants.length || !expectedCurrency || selectedCurrency !== expectedCurrency || !categoryId || !categoryAspects || categoryAspectsLoading || categoryAspectsError || !location || location.merchantLocationStatus !== 'ENABLED' ||
      !paymentPolicyId || !fulfillmentPolicyId || !returnPolicyId) return false;
    if (!imageList.length || imageList.some((image) => !isPublicImageURL(image))) return false;
    if (activeVariants.some((variant) => !/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,3})?$/.test((prices[variant.sku] ?? '').trim()) || Number(prices[variant.sku]) <= 0)) return false;
    if (requiredAspects.some((aspect) => !aspects[aspect.localizedAspectName]?.some((value) => value.trim()))) return false;
    if (activeVariants.length > 1 && (!Object.keys(variationAspects).length || Object.values(variationAspects).some((source) => source !== 'color' && source !== 'size'))) return false;
    return true;
  })();
  const canDraft = featureReady && catalogReady && state?.publication_state !== 'published';
  const canSync = featureReady && catalogReady && Boolean(mapped) && ['draft', 'published', 'unpublished'].includes(state?.publication_state ?? '');
  const canPriceSync = featureReady && Boolean(mapped) && ['draft', 'published', 'unpublished'].includes(state?.publication_state ?? '') && expectedCurrency === selectedCurrency && activeVariants.length > 0 && activeVariants.every((variant) => Number(prices[variant.sku]) > 0);
  const canPublish = featureReady && mapped && product.status === 'active' && ['draft', 'unpublished'].includes(state?.publication_state ?? '');
  const canWithdraw = featureReady && mapped && state?.publication_state === 'published';

  const draftBlocker = !canWrite ? 'Bạn không có quyền quản lý sản phẩm trên kênh này.'
    : loading ? 'Đang kiểm tra kết nối và yêu cầu của eBay.'
      : error ? 'Không đọc được trạng thái eBay. Hãy tải lại rồi kiểm tra lại.'
        : !connection || connection.connection_status !== 'connected' ? 'Tài khoản eBay chưa kết nối hoặc chưa xác minh.'
          : !status?.product_publish_enabled || !state?.product_publish_enabled ? 'Tài khoản hiện chưa cho phép OctoFlow tạo sản phẩm trên eBay.'
            : !activeVariants.length ? 'Sản phẩm chưa có mẫu mã đang hoạt động kèm SKU.'
              : !catalogReady ? 'Bổ sung danh mục, ảnh công khai, địa điểm gửi, chính sách bán và giá cho từng SKU.'
                : state?.publication_state === 'published' ? 'Sản phẩm đã có listing. Hãy quản lý listing hiện tại để tránh tạo trùng.'
                  : '';

  useEffect(() => {
    if (wizardMode) onWorkflowConfigurationChange?.(channelId, formSpec, featureReady && catalogReady,
      catalogReady ? undefined : draftBlocker || 'Hoàn tất thông tin bắt buộc riêng của eBay.');
  }, [catalogReady, channelId, draftBlocker, featureReady, formSpec, onWorkflowConfigurationChange, wizardMode]);

  const submitDraft = async () => {
    if (!canDraft || !channelId) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      const queued = await queueEbayProductAction(channelId, product.id, {
        operation: 'draft', expected_product_version: product.productVersion, confirm: true, spec: formSpec,
      }, newIdempotencyKey('ebay-product-draft'));
      setNotice('Đã tiếp nhận yêu cầu tạo bản nháp. eBay sẽ được đọc lại trước khi xác nhận hoàn tất.');
      onDraftQueued?.(queued);
      await refresh();
    } catch (cause) {
      setError(productWriteErrorMessage(cause, 'Không thể tạo bản nháp eBay.'));
      throw cause;
    } finally { setBusy(false); }
  };

  useEffect(() => {
    if (wizardMode) {
      onDraftReadinessChange?.(canDraft, draftBlocker || undefined);
      onDraftSubmitReady?.(canDraft ? submitDraft : null);
    }
  }, [canDraft, draftBlocker, onDraftReadinessChange, onDraftSubmitReady, wizardMode]);

  const findCategories = async () => {
    if (!channelId || !treeId || !categoryQuery.trim()) return;
    setError(null);
    try { setSuggestions(await getEbayCategorySuggestions(channelId, treeId, categoryQuery.trim())); }
    catch (cause) { setError(productWriteErrorMessage(cause, 'Không tìm được danh mục eBay.')); }
  };

  const execute = async (action: Action = pending) => {
    if (!action || !channelId || busy) return;
    setBusy(true); setError(null); setNotice(null);
    try {
      if (action === 'create_location') {
        const merchantLocationKey = newLocation.key.trim() || generatedLocationKey(newLocation.name || newLocation.city);
        setNewLocation((current) => ({ ...current, key: merchantLocationKey }));
        const created = await createEbayInventoryLocation(channelId, {
          merchant_location_key: merchantLocationKey, name: newLocation.name, city: newLocation.city, state_or_province: newLocation.state,
          postal_code: newLocation.postal, country: newLocation.country.toUpperCase(), confirm: true,
        });
        setNotice(created.reconciled ? 'Đã xác nhận địa điểm gửi hàng này trên eBay.' : 'Đã thêm và xác minh địa điểm gửi hàng trên eBay.');
        setLocationKey(created.location.merchantLocationKey);
        setPending(null); await refresh(); return;
      }
      if (action === 'enable_location') {
        if (!locationKey) throw new Error('Hãy chọn địa điểm gửi hàng cần bật.');
        await setEbayInventoryLocationEnabled(channelId, locationKey, true);
        setNotice('Đã bật và xác minh địa điểm gửi hàng.'); setPending(null); await refresh(); return;
      }
      const spec = action === 'publish' || action === 'withdraw' ? undefined
      : action === 'price_sync' ? { price_currency: selectedCurrency, prices: formSpec.prices }
          : formSpec;
      const input: EbayProductAction = { operation: action, expected_product_version: product.productVersion, confirm: true, ...(spec ? { spec } : {}) };
      const queued = await queueEbayProductAction(channelId, product.id, input, newIdempotencyKey(`ebay-product-${action}`));
      setNotice(`Đã tiếp nhận yêu cầu ${operationLabel(action).toLocaleLowerCase('vi')} trên eBay. Trạng thái tự cập nhật; không gửi lại.`);
      if (action === 'draft') onDraftQueued?.(queued);
      setPending(null); await refresh();
    } catch (cause) {
      setError(productWriteErrorMessage(cause, 'Không thể xếp thao tác eBay.'));
    } finally { setBusy(false); }
  };

  const latest = jobs[0];
  const inProgress = Boolean(latest && ['pending', 'processing', 'retrying'].includes(latest.state));
  const inventoryWriteEnabled = Boolean(status?.inventory_write_enabled && state?.inventory_write_enabled);
  const sellerEligible = Boolean(status?.enabled && status.product_publish_enabled && state?.product_publish_enabled);
  const hasPublishJob = jobs.some((job) => job.operation === 'publish');
  const inventoryRelevant = Boolean(!wizardMode && channelId && (state?.publication_state === 'published' || hasPublishJob));
  const listedInventoryRows = inventoryRows.filter((row) => row.listed);
  const inventoryVerified = listedInventoryRows.length > 0 && listedInventoryRows.every((row) => row.latest_sync_status === 'VERIFIED');
  const connectionName = connection?.seller_username || connection?.display_name || connection?.seller_user_id || 'eBay Sandbox';

  useEffect(() => {
    if (wizardMode || !channelId || !inProgress) return;
    const controller = new AbortController();
    let inFlight = false;
    const poll = async () => {
      if (inFlight || controller.signal.aborted) return;
      inFlight = true;
      try { await refreshProgress(controller.signal, true); }
      finally { inFlight = false; }
    };
    void poll();
    const timer = window.setInterval(() => void poll(), 3000);
    return () => { controller.abort(); window.clearInterval(timer); };
  }, [channelId, inProgress, refreshProgress, wizardMode]);
  const actionTitle = pending === 'create_location' ? 'Thêm địa điểm gửi hàng trên eBay?'
    : pending === 'enable_location' ? 'Bật địa điểm gửi hàng?'
      : pending === 'draft' ? 'Tạo hoặc cập nhật bản nháp eBay?'
        : pending === 'sync' ? 'Đồng bộ catalogue eBay?'
          : pending === 'price_sync' ? `Cập nhật giá bằng ${selectedCurrency}?`
            : pending === 'publish' ? 'Đăng sản phẩm lên eBay?'
              : 'Tạm dừng listing eBay?';

  return <Card className="grid gap-4 p-5" aria-label="Thông tin sản phẩm eBay">
    <header className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/50 pb-4">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-channel-paper text-carbon"><ChannelBrandIcon code="ebay" /></span>
        <div className="min-w-0"><h2 className="truncate font-body text-base font-semibold text-on-surface">Thông tin bán hàng eBay</h2><p className="mt-1 font-body text-caption text-graphite">{connectionName} · {connection?.connection_status === 'connected' ? 'Đã kết nối' : loading ? 'Đang kiểm tra kết nối' : 'Chưa kết nối'} · Sandbox</p></div>
      </div>
      <div className="flex items-center gap-2">
        <StatusBadge tone={state ? tone(state.publication_state) : 'neutral'}>{state ? label(state.publication_state) : 'Đang tải trạng thái'}</StatusBadge>
        <Button variant="secondary" size="sm" loading={loading} disabled={busy || !channelId} onClick={() => void refresh()}>Làm mới</Button>
      </div>
    </header>
    <p className="text-sm leading-6 text-graphite">Giá được thiết lập riêng theo tiền tệ của marketplace. Tạo bản nháp không thay đổi tồn kho Core.</p>
    {status?.connections.length ? <Select label="Tài khoản và marketplace" value={channelId} onChange={(event) => setChannelId(event.target.value)}>
      {status.connections.map((item) => <option key={item.channel_id} value={item.channel_id}>{item.seller_username || item.display_name || item.seller_user_id} · {item.marketplace_id} · {item.connection_status === 'connected' ? 'Đã kết nối' : 'Chưa kết nối'}</option>)}
    </Select> : <ProductChannelNotice kind="info">Chưa kết nối eBay Sandbox. Kết nối tài khoản trong trang Kênh bán trước khi tạo listing.</ProductChannelNotice>}
    {error ? <ProductChannelNotice kind="error">{error}</ProductChannelNotice> : null}
    {notice ? <ProductChannelNotice kind="success">{notice}</ProductChannelNotice> : null}
    {progressError ? <ProductChannelNotice kind="error">{progressError}</ProductChannelNotice> : null}
    {state ? <>
      <ProductChannelStatusGrid items={[
        { label: 'Ghép mã sản phẩm', value: label(state.mapping_state), tone: tone(state.mapping_state) },
        { label: 'Thông tin và giá', value: label(state.catalog_sync_state), tone: tone(state.catalog_sync_state) },
        { label: 'Điều kiện bán', value: sellerEligible ? 'Đủ điều kiện' : 'Cần kiểm tra', tone: sellerEligible ? 'success' : 'warning' },
        { label: 'Quyền ghi tồn', value: inventoryWriteEnabled ? 'Đã bật' : 'Chưa bật', tone: inventoryWriteEnabled ? 'success' : 'warning' },
      ]} />
      <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <Fact label="Marketplace" value={marketplace || '—'} /><Fact label="Listing ID" value={state.remote_listing_id || 'Chưa có'} mono />
        <Fact label="Phiên bản Core" value={String(state.product_version)} /><Fact label={wizardMode ? 'Tiền tệ giá' : 'Tiền tệ eBay'} value={state.price_currency || currency || expectedCurrency || 'Chưa chọn'} />
      </dl>
    </> : null}
    {state?.last_error_code && !wizardMode ? <ProductChannelNotice kind="error">Không thể hoàn tất thao tác gần nhất. Hãy kiểm tra cấu hình eBay.</ProductChannelNotice> : null}
    {inProgress && latest ? <ProductChannelProgressNotice channelName="eBay" detail={`${operationLabel(latest.operation)} đang được xử lý.`} refreshing={progressRefreshing} onRefresh={() => void refreshProgress()} /> : null}

    {inventoryRelevant ? <section className="grid gap-3 rounded-lg border border-outline-variant/60 bg-surface-container-low p-3" aria-label="Phân bổ và tồn kho eBay sau khi đăng">
      <div>
        <h3 className="text-sm font-semibold text-on-surface">Phân bổ và tồn kho sau khi đăng</h3>
        <p className="mt-1 text-xs leading-5 text-graphite">Offer đã đăng chưa đủ để kết luận tồn đã sẵn sàng. OctoFlow chỉ xác nhận khi eBay đọc lại đúng số lượng cho từng SKU; mapping, số thực tế và lỗi đồng bộ nằm trong phần chi tiết.</p>
      </div>
      {!sellerEligible ? <ProductChannelNotice kind="warning">Tài khoản eBay chưa đủ điều kiện đăng bán (seller eligibility). Kiểm tra marketplace, tài khoản seller và quyền Inventory trong Cài đặt kênh eBay.</ProductChannelNotice> : null}
      {!inventoryWriteEnabled ? <ProductChannelNotice kind="warning">eBay chưa cấp quyền ghi tồn (inventory_write_enabled). OctoFlow sẽ không gửi số lượng cho tới khi quyền này được bật và xác minh lại trong Cài đặt kênh.</ProductChannelNotice> : null}
      {state?.publication_state === 'published' && !inventoryVerified ? <ProductChannelNotice kind="info">Listing đã được đăng nhưng tồn chưa được xác minh cho mọi SKU đang bán. Chưa coi luồng đăng là hoàn tất; xem trạng thái từng SKU bên dưới.</ProductChannelNotice> : null}
      <ProductInventorySync channelId={channelId} productId={product.id} channelName="eBay" requireListedForActions canWrite={canWrite && inventoryWriteEnabled && !busy} onRowsChange={receiveInventoryRows} />
    </section> : null}

    {channelId ? <div className="grid gap-5 border-t border-outline-variant/50 pt-4">
      <section className="grid gap-3">
        <div><h3 className="text-sm font-semibold text-on-surface">Thông tin listing</h3><p className="mt-1 text-xs leading-5 text-graphite">Tên và mô tả lấy từ Core. Chọn category từ Taxonomy eBay và dùng URL ảnh HTTPS công khai.</p></div>
        <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-end"><Input label="Tìm danh mục sản phẩm" value={categoryQuery} onChange={(event) => setCategoryQuery(event.target.value)} /><Button size="sm" variant="secondary" disabled={!treeId || !categoryQuery.trim() || busy} onClick={() => void findCategories()}>Tìm danh mục</Button></div>
        {suggestions.length ? <ul className="grid gap-2 sm:grid-cols-2">{suggestions.slice(0, 8).map((item) => <li key={item.category.categoryId}><button type="button" onClick={() => { setCategoryId(item.category.categoryId); setCategoryName(item.category.categoryName); setSuggestions([]); }} className="min-h-11 w-full rounded-control border border-outline-variant/60 px-3 py-2 text-left text-sm hover:border-carbon focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"><strong>{item.category.categoryName}</strong></button></li>)}</ul> : null}
        {wizardMode ? <p className="rounded-control bg-surface-container-low px-3 py-2 text-sm text-on-surface">Danh mục đã chọn: <strong>{categoryName || (categoryId ? 'Danh mục đã lưu' : 'Chưa chọn')}</strong>{categoryAspects ? <span className="block text-xs text-graphite">{requiredAspects.length} thông tin bắt buộc</span> : null}</p> : <Input label="Mã danh mục" value={categoryId} onChange={(event) => setCategoryId(event.target.value)} hint={categoryAspects ? `${requiredAspects.length} thuộc tính bắt buộc từ danh mục đã chọn.` : 'Chọn danh mục có trong marketplace eBay.'} />}
        {requiredAspects.map((aspect) => <div key={aspect.localizedAspectName} className="grid gap-1.5">
          {aspect.aspectValues?.length && aspect.aspectConstraint?.itemToAspectCardinality === 'MULTI' ? <fieldset className="grid gap-2 rounded-control border border-outline-variant/60 p-3">
            <legend className="px-1 text-sm font-semibold text-on-surface">{aspect.localizedAspectName} · chọn một hoặc nhiều giá trị</legend>
            {aspect.aspectValues.map((value) => <label key={value.localizedValue} className="flex min-h-9 items-center gap-2 text-sm text-on-surface"><input type="checkbox" checked={aspects[aspect.localizedAspectName]?.includes(value.localizedValue) ?? false} onChange={(event) => setAspects((current) => {
              const values = new Set(current[aspect.localizedAspectName] ?? []);
              if (event.target.checked) values.add(value.localizedValue); else values.delete(value.localizedValue);
              return { ...current, [aspect.localizedAspectName]: [...values] };
            })} />{value.localizedValue}</label>)}
          </fieldset> : aspect.aspectValues?.length ? <Select label={`${aspect.localizedAspectName} · bắt buộc`} value={aspects[aspect.localizedAspectName]?.[0] ?? ''} onChange={(event) => setAspects((current) => ({ ...current, [aspect.localizedAspectName]: event.target.value ? [event.target.value] : [] }))}>
            <option value="">Chọn {aspect.localizedAspectName.toLocaleLowerCase('vi')}</option>{aspect.aspectValues.map((value) => <option key={value.localizedValue} value={value.localizedValue}>{value.localizedValue}</option>)}
          </Select> : <Input label={`${aspect.localizedAspectName} · bắt buộc`} value={aspects[aspect.localizedAspectName]?.[0] ?? ''} onChange={(event) => setAspects((current) => ({ ...current, [aspect.localizedAspectName]: event.target.value ? [event.target.value] : [] }))} />}
        </div>)}
        <Select label="Tình trạng" value={condition} onChange={(event) => setCondition(event.target.value)}><option value="NEW">Mới</option><option value="LIKE_NEW">Gần như mới</option><option value="USED_EXCELLENT">Đã dùng · rất tốt</option><option value="USED_VERY_GOOD">Đã dùng · tốt</option><option value="USED_GOOD">Đã dùng · khá</option><option value="USED_ACCEPTABLE">Đã dùng · chấp nhận được</option><option value="FOR_PARTS_OR_NOT_WORKING">Hỏng / lấy linh kiện</option></Select>
        {condition !== 'NEW' ? <Input label="Mô tả tình trạng" value={conditionDescription} onChange={(event) => setConditionDescription(event.target.value)} /> : null}
        <label className="grid gap-2 text-sm font-semibold text-on-surface">URL ảnh HTTPS công khai, mỗi dòng một URL<textarea value={images} onChange={(event) => setImages(event.target.value)} rows={3} className="min-h-24 w-full rounded-control border border-outline-variant bg-pure-white p-3 text-sm font-normal focus:border-carbon focus:outline-none focus:ring-2 focus:ring-carbon/20" placeholder="https://cdn.example.com/giay.jpg" /></label>
        {hasInvalidImageURL ? <ProductChannelNotice kind="error">Đường dẫn ảnh phải là HTTPS công khai. OctoFlow không nhận localhost, địa chỉ nội bộ hoặc tên miền thử nghiệm; eBay sẽ kiểm tra khả năng truy cập khi tạo bản nháp.</ProductChannelNotice> : null}
        {categoryAspects && requiredAspects.length === 0 ? <p className="rounded-control bg-surface-container-low p-3 text-xs leading-5 text-graphite">Danh mục này không yêu cầu thêm thuộc tính. Nếu marketplace bổ sung yêu cầu, hãy kiểm tra lại danh mục trước khi tạo bản nháp.</p> : null}
        {activeVariants.length > 1 ? <fieldset className="grid gap-3 rounded-control border border-outline-variant/50 p-3"><legend className="px-1 text-sm font-semibold text-on-surface">Ghép thuộc tính với các mẫu mã</legend><p className="text-xs leading-5 text-graphite">OctoFlow tự nhận màu sắc hoặc kích cỡ có sẵn trong Core. Hãy kiểm tra lại các thông tin đã ghép.</p>{variantAxisAspects.map((aspect) => {
          const axis = variantAxis(aspect.localizedAspectName);
          return <Select key={aspect.localizedAspectName} label={aspect.localizedAspectName} value={variationAspects[aspect.localizedAspectName] ?? ''} onChange={(event) => setVariationAspects((current) => {
          const next = { ...current };
          if (event.target.value === 'color' || event.target.value === 'size') next[aspect.localizedAspectName] = event.target.value;
          else delete next[aspect.localizedAspectName];
          return next;
        })}><option value="">Không dùng làm thuộc tính biến thể</option>{axis === 'color' ? <option value="color">Lấy màu sắc từ OctoFlow</option> : null}{axis === 'size' ? <option value="size">Lấy kích cỡ từ OctoFlow</option> : null}</Select>;
        })}</fieldset> : null}
      </section>

      <section className="grid gap-3 border-t border-outline-variant/50 pt-4">
        <div><h3 className="text-sm font-semibold text-on-surface">Địa điểm gửi và chính sách bán</h3><p className="mt-1 text-xs leading-5 text-graphite">OctoFlow đọc các chính sách từ eBay. Nếu thiếu, hãy tạo chúng trên tài khoản eBay rồi tải lại trạng thái.</p></div>
        <Select label="Địa điểm gửi hàng đang bật" value={locationKey} onChange={(event) => setLocationKey(event.target.value)}><option value="">Chọn địa điểm gửi hàng</option>{locations.map((item) => <option key={item.merchantLocationKey} value={item.merchantLocationKey} disabled={item.merchantLocationStatus !== 'ENABLED'}>{item.name}{!wizardMode ? ` · ${item.merchantLocationKey}` : ''} · {item.merchantLocationStatus === 'ENABLED' ? 'Đang bật' : 'Chưa bật'}</option>)}</Select>
        {location && location.merchantLocationStatus !== 'ENABLED' ? <Button size="sm" variant="secondary" disabled={!featureReady} onClick={() => setPending('enable_location')}>Bật địa điểm đã chọn</Button> : null}
        <div className="grid gap-3 md:grid-cols-3">
          <PolicySelect label="Chính sách thanh toán" items={policies?.payment_policies ?? []} value={paymentPolicyId} onChange={setPaymentPolicyId} id="paymentPolicyId" showIds={!wizardMode} />
          <PolicySelect label="Chính sách giao hàng" items={policies?.fulfillment_policies ?? []} value={fulfillmentPolicyId} onChange={setFulfillmentPolicyId} id="fulfillmentPolicyId" showIds={!wizardMode} />
          <PolicySelect label="Chính sách đổi trả" items={policies?.return_policies ?? []} value={returnPolicyId} onChange={setReturnPolicyId} id="returnPolicyId" showIds={!wizardMode} />
        </div>
        <details className="rounded-control border border-outline-variant/50 p-3"><summary className="cursor-pointer text-sm font-semibold text-on-surface">Thêm địa điểm gửi hàng</summary><div className="mt-3 grid gap-3 sm:grid-cols-2">
          {!wizardMode ? <Input label="Mã địa điểm (tùy chọn)" value={newLocation.key} onChange={(event) => setNewLocation({ ...newLocation, key: event.target.value })} hint="Mã này dùng để eBay nhận diện địa điểm." /> : <p className="text-xs leading-5 text-graphite sm:col-span-2">OctoFlow tự tạo mã cho địa điểm mới; bạn không cần nhập mã kỹ thuật.</p>}
          <Input label="Tên địa điểm" value={newLocation.name} onChange={(event) => setNewLocation({ ...newLocation, name: event.target.value })} />
          <Input label="Thành phố" value={newLocation.city} onChange={(event) => setNewLocation({ ...newLocation, city: event.target.value })} />
          <Input label="Tỉnh / bang" value={newLocation.state} onChange={(event) => setNewLocation({ ...newLocation, state: event.target.value })} />
          <Input label="Mã bưu chính" value={newLocation.postal} onChange={(event) => setNewLocation({ ...newLocation, postal: event.target.value })} />
          <Input label="Quốc gia" value={newLocation.country} onChange={(event) => setNewLocation({ ...newLocation, country: event.target.value.toUpperCase() })} maxLength={2} hint="Nhập mã quốc gia gồm hai chữ, ví dụ VN." />
          <Button size="sm" variant="secondary" disabled={!featureReady || (!wizardMode && !newLocation.key) || !newLocation.name || !newLocation.city || !newLocation.postal || newLocation.country.length !== 2} onClick={() => setPending('create_location')}>Thêm địa điểm</Button>
        </div></details>
      </section>

      <section className="grid gap-3 border-t border-outline-variant/50 pt-4">
        <div><h3 className="text-sm font-semibold text-on-surface">Giá theo SKU</h3><p className="mt-1 text-xs leading-5 text-graphite">Giá eBay là dữ liệu riêng. Không chuyển đổi giá VND từ Core; điền trực tiếp bằng {expectedCurrency || 'tiền tệ marketplace'}.</p></div>
        <Select label="Tiền tệ marketplace" value={selectedCurrency} onChange={(event) => setCurrency(event.target.value)}><option value="">Chọn tiền tệ</option>{expectedCurrency ? <option value={expectedCurrency}>{expectedCurrency}</option> : null}</Select>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{activeVariants.map((variant) => <Input key={variant.id} label={`${variant.sku}${variant.color || variant.size ? ` · ${[variant.color, variant.size].filter(Boolean).join(' / ')}` : ''} · ${selectedCurrency || '—'}`} type="number" min="0.01" step="0.01" value={prices[variant.sku] ?? ''} onChange={(event) => setPrices((current) => ({ ...current, [variant.sku]: event.target.value }))} />)}</div>
      </section>
    </div> : null}

    {latest ? <section aria-label="Tác vụ eBay gần nhất" className="grid gap-2 rounded-control bg-surface-container-low p-3"><div className="flex flex-wrap items-center gap-2"><strong className="text-sm text-on-surface">{operationLabel(latest.operation)}</strong><StatusBadge tone={tone(latest.state)}>{label(latest.state)}</StatusBadge></div>{!wizardMode ? <p className="text-xs text-graphite">Phiên bản Core {latest.product_version} · lần thử {latest.attempt_count} · {formatDate(latest.updated_at)}</p> : null}{latest.safe_error_code ? <><ProductChannelNotice kind="error">{productWriteErrorForCode(latest.safe_error_code) ?? 'Thao tác chưa được xác minh. Hãy kiểm tra lại listing và trạng thái kết nối.'}</ProductChannelNotice>{!wizardMode ? <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => setHistoryOpen(true)}>Xem lần xử lý</Button> : null}</> : null}{['conflict', 'blocked'].includes(latest.state) ? <p className="text-xs leading-5 text-graphite">Thao tác chưa được gửi lại vì kết quả ghi trên kênh chưa rõ. Hãy tải lại trạng thái listing trước khi thử thao tác tiếp theo.</p> : null}</section> : null}
    {!wizardMode ? <>
      <footer className="flex items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
        <span className="text-xs text-graphite">{jobs.length} thao tác</span>
        <Button size="sm" variant="ghost" aria-expanded={historyOpen} aria-controls={`ebay-product-history-${product.id}`} disabled={busy} onClick={() => setHistoryOpen((open) => !open)}>{historyOpen ? 'Ẩn lịch sử' : 'Xem lịch sử'}</Button>
      </footer>
      {historyOpen ? <section id={`ebay-product-history-${product.id}`} className="grid gap-3" aria-label="Lịch sử đăng eBay">
        <h3 className="font-body text-sm font-semibold text-on-surface">Lịch sử thao tác</h3>
        {jobs.length === 0 ? <p className="rounded-lg bg-surface-container-low p-3 text-body-sm text-graphite">Chưa có thao tác nào.</p> : null}
        {jobs.map((job) => <article key={job.id} className="grid gap-2 rounded-lg border border-outline-variant/50 p-3">
          <div className="flex flex-wrap items-center gap-2"><strong className="font-body text-body-sm text-on-surface">{operationLabel(job.operation)}</strong><StatusBadge tone={tone(job.state)}>{label(job.state)}</StatusBadge></div>
          <p className="text-caption text-graphite">{formatDate(job.created_at)} · {job.attempt_count} lần thử · phiên bản Core {job.product_version}</p>
          {job.safe_error_code ? <ProductChannelNotice kind="error">{productWriteErrorForCode(job.safe_error_code) ?? 'Thao tác chưa được xác minh.'} <code className="break-all font-mono">Mã lỗi: {job.safe_error_code}</code></ProductChannelNotice> : null}
        </article>)}
      </section> : null}
    </> : null}
    {!status?.product_publish_enabled && !wizardMode ? <p className="text-xs leading-5 text-graphite">Tài khoản hiện chưa cho phép OctoFlow tạo hoặc cập nhật sản phẩm trên eBay.</p> : null}
    {!wizardMode ? <section className="grid gap-3 rounded-lg bg-channel-paper p-4" aria-label="Thao tác eBay">
      <div className="grid gap-3 lg:grid-cols-2">
        <ProductChannelActionCard title="Thông tin sản phẩm" description="Tạo bản nháp hoặc cập nhật thông tin và giá trên eBay.">
          <Button className="w-full justify-start" disabled={!canDraft} onClick={() => setPending('draft')}>Tạo / cập nhật bản nháp</Button>
          <Button className="w-full justify-start" variant="secondary" disabled={!canSync} onClick={() => setPending('sync')}>Cập nhật thông tin và giá</Button>
          <Button className="w-full justify-start" variant="secondary" disabled={!canPriceSync} onClick={() => setPending('price_sync')}>Cập nhật giá theo SKU</Button>
        </ProductChannelActionCard>
        <ProductChannelActionCard title="Bán hàng" description="Đăng listing lên eBay hoặc tạm dừng bán.">
          <Button className="w-full justify-start" disabled={!canPublish} onClick={() => setPending('publish')}>Đăng bán</Button>
          {state?.publication_state === 'published' ? <Button className="w-full justify-start" variant="danger" disabled={!canWithdraw} onClick={() => setPending('withdraw')}>Ngừng bán</Button> : null}
        </ProductChannelActionCard>
      </div>
    </section> : <p className="border-t border-outline-variant/50 pt-3 text-xs leading-5 text-graphite">Cấu hình này chỉ được gửi khi bạn xác nhận tạo bản nháp ở bước tiếp theo.</p>}
      {categoryAspectsLoading ? <p role="status" className="text-xs leading-5 text-graphite">Đang tải các thuộc tính bắt buộc của danh mục eBay…</p> : null}
      {categoryAspectsError ? <ProductChannelNotice kind="warning">Chưa đọc được yêu cầu của danh mục này từ eBay. Hãy chọn lại danh mục hoặc tải lại trạng thái trước khi tạo bản nháp.</ProductChannelNotice> : null}
      {!catalogReady ? <p className="text-xs leading-5 text-graphite">Cần danh mục đã kiểm tra, ảnh HTTPS công khai, địa điểm gửi đang bật, ba chính sách, currency đúng marketplace và giá riêng cho từng SKU. Ảnh phải truy cập được từ Internet; eBay sẽ kiểm tra lại khi nhận bản nháp.</p> : null}

    <Modal open={pending !== null} onClose={() => { if (!busy) setPending(null); }} title={actionTitle} description="Yêu cầu được gửi qua kết nối eBay hiện có và chỉ hoàn tất sau khi đọc lại trạng thái." footer={<><Button variant="ghost" disabled={busy} onClick={() => setPending(null)}>Hủy</Button><Button loading={busy} variant={pending === 'withdraw' ? 'danger' : 'primary'} onClick={() => void execute(pending)}>Xác nhận</Button></>}>
      <div className="grid gap-2 text-sm leading-6 text-graphite">
        {pending === 'draft' ? <p>OctoFlow sẽ tạo sản phẩm cùng các mẫu mã trên eBay, sau đó đọc lại để xác minh. Số lượng khởi tạo trên eBay là 0; tồn kho vật lý trong OctoFlow không thay đổi.</p> : null}
        {pending === 'sync' ? <p>Chỉ thông tin và giá trên eBay được cập nhật. Số lượng hiện tại trên eBay được giữ nguyên.</p> : null}
        {pending === 'price_sync' ? <p>Giá mới được gửi bằng {selectedCurrency}; tồn kho và thông tin khác không thay đổi. Chỉ xác nhận sau khi đọc lại đúng giá và currency.</p> : null}
        {pending === 'publish' ? <p>Chỉ đăng khi sản phẩm OctoFlow đang hoạt động, mọi SKU được ghép đúng và chính sách bán cùng địa điểm gửi hợp lệ.</p> : null}
        {pending === 'withdraw' ? <p>Sản phẩm sẽ được tạm dừng bán trên eBay. OctoFlow sẽ đọc lại trạng thái trước khi xác nhận; sản phẩm và tồn kho Core không bị xóa.</p> : null}
        {pending === 'create_location' ? <p>Địa chỉ này sẽ được thêm vào tài khoản eBay Sandbox và xác minh trước khi có thể chọn cho sản phẩm.</p> : null}
        {pending === 'enable_location' ? <p>Địa điểm gửi này sẽ được bật trong tài khoản eBay Sandbox để dùng cho listing.</p> : null}
        {pending === 'price_sync' ? <div className="grid gap-1 rounded-control bg-surface-container-low p-3"><strong>{activeVariants.length} SKU · {selectedCurrency}</strong>{activeVariants.map((variant) => <span key={variant.id} className="flex justify-between gap-4"><code>{variant.sku}</code><strong>{prices[variant.sku] || '—'}</strong></span>)}</div> : null}
      </div>
    </Modal>
  </Card>;
}

function PolicySelect({ label: title, items, value, onChange, id, showIds = false }: { label: string; items: Array<{ name: string; paymentPolicyId?: string; fulfillmentPolicyId?: string; returnPolicyId?: string }>; value: string; onChange: (value: string) => void; id: 'paymentPolicyId' | 'fulfillmentPolicyId' | 'returnPolicyId'; showIds?: boolean }) {
  return <Select label={title} value={value} onChange={(event) => onChange(event.target.value)}><option value="">Chọn policy</option>{items.map((item) => {
    const key = item[id]; return key ? <option key={key} value={key}>{item.name}{showIds ? ` · ${key}` : ''}</option> : null;
  })}</Select>;
}

function Fact({ label: title, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return <div className="min-w-0"><dt className="text-[11px] uppercase tracking-wide text-graphite">{title}</dt><dd className={`mt-1 break-all text-sm font-semibold text-on-surface${mono ? ' font-mono' : ''}`}>{value}</dd></div>;
}

function label(value: string): string { return stateLabel[value] ?? 'Đang cập nhật'; }
function operationLabel(value: string): string { return ({ draft: 'Tạo bản nháp', sync: 'Cập nhật danh mục', price_sync: 'Cập nhật giá', publish: 'Đăng bán', withdraw: 'Tạm dừng listing', create_location: 'Tạo địa điểm gửi', enable_location: 'Bật địa điểm gửi' } as Record<string, string>)[value] ?? 'Cập nhật sản phẩm'; }
function generatedLocationKey(name: string): string {
  const slug = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 25) || 'octoflow-location';
  return `${slug}-${Date.now().toString(36).slice(-6)}`;
}
function variantAxis(name: string): 'color' | 'size' | undefined {
  const normalized = name.toLocaleLowerCase('vi');
  if (/color|colour|màu/.test(normalized)) return 'color';
  if (/size|sizing|cỡ|kích|talla|größe|taille/.test(normalized)) return 'size';
  return undefined;
}
function isPublicImageURL(raw: string): boolean {
  try {
    const url = new URL(raw);
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (url.protocol !== 'https:' || url.username || url.password || url.port || !host.includes('.') || host.includes(':')) return false;
    if (['localhost', 'test', 'example', 'invalid'].includes(host) || /\.(?:localhost|local|internal|test|example|invalid)$/.test(host)) return false;
    const octets = host.split('.').map(Number);
    if (octets.length === 4 && octets.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)) {
      const [first, second] = octets;
      if (first === undefined || first === 0 || first === 10 || first === 127 || first >= 224 || (first === 169 && second === 254) || (first === 172 && second !== undefined && second >= 16 && second <= 31) || (first === 192 && second === 168)) return false;
    }
    return true;
  } catch { return false; }
}
function tone(value: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (['published', 'draft', 'verified', 'succeeded'].includes(value)) return 'success';
  if (['sync_pending', 'pending', 'processing', 'retrying', 'verification_pending'].includes(value)) return 'warning';
  if (['conflict', 'blocked', 'failed', 'sync_failed'].includes(value)) return 'danger';
  return 'neutral';
}
function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}
