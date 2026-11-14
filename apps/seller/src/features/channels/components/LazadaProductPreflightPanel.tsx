import { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  getLazadaBrands,
  getLazadaProductImages,
  getLazadaSpecification,
  prepareLazadaProductImages,
  preflightLazadaProduct,
  publishLazadaProduct,
  saveLazadaSpecification,
  type LazadaBrand,
  type LazadaCategoryAttribute,
  type LazadaImageAsset,
  type LazadaProductImageState,
  type LazadaProductPreflight,
  type LazadaProductSpec,
  type LazadaPublishResult,
  type LazadaSpecificationState,
} from '../../../api/lazada';
import { ApiRequestError } from '../../../core/api-error';
import { formatMinor } from '../../../lib/money';
import type { ProductApiDetail, ProductApiVariant } from '../../products/product.detail.api';
import { newIdempotencyKey } from '../../products/product.write';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ChannelProductImage } from './ChannelProductImage';
import { LazadaCategoryPanel } from './LazadaCategoryPanel';
import { lazadaErrorText, lazadaIssueText, lazadaPriceText } from './lazada-publish.messages';

export type LazadaSetupSummary = {
  categoryPath: string;
  brandName: string;
  skuCount: number;
  imageReady: number;
  imageTotal: number;
  prices: Array<{ sku: string; amount: string; currency: string }>;
  packageOverrideCount: number;
  attributeOverrideCount: number;
  packageReady: boolean;
  attributesReady: boolean;
  operation: 'create' | 'update';
  publishReady: boolean;
};

type Readiness = { ready: boolean; blocker: string };

const required = (value: LazadaCategoryAttribute['is_mandatory'] | undefined) => value === 1 || value === '1' || value === true;
const derived = new Set(['name', 'description', 'short_description', 'brand', 'brand_id', 'price', 'SellerSku', 'seller_sku', 'quantity', 'package_length', 'package_width', 'package_height', 'package_weight', 'package_content']);
const imageStatusText: Record<LazadaImageAsset['status'], string> = {
  ready: 'Đã tải lên Lazada',
  missing: 'Chưa chuẩn bị',
  stale: 'Core đã thay đổi',
  failed: 'Tải lên thất bại',
  invalid: 'Ảnh không hợp lệ',
};

function emptySpec(product: ProductApiDetail): LazadaProductSpec {
  return {
    category_id: '', brand_id: '', attributes: {}, expected_core_version: product.productVersion, metadata_version: 0,
    skus: product.variants.map((variant) => ({ variant_id: variant.id, attributes: {}, package_length: '', package_width: '', package_height: '', package_weight: '', package_content: '' })),
  };
}

function scaled(value: number | null, divisor: number, places: number): string {
  if (value === null || !Number.isSafeInteger(value) || value <= 0) return '';
  const whole = Math.floor(value / divisor);
  const part = String(value % divisor).padStart(places, '0').replace(/0+$/, '');
  return part ? `${whole}.${part}` : String(whole);
}

/** Mirrors the backend's Core package fallback: centimetres and kilograms rounded up to 0.01. */
function corePackage(product: ProductApiDetail) {
  const weightGrams = product.weightGrams && product.weightGrams > 0 ? Math.ceil(product.weightGrams / 10) / 100 : null;
  return {
    package_length: scaled(product.lengthMM, 10, 2),
    package_width: scaled(product.widthMM, 10, 2),
    package_height: scaled(product.heightMM, 10, 2),
    package_weight: weightGrams === null ? '' : String(weightGrams),
  };
}

function optionValue(attribute: LazadaCategoryAttribute, candidate: string): string {
  if (!candidate) return '';
  const kind = attribute.input_type.toLowerCase();
  if (!['singleselect', 'multiselect', 'enuminput', 'multienuminput'].includes(kind)) return candidate;
  const match = attribute.options?.find((option) => option.en_name?.toLocaleLowerCase('vi') === candidate.toLocaleLowerCase('vi') || option.name?.toLocaleLowerCase('vi') === candidate.toLocaleLowerCase('vi'));
  return match?.en_name ?? (kind.includes('enuminput') ? candidate : '');
}

function inherited(attribute: LazadaCategoryAttribute, product: ProductApiDetail, variant?: ProductApiVariant): string {
  const key = attribute.name.toLocaleLowerCase('en');
  let value = Object.entries(product.attributes).find(([name]) => name.toLocaleLowerCase('en') === key)?.[1] ?? '';
  if (key === 'name') value = product.name;
  if (key === 'description') value = product.description;
  if (key === 'short_description') value = product.shortDescription;
  if (variant && ['color', 'colour', 'color_family', 'colour_family'].includes(key.toLowerCase())) value = variant.colorDescription || variant.color || value;
  if (variant && ['size', 'size_name'].includes(key.toLowerCase())) value = variant.size || value;
  return optionValue(attribute, value);
}

type BrandPage = LazadaBrand[] | { module?: LazadaBrand[]; brands?: LazadaBrand[]; brand_list?: LazadaBrand[]; total_record?: number };

function brandPageRows(data: BrandPage): LazadaBrand[] {
  return Array.isArray(data) ? data : data?.module ?? data?.brands ?? data?.brand_list ?? [];
}

function brandRows(data: BrandPage): LazadaBrand[] {
  const rows = brandPageRows(data);
  return rows.filter((brand) => brand && typeof brand.name === 'string' && brand.name.trim() && (typeof brand.brand_id === 'string' || typeof brand.brand_id === 'number'));
}

function brandPageLength(data: BrandPage): number {
  return brandPageRows(data).length;
}

function attributeName(attribute: LazadaCategoryAttribute): string {
  return attribute.label?.trim() || attribute.name;
}

