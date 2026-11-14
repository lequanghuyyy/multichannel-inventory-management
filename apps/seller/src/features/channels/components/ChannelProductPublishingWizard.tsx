import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Channel } from '../../../api/channels';
import { listChannels } from '../../../api/channels';
import { listChannelProducts, type ChannelProduct, type ChannelProductState } from '../../../api/channel-operations';
import { getChannelPrices, getProduct, getProductPublicationHistory, listProductMedia, type ChannelVariantPrice, type ProductMedia } from '../../../api/products';
import { getProductMediaContent } from '../../../api/products';
import { getEbayProductJobs, type EbayProductSyncJob } from '../../../api/ebay';
import { getWooCommerceProductJobs, getWooCommerceProductState, type WooCommerceProductSyncJob } from '../../../api/woocommerce';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Drawer } from '../../../components/ui/Drawer';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Input } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ProductPublicationPanel } from '../../products/components/ProductPublicationPanel';
import { EbayProductPanel } from '../../products/components/EbayProductPanel';
import { WooCommerceProductPanel, wooJobError } from '../../products/components/WooCommerceProductPanel';
import { LazadaProductPreflightPanel, type LazadaSetupSummary } from './LazadaProductPreflightPanel';
import { LazadaPublicationPanel } from './LazadaPublicationPanel';
import { lazadaPriceText } from './lazada-publish.messages';
import { ChannelProductImage } from './ChannelProductImage';
import { toProductApiDetail, type ProductApiDetail } from '../../products/product.detail.api';
import { productWriteErrorMessage } from '../../products/product.write.messages';
import type { PublicationPreview, PublicationRequestResult } from '../../../api/products';
import { listShopifyPublications, type ShopifyPublicationOption } from '../../../api/shopify';
import type { EbayProductSpec } from '../../../api/ebay';
import { createPublicationWorkflow, getPublicationWorkflow, listPublicationWorkflows, previewPublicationWorkflow, retryPublicationWorkflowChannel, type PublicationWorkflowChannelSelection, type PublicationWorkflowDetail, type PublicationWorkflowPreview } from '../../../api/publication-workflows';
import { newIdempotencyKey } from '../../products/product.write';

type Step = 1 | 2 | 3 | 4 | 5;
type JobReceipt = { id: string; state: string };
type ConnectorSubmit = () => Promise<void>;
type WorkflowConfig = { publication_id?: string; ebay_spec?: EbayProductSpec; ready: boolean; reason?: string };

const stepLabels = ['Chọn sản phẩm', 'Kiểm tra', 'Thiết lập bán hàng', 'Xác nhận'];
const filters: Array<{ id: ChannelProductState; label: string }> = [
  { id: 'not_published', label: 'Chưa đăng' },
  { id: 'active', label: 'Đang bán' },
  { id: 'needs_attention', label: 'Cần xử lý' },
];

