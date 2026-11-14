import { useEffect, useMemo, useRef, useState } from 'react';
import { updateVariant, type UpdateVariantInput } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { ApiRequestError } from '../../../core/api-error';
import { formatMinor, formatPriceRange } from '../../../lib/money';
import { newIdempotencyKey } from '../product.write';
import { variantLabel, type ProductApiDetail, type ProductApiVariant } from '../product.detail.api';

/**
 * Core price is the default price every channel falls back to when it has no override.
 *
 * The API stores it per variant in minor units, so this editor never invents a product-level
 * price: a product with six SKUs is six prices, and a single field here would silently make
 * five of them disagree with the server. Each row saves on its own because every PATCH needs
 * the product revision returned by the previous write; batching them would either guess the
 * next revision or hide a partial failure behind one button.
 */
export function ProductPriceEditor({ product, canWrite, disabledReason, onUpdated }: {
  product: ProductApiDetail;
  canWrite: boolean;
  disabledReason?: string;
  onUpdated: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, string>>(() => draftsFrom(product));
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const attempts = useRef(new Map<string, { payload: string; key: string }>());
  const previousCanonical = useRef<Record<string, string>>({});
  const canonical = useMemo(() => draftsFrom(product), [product]);

  // A re-read after save brings new prices and a new product revision into this component.
  // Only fields the seller has not edited are replaced, so saving SKU A cannot discard a
  // half-typed price for SKU B.
  useEffect(() => {
    const previous = previousCanonical.current;
    setDrafts((current) => {
      const next: Record<string, string> = {};
      for (const variant of product.variants) {
        const value = current[variant.id];
        next[variant.id] = value === undefined || value === previous[variant.id] ? canonical[variant.id] ?? '' : value;
      }
      return next;
    });
    previousCanonical.current = canonical;
  }, [canonical, product.variants]);

  const prices = product.variants.map((variant) => variant.priceMinor);
  const unpriced = prices.filter((price) => price === null).length;
  const save = async (variant: ProductApiVariant) => {
    const raw = drafts[variant.id] ?? '';
    const nextPrice = parsePrice(raw);
    if (nextPrice === undefined) {
      setError(`Giá của ${variant.sku} phải là số nguyên không âm theo đơn vị nhỏ nhất.`);
      return;
    }
    if (nextPrice === variant.priceMinor) {
      setError(null);
      return;
    }

    const input: UpdateVariantInput = {
      price_minor: nextPrice,
      expected_product_version: product.productVersion,
    };
    const payload = JSON.stringify(input);
    const previousAttempt = attempts.current.get(variant.id);
    const key = previousAttempt?.payload === payload
      ? previousAttempt.key
      : newIdempotencyKey(`product-price-${variant.id}`);
    attempts.current.set(variant.id, { payload, key });

    setBusyId(variant.id);
    setError(null);
    setSaved(null);
    try {
      await updateVariant(product.id, variant.id, input, key);
      attempts.current.delete(variant.id);
      setDrafts((current) => ({ ...current, [variant.id]: nextPrice === null ? '' : String(nextPrice) }));
      setSaved(nextPrice === null
        ? `Đã bỏ giá của ${variant.sku}.`
        : `Đã lưu giá ${formatMinor(nextPrice, product.currency)} cho ${variant.sku}.`);
      onUpdated();
    } catch (cause) {
      // The revision is required precisely so two edits cannot overwrite each other. Re-read
      // the product rather than leaving a stale revision in the form for the next attempt.
      if (cause instanceof ApiRequestError && cause.code === 'PRODUCT_REVISION_STALE') onUpdated();
      setError(priceErrorMessage(cause, variant.sku));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <Card className="grid min-w-0 gap-4 p-5" aria-label="Giá bán sản phẩm">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-body text-caption font-semibold uppercase tracking-wider text-primary">Giá Core</p>
          <h2 className="mt-1 font-display text-lg font-bold text-on-surface">Giá bán</h2>
          <p className="mt-1 max-w-2xl font-body text-caption leading-5 text-graphite">
            Giá mặc định cho mọi kênh chưa đặt giá riêng. Nhập theo đơn vị nhỏ nhất của {product.currency}; để trống khi SKU chưa có giá.
          </p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          disabled={!canWrite || product.variants.length === 0}
          title={!canWrite ? disabledReason : undefined}
          aria-expanded={open}
          aria-controls="product-price-editor"
          onClick={() => { setOpen((value) => !value); setError(null); setSaved(null); }}
        >
          {open ? 'Đóng chỉnh sửa giá' : 'Chỉnh sửa giá'}
        </Button>
      </header>

      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 rounded-control bg-surface-container-low px-4 py-3">
        <div className="min-w-0">
          <p className="font-body text-caption font-semibold uppercase tracking-wider text-graphite">Khoảng giá hiện tại</p>
          <p className="mt-1 break-words font-display text-xl font-bold tabular-nums text-on-surface">{formatPriceRange(prices, product.currency)}</p>
        </div>
        <p className="max-w-md font-body text-caption leading-5 text-graphite">
          {product.variants.length} biến thể
          {unpriced > 0 ? ` · ${unpriced} biến thể chưa có giá sẽ không thể bán` : ' · mọi biến thể đã có giá'}
        </p>
      </div>

      {product.variants.length === 0 ? <p className="font-body text-body-sm text-graphite">Sản phẩm chưa có biến thể. Thêm SKU trước khi đặt giá.</p> : null}

      {open && product.variants.length > 0 ? <div id="product-price-editor" className="grid min-w-0 gap-2">
        {product.variants.map((variant) => {
          const draft = drafts[variant.id] ?? '';
          const dirty = draft !== (variant.priceMinor === null ? '' : String(variant.priceMinor));
          const isBusy = busyId === variant.id;
          return <form
            key={variant.id}
            aria-label={`Cập nhật giá ${variant.sku}`}
            noValidate
            onSubmit={(event) => { event.preventDefault(); void save(variant); }}
            className="grid min-w-0 gap-3 rounded-control border border-outline-variant/70 bg-pure-white p-3 md:grid-cols-[minmax(0,1fr)_minmax(12rem,0.8fr)_auto] md:items-end"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <code className="break-all font-mono text-body-sm font-bold text-on-surface">{variant.sku}</code>
                {!variant.variantIsActive ? <span className="rounded-full bg-surface-container px-2 py-0.5 font-body text-[10px] font-semibold uppercase tracking-wide text-graphite">Ngừng bán</span> : null}
              </div>
              <p className="mt-1 break-words font-body text-caption text-graphite">
                {variantLabel(variant)} · Hiện tại {formatMinor(variant.priceMinor, product.currency)}
              </p>
            </div>
            <Input
              label={`Giá mới (${product.currency})`}
              aria-label={`Giá bán của ${variant.sku}`}
              type="number"
              min={0}
              step={1}
              inputMode="numeric"
              value={draft}
              disabled={!canWrite || busyId !== null}
              onChange={(event) => {
                setDrafts((current) => ({ ...current, [variant.id]: event.target.value }));
                setError(null);
                setSaved(null);
              }}
              hint={priceHint(draft, product.currency)}
            />
            <Button
              type="submit"
              size="sm"
              disabled={!canWrite || busyId !== null || !dirty}
              loading={isBusy}
              loadingLabel="Đang lưu…"
              aria-label={`Lưu giá ${variant.sku}`}
            >
              Lưu giá
            </Button>
          </form>;
        })}
      </div> : null}

      {open && product.variants.length > 0 ? <p className="font-body text-caption text-graphite">Mỗi lần lưu áp dụng cho một SKU và ghi nhật ký giá. Sửa nhiều SKU thì lưu lần lượt từng dòng.</p> : null}
      {error ? <p role="alert" className="font-body text-body-sm text-error">{error}</p> : null}
      {saved && !error ? <p role="status" className="font-body text-body-sm text-badge-progress-text">{saved}</p> : null}
      {!canWrite ? <p className="font-body text-caption text-graphite">{disabledReason}</p> : null}
    </Card>
  );
}

function draftsFrom(product: ProductApiDetail): Record<string, string> {
  return Object.fromEntries(product.variants.map((variant) => [variant.id, variant.priceMinor === null ? '' : String(variant.priceMinor)]));
}

/** Empty clears the price; digits only keeps the API's integer-minor-unit contract. */
function parsePrice(value: string): number | null | undefined {
  const trimmed = value.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const parsed = Number(trimmed);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function priceHint(value: string, currency: string): string {
  const parsed = parsePrice(value);
  if (parsed === undefined) return 'Chỉ nhập số nguyên không âm.';
  if (parsed === null) return 'Để trống: bỏ giá, SKU sẽ không thể bán cho đến khi có giá mới.';
  return `Xem trước: ${formatMinor(parsed, currency)}`;
}

function priceErrorMessage(cause: unknown, sku: string): string {
  if (cause instanceof ApiRequestError) {
    switch (cause.code) {
      case 'PRODUCT_REVISION_STALE':
        return 'Sản phẩm vừa thay đổi ở nơi khác. Hệ thống đang tải bản mới; kiểm tra lại giá rồi lưu lần nữa.';
      case 'AUTHENTICATION_REQUIRED':
        return 'Cần đăng nhập lại để thay đổi giá.';
      case 'VARIANT_NOT_FOUND':
        return `Không tìm thấy biến thể ${sku}. Tải lại trang sản phẩm.`;
      case 'VALIDATION_ERROR':
        return `Giá của ${sku} không hợp lệ. Dùng số nguyên không âm theo đơn vị nhỏ nhất.`;
      case 'PRODUCTS_UNAVAILABLE':
        return 'Máy chủ chưa lưu được giá. Thử lại sau.';
      default:
        return cause.message;
    }
  }
  return cause instanceof Error ? cause.message : 'Không lưu được giá.';
}