function issueTextFor(code: string): string {
  return lazadaIssueText[code] ?? 'Thông tin Lazada chưa đáp ứng yêu cầu. Kiểm tra trường được đánh dấu.';
}

function apiErrorText(cause: unknown, fallback: string): string {
  if (cause instanceof ApiRequestError) return lazadaErrorText(cause.code);
  return fallback;
}

function blockingIssues(result: LazadaProductPreflight, operation: 'create' | 'update') {
  return result.issues.filter((issue) => {
    if (issue.field === 'images' || issue.field === 'connection') return false;
    if (operation === 'update' && issue.code === 'LAZADA_LISTING_EXISTS') return false;
    return true;
  });
}

function readinessFor(result: LazadaProductPreflight | null, canWrite: boolean, writeBlockedReason?: string): Readiness {
  if (!canWrite) return { ready: false, blocker: writeBlockedReason || 'Tài khoản của bạn không có quyền ghi sản phẩm Lazada.' };
  if (!result) return { ready: false, blocker: 'Bấm “Kiểm tra điều kiện đăng” để xác minh cấu hình trước khi tiếp tục.' };
  const operation: 'create' | 'update' = result.remote_item_id ? 'update' : 'create';
  if (!result.connection_ready) return { ready: false, blocker: issueTextFor(result.issues.find((issue) => issue.field === 'connection')?.code ?? 'CHANNEL_NOT_CONNECTED') };
  if (!result.product_write_enabled) return { ready: false, blocker: lazadaIssueText.LAZADA_PRODUCT_WRITES_DISABLED ?? 'Quyền ghi sản phẩm Lazada chưa được bật.' };
  if (!result.media_ready) return { ready: false, blocker: issueTextFor(result.issues.find((issue) => issue.field === 'images')?.code ?? 'LAZADA_IMAGE_NOT_PREPARED') };
  const blocking = blockingIssues(result, operation);
  if (blocking.length) return { ready: false, blocker: issueTextFor(blocking[0]!.code) };
  return { ready: true, blocker: '' };
}