export function ChannelProductPublishingWizard({
  channel, open, canWrite, initialProduct, onClose, onCompleted,
}: {
  channel: Channel;
  open: boolean;
  canWrite: boolean;
  initialProduct?: ChannelProduct | null;
  onClose: () => void;
  onCompleted: () => void;
}) {
  const [step, setStep] = useState<Step>(initialProduct ? 2 : 1);
  const [workflowMode, setWorkflowMode] = useState(channel.code !== 'lazada');
  const [availableChannels, setAvailableChannels] = useState<Channel[]>([]);
  const [selectedChannelIDs, setSelectedChannelIDs] = useState<string[]>([channel.id]);
  const [selectedVariantIDs, setSelectedVariantIDs] = useState<string[]>([]);
  const [workflowConfigs, setWorkflowConfigs] = useState<Record<string, WorkflowConfig>>({});
  const [shopifyPublications, setShopifyPublications] = useState<ShopifyPublicationOption[]>([]);
  const [shopifyPublicationsError, setShopifyPublicationsError] = useState('');
  const [workflowPreview, setWorkflowPreview] = useState<PublicationWorkflowPreview | null>(null);
  const [workflow, setWorkflow] = useState<PublicationWorkflowDetail | null>(null);
  const [workflowLoading, setWorkflowLoading] = useState(false);
  const [workflowError, setWorkflowError] = useState('');
  const dismissedWorkflowIDs = useRef(new Set<string>());
  const [filter, setFilter] = useState<ChannelProductState>('not_published');
  const [query, setQuery] = useState('');
  const [products, setProducts] = useState<ChannelProduct[]>([]);
  const [nextCursor, setNextCursor] = useState('');
  const nextCursorRef = useRef('');
  const [total, setTotal] = useState(0);
  const [loadingList, setLoadingList] = useState(false);
  const [listError, setListError] = useState<unknown>();
  const [selected, setSelected] = useState<ChannelProduct | null>(initialProduct ?? null);
  const [detail, setDetail] = useState<ProductApiDetail | null>(null);
  const [media, setMedia] = useState<ProductMedia[]>([]);
  const [channelPrices, setChannelPrices] = useState<ChannelVariantPrice[]>([]);
  const [imageURL, setImageURL] = useState('');
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<unknown>();
  const [preview, setPreview] = useState<PublicationPreview | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftBlocker, setDraftBlocker] = useState('');
  const [lazadaReady, setLazadaReady] = useState(false);
  const [lazadaBlocker, setLazadaBlocker] = useState('');
  const [lazadaSummary, setLazadaSummary] = useState<LazadaSetupSummary | null>(null);
  const [receipt, setReceipt] = useState<JobReceipt | null>(null);
  const [progress, setProgress] = useState<{ state: string; detail: string } | null>(null);
  const [progressError, setProgressError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const submitRef = useRef<ConnectorSubmit | null>(null);
  const cachedKey = `octoflow:channel-product-wizard:${channel.id}`;

  useEffect(() => {
    if (!open) return;
    if (initialProduct) {
      setSelected(initialProduct);
      setReceipt(null);
      setStep(2);
      return;
    }
    try {
      const cached = sessionStorage.getItem(cachedKey);
      if (!cached) return;
      const value = JSON.parse(cached) as { product?: ChannelProduct; step?: number; receipt?: JobReceipt | null };
      if (value.product?.product_id) {
        setSelected(value.product);
        setReceipt(value.receipt ?? null);
        setStep(value.receipt ? 4 : ([1, 2, 3, 4].includes(value.step ?? 1) ? value.step : 1) as Step);
      }
    } catch { sessionStorage.removeItem(cachedKey); }
  }, [cachedKey, initialProduct, open]);

  useEffect(() => {
    if (!open) return;
    setWorkflowMode(channel.code !== 'lazada');
    setSelectedChannelIDs([channel.id]);
    setSelectedVariantIDs([]);
    setWorkflowConfigs({});
    setWorkflowPreview(null);
    setWorkflow(null);
    setWorkflowError('');
    const controller = new AbortController();
    void listChannels({ limit: 100 }, controller.signal).then((result) => {
      if (!controller.signal.aborted) setAvailableChannels(result.items.filter((item) => ['shopify', 'ebay', 'woocommerce'].includes(item.code)));
    }).catch(() => { if (!controller.signal.aborted) setAvailableChannels([channel]); });
    return () => controller.abort();
  }, [channel, open]);

  useEffect(() => {
    if (!open || !selected) return;
    sessionStorage.setItem(cachedKey, JSON.stringify({ product: selected, step, receipt }));
  }, [cachedKey, open, receipt, selected, step]);

  const loadProducts = useCallback(async (signal?: AbortSignal, append = false) => {
    setLoadingList(true);
    setListError(undefined);
    if (!append) { nextCursorRef.current = ''; setNextCursor(''); setProducts([]); }
    try {
      const result = await listChannelProducts(channel.id, {
        state: filter,
        q: query.trim() || undefined,
        limit: 25,
        ...(append && nextCursorRef.current ? { cursor: nextCursorRef.current } : {}),
      }, signal);
      if (signal?.aborted) return;
      setProducts((current) => append ? [...current, ...result.products] : result.products);
      nextCursorRef.current = result.next_cursor ?? '';
      setNextCursor(result.next_cursor ?? '');
      setTotal(result.total_count);
    } catch (cause) {
      if (!signal?.aborted) setListError(cause);
    } finally {
      if (!signal?.aborted) setLoadingList(false);
    }
  }, [channel.id, filter, query]);

  useEffect(() => {
    if (!open || step !== 1) return;
    const controller = new AbortController();
    void loadProducts(controller.signal);
    return () => controller.abort();
  }, [loadProducts, open, step]);

  useEffect(() => {
    if (!open || !selected) return;
    const controller = new AbortController();
    let objectURL = '';
    setLoadingDetail(true);
    setDetailError(undefined);
    setDetail(null);
    setMedia([]);
    setChannelPrices([]);
    setImageURL('');
    setPreview(null);
    setDraftReady(false);
    setDraftBlocker('');
    setLazadaReady(false);
    setLazadaBlocker('');
    setLazadaSummary(null);
    setProgress(null);
    setSubmitError('');
    submitRef.current = null;
    void Promise.all([getProduct(selected.product_id, controller.signal), listProductMedia(selected.product_id, controller.signal),
      channel.code === 'shopify' || channel.code === 'woocommerce' ? getChannelPrices(selected.product_id, controller.signal) : Promise.resolve(null)])
      .then(async ([raw, mediaResult, priceResult]) => {
        if (controller.signal.aborted) return;
        const nextDetail = toProductApiDetail(raw);
        setDetail(nextDetail);
        setSelectedVariantIDs(nextDetail.variants.filter((variant) => variant.isActive && variant.variantIsActive && variant.sku.trim()).map((variant) => variant.id));
        setMedia(mediaResult.media);
        setChannelPrices(priceResult?.prices ?? []);
        if (mediaResult.media[0]) {
          const blob = await getProductMediaContent(selected.product_id, mediaResult.media[0].id, controller.signal);
          if (!controller.signal.aborted) {
            objectURL = URL.createObjectURL(blob);
            setImageURL(objectURL);
          }
        }
      })
      .catch((cause: unknown) => { if (!controller.signal.aborted) setDetailError(cause); })
      .finally(() => { if (!controller.signal.aborted) setLoadingDetail(false); });
    return () => {
      controller.abort();
      if (objectURL) URL.revokeObjectURL(objectURL);
    };
  }, [channel.code, open, selected]);

  useEffect(() => {
    if (!open || !workflowMode || !selected?.product_id || workflow) return;
    const controller = new AbortController();
    const productId = selected.product_id;
    void listPublicationWorkflows(productId, controller.signal).then(async (result) => {
      const latest = result.items.find((item) => item.channels.some((entry) => entry.channel_id === channel.id) && !dismissedWorkflowIDs.current.has(item.id));
      if (!latest || controller.signal.aborted) return;
      const saved = await getPublicationWorkflow(productId, latest.id, controller.signal);
      if (!controller.signal.aborted) { setWorkflow(saved); setStep(5); }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setWorkflowError(productWriteErrorMessage(cause, 'Không thể tải tiến trình đăng đa kênh đã lưu.'));
    });
    return () => controller.abort();
  }, [channel.id, open, selected?.product_id, workflow, workflowMode]);

  const channelOptions = useMemo(() => {
    const values = new Map(availableChannels.map((item) => [item.id, item]));
    values.set(channel.id, channel);
    return [...values.values()].filter((item) => ['shopify', 'ebay', 'woocommerce'].includes(item.code))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, [availableChannels, channel]);
  const chosenChannels = useMemo(() => selectedChannelIDs.map((id) => channelOptions.find((item) => item.id === id)).filter((item): item is Channel => Boolean(item)), [channelOptions, selectedChannelIDs]);

  useEffect(() => {
    if (!open || !workflowMode || !chosenChannels.some((item) => item.code === 'shopify')) {
      setShopifyPublications([]);
      setShopifyPublicationsError('');
      return;
    }
    const controller = new AbortController();
    void listShopifyPublications(controller.signal).then((values) => {
      if (controller.signal.aborted) return;
      setShopifyPublications(values);
      if (values.length === 1 && values[0]) {
        const publication = values[0];
        const shopify = chosenChannels.find((item) => item.code === 'shopify');
        if (shopify) setWorkflowConfigs((current) => ({ ...current, [shopify.id]: { ...current[shopify.id], publication_id: publication.id, ready: current[shopify.id]?.ready ?? true } }));
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setShopifyPublicationsError(productWriteErrorMessage(cause, 'Không tải được nơi bán Shopify.'));
    });
    return () => controller.abort();
  }, [chosenChannels, open, workflowMode]);

  useEffect(() => {
    if (!open || !workflow?.id || !detail) return;
    const controller = new AbortController();
    let active = true;
    const refreshWorkflow = async () => {
      try {
        const result = await getPublicationWorkflow(detail.id, workflow.id, controller.signal);
        if (!active || controller.signal.aborted) return;
        setWorkflow(result);
        if (['completed', 'partial_failure', 'failed', 'blocked'].includes(result.state)) active = false;
      } catch (cause) {
        if (active && !controller.signal.aborted) setWorkflowError(productWriteErrorMessage(cause, 'Không thể làm mới tiến trình đăng đa kênh.'));
      }
    };
    void refreshWorkflow();
    const timer = window.setInterval(() => { if (active) void refreshWorkflow(); }, 2000);
    return () => { active = false; controller.abort(); window.clearInterval(timer); };
  }, [detail, open, workflow?.id, workflow?.state]);

  const checks = useMemo(() => {
    if (!detail) return [];
    const variants = detail.variants.filter((item) => item.isActive && item.variantIsActive);
    const requiredVariants = channel.code === 'shopify' ? detail.variants : variants;
    const withSku = requiredVariants.filter((item) => item.sku.trim()).length;
    const pricesByVariant = new Map(channelPrices.filter((item) => item.channel_id === channel.id).map((item) => [item.variant_id, item]));
    const withPrice = requiredVariants.filter((item) => {
      const channelPrice = pricesByVariant.get(item.id);
      if (channel.code !== 'shopify' && channel.code !== 'woocommerce') return item.priceMinor !== null && item.priceMinor > 0;
      if (channelPrice?.currency !== undefined && channelPrice.currency !== detail.currency) return false;
      if (channelPrice?.override_amount === undefined) {
        return detail.currency === 'VND' && item.priceMinor !== null && Number.isSafeInteger(item.priceMinor) && item.priceMinor > 0;
      }
      const amount = Number(channelPrice.override_amount);
      return detail.currency === 'VND' && Number.isSafeInteger(amount) && amount > 0;
    }).length;
    return [
      { label: 'Sản phẩm đang được kinh doanh', ok: detail.status === 'active', note: detail.status === 'active' ? 'Đã sẵn sàng' : 'Cần mở lại sản phẩm trong OctoFlow' },
      { label: 'Có mẫu mã đang hoạt động', ok: variants.length > 0, note: `${variants.length} mẫu mã` },
      { label: 'Mỗi mẫu mã có mã SKU', ok: withSku === requiredVariants.length && requiredVariants.length > 0, note: `${withSku}/${requiredVariants.length} mẫu mã` },
      { label: channel.code === 'shopify' ? 'Mỗi SKU có giá Shopify (giá riêng hoặc Core)' : channel.code === 'woocommerce' ? 'Mỗi SKU có giá WooCommerce (giá riêng hoặc Core)' : 'Mỗi mẫu mã có giá bán', ok: withPrice === requiredVariants.length && requiredVariants.length > 0, note: `${withPrice}/${requiredVariants.length} mẫu mã · ${detail.currency}` },
      { label: 'Có ảnh sản phẩm', ok: media.length > 0, note: media.length ? `${media.length} ảnh trong Core` : 'Chưa thêm ảnh' },
    ];
  }, [channel.code, channel.id, channelPrices, detail, media.length]);
  const checksReady = checks.length > 0 && checks.every((check) => check.ok);

  const close = () => {
    if (receipt || workflow) onCompleted();
    onClose();
  };
  const finish = () => {
    if (workflow) dismissedWorkflowIDs.current.add(workflow.id);
    sessionStorage.removeItem(cachedKey);
    onCompleted();
    setSelected(null); setReceipt(null); setWorkflow(null); setWorkflowPreview(null); setProgress(null); setProgressError(''); setStep(1); setQuery('');
    onClose();
  };

  const choose = (product: ChannelProduct) => {
    setSelected(product);
    setReceipt(null);
    setWorkflow(null);
    setWorkflowPreview(null);
    setStep(2);
  };

  const stepThreeReady = channel.code === 'shopify' ? Boolean(preview?.supported && preview.ready)
    : ['ebay', 'woocommerce'].includes(channel.code) ? draftReady
      : channel.code === 'lazada' ? lazadaReady
        : false;
  const manageMode = Boolean(selected && (selected.listing_count > 0 || selected.state !== 'not_published'));
  const workflowFlow = workflowMode;
  const workflowStepLabels = workflowFlow ? ['Chọn sản phẩm', 'Chọn SKU và kênh', 'Thông tin theo kênh', 'Xem trước phân bổ', 'Xác nhận'] : stepLabels;
  const workflowConfigReady = chosenChannels.length === selectedChannelIDs.length && chosenChannels.every((item) => {
    const config = workflowConfigs[item.id];
    if (item.code === 'shopify') return Boolean(config?.publication_id && shopifyPublications.some((option) => option.id === config.publication_id));
    return Boolean(config?.ready && (item.code !== 'ebay' || config.ebay_spec));
  });

  const receiveEbayWorkflowConfig = useCallback((channelId: string, spec: EbayProductSpec, ready: boolean, reason?: string) => {
    if (!channelId) return;
    setWorkflowConfigs((current) => ({ ...current, [channelId]: { ...current[channelId], ebay_spec: spec, ready, reason } }));
  }, []);
  const receiveWooWorkflowReadiness = useCallback((ready: boolean, reason?: string) => {
    const woo = chosenChannels.find((item) => item.code === 'woocommerce');
    if (!woo) return;
    setWorkflowConfigs((current) => ({ ...current, [woo.id]: { ...current[woo.id], ready, reason } }));
  }, [chosenChannels]);

  const workflowRequest = (): PublicationWorkflowChannelSelection[] => chosenChannels.map((item) => {
    const config = workflowConfigs[item.id];
    return {
      channel_id: item.id,
      ...(item.code === 'shopify' && config?.publication_id ? { publication_id: config.publication_id } : {}),
      ...(item.code === 'ebay' && config?.ebay_spec ? { ebay_spec: config.ebay_spec } : {}),
    };
  });

  const requestWorkflowPreview = async () => {
    if (!detail || !selectedVariantIDs.length || !chosenChannels.length) return;
    setWorkflowLoading(true);
    setWorkflowError('');
    setWorkflowPreview(null);
    try {
      const result = await previewPublicationWorkflow(detail.id, { expected_product_version: detail.productVersion,
        variant_ids: selectedVariantIDs, channels: workflowRequest() });
      setWorkflowPreview(result);
    } catch (cause) {
      setWorkflowError(productWriteErrorMessage(cause, 'Không thể tính phân bổ tồn kho.'));
    } finally { setWorkflowLoading(false); }
  };

  const requestWorkflowCreate = async () => {
    if (!detail || !workflowPreview?.can_start || !selectedVariantIDs.length) return;
    setWorkflowLoading(true);
    setWorkflowError('');
    try {
      const result = await createPublicationWorkflow(detail.id, { expected_product_version: detail.productVersion,
        variant_ids: selectedVariantIDs, channels: workflowRequest(), confirm: true }, newIdempotencyKey('publication-workflow'));
      setWorkflow(result);
      onCompleted();
    } catch (cause) {
      setWorkflowError(productWriteErrorMessage(cause, 'Chưa thể xác nhận quy trình đăng đa kênh.'));
    } finally { setWorkflowLoading(false); }
  };

  const retryWorkflow = async (channelId: string) => {
    if (!detail || !workflow) return;
    setWorkflowLoading(true);
    setWorkflowError('');
    try {
      const result = await retryPublicationWorkflowChannel(detail.id, workflow.id, channelId, newIdempotencyKey('publication-workflow-retry'));
      setWorkflow(result);
    } catch (cause) {
      setWorkflowError(productWriteErrorMessage(cause, 'Không thể thử lại kênh này.'));
    } finally { setWorkflowLoading(false); }
  };

  const toggleChannel = (channelId: string) => {
    setWorkflowPreview(null);
    setWorkflowConfigs((current) => { const next = { ...current }; delete next[channelId]; return next; });
    setSelectedChannelIDs((current) => {
      if (current.includes(channelId)) return current.length > 1 ? current.filter((item) => item !== channelId) : current;
      return current.length < 3 ? [...current, channelId] : current;
    });
  };

  const requestConfirm = async () => {
    if (!submitRef.current || !stepThreeReady || !canWrite) return;
    setSubmitting(true);
    setSubmitError('');
    try { await submitRef.current(); }
    catch (cause) { setSubmitError(productWriteErrorMessage(cause, 'Chưa thể gửi yêu cầu tạo bản nháp. Hãy kiểm tra thông tin rồi thử lại.')); }
    finally { setSubmitting(false); }
  };

  const recordQueued = (next: JobReceipt) => {
    setReceipt(next);
    setProgress({ state: next.state || 'queued', detail: 'Đã tiếp nhận yêu cầu. Đang chờ kênh xử lý và xác minh kết quả.' });
    setStep(4);
    onCompleted();
  };

  const title = workflow ? 'Tiến trình đăng đa kênh' : receipt ? 'Yêu cầu đang được xử lý' : 'Chọn sản phẩm lên kênh bán';

  return <Drawer open={open} onClose={close} title={title} visuallyHiddenTitle className="max-w-5xl p-0">
    <div className="grid gap-5 px-5 pb-6 sm:px-7">
      <ol className={`grid ${workflowFlow ? 'grid-cols-5' : 'grid-cols-4'} gap-2`} aria-label="Các bước đăng sản phẩm">
        {workflowStepLabels.map((label, index) => {
          const value = (index + 1) as Step;
          const active = step === value;
          const complete = step > value || (receipt && value === 4) || (workflow && value === 5 && workflow.state === 'completed');
          return <li key={label} aria-current={active ? 'step' : undefined} className={`min-w-0 border-b-2 py-2 text-[11px] font-semibold leading-4 sm:text-sm ${active ? 'border-octo-ember text-on-surface' : complete ? 'border-badge-progress-text text-badge-progress-text' : 'border-outline-variant text-graphite'}`}>
            <span className="mr-1 inline-grid size-5 place-items-center rounded-full border border-current text-[10px]">{complete ? '✓' : value}</span><span className="hidden sm:inline">{label}</span>
          </li>;
        })}
      </ol>

      {!selected && step === 1 ? <section className="grid gap-4" aria-label="Chọn sản phẩm Core">
        <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">BƯỚC 1</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">Chọn sản phẩm cần đăng bán</h3><p className="mt-1 text-sm leading-5 text-graphite">Dùng thông tin và tồn kho Core sẵn có; không cần nhập lại dữ liệu chung của sản phẩm.</p></div>
        <Input label="Tìm sản phẩm" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tên hoặc mã SKU" leading={<span className="material-symbols-outlined" aria-hidden="true">search</span>} />
        <div className="flex gap-2 overflow-x-auto" role="group" aria-label="Lọc sản phẩm Core">
          {filters.map((item) => <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={`min-h-9 shrink-0 rounded-full border px-3 text-xs font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-octo-ember ${filter === item.id ? 'border-carbon bg-carbon text-pure-white' : 'border-outline-variant bg-pure-white text-on-surface hover:bg-surface-container-low'}`}>{item.label}</button>)}
        </div>
        {loadingList ? <LoadingState label="Đang tìm sản phẩm trong danh mục…" /> : null}
        {!loadingList && listError ? <ErrorState error={listError} retry={() => void loadProducts()} /> : null}
        {!loadingList && !listError && products.length === 0 ? <EmptyState title="Không tìm thấy sản phẩm" detail={filter === 'not_published' ? 'Thử tìm theo tên hoặc SKU. Nếu sản phẩm đã có trên kênh, hãy mở mục Đang bán để quản lý.' : 'Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm.'} /> : null}
        {products.length ? <div className="grid gap-2">
          {products.map((product) => <button key={product.product_id} type="button" onClick={() => choose(product)} className="grid min-w-0 gap-3 rounded-lg border border-outline-variant/70 bg-pure-white p-4 text-left transition-colors hover:border-carbon hover:bg-warm-alabaster focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-octo-ember sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
            <span className="flex min-w-0 items-center gap-3"><ChannelProductImage productId={product.product_id} className="size-12" /><span className="min-w-0"><strong className="block truncate text-sm font-semibold text-on-surface">{product.name}</strong><span className="mt-1 block text-xs text-graphite">{product.master_sku || 'Chưa có SKU'} · {product.variant_count} mẫu mã · {product.currency}</span></span></span>
            <span className="flex items-center justify-between gap-3"><StatusBadge tone={product.state === 'active' ? 'success' : product.state === 'needs_attention' ? 'warning' : 'neutral'}>{productStateLabel(product.state)}</StatusBadge><span className="material-symbols-outlined text-lg" aria-hidden="true">arrow_forward</span></span>
          </button>)}
          {nextCursor ? <Button variant="secondary" size="sm" loading={loadingList} onClick={() => void loadProducts(undefined, true)}>Tải thêm · {products.length}/{total}</Button> : null}
        </div> : null}
      </section> : null}

      {selected && !receipt && !workflow && step >= 2 ? <>
        {step === 2 ? <section className="grid gap-4" aria-label="Kiểm tra thông tin sản phẩm">
          <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">BƯỚC 2</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">{workflowMode ? 'Chọn SKU và kênh đăng bán' : 'Kiểm tra sản phẩm trước khi đăng'}</h3><p className="mt-1 text-sm leading-5 text-graphite">{workflowMode ? 'Chọn tối đa ba kênh. OctoFlow sẽ kiểm tra riêng quyền, kết nối và điều kiện của từng kênh.' : `${channel.name} sẽ nhận thông tin từ sản phẩm gốc trong OctoFlow. Kiểm tra giá, mẫu mã và ảnh trước khi tiếp tục.`}</p></div>
          {channel.code !== 'lazada' ? <label className="flex items-start gap-3 rounded-lg border border-outline-variant bg-pure-white p-3 text-sm leading-5"><input type="checkbox" checked={workflowMode} onChange={(event) => { setWorkflowMode(event.target.checked); setWorkflowPreview(null); setWorkflowConfigs({}); setSelectedChannelIDs(event.target.checked ? [channel.id] : [channel.id]); }} className="mt-1 size-4 accent-octo-ember" /><span><strong className="block text-on-surface">Điều phối đăng và phân bổ tồn theo một quy trình</strong><span className="text-graphite">Tắt lựa chọn này để tiếp tục luồng đăng một kênh hiện có.</span></span></label> : null}
          {loadingDetail ? <LoadingState label="Đang đọc sản phẩm và ảnh từ OctoFlow…" /> : null}
          {detailError ? <ErrorState error={detailError} retry={() => setSelected({ ...selected })} /> : null}
          {detail ? <>
            {workflowMode ? <div className="grid gap-4 rounded-lg border border-sandstone bg-warm-alabaster p-4">
              <div><h4 className="text-sm font-semibold text-on-surface">Kênh đăng bán</h4><p className="mt-1 text-xs leading-5 text-graphite">Chọn một đến ba kênh đã cấu hình trong OctoFlow. Trạng thái cuối được xác minh lại từ connector.</p></div>
              <div className="grid gap-2 sm:grid-cols-3">{channelOptions.map((item) => {
                const checked = selectedChannelIDs.includes(item.id);
                const connected = item.status === 'connected';
                return <label key={item.id} className={`flex min-h-16 items-start gap-3 rounded-lg border p-3 ${checked ? 'border-carbon bg-pure-white' : 'border-outline-variant bg-pure-white/70'}`}>
                  <input type="checkbox" checked={checked} disabled={!checked && selectedChannelIDs.length >= 3} onChange={() => toggleChannel(item.id)} className="mt-1 size-4 accent-octo-ember" />
                  <span className="min-w-0"><strong className="block text-sm text-on-surface">{item.name}</strong><span className={`mt-1 block text-xs ${connected ? 'text-badge-progress-text' : 'text-badge-blocked-text'}`}>{connected ? 'Đã kết nối' : `Cần xác minh kết nối · ${item.status}`}</span></span>
                </label>;
              })}</div>
              <div className="grid gap-2"><h4 className="text-sm font-semibold text-on-surface">SKU cần đăng</h4>{detail.variants.filter((variant) => variant.isActive && variant.variantIsActive && variant.sku.trim()).map((variant) => {
                const checked = selectedVariantIDs.includes(variant.id);
                return <label key={variant.id} className="flex items-center gap-3 rounded-lg border border-outline-variant bg-pure-white px-3 py-2.5 text-sm">
                  <input type="checkbox" checked={checked} onChange={() => { setWorkflowPreview(null); setSelectedVariantIDs((current) => checked ? current.filter((id) => id !== variant.id) : [...current, variant.id]); }} className="size-4 accent-octo-ember" />
                  <span className="min-w-0 flex-1"><strong className="font-mono text-xs text-on-surface">{variant.sku}</strong><span className="ml-2 text-xs text-graphite">{[variant.color || variant.colorDescription, variant.size].filter(Boolean).join(' · ') || 'Mẫu mã mặc định'}</span></span>
                  <span className="shrink-0 text-xs text-graphite">Core ATS {variant.availableToSell.toLocaleString('vi-VN')}</span>
                </label>;
              })}{detail.variants.every((variant) => !(variant.isActive && variant.variantIsActive && variant.sku.trim())) ? <p className="rounded-lg bg-pure-white p-3 text-sm text-badge-blocked-text">Chưa có SKU đang hoạt động kèm mã SKU.</p> : null}</div>
              {selectedChannelIDs.length >= 3 ? <p className="text-xs text-graphite">Đã chọn tối đa ba kênh.</p> : null}
            </div> : null}
            <Card className="grid gap-4 border border-carbon bg-cream-paper p-4 shadow-[5px_5px_0_#000] sm:grid-cols-[136px_minmax(0,1fr)] sm:p-5">
              {imageURL ? <img src={imageURL} alt={detail.name} className="aspect-square w-full rounded-lg border border-outline-variant object-cover sm:size-[136px]" /> : <span className="grid aspect-square w-full place-items-center rounded-lg border border-outline-variant bg-warm-alabaster text-graphite sm:size-[136px]"><span className="material-symbols-outlined text-4xl" aria-hidden="true">inventory_2</span></span>}
              <div className="min-w-0"><p className="text-xs font-semibold uppercase tracking-wide text-graphite">{[detail.brand, detail.category].filter(Boolean).join(' · ') || 'Sản phẩm OctoFlow'}</p><h4 className="mt-1 break-words font-display text-xl font-bold tracking-tight text-on-surface">{detail.name}</h4><p className="mt-1 break-all font-mono text-xs text-graphite">SKU {detail.masterSku || 'Chưa thiết lập'}</p><p className="mt-3 line-clamp-3 text-sm leading-5 text-graphite">{detail.shortDescription || detail.description || 'Chưa có mô tả sản phẩm.'}</p><div className="mt-3 flex flex-wrap gap-2"><StatusBadge tone={detail.status === 'active' ? 'success' : 'warning'}>{detail.status === 'active' ? 'Đang kinh doanh' : 'Cần kiểm tra'}</StatusBadge><StatusBadge tone="neutral">{detail.variantCount} mẫu mã</StatusBadge><StatusBadge tone="neutral">Có thể bán trong Core: {detail.availableToSell.toLocaleString('vi-VN')}</StatusBadge></div></div>
            </Card>
            {!workflowMode ? <div className="grid gap-2 sm:grid-cols-2">
              {checks.map((check) => <div key={check.label} className={`flex items-start gap-3 rounded-lg border p-3 ${check.ok ? 'border-badge-progress-text/30 bg-badge-progress-bg/60' : 'border-badge-blocked-text/25 bg-badge-blocked-bg/50'}`}>
                <span className="material-symbols-outlined mt-0.5 text-base" aria-hidden="true">{check.ok ? 'check_circle' : 'warning'}</span><span className="min-w-0"><strong className="block text-sm text-on-surface">{check.label}</strong><span className="mt-0.5 block text-xs text-graphite">{check.note}</span></span>
              </div>)}
            </div> : null}
            {manageMode ? <p role="status" className="rounded-lg border border-badge-info-text/20 bg-badge-info-bg p-3 text-sm leading-5 text-badge-info-text">Sản phẩm này đã có liên kết trên kênh. Dùng phần quản lý để cập nhật trạng thái, tránh tạo listing trùng.</p> : null}
            {selected.state === 'syncing' ? <p role="status" className="rounded-lg border border-badge-info-text/20 bg-badge-info-bg p-3 text-sm leading-5 text-badge-info-text">Sản phẩm đang được cập nhật. Mở phần quản lý để xem tiến trình và lịch sử thao tác.</p> : null}
            {selected.mapping_state === 'conflict' ? <p role="alert" className="rounded-lg border border-badge-blocked-text/25 bg-badge-blocked-bg p-3 text-sm leading-5 text-badge-blocked-text">Sản phẩm trên kênh có liên kết chưa rõ. Hãy kiểm tra liên kết trước khi gửi để tránh ghi đè hoặc tạo bản trùng.</p> : null}
            {!workflowMode && !manageMode && checks.length > 0 && !checksReady ? <p role="status" className="text-sm leading-5 text-badge-blocked-text">Hoàn tất các mục đang cảnh báo trước khi tiếp tục. {channel.code === 'shopify' ? <a className="font-semibold underline" href={`/products/${detail.id}`}>Mở sản phẩm để thêm ảnh, chuyển sang Đang bán và kiểm tra giá Core hoặc giá riêng</a> : null}</p> : null}
            <WizardFooter onBack={() => { setSelected(null); setReceipt(null); setWorkflow(null); setWorkflowPreview(null); setStep(1); }} onNext={() => setStep(3)} nextLabel={workflowMode ? 'Thiết lập thông tin kênh' : manageMode ? 'Quản lý sản phẩm trên kênh' : 'Tiếp tục'} nextDisabled={loadingDetail || !detail || Boolean(detailError) || (workflowMode ? !selectedVariantIDs.length || !chosenChannels.length : !manageMode && (!checksReady || selected.state === 'syncing' || selected.mapping_state === 'conflict'))} />
          </> : null}
        </section> : null}

        {step === 3 && detail && workflowMode ? <section className="grid gap-4" aria-label="Thiết lập thông tin từng kênh">
          <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">BƯỚC 3</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">Thông tin và điều kiện riêng theo kênh</h3><p className="mt-1 text-sm leading-5 text-graphite">Các panel hiện có được tái sử dụng để kiểm tra cấu hình từng kênh. Chưa có thao tác ghi tồn hoặc tạo sản phẩm ở bước này.</p></div>
          <div className="rounded-lg border border-sandstone bg-warm-alabaster p-3 text-sm leading-5 text-on-surface"><strong>Tồn kho Core:</strong> {detail.onHand.toLocaleString('vi-VN')} trong kho · {detail.reserved.toLocaleString('vi-VN')} đang giữ · {detail.availableToSell.toLocaleString('vi-VN')} có thể bán.</div>
          {!canWrite ? <p role="alert" className="rounded-lg border border-badge-blocked-text/30 bg-badge-blocked-bg p-3 text-sm leading-5 text-badge-blocked-text">Tài khoản của bạn không có quyền đăng sản phẩm lên các kênh.</p> : null}
          {chosenChannels.map((item) => <Card key={item.id} className="grid gap-3 border border-outline-variant p-4">
            <div><h4 className="font-semibold text-on-surface">{item.name}</h4><p className="text-xs text-graphite">{item.status === 'connected' ? 'Kết nối đã sẵn sàng; backend sẽ kiểm tra thêm quyền ghi.' : `Cảnh báo kết nối: ${item.status}`}</p></div>
            {item.code === 'shopify' ? <div className="grid gap-2">
              <label className="grid gap-1 text-sm font-medium text-on-surface">Nơi bán Shopify
                <select value={workflowConfigs[item.id]?.publication_id ?? ''} onChange={(event) => { const publicationID = event.target.value; setWorkflowPreview(null); setWorkflowConfigs((current) => ({ ...current, [item.id]: { ...current[item.id], publication_id: publicationID, ready: Boolean(publicationID) } })); }} disabled={Boolean(shopifyPublicationsError)} className="min-h-11 rounded-control border border-sandstone bg-pure-white px-3 text-sm">
                  <option value="">Chọn nơi bán</option>{shopifyPublications.map((publication) => <option key={publication.id} value={publication.id}>{publication.name}</option>)}
                </select>
              </label>
              {shopifyPublicationsError ? <p role="alert" className="text-sm text-badge-blocked-text">{shopifyPublicationsError}</p> : null}
              {!shopifyPublicationsError && !shopifyPublications.length ? <p role="status" className="text-xs text-graphite">Đang tải hoặc Shopify chưa trả về nơi bán khả dụng.</p> : null}
              <ProductPublicationPanel productId={detail.id} productVersion={detail.productVersion} canWrite={canWrite} channelFilter={item.id} draftOnly wizardMode onDraftPreview={setPreview} />
            </div> : null}
            {item.code === 'ebay' ? <EbayProductPanel product={detail} canWrite={canWrite} initialChannelId={item.id} wizardMode onWorkflowConfigurationChange={receiveEbayWorkflowConfig} /> : null}
            {item.code === 'woocommerce' ? <WooCommerceProductPanel product={detail} canWrite={canWrite} wizardMode onDraftReadinessChange={receiveWooWorkflowReadiness} /> : null}
            {workflowConfigs[item.id]?.reason ? <p role="status" className="text-sm text-badge-blocked-text">{workflowConfigs[item.id]?.reason}</p> : null}
          </Card>)}
          {workflowError ? <p role="alert" className="rounded-lg border border-badge-error-text/20 bg-badge-error-bg p-3 text-sm text-badge-error-text">{workflowError}</p> : null}
          <WizardFooter onBack={() => setStep(2)} onNext={() => { setStep(4); void requestWorkflowPreview(); }} nextLabel="Xem trước phân bổ" nextDisabled={!canWrite || !selectedVariantIDs.length || !workflowConfigReady || workflowLoading} />
        </section> : null}

        {step === 3 && detail && !workflowMode ? <section className="grid gap-4" aria-label="Thiết lập thông tin bán hàng">
          <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">{manageMode ? 'QUẢN LÝ SẢN PHẨM' : 'BƯỚC 3'}</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">{manageMode ? `Quản lý trên ${channel.name}` : `Thiết lập bán hàng trên ${channel.name}`}</h3><p className="mt-1 text-sm leading-5 text-graphite">Dùng dữ liệu Core khi có thể. Cấu hình riêng của kênh không thay đổi giá hoặc tồn kho gốc.</p></div>
          <div className="rounded-lg border border-sandstone bg-warm-alabaster p-3 text-sm leading-5 text-on-surface"><strong>Tồn kho Core:</strong> {detail.onHand.toLocaleString('vi-VN')} trong kho · {detail.reserved.toLocaleString('vi-VN')} đang giữ · {detail.availableToSell.toLocaleString('vi-VN')} có thể bán.</div>
          {!canWrite ? <p role="alert" className="rounded-lg border border-badge-blocked-text/30 bg-badge-blocked-bg p-3 text-sm leading-5 text-badge-blocked-text">Tài khoản của bạn không có quyền tạo sản phẩm trên kênh này.</p> : null}
          {channel.code === 'shopify' ? <ProductPublicationPanel productId={detail.id} productVersion={detail.productVersion} canWrite={canWrite} channelFilter={channel.id} draftOnly={!manageMode} wizardMode={!manageMode} readOnlyWhileProcessing={selected.state === 'syncing'} onDraftPreview={setPreview} onDraftSubmitReady={(submit) => { submitRef.current = submit; }} onDraftQueued={(result: Pick<PublicationRequestResult, 'id' | 'state'>) => recordQueued({ id: result.id, state: result.state })} /> : null}
          {channel.code === 'ebay' ? <EbayProductPanel product={detail} canWrite={canWrite} initialChannelId={channel.id} wizardMode={!manageMode} onDraftReadinessChange={(ready, reason) => { setDraftReady(ready); setDraftBlocker(reason ?? ''); }} onDraftSubmitReady={(submit) => { submitRef.current = submit; }} onDraftQueued={(job: EbayProductSyncJob) => recordQueued({ id: job.id, state: job.state })} /> : null}
          {channel.code === 'woocommerce' ? <WooCommerceProductPanel product={detail} canWrite={canWrite} wizardMode={!manageMode} onDraftReadinessChange={(ready, reason) => { setDraftReady(ready); setDraftBlocker(reason ?? ''); }} onDraftSubmitReady={(submit) => { submitRef.current = submit; }} onDraftQueued={(job: WooCommerceProductSyncJob) => recordQueued({ id: job.id, state: job.state })} /> : null}
          {channel.code === 'lazada' ? <LazadaProductPreflightPanel
            key={detail.id}
            channelId={channel.id}
            product={detail}
            canWrite={canWrite}
            onReadinessChange={(ready, blocker) => { setLazadaReady(ready); setLazadaBlocker(blocker ?? ''); }}
            onSubmitReady={(submit) => { submitRef.current = submit; }}
            onSummaryChange={setLazadaSummary}
            onQueued={(result) => recordQueued({ id: result.job.id, state: result.job.state })}
            onSaved={() => onCompleted()}
          /> : null}
          {!['shopify', 'ebay', 'woocommerce', 'lazada'].includes(channel.code) ? <p className="rounded-lg border border-sandstone bg-warm-alabaster p-4 text-sm leading-5 text-graphite">Kênh này chưa có luồng tạo bản nháp đã xác minh.</p> : null}
          {channel.code !== 'shopify' && channel.code !== 'lazada' && !draftReady && draftBlocker ? <p role="status" className="text-sm leading-5 text-badge-blocked-text">{draftBlocker}</p> : null}
          {channel.code === 'lazada' && !lazadaReady && lazadaBlocker ? <p role="status" className="text-sm leading-5 text-badge-blocked-text">{lazadaBlocker}</p> : null}
          {channel.code === 'lazada' ? <WizardFooter onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel={manageMode ? 'Tiếp tục cập nhật Lazada' : 'Tiếp tục xác nhận'} nextDisabled={!stepThreeReady || !canWrite || !submitRef.current} /> : !manageMode ? <WizardFooter onBack={() => setStep(2)} onNext={() => setStep(4)} nextLabel="Tiếp tục xác nhận" nextDisabled={!stepThreeReady || !canWrite || !submitRef.current} /> : null}
        </section> : null}

        {step === 4 && !workflowMode && !receipt && detail ? <section className="grid gap-4" aria-label={channel.code === 'lazada' ? 'Xác nhận đăng Lazada' : 'Xác nhận tạo bản nháp'}>
          <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">BƯỚC 4</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">{channel.code === 'lazada' ? manageMode ? 'Xác nhận cập nhật listing Lazada' : 'Xác nhận đăng sản phẩm lên Lazada' : `Xác nhận tạo bản nháp trên ${channel.name}`}</h3>{channel.code === 'lazada' ? <p className="mt-1 text-sm leading-5 text-graphite">Kiểm tra lần cuối thông tin Lazada. Yêu cầu chỉ được coi là tiếp nhận; trạng thái bán chỉ xác nhận sau khi Lazada duyệt và OctoFlow đọc lại.</p> : null}</div>
          {channel.code === 'lazada' ? <Card className="grid gap-4 border border-carbon bg-cream-paper p-4 shadow-[5px_5px_0_#000] sm:grid-cols-[72px_minmax(0,1fr)]">
            {imageURL ? <img src={imageURL} alt="" className="size-[72px] rounded-lg border border-outline-variant object-cover" /> : <span className="grid size-[72px] place-items-center rounded-lg border border-outline-variant bg-warm-alabaster"><span className="material-symbols-outlined" aria-hidden="true">inventory_2</span></span>}
            <div className="min-w-0">
              <h4 className="break-words font-display text-lg font-bold text-on-surface">{detail.name}</h4>
              <p className="mt-1 text-sm text-graphite">{lazadaSummary?.skuCount ?? detail.variantCount} SKU · {lazadaSummary?.categoryPath || 'Chưa chọn ngành hàng Lazada'}</p>
              <dl className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <div><dt className="text-xs text-graphite">Thương hiệu</dt><dd className="font-semibold text-on-surface">{lazadaSummary?.brandName || 'Chưa chọn'}</dd></div>
                <div><dt className="text-xs text-graphite">Ảnh Lazada sẵn sàng</dt><dd className="font-semibold text-on-surface">{lazadaSummary?.imageReady ?? 0}/{lazadaSummary?.imageTotal ?? 0} ảnh</dd></div>
                <div><dt className="text-xs text-graphite">Thao tác</dt><dd className="font-semibold text-on-surface">{lazadaSummary?.operation === 'update' ? 'Cập nhật listing hiện có' : 'Tạo sản phẩm mới'}</dd></div>
                <div><dt className="text-xs text-graphite">Kiện hàng</dt><dd className="font-semibold text-on-surface">{lazadaSummary?.packageReady ? 'Đã đủ số đo từ Core hoặc thiết lập riêng' : 'Còn thiếu số đo kiện hàng'}</dd></div>
                <div><dt className="text-xs text-graphite">Thuộc tính bắt buộc</dt><dd className="font-semibold text-on-surface">{lazadaSummary?.attributesReady ? 'Đã đủ ngành hàng, thương hiệu và thuộc tính' : 'Còn thiếu thông tin bắt buộc'}</dd></div>
                <div><dt className="text-xs text-graphite">Thông tin Lazada override</dt><dd className="font-semibold text-on-surface">{lazadaSummary?.attributeOverrideCount ?? 0} thuộc tính · {lazadaSummary?.packageOverrideCount ?? 0} kiện hàng</dd></div>
              </dl>
              {lazadaSummary?.prices.length ? <div className="mt-3 grid gap-1 rounded-lg border border-outline-variant/60 bg-pure-white p-3">
                <p className="text-xs font-semibold text-on-surface">Giá gửi Lazada</p>
                {lazadaSummary.prices.map((price) => <div key={price.sku} className="flex flex-wrap items-center justify-between gap-2 text-xs"><span className="font-mono text-on-surface">{price.sku}</span><span className="tabular-nums text-graphite">{lazadaPriceText(price.amount, price.currency)}</span></div>)}
              </div> : null}
              <p className="mt-3 text-xs leading-5 text-graphite">Tạo listing mới không ghi tồn kho Lazada. Sản phẩm mới được gửi với số lượng 0; tồn chỉ đồng bộ khi chính sách tồn Lazada được mở.</p>
            </div>
          </Card> : <Card className="grid gap-4 border border-carbon bg-cream-paper p-4 shadow-[5px_5px_0_#000] sm:grid-cols-[72px_minmax(0,1fr)]">
            {imageURL ? <img src={imageURL} alt="" className="size-[72px] rounded-lg border border-outline-variant object-cover" /> : <span className="grid size-[72px] place-items-center rounded-lg border border-outline-variant bg-warm-alabaster"><span className="material-symbols-outlined" aria-hidden="true">inventory_2</span></span>}
            <div className="min-w-0"><h4 className="break-words font-display text-lg font-bold text-on-surface">{detail.name}</h4><p className="mt-1 text-sm text-graphite">{detail.variantCount} mẫu mã · Giá Core {detail.currency} · Trạng thái ban đầu: Bản nháp</p><p className="mt-2 text-xs leading-5 text-graphite">Sản phẩm chưa mở bán cho khách. Tồn vật lý trong OctoFlow không thay đổi; mọi lượng khởi tạo trên kênh tuân theo chính sách riêng của connector.</p></div>
          </Card>}
          {channel.code === 'shopify' && preview?.issues.length ? <div className="rounded-lg border border-sandstone bg-warm-alabaster p-3 text-sm leading-5 text-graphite">{preview.issues.map((issue, index) => <p key={`${issue.code}-${index}`}>{shopifyIssueText(issue.code)}</p>)}</div> : null}
          {submitError ? <p role="alert" className="rounded-lg border border-badge-error-text/20 bg-badge-error-bg p-3 text-sm text-badge-error-text">{submitError}</p> : null}
          <div className="flex flex-col-reverse justify-between gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row"><Button variant="secondary" onClick={() => setStep(3)} disabled={submitting}>Quay lại chỉnh sửa</Button><Button loading={submitting} disabled={!canWrite || !stepThreeReady || !submitRef.current || submitting} onClick={() => void requestConfirm()}>{channel.code === 'lazada' ? manageMode ? 'Xác nhận cập nhật Lazada' : 'Xác nhận đăng Lazada' : `Tạo bản nháp trên ${channel.name}`}</Button></div>
        </section> : null}
      </> : null}

      {selected && !workflow && workflowMode && step === 4 && detail ? <section className="grid gap-4" aria-label="Xem trước phân bổ tồn kho">
        <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">BƯỚC 4</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">Xem trước phân bổ tồn kho</h3><p className="mt-1 text-sm leading-5 text-graphite">Bản xem trước chỉ tính toán. Chưa tạo sản phẩm, sync job hoặc thay đổi tồn trên Core hay nền tảng.</p></div>
        {workflowLoading && !workflowPreview ? <LoadingState label="Đang kiểm tra phiên bản Core, listing và chính sách phân bổ…" /> : null}
        {workflowError ? <p role="alert" className="rounded-lg border border-badge-error-text/20 bg-badge-error-bg p-3 text-sm text-badge-error-text">{workflowError}</p> : null}
        {workflowPreview ? <>
          <Card className="grid gap-3 border border-carbon bg-cream-paper p-4 shadow-[5px_5px_0_#000]">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-display text-lg font-bold text-on-surface">{workflowPreview.product_name}</h4><p className="text-xs text-graphite">Phiên bản Core {workflowPreview.product_version} · {workflowPreview.currency} · {workflowPreview.selected_variant_ids.length} SKU được chọn</p></div><StatusBadge tone={workflowPreview.can_start ? 'success' : 'warning'}>{workflowPreview.can_start ? 'Có thể xác nhận' : 'Cần xử lý điều kiện'}</StatusBadge></div>
            <div className="grid gap-2 sm:grid-cols-3">{workflowPreview.channels.map((item) => <div key={item.channel_id} className="rounded-lg border border-outline-variant bg-pure-white p-3"><div className="flex items-center justify-between gap-2"><strong className="text-sm text-on-surface">{item.channel_name}</strong><StatusBadge tone={item.ready && item.connection_verified ? 'success' : 'warning'}>{item.ready && item.connection_verified ? 'Sẵn sàng' : 'Cần kiểm tra'}</StatusBadge></div><p className="mt-1 text-xs text-graphite">{item.channel_code} · {item.environment} · {item.channel_status}</p>{item.issues.map((issue, index) => <p key={`${issue.code}-${index}`} className="mt-1 text-xs leading-4 text-badge-blocked-text">{issue.message}</p>)}</div>)}</div>
          </Card>
          {workflowPreview.allocations.map((allocation) => <article key={allocation.variant_id} className="grid gap-2 rounded-lg border border-outline-variant bg-pure-white p-4">
            <div className="flex flex-wrap items-center justify-between gap-2"><h4 className="font-mono text-sm font-semibold text-on-surface">{allocation.sku}</h4><span className="text-xs text-graphite">ATS {allocation.available_to_sell} · {allocation.policy_type || 'chính sách mặc định'}</span></div>
            <div className="grid gap-2">{allocation.items.map((item) => <div key={item.listing_id} className="grid gap-1 rounded-lg bg-warm-alabaster p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div><strong className="text-sm text-on-surface">{workflowPreview.channels.find((candidate) => candidate.channel_id === item.channel_id)?.channel_name ?? item.channel_code}</strong><p className="text-xs text-graphite">{item.already_listed ? 'Listing hiện có' : item.selected ? 'Listing sẽ được tạo' : item.participating ? 'Đang tham gia phân bổ' : 'Không tham gia phân bổ'}{item.issues.length ? ` · ${item.issues.join(', ')}` : ''}</p></div><span className="text-xs text-graphite">Hiện tại {item.current_target === undefined ? '—' : item.current_target}</span><strong className="text-sm text-on-surface">Dự kiến {item.proposed_target}{item.delta === undefined ? '' : ` · ${item.delta > 0 ? '+' : ''}${item.delta}`}</strong></div>)}</div>
            {!allocation.can_execute ? <p className="text-xs leading-5 text-badge-blocked-text">{allocation.issues.join(' · ')}</p> : null}
          </article>)}
          {workflowPreview.blockers.length ? <div role="alert" className="grid gap-1 rounded-lg border border-badge-blocked-text/25 bg-badge-blocked-bg p-3 text-sm text-badge-blocked-text">{workflowPreview.blockers.map((blocker, index) => <p key={`${blocker.code}-${blocker.channel_id ?? ''}-${blocker.variant_id ?? ''}-${index}`}>{blocker.message}</p>)}</div> : null}
        </> : null}
        <div className="flex flex-col-reverse justify-between gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row"><Button variant="secondary" disabled={workflowLoading} onClick={() => setStep(3)}>Quay lại cấu hình</Button><div className="flex flex-col-reverse gap-2 sm:flex-row"><Button variant="secondary" loading={workflowLoading} onClick={() => void requestWorkflowPreview()}>Tính lại preview</Button><Button disabled={!workflowPreview?.can_start || workflowLoading} onClick={() => setStep(5)}>Tiếp tục xác nhận</Button></div></div>
      </section> : null}

      {selected && !workflow && workflowMode && step === 5 && detail ? <section className="grid gap-4" aria-label="Xác nhận đăng đa kênh">
        <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">BƯỚC 5</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">Xác nhận quy trình đăng đa kênh</h3><p className="mt-1 text-sm leading-5 text-graphite">OctoFlow sẽ xử lý từng kênh độc lập, xác minh sản phẩm trước khi bắt đầu cấp tồn theo kế hoạch.</p></div>
        <Card className="grid gap-3 border border-carbon bg-cream-paper p-4 shadow-[5px_5px_0_#000]">
          <div><h4 className="font-display text-lg font-bold text-on-surface">{detail.name}</h4><p className="text-sm text-graphite">{selectedVariantIDs.length} SKU · {chosenChannels.map((item) => item.name).join(', ')}</p></div>
          <div className="grid gap-2">{workflowPreview?.allocations.map((allocation) => <div key={allocation.variant_id} className="rounded-lg border border-outline-variant bg-pure-white p-3"><strong className="font-mono text-xs text-on-surface">{allocation.sku}</strong><div className="mt-2 flex flex-wrap gap-2">{allocation.items.map((item) => <StatusBadge key={item.listing_id} tone={item.eligible ? 'neutral' : 'warning'}>{item.channel_code}: {item.proposed_target}</StatusBadge>)}</div></div>)}</div>
          <p className="text-xs leading-5 text-graphite">Khi xác nhận, backend lưu workflow bền vững. Connector sẽ tạo hoặc xác minh listing; Allocation Orchestrator chỉ cấp quota theo thứ tự an toàn sau khi listing sẵn sàng.</p>
        </Card>
        {workflowError ? <p role="alert" className="rounded-lg border border-badge-error-text/20 bg-badge-error-bg p-3 text-sm text-badge-error-text">{workflowError}</p> : null}
        <div className="flex flex-col-reverse justify-between gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row"><Button variant="secondary" disabled={workflowLoading} onClick={() => setStep(4)}>Quay lại preview</Button><Button loading={workflowLoading} disabled={!workflowPreview?.can_start} onClick={() => void requestWorkflowCreate()}>Xác nhận đăng lên {chosenChannels.length} kênh</Button></div>
      </section> : null}

      {workflow && detail ? <section className="grid gap-4" aria-label="Tiến trình đăng đa kênh">
        <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">TIẾN TRÌNH CHUNG</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">{detail.name}</h3><p className="mt-1 text-sm leading-5 text-graphite">Workflow {workflow.id} · phiên bản Core {workflow.product_version} · trạng thái {workflowStateLabel(workflow.state)}</p></div>
        {workflowError ? <p role="alert" className="rounded-lg border border-badge-error-text/20 bg-badge-error-bg p-3 text-sm text-badge-error-text">{workflowError}</p> : null}
        <div className="grid gap-3">{workflow.channels.map((item) => <article key={item.channel_id} className="grid gap-2 rounded-lg border border-outline-variant bg-pure-white p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><div><div className="flex flex-wrap items-center gap-2"><h4 className="font-semibold text-on-surface">{item.channel_name}</h4><StatusBadge tone={['verified', 'published'].includes(item.state) ? 'success' : ['failed', 'blocked'].includes(item.state) ? 'danger' : 'warning'}>{workflowStateLabel(item.state)}</StatusBadge></div><p className="mt-1 text-xs text-graphite">{item.channel_code} · {item.last_error_code || item.last_error_message || 'Đang theo dõi xác minh từ connector'}</p>{item.draft_job_id || item.draft_request_id ? <p className="mt-1 break-all font-mono text-[11px] text-graphite">Tác vụ nháp: {item.draft_job_id || item.draft_request_id}</p> : null}</div>{workflow.can_retry && ['failed', 'blocked'].includes(item.state) ? <Button size="sm" variant="secondary" loading={workflowLoading} disabled={workflowLoading} onClick={() => void retryWorkflow(item.channel_id)}>Thử lại kênh này</Button> : null}</article>)}</div>
        <div className="grid gap-2 rounded-lg border border-sandstone bg-warm-alabaster p-4"><h4 className="text-sm font-semibold text-on-surface">Phân bổ từng SKU</h4>{workflow.variants.map((variant) => <div key={variant.variant_id} className="rounded-lg bg-pure-white p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-xs text-on-surface">{variant.sku}</strong><StatusBadge tone={variant.allocation_state === 'completed' || variant.allocation_state === 'verified' ? 'success' : ['failed', 'blocked'].includes(variant.allocation_state) ? 'danger' : 'warning'}>{workflowStateLabel(variant.allocation_state)}</StatusBadge></div><p className="mt-1 text-xs text-graphite">ATS {variant.available_to_sell} · Core v{variant.core_version} · Allocation r{variant.allocation_revision}{variant.allocation_plan_id ? ` · plan ${variant.allocation_plan_id}` : ''}</p>{variant.last_error_code || variant.last_error_message ? <p className="mt-1 text-xs text-badge-blocked-text">{variant.last_error_code} {variant.last_error_message}</p> : null}</div>)}</div>
        {workflow.state === 'blocked' && workflow.variants.some((variant) => variant.allocation_state === 'blocked') ? <p role="alert" className="rounded-lg border border-badge-blocked-text/25 bg-badge-blocked-bg p-3 text-sm leading-5 text-badge-blocked-text">Kế hoạch phân bổ đã dừng để bảo vệ tồn kho. Kiểm tra tồn thực tế và nguyên nhân trong <a className="font-semibold underline" href={`/products/${detail.id}?tab=operations&allocation=1`}>trang phân bổ tồn</a>, rồi tạo kế hoạch mới từ dữ liệu hiện tại.</p> : null}
        <details className="rounded-lg border border-outline-variant p-3"><summary className="cursor-pointer text-sm font-semibold text-on-surface">Lịch sử workflow · {workflow.events.length} sự kiện</summary><ol className="mt-3 grid gap-2">{workflow.events.map((event) => <li key={event.id} className="border-l-2 border-outline-variant pl-3"><p className="text-xs font-semibold text-on-surface">{event.event_type}</p><p className="text-xs leading-5 text-graphite">{event.message} · {new Date(event.created_at).toLocaleString('vi-VN')}</p></li>)}</ol></details>
        {['completed', 'partial_failure', 'failed', 'blocked'].includes(workflow.state) ? <div className="flex flex-wrap justify-end gap-2 border-t border-outline-variant/60 pt-4"><Button variant="secondary" onClick={() => { dismissedWorkflowIDs.current.add(workflow.id); setWorkflow(null); setWorkflowPreview(null); setStep(2); }}>Tạo quy trình mới</Button><Button variant="secondary" onClick={finish}>{workflow.state === 'completed' ? 'Hoàn tất' : 'Đóng tiến trình'}</Button></div> : <p role="status" className="text-xs text-graphite">Trang sẽ tự cập nhật tiến trình định kỳ. Chưa thể đánh dấu hoàn tất trước khi connector và phân bổ được xác minh.</p>}
      </section> : null}

      {receipt && detail ? (channel.code === 'lazada' ? <section className="grid gap-4" aria-label="Tiến trình đăng Lazada">
        <div>
          <p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-octo-ember">TIẾN TRÌNH LAZADA</p>
          <h3 className="mt-1 font-display text-xl font-bold text-on-surface">{detail.name}</h3>
          <p className="mt-1 text-sm leading-5 text-graphite">Yêu cầu đã được tiếp nhận. OctoFlow đọc lại trạng thái từ Lazada; chỉ trạng thái “Đang bán” mới là đăng thành công.</p>
        </div>
        <LazadaPublicationPanel
          channelId={channel.id}
          productId={detail.id}
          currency={detail.currency}
          canWrite={canWrite}
          onEditFields={() => { setReceipt(null); setStep(3); }}
          refreshToken={0}
        />
        <div className="flex flex-col-reverse justify-end gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row">
          <Button variant="secondary" onClick={finish}>Về danh sách sản phẩm</Button>
        </div>
      </section> : <ProgressTracker channel={channel} productId={detail.id} receipt={receipt} setProgress={setProgress} setProgressError={setProgressError}>
        <Card className="grid gap-3 border border-carbon bg-cream-paper p-5 shadow-[5px_5px_0_#000]">
          <StatusBadge tone={isProgressSuccess(progress?.state) ? 'success' : ['failed', 'sync_failed', 'preflight_failed', 'conflict', 'blocked'].includes(progress?.state ?? '') ? 'danger' : 'warning'}>{progress ? progressStateLabel(progress.state) : 'Đang cập nhật'}</StatusBadge>
          <h3 className="font-display text-xl font-bold text-on-surface">{isDraftCreated(progress?.state) ? 'Đã tạo và xác minh bản nháp' : progress?.state === 'published' ? 'Kênh đã xác nhận trạng thái đang bán' : ['failed', 'sync_failed', 'preflight_failed', 'conflict', 'blocked'].includes(progress?.state ?? '') ? 'Chưa thể hoàn tất' : 'Đang tạo sản phẩm trên kênh'}</h3>
          <p className="text-sm leading-5 text-graphite">{progress?.detail ?? 'Đang đọc trạng thái mới nhất từ kênh.'}</p>
          {progressError ? <p role="alert" className="text-sm text-badge-blocked-text">{progressError}</p> : null}
          <p className="border-t border-outline-variant/60 pt-3 text-sm font-semibold text-on-surface">{detail.name} · {detail.variantCount} mẫu mã</p>
          <p className="text-xs leading-5 text-graphite">Kết quả chỉ được xác nhận khi trạng thái từ connector đã được đọc lại. Tồn Core không bị thay đổi.</p>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={finish}>{progress && ['failed', 'sync_failed', 'preflight_failed', 'conflict', 'blocked'].includes(progress.state) ? 'Về danh sách để xử lý' : 'Về danh sách sản phẩm'}</Button></div>
        </Card>
      </ProgressTracker>) : null}
    </div>
  </Drawer>;
}

function WizardFooter({ onBack, onNext, nextLabel, nextDisabled }: { onBack: () => void; onNext: () => void; nextLabel: string; nextDisabled: boolean }) {
  return <div className="flex flex-col-reverse justify-between gap-2 border-t border-outline-variant/60 pt-4 sm:flex-row"><Button variant="secondary" onClick={onBack}>Quay lại</Button><Button disabled={nextDisabled} onClick={onNext}>{nextLabel}</Button></div>;
}

function ProgressTracker({ channel, productId, receipt, setProgress, setProgressError, children }: {
  channel: Channel; productId: string; receipt: JobReceipt;
  setProgress: (value: { state: string; detail: string }) => void; setProgressError: (value: string) => void;
  children: React.ReactNode;
}) {
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      let shouldPoll = true;
      try {
      let item: { state: string; error?: string; detail?: string } | undefined;
        if (channel.code === 'shopify') {
          const history = await getProductPublicationHistory(productId, channel.id);
          const request = history.requests.find((entry) => entry.id === receipt.id);
          item = request ? { state: request.state, error: request.last_error_code } : undefined;
        } else if (channel.code === 'ebay') {
          const jobs = await getEbayProductJobs(channel.id, productId);
          const job = jobs.find((entry) => entry.id === receipt.id);
          item = job ? { state: job.state, error: job.safe_error_code } : undefined;
        } else if (channel.code === 'woocommerce') {
          const jobs = await getWooCommerceProductJobs(productId);
          const job = jobs.find((entry) => entry.id === receipt.id);
          if (job?.state === 'succeeded') {
            const remote = await getWooCommerceProductState(productId);
            item = remote.publication_state === 'draft'
              ? { state: 'draft', detail: 'WooCommerce đã xác nhận sản phẩm ở trạng thái bản nháp.' }
              : remote.publication_state === 'published'
                ? { state: 'conflict', detail: 'Sản phẩm vẫn đang bán trên WooCommerce. Chưa tạo được bản nháp; hãy kiểm tra liên kết trước khi thao tác tiếp.' }
                : { state: 'conflict', detail: 'Tác vụ đã chạy nhưng trạng thái sản phẩm trên WooCommerce chưa được xác minh là bản nháp.' };
          } else item = job ? { state: job.state, error: job.safe_error_code } : undefined;
        }
        if (cancelled) return;
        if (!item) {
          setProgressError('Chưa đọc lại được tiến trình. Yêu cầu vẫn được giữ; hãy thử tải lại trạng thái.');
        } else {
          setProgressError('');
          setProgress({ state: item.state, detail: item.detail ?? (item.error ? channel.code === 'woocommerce' ? `${wooJobError(item.error)} (${item.error})` : 'Kênh chưa xác minh được sản phẩm. Kiểm tra thông tin rồi thử lại.' : progressDetail(item.state)) });
          shouldPoll = !['succeeded', 'verified', 'completed', 'draft', 'published', 'failed', 'sync_failed', 'preflight_failed', 'conflict', 'blocked'].includes(item.state);
        }
      } catch {
        if (!cancelled) setProgressError('Không thể đọc trạng thái mới nhất từ kênh. Yêu cầu chưa được đánh dấu hoàn tất.');
      }
      if (!cancelled && shouldPoll) timer = setTimeout(read, 3000);
    };
    void read();
    return () => { cancelled = true; if (timer) clearTimeout(timer); };
  }, [channel.code, channel.id, productId, receipt.id, setProgress, setProgressError]);
  return <>{children}</>;
}

function productStateLabel(state: string) {
  return ({ not_published: 'Chưa đăng', draft: 'Bản nháp', syncing: 'Đang xử lý', active: 'Đang bán', needs_attention: 'Cần xử lý', stopped: 'Đã ngừng bán' } as Record<string, string>)[state] ?? 'Đang cập nhật';
}

function progressStateLabel(state: string) {
  return ({ queued: 'Đã tiếp nhận', pending: 'Đang chờ', publishing: 'Đang xử lý', processing: 'Đang xử lý', retrying: 'Đang thử lại', succeeded: 'Đã xác minh', verified: 'Đã xác minh', completed: 'Đã xác minh', draft: 'Đã tạo bản nháp', published: 'Đang bán', failed: 'Thất bại', sync_failed: 'Đồng bộ thất bại', preflight_failed: 'Cần bổ sung thông tin', conflict: 'Cần đối soát', blocked: 'Cần xử lý' } as Record<string, string>)[state] ?? 'Đang cập nhật';
}

function workflowStateLabel(state: string) {
  return ({ queued: 'Đang chờ', checking: 'Đang kiểm tra', preparing: 'Đang tạo bản nháp', prepared: 'Bản nháp đã xác minh', publishing: 'Đang đăng', published: 'Đã đăng', verified: 'Đã xác minh', allocating: 'Đang phân bổ tồn', completed: 'Hoàn tất', partial_failure: 'Hoàn tất một phần', failed: 'Thất bại', blocked: 'Cần xử lý', stale: 'Cần xem lại', pending: 'Đang chờ', running: 'Đang chạy', superseded: 'Đã được thay thế' } as Record<string, string>)[state] ?? state;
}

function isDraftCreated(state?: string) { return ['succeeded', 'verified', 'completed', 'draft'].includes(state ?? ''); }
function isProgressSuccess(state?: string) { return isDraftCreated(state) || state === 'published'; }

function progressDetail(state: string) {
  if (['succeeded', 'verified', 'draft'].includes(state)) return 'Connector đã đọc lại và xác minh sản phẩm trên kênh.';
  if (['failed', 'sync_failed', 'conflict', 'blocked'].includes(state)) return 'Không thể xác minh sản phẩm. Xem lại thông tin ở bước thiết lập trước khi gửi lại.';
  return 'Yêu cầu đã được tiếp nhận. Connector đang tạo sản phẩm và sẽ đọc lại kết quả trước khi hoàn tất.';
}

function shopifyIssueText(code: string) {
  const messages: Record<string, string> = {
    CHANNEL_NOT_CONNECTED: 'Shopify chưa được kết nối. Hãy kiểm tra kết nối trước khi đăng.',
    SHOPIFY_CONNECTION_NOT_VERIFIED: 'Chưa xác minh được cửa hàng Shopify.',
    SHOPIFY_PRODUCT_WRITE_SCOPE_MISSING: 'Tài khoản chưa cho phép OctoFlow tạo sản phẩm trên Shopify.',
    SHOPIFY_PUBLICATION_SCOPE_MISSING: 'Shopify chưa cấp quyền write_publications để thay đổi nơi sản phẩm hiển thị. Cập nhật quyền app rồi xác minh lại kết nối.',
    PRODUCT_NOT_PUBLISHABLE: 'Hãy chuyển sản phẩm sang Đang bán trong mục Vòng đời và tác vụ danh mục.',
    CURRENCY_MISMATCH: 'Đơn vị tiền tệ sản phẩm chưa khớp với cửa hàng Shopify.',
    PRODUCT_VARIANTS_REQUIRED: 'Thêm ít nhất một mẫu mã có thể bán trước khi tạo bản nháp.',
    PRODUCT_VARIANTS_INCOMPLETE: 'Một số mẫu mã còn thiếu SKU hoặc giá.',
    PRODUCT_IMAGE_REQUIRED: 'Hãy thêm ít nhất một ảnh sản phẩm trước khi tạo bản nháp Shopify.',
    SHOPIFY_CHANNEL_PRICE_REQUIRED: 'Giá hiệu lực của từng SKU cần lớn hơn 0; Shopify có thể dùng giá Core hoặc giá riêng theo kênh.',
    SHOPIFY_DRAFT_REQUIRED: 'Hãy tạo bản nháp Shopify trước khi đồng bộ danh mục.',
  };
  return messages[code] ?? 'Thông tin hoặc quyền của cửa hàng chưa đáp ứng yêu cầu tạo sản phẩm.';
}
