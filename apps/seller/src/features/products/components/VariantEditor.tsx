import { useEffect, useRef, useState } from 'react';
import { updateVariant, type UpdateVariantInput } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { ProductApiVariant } from '../product.detail.api';
import { newIdempotencyKey } from '../product.write';

const SKU_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const COLOR_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const SIZE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{0,31}$/;

export interface VariantEditorProps {
  productId: string;
  productVersion: number;
  currency: string;
  variant: ProductApiVariant;
  canWrite: boolean;
  disabledReason?: string;
  onUpdated: () => void;
  onClose: () => void;
}

export function VariantEditor({ productId, productVersion, currency, variant, canWrite, disabledReason, onUpdated, onClose }: VariantEditorProps) {
  const [canonical, setCanonical] = useState(variant);
  const [baseVersion, setBaseVersion] = useState(productVersion);
  const [color, setColor] = useState(variant.color);
  const [size, setSize] = useState(variant.size);
  const [sku, setSku] = useState(variant.sku);
  const [price, setPrice] = useState(variant.priceMinor?.toString() ?? '');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const dirty = sku.trim() !== canonical.sku
    || (color.trim() !== '' && color.trim() !== canonical.color)
    || (size.trim() !== '' && size.trim() !== canonical.size)
    || price.trim() !== (canonical.priceMinor?.toString() ?? '');

  useEffect(() => {
    if (dirty || busy) return;
    setBaseVersion(productVersion);
    setCanonical(variant);
    setSku(variant.sku);
    setColor(variant.color);
    setSize(variant.size);
    setPrice(variant.priceMinor?.toString() ?? '');
  }, [busy, dirty, productVersion, variant]);

  const save = async (explicit?: UpdateVariantInput) => {
    const next: UpdateVariantInput = explicit ? { ...explicit } : {};
    if (!explicit) {
      const nextSku = sku.trim();
      const nextColor = color.trim();
      const nextSize = size.trim();
      if (nextSku !== canonical.sku) next.sku = nextSku;
      if (nextColor && nextColor !== canonical.color) next.color = nextColor;
      if (nextSize && nextSize !== canonical.size) next.size = nextSize;
      const nextPrice = price.trim();
      if (nextPrice !== (canonical.priceMinor?.toString() ?? '')) {
        if (nextPrice === '') {
          next.price_minor = null;
        } else {
          const parsedPrice = Number(nextPrice);
          if (!/^\d+$/.test(nextPrice) || !Number.isSafeInteger(parsedPrice) || parsedPrice < 0) {
            setError('Giá phải là số nguyên không âm theo đơn vị tiền nhỏ nhất.');
            return;
          }
          next.price_minor = parsedPrice;
        }
      }
      if (next.sku) next.reason = reason.trim();
      if (next.sku && !SKU_PATTERN.test(next.sku)) { setError('SKU phải đúng định dạng A-Z/0-9 và tối đa 64 ký tự.'); return; }
      if (next.color && !COLOR_PATTERN.test(next.color)) { setError('Màu phải đúng định dạng A-Z/0-9 và tối đa 64 ký tự.'); return; }
      if (next.size && !SIZE_PATTERN.test(next.size)) { setError('Kích cỡ phải đúng định dạng A-Z/0-9 và tối đa 32 ký tự.'); return; }
      if (next.sku && (!next.reason || next.reason.length > 500)) { setError('Lý do đổi SKU là bắt buộc và tối đa 500 ký tự.'); return; }
      if (Object.keys(next).length === 0) { setError('Không có thuộc tính hợp lệ nào thay đổi.'); return; }
    }
    // Every catalog edit uses the revision shown on the page. Price edits require it at the
    // API boundary; sending it for the other fields also prevents a stale form overwriting a
    // newer SKU or option value.
    next.expected_product_version = baseVersion;
    const payload = JSON.stringify(next);
    if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, key: newIdempotencyKey(`variant-${variant.id}`) };
    setBusy(true); setError(null); setSaved(null);
    try {
      const updated = await updateVariant(productId, variant.id, next, attempt.current.key);
      const nextCanonical: ProductApiVariant = {
        ...canonical,
        sku: updated.sku,
        color: updated.color ?? '',
        colorDescription: updated.color_description ?? '',
        size: updated.size ?? '',
        priceMinor: updated.price_minor ?? null,
        barcode: updated.barcode ?? '',
        isActive: updated.is_active,
        variantIsActive: updated.variant_is_active,
        onHand: updated.on_hand,
        reserved: updated.reserved,
        safetyBuffer: updated.safety_buffer,
        availableToSell: updated.available_to_sell,
      };
      setCanonical(nextCanonical);
      setSku(nextCanonical.sku); setColor(nextCanonical.color); setSize(nextCanonical.size);
      setPrice(nextCanonical.priceMinor?.toString() ?? '');
      setReason(''); setSaved(nextCanonical.sku); attempt.current = null;
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không lưu được biến thể.');
    } finally { setBusy(false); }
  };

  const renaming = sku.trim() !== canonical.sku;
  return (
    <section aria-label={`Sửa biến thể ${canonical.sku}`} className="grid gap-3 rounded-card border border-line bg-white p-4">
      <header className="flex items-center justify-between gap-3">
        <div><p className="font-body text-caption font-semibold uppercase tracking-wide text-primary">Chỉnh sửa SKU</p><h3 className="mt-1 font-display text-base font-bold text-on-surface">{canonical.sku}</h3></div>
        <Button size="sm" variant="ghost" disabled={busy} onClick={onClose}>Đóng</Button>
      </header>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="SKU" value={sku} maxLength={64} onChange={(event) => { setSku(event.target.value); setError(null); }} disabled={busy || !canWrite} />
        <Input label="Màu" value={color} maxLength={64} onChange={(event) => { setColor(event.target.value); setError(null); }} disabled={busy || !canWrite} />
        <Input label="Kích cỡ" value={size} maxLength={32} onChange={(event) => { setSize(event.target.value); setError(null); }} disabled={busy || !canWrite} />
        <Input label={`Giá bán (${currency})`} type="number" min={0} step={1} inputMode="numeric" value={price} hint="Để trống để bỏ giá; số 0 là giá hợp lệ." onChange={(event) => { setPrice(event.target.value); setError(null); }} disabled={busy || !canWrite} />
        {renaming ? <Input label="Lý do đổi SKU" value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} disabled={busy || !canWrite} /> : null}
      </div>
      {error ? <p role="alert" className="font-body text-body-sm text-error">{error}</p> : null}
      {saved && !error ? <p role="status" className="font-body text-body-sm text-badge-progress-text">Đã lưu {saved}.</p> : null}
      {!canWrite ? <p className="font-body text-caption text-graphite">{disabledReason}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !canWrite || !dirty || (renaming && reason.trim() === '')} onClick={() => void save()}>{busy ? 'Đang lưu…' : 'Lưu thay đổi'}</Button>
        {canonical.variantIsActive
          ? <Button size="sm" variant="secondary" disabled={busy || !canWrite} onClick={() => void save({ is_active: false })}>Ẩn khỏi danh mục</Button>
          : <Button size="sm" variant="secondary" disabled={busy || !canWrite} onClick={() => void save({ is_active: true })}>Đưa lại danh mục</Button>}
      </div>
      <p className="font-body text-caption text-graphite">Việc sửa thuộc tính không làm thay đổi tồn kho. Muốn đổi tồn kho, hãy dùng chức năng điều chỉnh tồn kho.</p>
    </section>
  );
}