export function LazadaProductPreflightPanel({
  channelId,
  product,
  canWrite = false,
  writeBlockedReason,
  onReadinessChange,
  onSubmitReady,
  onQueued,
  onSummaryChange,
  onSaved,
  onPreflightChange,
}: {
  channelId: string;
  product: ProductApiDetail;
  canWrite?: boolean;
  writeBlockedReason?: string;
  onReadinessChange?: (ready: boolean, blocker?: string) => void;
  onSubmitReady?: (submit: () => Promise<void>) => void;
  onQueued?: (result: LazadaPublishResult) => void;
  onSummaryChange?: (summary: LazadaSetupSummary | null) => void;
  onSaved?: (state: LazadaSpecificationState) => void;
  onPreflightChange?: (result: LazadaProductPreflight | null) => void;
}) {
  const [spec, setSpec] = useState<LazadaProductSpec>(() => emptySpec(product));
  const [attributes, setAttributes] = useState<LazadaCategoryAttribute[]>([]);
  const [brands, setBrands] = useState<LazadaBrand[]>([]);
  const [brandQuery, setBrandQuery] = useState(product.brand);
  const [brandsLoading, setBrandsLoading] = useState(true);
  const [brandHasMore, setBrandHasMore] = useState(false);
  const [nextBrandOffset, setNextBrandOffset] = useState(0);
  const [brandError, setBrandError] = useState('');
  const [brandAttempt, setBrandAttempt] = useState(0);
  const [stale, setStale] = useState(false);
  const [changedFields, setChangedFields] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [result, setResult] = useState<LazadaProductPreflight | null>(null);
  const [images, setImages] = useState<LazadaProductImageState | null>(null);
  const [imageError, setImageError] = useState('');
  const [imageAttempt, setImageAttempt] = useState(0);
  const [preparingImages, setPreparingImages] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const [queuedState, setQueuedState] = useState('');
  const submitting = useRef(false);
  const specRef = useRef(spec);
  specRef.current = spec;
  const resultRef = useRef(result);
  resultRef.current = result;
  const callbackRef = useRef({ onReadinessChange, onSubmitReady, onSummaryChange, onPreflightChange });
  callbackRef.current = { onReadinessChange, onSubmitReady, onSummaryChange, onPreflightChange };

  useEffect(() => {
    let active = true;
    setLoaded(false);
    setLoadError('');
    void getLazadaSpecification(channelId, product.id).then((state) => {
      if (!active) return;
      const byId = new Map(state.spec.skus.map((sku) => [sku.variant_id, sku]));
      const next = {
        ...state.spec,
        skus: product.variants.map((variant) => byId.get(variant.id) ?? emptySpec(product).skus.find((sku) => sku.variant_id === variant.id)!),
      };
      setSpec(next);
      specRef.current = next;
      setStale(state.stale);
      setChangedFields(state.changed_fields ?? []);
      setLoaded(true);
    }).catch((cause) => {
      if (!active) return;
      setLoadError(apiErrorText(cause, 'Không tải được cấu hình Lazada đã lưu.'));
      setLoaded(true);
    });
    return () => { active = false; };
  }, [channelId, loadAttempt, product]);

  useEffect(() => {
    let active = true;
    setImages(null);
    setImageError('');
    void getLazadaProductImages(channelId, product.id).then((state) => {
      if (active) setImages(state);
    }).catch((cause) => {
      if (active) setImageError(apiErrorText(cause, 'Không tải được trạng thái ảnh Lazada của sản phẩm.'));
    });
    return () => { active = false; };
  }, [channelId, imageAttempt, product.id]);

  const loadBrands = useCallback(async (offset: number) => {
    setBrandsLoading(true);
    setBrandError('');
    try {
      const page = (await getLazadaBrands(channelId, offset)).data;
      const rows = brandRows(page);
      setBrands((current) => offset ? [...current, ...rows] : rows);
      setNextBrandOffset(offset + brandPageLength(page));
      setBrandHasMore(brandPageLength(page) === 100 && (Array.isArray(page) || typeof page.total_record !== 'number' || offset + brandPageLength(page) < page.total_record));
      if (!rows.length && !offset) setBrandError('Lazada trả về danh sách thương hiệu trống. Kiểm tra quyền GetBrandByPages của ứng dụng hoặc tình trạng thương hiệu trong Seller Center.');
    } catch (cause) {
      setBrandError(apiErrorText(cause, 'Chưa đọc được danh sách thương hiệu Lazada. Kiểm tra quyền Product API trong App Console.'));
    } finally {
      setBrandsLoading(false);
    }
  }, [channelId]);

  useEffect(() => { void loadBrands(0); }, [brandAttempt, loadBrands]);

  useEffect(() => {
    if (loaded && spec.expected_core_version !== product.productVersion) setStale(true);
  }, [loaded, spec.expected_core_version, product.productVersion]);

  const update = (next: LazadaProductSpec) => {
    specRef.current = next;
    setSpec(next);
    setResult(null);
    setError('');
    setSaved(false);
    setQueuedState('');
    callbackRef.current.onPreflightChange?.(null);
  };
  const updateSKU = (variantId: string, changes: Partial<LazadaProductSpec['skus'][number]>) => update({
    ...specRef.current,
    skus: specRef.current.skus.map((sku) => sku.variant_id === variantId ? { ...sku, ...changes } : sku),
  });

  const normalFields = useMemo(() => attributes.filter((attribute) => attribute.attribute_type === 'normal' && !derived.has(attribute.name)
    && (required(attribute.is_mandatory) || Boolean(inherited(attribute, product)) || spec.attributes[attribute.name] !== undefined))
    .sort((a, b) => Number(required(b.is_mandatory)) - Number(required(a.is_mandatory))), [attributes, product, spec.attributes]);
  const skuFields = useMemo(() => attributes.filter((attribute) => attribute.attribute_type === 'sku' && !derived.has(attribute.name)
    && !(product.variants.length === 1 && required(attribute.is_sale_prop))
    && (required(attribute.is_mandatory) || (product.variants.length > 1 && required(attribute.is_sale_prop)) || spec.skus.some((sku) => sku.attributes[attribute.name] !== undefined)))
    .sort((a, b) => Number(required(b.is_mandatory)) - Number(required(a.is_mandatory))), [attributes, product.variants.length, spec.skus]);

  const effective = useMemo<LazadaProductSpec>(() => ({
    ...spec,
    attributes: {
      name: product.name,
      description: product.description,
      short_description: product.shortDescription,
      ...Object.fromEntries(normalFields.map((attribute) => [attribute.name, inherited(attribute, product)])),
      ...spec.attributes,
    },
    skus: spec.skus.map((sku) => ({
      ...sku,
      attributes: {
        ...Object.fromEntries(skuFields.map((attribute) => [attribute.name, inherited(attribute, product, product.variants.find((variant) => variant.id === sku.variant_id))])),
        ...sku.attributes,
      },
    })),
  }), [normalFields, product, skuFields, spec]);

  const filteredBrands = useMemo(() => {
    const term = brandQuery.trim().toLocaleLowerCase('vi');
    const rows = term ? brands.filter((brand) => brand.name.toLocaleLowerCase('vi').includes(term)) : brands;
    return rows.slice(0, 30);
  }, [brandQuery, brands]);

  const readiness = useMemo(() => readinessFor(result, canWrite, writeBlockedReason), [canWrite, result, writeBlockedReason]);
  // Update is only real when the backend already knows the Lazada item id. Without it
  // a create is the only valid request, even when the screen was opened from a listed row.
  const selectedOperation = useMemo<'create' | 'update'>(() => (result?.remote_item_id ? 'update' : 'create'), [result?.remote_item_id]);

  const summary = useMemo<LazadaSetupSummary>(() => {
    const issues = result?.issues ?? [];
    const packageReady = Boolean(result) && !issues.some((issue) => issue.code === 'PACKAGE_MEASURE_REQUIRED' || issue.field === 'package');
    const attributesReady = Boolean(result) && !issues.some((issue) => /^(CATEGORY_|BRAND_|CATEGORY_ATTRIBUTE_|SKU_ATTRIBUTE_|SALE_PROP_)/.test(issue.code));
    return {
      categoryPath: spec.category_path ?? '',
      brandName: spec.brand_name ?? '',
      skuCount: spec.skus.length,
      imageReady: images?.accepted ?? 0,
      imageTotal: images?.items.length ?? 0,
      prices: result?.prices?.map((price) => ({ sku: price.sku, amount: price.amount, currency: price.currency }))
        ?? product.variants.map((variant) => ({ sku: variant.sku, amount: variant.priceMinor === null ? '' : String(variant.priceMinor), currency: product.currency })),
      packageOverrideCount: spec.skus.filter((sku) => sku.package_source === 'manual' || sku.package_source === 'core_confirmed').length,
      attributeOverrideCount: Object.keys(spec.attributes).length + spec.skus.reduce((count, sku) => count + Object.keys(sku.attributes).length, 0),
      packageReady,
      attributesReady,
      operation: selectedOperation,
      publishReady: readiness.ready,
    };
  }, [images?.accepted, images?.items.length, product.currency, product.variants, readiness.ready, result, selectedOperation, spec]);

  useEffect(() => {
    callbackRef.current.onReadinessChange?.(readiness.ready, readiness.blocker);
  }, [readiness.blocker, readiness.ready]);

  useEffect(() => {
    callbackRef.current.onSummaryChange?.(summary);
  }, [summary]);

  const submitRef = useRef<() => Promise<void>>(async () => {});
  const submit = useCallback(async () => {
    if (!canWrite) throw new Error('LAZADA_PRODUCT_WRITES_DISABLED');
    if (submitting.current) return;
    submitting.current = true;
    setPublishing(true);
    setError('');
    setSaved(false);
    setQueuedState('');
    try {
      const state = await saveLazadaSpecification(channelId, product.id, specRef.current);
      specRef.current = state.spec;
      setSpec(state.spec);
      setStale(false);
      setSaved(true);
      onSaved?.(state);
      const next = await preflightLazadaProduct(channelId, product.id);
      setResult(next);
      setImages(await getLazadaProductImages(channelId, product.id).catch(() => images));
      callbackRef.current.onPreflightChange?.(next);
      const nextOperation: 'create' | 'update' = next.remote_item_id ? 'update' : 'create';
      const blocking = blockingIssues(next, nextOperation);
      if (!next.connection_ready || !next.product_write_enabled || !next.media_ready || blocking.length) {
        const blocker = readinessFor(next, canWrite, writeBlockedReason).blocker;
        setError(blocker);
        throw new Error('LAZADA_NOT_READY');
      }
      const published = await publishLazadaProduct(channelId, product.id, {
        operation: nextOperation,
        expected_product_version: next.product_version,
        expected_metadata_version: state.spec.metadata_version ?? 0,
      }, newIdempotencyKey('lazada-publish'));
      setQueuedState(published.job.state || 'queued');
      onQueued?.(published);
    } catch (cause) {
      if (!(cause instanceof Error && cause.message === 'LAZADA_NOT_READY')) {
        setError(apiErrorText(cause, 'Chưa thể lưu hoặc gửi sản phẩm sang Lazada. Kiểm tra cấu hình rồi thử lại.'));
      }
      throw cause;
    } finally {
      submitting.current = false;
      setPublishing(false);
    }
  }, [canWrite, channelId, images, onQueued, onSaved, product.id, writeBlockedReason]);
  submitRef.current = submit;

  useEffect(() => {
    callbackRef.current.onSubmitReady?.(() => submitRef.current());
  }, []);

  const save = async () => {
    if (!canWrite || busy || publishing) return;
    setBusy(true);
    setError('');
    setSaved(false);
    setQueuedState('');
    try {
      const state = await saveLazadaSpecification(channelId, product.id, specRef.current);
      specRef.current = state.spec;
      setSpec(state.spec);
      setStale(false);
      setSaved(true);
      onSaved?.(state);
    } catch (cause) {
      setError(apiErrorText(cause, 'Không lưu được cấu hình Lazada. Nếu Core đã thay đổi, tải lại sản phẩm và kiểm tra từng trường.'));
    } finally {
      setBusy(false);
    }
  };

  const check = async () => {
    if (!canWrite || busy || publishing) return;
    setBusy(true);
    setError('');
    setResult(null);
    setSaved(false);
    setQueuedState('');
    callbackRef.current.onPreflightChange?.(null);
    try {
      const state = await saveLazadaSpecification(channelId, product.id, specRef.current);
      specRef.current = state.spec;
      setSpec(state.spec);
      setStale(false);
      setSaved(true);
      onSaved?.(state);
      const next = await preflightLazadaProduct(channelId, product.id);
      setResult(next);
      callbackRef.current.onPreflightChange?.(next);
      setImages(await getLazadaProductImages(channelId, product.id).catch(() => images));
    } catch (cause) {
      setError(apiErrorText(cause, 'Không lưu hoặc kiểm tra được sản phẩm Lazada. Kiểm tra Core, kết nối và quyền Product API.'));
    } finally {
      setBusy(false);
    }
  };

  const prepareImages = async () => {
    if (!canWrite || preparingImages) return;
    setPreparingImages(true);
    setImageError('');
    setResult(null);
    setSaved(false);
    callbackRef.current.onPreflightChange?.(null);
    try {
      setImages(await prepareLazadaProductImages(channelId, product.id));
    } catch (cause) {
      setImageError(apiErrorText(cause, 'Không chuẩn bị được ảnh Lazada. Kiểm tra kết nối, quyền Product API và ảnh Core.'));
    } finally {
      setPreparingImages(false);
    }
  };

  const applyCorePackage = (variantId: string) => updateSKU(variantId, {
    package_length: '', package_width: '', package_height: '', package_weight: '', package_content: '', package_source: undefined,
  });
  const checkAttempt = () => { setLoadAttempt((value) => value + 1); };
  const brandBlocked = !spec.brand_id;
  const imageReady = Boolean(images?.accepted && images.accepted > 0 && images.primary_ready);
  const resultIssues = result?.issues ?? [];
  const rowIssues = (variantId: string) => {
    const dataIssue = resultIssues.find((issue) => issue.variant_id === variantId && issue.field !== 'images' && issue.field !== 'connection');
    if (dataIssue) return issueTextFor(dataIssue.code);
    const asset = images?.items.find((item) => item.variant_id === variantId && item.status !== 'ready');
    if (asset) return `Ảnh SKU: ${imageStatusText[asset.status]}.`;
    const imageIssue = resultIssues.find((issue) => issue.variant_id === variantId && issue.field === 'images');
    return imageIssue ? issueTextFor(imageIssue.code) : '';
  };

  return <div className="grid gap-4">
    {stale ? <div role="alert" className="grid gap-2 rounded-control border border-outline-variant bg-badge-blocked-bg p-3 text-sm text-badge-blocked-text">
      <p>Core đã thay đổi từ phiên bản {spec.expected_core_version} sang {product.productVersion}.{changedFields.length ? ` Trường thay đổi: ${changedFields.join(', ')}.` : ''} Kiểm tra lại các trường và từng SKU trước khi lưu.</p>
      <Button size="sm" variant="secondary" className="justify-self-start" onClick={() => {
        const byId = new Map(specRef.current.skus.map((sku) => [sku.variant_id, sku]));
        update({ ...specRef.current, expected_core_version: product.productVersion, skus: product.variants.map((variant) => byId.get(variant.id) ?? emptySpec(product).skus.find((sku) => sku.variant_id === variant.id)!) });
        setStale(false);
      }}>Đã kiểm tra với Core mới</Button>
    </div> : null}

    {loadError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-error/20 bg-error-container/30 p-3 text-sm text-error">
      <span>{loadError}</span><Button size="sm" variant="secondary" onClick={checkAttempt}>Tải lại cấu hình</Button>
    </div> : null}
    {!loaded && !loadError ? <div className="grid gap-2" aria-busy="true"><div className="h-20 animate-pulse rounded-lg bg-surface-container-low" /><p className="text-xs text-graphite">Đang đọc cấu hình Lazada đã lưu…</p></div> : null}

    <LazadaCategoryPanel
      channelId={channelId}
      productName={product.name}
      coreCategory={product.category}
      selectedCategoryId={spec.category_id}
      onAttributes={setAttributes}
      onSelect={(id, path, values) => {
        setAttributes(values);
        update(id === specRef.current.category_id
          ? { ...specRef.current, category_path: path }
          : { ...specRef.current, category_id: id, category_path: path, attributes: {}, skus: specRef.current.skus.map((sku) => ({ ...sku, attributes: {} })) });
      }}
    />

    <Card className="grid gap-4 p-4 sm:p-5">
      <div>
        <h3 className="font-display text-base font-bold text-on-surface">Thương hiệu và thuộc tính Lazada</h3>
        <p className="mt-1 text-sm leading-5 text-graphite">OctoFlow dùng tên, mô tả và thuộc tính Core khi hợp lệ. Thương hiệu phải được bạn chọn từ danh sách Lazada; chất liệu, họa tiết và các trường bắt buộc khác phụ thuộc ngành hàng đã chọn.</p>
      </div>

      <div className="grid gap-2 rounded-lg border border-outline-variant/60 p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm font-semibold text-on-surface">Thương hiệu Lazada</p>
          {spec.brand_id ? <StatusBadge tone="success">Đã chọn thương hiệu</StatusBadge> : <StatusBadge tone={brandBlocked ? 'warning' : 'neutral'}>{brandBlocked ? 'Chưa chọn thương hiệu' : 'Đang xác minh'}</StatusBadge>}
        </div>
        {product.brand ? <p className="text-xs text-graphite">Thương hiệu Core: <strong>{product.brand}</strong> · chỉ dùng để gợi ý tìm kiếm, không tự gửi sang Lazada.</p> : null}
        {spec.brand_id ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container-low px-3 py-2">
          <strong className="text-sm text-on-surface">{spec.brand_name || 'Thương hiệu Lazada'}</strong>
          <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => update({ ...specRef.current, brand_id: '', brand_name: '' })}>Đổi thương hiệu</Button>
        </div> : <div className="flex flex-wrap items-end gap-2"><div className="min-w-56 flex-1"><Input label="Tìm thương hiệu Lazada" value={brandQuery} onChange={(event) => setBrandQuery(event.target.value)} placeholder="Nhập tên thương hiệu" disabled={!canWrite} /></div>{brandQuery ? <Button size="sm" variant="ghost" onClick={() => setBrandQuery('')}>Xem danh sách</Button> : null}</div>}
        {!spec.brand_id && brandsLoading ? <p className="text-xs text-graphite">Đang tải thương hiệu từ Lazada…</p> : null}
        {!spec.brand_id && brandError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-error"><span>{brandError}</span><Button size="sm" variant="secondary" onClick={() => setBrandAttempt((value) => value + 1)}>Thử lại</Button></div> : null}
        {!spec.brand_id && !brandsLoading && !brandError ? <div className="max-h-40 overflow-y-auto rounded-control border border-outline-variant/60">
          {filteredBrands.map((brand) => <button key={String(brand.brand_id)} type="button" disabled={!canWrite} className="block w-full border-b border-outline-variant/40 px-3 py-2 text-left text-sm hover:bg-surface-container-low focus-visible:outline focus-visible:outline-2 focus-visible:outline-inset focus-visible:outline-octo-ember" onClick={() => update({ ...specRef.current, brand_id: String(brand.brand_id), brand_name: brand.name })}>{brand.name}</button>)}
          {!filteredBrands.length ? <p className="p-3 text-sm text-graphite">Không có thương hiệu phù hợp trong danh sách đã tải. Thử từ khóa khác, xem toàn bộ hoặc tải thêm trang.</p> : null}
        </div> : null}
        {!spec.brand_id && brandHasMore ? <Button size="sm" variant="secondary" className="justify-self-start" loading={brandsLoading} onClick={() => void loadBrands(nextBrandOffset)}>Tải thêm thương hiệu Lazada</Button> : null}
        {!spec.brand_id ? <p role="status" className="text-xs leading-5 text-badge-blocked-text">Cần chọn thương hiệu trước khi gửi Lazada.</p> : null}
      </div>

      {normalFields.length ? <div className="grid gap-3 sm:grid-cols-2">
        {normalFields.map((attribute) => <AttributeField key={attribute.name} attribute={attribute} value={effective.attributes[attribute.name] ?? ''} source={spec.attributes[attribute.name] === undefined ? 'Core' : 'Lazada'} disabled={!canWrite} onChange={(value) => update({ ...specRef.current, attributes: { ...specRef.current.attributes, [attribute.name]: value } })} />)}
      </div> : <p className="text-xs text-graphite">Chọn ngành hàng cuối để xem thuộc tính bắt buộc.</p>}
    </Card>

    <Card className="grid gap-4 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <ChannelProductImage productId={product.id} className="size-16" />
          <div className="min-w-0">
            <h3 className="font-display text-base font-bold text-on-surface">Ảnh sản phẩm từ Core</h3>
            <p className="mt-1 text-sm leading-5 text-graphite">{images ? `${images.accepted}/${images.items.length} ảnh đã được Lazada chấp nhận · ${images.product_images} ảnh sản phẩm · ${images.variant_images} ảnh SKU` : 'Đang đọc trạng thái ảnh…'}</p>
            {imageReady ? <StatusBadge tone="success">Ảnh chính đã sẵn sàng</StatusBadge> : <StatusBadge tone={images ? 'warning' : 'neutral'}>{images ? 'Cần chuẩn bị ảnh' : 'Chưa kiểm tra ảnh'}</StatusBadge>}
          </div>
        </div>
        <Button size="sm" variant="secondary" loading={preparingImages} disabled={!canWrite || preparingImages || busy || publishing || !images?.items.length} onClick={() => void prepareImages()}>Chuẩn bị ảnh Lazada</Button>
      </div>
      {images?.items.length ? <ul className="grid gap-1.5">{images.items.map((asset) => {
        const variant = asset.variant_id ? product.variants.find((item) => item.id === asset.variant_id) : undefined;
        return <li key={`${asset.core_media_id}:${asset.variant_id ?? 'product'}:${asset.position}`} className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container-low px-2.5 py-1.5 text-xs">
          <span className="text-on-surface">{asset.scope === 'product' ? 'Ảnh sản phẩm' : `Ảnh SKU ${variant?.sku ?? 'biến thể'}`}{asset.is_primary ? ' · Ảnh chính' : ''}</span>
          <span className={asset.status === 'ready' ? 'text-badge-progress-text' : 'text-error'}>{imageStatusText[asset.status ?? 'missing']}{asset.error_code ? ` · ${issueTextFor(asset.error_code)}` : ''}</span>
        </li>;
      })}</ul> : !imageError ? <p className="text-xs text-graphite">Sản phẩm chưa có ảnh Core. Thêm ảnh trong trang sản phẩm trước khi đăng Lazada.</p> : null}
      {images?.issues.length ? <ul role="status" className="grid gap-1 text-xs text-error">{images.issues.map((issue, index) => <li key={`${issue.code}:${issue.variant_id ?? ''}:${index}`}>{issueTextFor(issue.code)}</li>)}</ul> : null}
      {imageError ? <div role="alert" className="flex flex-wrap items-center justify-between gap-2 text-sm text-error"><span>{imageError}</span><Button size="sm" variant="secondary" onClick={() => setImageAttempt((value) => value + 1)}>Thử lại</Button></div> : null}
      <p className="text-xs leading-5 text-graphite">Ảnh chính và tối đa 8 ảnh mỗi nhóm được lấy từ Core (ảnh nguồn tối đa 5 MiB). UploadImage của Open Platform nhận JPG/PNG, ít nhất 330 × 330 px, tối đa 5000 × 5000 px và 3 MiB sau xử lý. OctoFlow tự thu nhỏ/nén ảnh khi cần; hãy kiểm tra ảnh không chứa nội dung nhạy cảm trước khi đăng.</p>
    </Card>

    <Card className="grid gap-3 p-4 sm:p-5">
      <h3 className="font-display text-base font-bold text-on-surface">Biến thể và SKU</h3>
      <div className="overflow-x-auto rounded-lg border border-outline-variant/60">
        <table className="w-full min-w-[640px] text-left text-sm">
          <thead className="bg-surface-container-low text-xs text-graphite"><tr><th className="p-3">SKU Core</th><th className="p-3">Biến thể</th><th className="p-3">Giá dự kiến</th><th className="p-3">Ảnh</th><th className="p-3">Trạng thái</th></tr></thead>
          <tbody className="divide-y divide-outline-variant/40">{product.variants.map((variant) => {
            const sku = spec.skus.find((item) => item.variant_id === variant.id);
            const core = corePackage(product);
            const packaging = sku?.package_source === 'manual' || sku?.package_source === 'core_confirmed' ? 'Đã override kiện hàng' : core.package_length && core.package_width && core.package_height && core.package_weight ? 'Kiện hàng tự lấy từ Core' : 'Thiếu số đo kiện hàng';
            const price = result?.prices?.find((item) => item.variant_id === variant.id);
            const issue = rowIssues(variant.id);
            return <tr key={variant.id}>
              <td className="p-3"><strong className="font-mono text-xs text-on-surface">{variant.sku || 'Chưa có SKU'}</strong>{!variant.isActive || !variant.variantIsActive ? <span className="mt-1 block text-[11px] text-error">SKU không hoạt động</span> : null}</td>
              <td className="p-3 text-xs text-graphite">{[variant.color, variant.size].filter(Boolean).join(' · ') || 'Mẫu mã mặc định'}</td>
              <td className="p-3 tabular-nums text-xs text-on-surface">{price ? lazadaPriceText(price.amount, price.currency) : variant.priceMinor === null ? 'Chưa có giá' : formatMinor(variant.priceMinor, product.currency)}<span className="mt-1 block text-[11px] text-graphite">{packaging}</span></td>
              <td className="p-3 text-xs text-graphite">{images?.items.filter((item) => item.variant_id === variant.id && item.status === 'ready').length ?? 0} ảnh SKU<span className="mt-1 block">{images?.primary_ready ? 'Ảnh chính sẵn sàng' : 'Ảnh chính chưa sẵn sàng'}</span></td>
              <td className="p-3">{issue ? <span className="text-xs leading-5 text-error">{issue}</span> : result ? <StatusBadge tone="success">Đã kiểm tra</StatusBadge> : <StatusBadge tone="neutral">Chưa kiểm tra</StatusBadge>}</td>
            </tr>;
          })}</tbody>
        </table>
      </div>
      {product.variants.length === 0 ? <p className="rounded-lg border border-outline-variant bg-warm-alabaster p-3 text-sm text-graphite">Sản phẩm Core chưa có biến thể để đăng Lazada.</p> : null}
    </Card>

    {skuFields.length ? <Card className="grid gap-4 p-4 sm:p-5">
      <div><h3 className="font-display text-base font-bold text-on-surface">Thuộc tính riêng của SKU</h3><p className="mt-1 text-sm leading-5 text-graphite">Màu và cỡ được kế thừa từ biến thể Core. Giá trị bạn sửa được gửi đúng khóa Lazada của ngành hàng.</p></div>
      <div className="grid gap-4">
        {product.variants.map((variant) => {
          const sku = spec.skus.find((item) => item.variant_id === variant.id);
          const effectiveSKU = effective.skus.find((item) => item.variant_id === variant.id);
          if (!sku || !effectiveSKU) return null;
          const issue = rowIssues(variant.id);
          return <div key={variant.id} className="grid gap-3 rounded-lg border border-outline-variant/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2"><strong className="font-mono text-xs text-on-surface">{variant.sku || 'Chưa có SKU'}</strong><span className="text-xs text-graphite">{[variant.color, variant.size].filter(Boolean).join(' · ') || 'Mẫu mã mặc định'}</span></div>
            <div className="grid gap-3 sm:grid-cols-2">
              {skuFields.map((attribute) => <AttributeField key={attribute.name} attribute={attribute} value={effectiveSKU.attributes[attribute.name] ?? ''} source={sku.attributes[attribute.name] === undefined ? 'Core' : 'Lazada'} disabled={!canWrite} onChange={(value) => updateSKU(variant.id, { attributes: { ...sku.attributes, [attribute.name]: value } })} />)}
            </div>
            {issue ? <p role="status" className="text-xs text-error">{issue}</p> : null}
          </div>;
        })}
      </div>
    </Card> : null}

    <Card className="grid gap-4 p-4 sm:p-5">
      <div><h3 className="font-display text-base font-bold text-on-surface">Kiện hàng Lazada</h3><p className="mt-1 text-sm text-graphite">Trọng lượng, dài, rộng và cao của kiện hàng là bắt buộc cho từng SKU.</p></div>
      <div className="grid gap-4">
        {product.variants.map((variant) => {
          const sku = spec.skus.find((item) => item.variant_id === variant.id);
          const core = corePackage(product);
          const overridden = sku?.package_source === 'manual' || sku?.package_source === 'core_confirmed';
          if (!sku) return null;
          return <div key={variant.id} className="grid gap-3 rounded-lg border border-outline-variant/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="font-mono text-xs text-on-surface">{variant.sku || 'Chưa có SKU'}</strong>
              <StatusBadge tone={overridden ? 'warning' : core.package_length && core.package_width && core.package_height && core.package_weight ? 'success' : 'neutral'}>{overridden ? 'Đã override' : core.package_length && core.package_width && core.package_height && core.package_weight ? 'Tự động từ Core' : 'Thiếu số đo'}</StatusBadge>
            </div>
            <p className="text-xs text-graphite">Gợi ý từ Core: {core.package_length || '—'} × {core.package_width || '—'} × {core.package_height || '—'} cm · {core.package_weight || '—'} kg.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {(['package_length', 'package_width', 'package_height', 'package_weight'] as const).map((field) => <Input key={field} label={`${field === 'package_weight' ? 'Trọng lượng (kg)' : field === 'package_length' ? 'Dài (cm)' : field === 'package_width' ? 'Rộng (cm)' : 'Cao (cm)'}`} value={sku[field]} placeholder={core[field] || ''} disabled={!canWrite} onChange={(event) => updateSKU(variant.id, { [field]: event.target.value, package_source: 'manual' })} />)}
              <Input label="Nội dung kiện hàng" value={sku.package_content} placeholder={`${product.name}${variant.color ? ` · ${variant.color}` : ''}${variant.size ? ` · ${variant.size}` : ''}`} disabled={!canWrite} onChange={(event) => updateSKU(variant.id, { package_content: event.target.value, package_source: 'manual' })} />
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              {overridden ? <Button size="sm" variant="ghost" disabled={!canWrite} onClick={() => applyCorePackage(variant.id)}>Dùng số đo Core tự động</Button> : null}
            </div>
            {overridden && sku.package_source === 'manual' ? <Button size="sm" variant="secondary" className="justify-self-start" disabled={!canWrite || !core.package_length || !core.package_width || !core.package_height || !core.package_weight} onClick={() => updateSKU(variant.id, { ...core, package_source: 'core_confirmed' })}>Xác nhận số đo Core là kiện hàng</Button> : null}
          </div>;
        })}
      </div>
    </Card>

    <div className="flex flex-col gap-3 rounded-lg border border-outline-variant bg-warm-alabaster p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-on-surface">Điều kiện đăng Lazada</p>
        <p role="status" className={`mt-1 text-sm leading-5 ${readiness.ready ? 'text-badge-progress-text' : 'text-badge-blocked-text'}`}>{readiness.ready ? 'Cấu hình đã sẵn sàng để xác nhận. Sản phẩm chỉ được coi là đăng thành công sau khi Lazada xác minh và duyệt.' : readiness.blocker}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={!canWrite || !loaded || stale || busy || publishing || preparingImages || Boolean(loadError)} loading={busy} onClick={() => void save()}>Lưu cấu hình</Button>
        <Button size="sm" disabled={!canWrite || !loaded || stale || busy || publishing || preparingImages || Boolean(loadError)} loading={busy || publishing} onClick={() => void check()}>Kiểm tra điều kiện đăng</Button>
      </div>
    </div>

    {saved ? <p role="status" className="text-sm text-badge-progress-text">Đã lưu cấu hình Lazada trong OctoFlow.</p> : null}
    {queuedState ? <p role="status" className="text-sm text-badge-progress-text">Đã tiếp nhận yêu cầu đăng Lazada ({queuedState === 'queued' ? 'đang chờ xử lý' : 'đã xếp hàng'}). Trạng thái thật sẽ được đọc lại từ Lazada.</p> : null}
    {error ? <p role="alert" className="rounded-lg border border-error/20 bg-error-container/30 p-3 text-sm text-error">{error}</p> : null}

    {result ? <div role="status" className="grid gap-3 rounded-lg border border-outline-variant bg-pure-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <strong className="text-sm text-on-surface">{readiness.ready ? 'Sẵn sàng xác nhận đăng Lazada' : `${result.issues.length} điều kiện cần xử lý`}</strong>
        <StatusBadge tone={readiness.ready ? 'success' : 'warning'}>{readiness.ready ? 'Đã kiểm tra' : 'Cần xử lý'}</StatusBadge>
      </div>
      <div className="grid gap-1 sm:grid-cols-2">
        <ReadinessRow label="Dữ liệu sản phẩm" ready={result.issues.every((issue) => issue.field === 'images' || issue.field === 'connection' || (selectedOperation === 'update' && issue.code === 'LAZADA_LISTING_EXISTS'))} />
        <ReadinessRow label="Ảnh đã được Lazada chấp nhận" ready={result.media_ready} />
        <ReadinessRow label="Kết nối và quyền Product API" ready={result.connection_ready} />
        <ReadinessRow label="Quyền ghi sản phẩm Lazada" ready={result.product_write_enabled} />
      </div>
      {result.issues.length ? <ul className="grid gap-1 text-xs leading-5 text-graphite">{result.issues.filter((issue) => !(selectedOperation === 'update' && issue.code === 'LAZADA_LISTING_EXISTS')).map((issue, index) => {
        const variant = issue.variant_id ? product.variants.find((item) => item.id === issue.variant_id) : undefined;
        return <li key={`${issue.code}:${issue.field}:${issue.variant_id ?? ''}:${index}`}>{issueTextFor(issue.code)}{variant ? ` · SKU ${variant.sku}` : issue.field === 'package' && issue.variant_id ? ' · Kiện hàng' : ''}</li>;
      })}</ul> : null}
      <p className="text-xs leading-5 text-graphite">Kết quả kiểm tra không tạo sản phẩm, không đổi tồn kho và không xác nhận thành công trước khi Lazada trả trạng thái thật.</p>
    </div> : null}
  </div>;
}

function ReadinessRow({ label, ready }: { label: string; ready: boolean }) {
  return <p className={ready ? 'text-badge-progress-text' : 'text-error'}>{ready ? '✓' : '✕'} {label}</p>;
}

function AttributeField({ attribute, value, source, disabled, onChange }: { attribute: LazadaCategoryAttribute; value: string; source: string; disabled: boolean; onChange: (value: string) => void }) {
  const optionsId = useId();
  const label = `${attributeName(attribute)}${required(attribute.is_mandatory) ? ' *' : ''} · ${source}`;
  const kind = attribute.input_type.toLowerCase();
  const options = attribute.options?.filter((option) => option.en_name) ?? [];
  if (kind === 'singleselect' && options.length) return <label className="grid gap-1 text-sm text-on-surface">{label}<select className="min-h-11 rounded-control border border-outline-variant bg-pure-white px-3 text-sm" value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}><option value="">Chọn giá trị Lazada</option>{options.map((option) => <option key={option.en_name} value={option.en_name}>{option.name || option.en_name}</option>)}</select></label>;
  if (kind === 'multiselect' && options.length) return <fieldset className="grid gap-1 text-sm text-on-surface"><legend>{label}</legend><div className="max-h-36 overflow-y-auto rounded-control border border-outline-variant p-2">{options.map((option) => <label key={option.en_name} className="flex items-center gap-2 py-1"><input type="checkbox" disabled={disabled} checked={value.split(',').map((part) => part.trim()).includes(option.en_name!)} onChange={(event) => { const parts = value.split(',').map((part) => part.trim()).filter(Boolean); onChange(event.target.checked ? [...parts, option.en_name!].join(',') : parts.filter((part) => part !== option.en_name).join(',')); }} />{option.name || option.en_name}</label>)}</div></fieldset>;
  if (kind === 'enuminput' && options.length) return <div><Input label={label} list={optionsId} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Chọn hoặc nhập giá trị riêng" /><datalist id={optionsId}>{options.map((option) => <option key={option.en_name} value={option.en_name}>{option.name}</option>)}</datalist></div>;
  if (kind === 'multienuminput' && options.length) return <div className="grid gap-2"><Input label={label} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} placeholder="Các giá trị cách nhau bằng dấu phẩy" /><div className="flex flex-wrap gap-1">{options.slice(0, 20).map((option) => <button key={option.en_name} type="button" disabled={disabled} className="rounded-control border border-outline-variant px-2 py-1 text-xs hover:bg-surface-container-low" onClick={() => { const parts = value.split(',').map((part) => part.trim()).filter(Boolean); if (!parts.includes(option.en_name!)) onChange([...parts, option.en_name!].join(',')); }}>{option.name || option.en_name}</button>)}</div></div>;
  return <Input label={label} type={kind === 'date' ? 'date' : 'text'} inputMode={kind === 'numeric' ? 'decimal' : undefined} value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)} />;
}
