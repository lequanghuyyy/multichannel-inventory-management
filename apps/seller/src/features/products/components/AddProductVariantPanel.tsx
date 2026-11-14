import { useRef, useState } from 'react';
import { createProductVariant, type CreateProductVariantInput } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { newIdempotencyKey } from '../product.write';

type Form = { sku: string; color: string; size: string; price: string; barcode: string };
const empty: Form = { sku: '', color: '', size: '', price: '', barcode: '' };
const CODE = /^[A-Z0-9][A-Z0-9._-]*$/;

export function AddProductVariantPanel({ productId, canWrite, disabledReason, onAdded }: {
  productId: string; canWrite: boolean; disabledReason?: string; onAdded: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<Form>(empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  const submit = async () => {
    const sku = form.sku.trim(); const color = form.color.trim(); const size = form.size.trim(); const barcode = form.barcode.trim();
    if (!CODE.test(sku) || sku.length > 64) { setError('SKU không đúng định dạng hoặc dài quá 64 ký tự.'); return; }
    if (!CODE.test(color) || color.length > 64) { setError('Màu phải dùng mã A-Z/0-9 và tối đa 64 ký tự.'); return; }
    if (!CODE.test(size) || size.length > 32) { setError('Kích cỡ phải dùng mã A-Z/0-9 và tối đa 32 ký tự.'); return; }
    if (form.price && (!/^\d+$/.test(form.price) || !Number.isSafeInteger(Number(form.price)))) { setError('Giá phải là số nguyên không âm.'); return; }
    if (barcode && !/^\d{8,14}$/.test(barcode)) { setError('Barcode phải có từ 8 đến 14 chữ số.'); return; }
    const input: CreateProductVariantInput = {
      sku, color, size,
      ...(form.price ? { price_minor: Number(form.price) } : {}),
      ...(barcode ? { barcode } : {}),
    };
    const payload = JSON.stringify(input);
    if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, key: newIdempotencyKey('variant-create') };
    setBusy(true); setError(null); setSaved(null);
    try {
      await createProductVariant(productId, input, attempt.current.key);
      attempt.current = null;
      setForm(empty);
      setSaved(sku);
      onAdded();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thêm được biến thể.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Thêm biến thể cho sản phẩm" className="grid gap-4 rounded-card border border-line bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="font-display text-lg font-bold">Thêm SKU cho sản phẩm này</h2><p className="font-body text-caption text-graphite">Thông tin sản phẩm gốc được giữ nguyên. SKU mới có tồn kho bằng 0.</p></div>
        <Button size="sm" variant="secondary" disabled={!canWrite || busy} title={!canWrite ? disabledReason : undefined} onClick={() => { setOpen((value) => !value); setError(null); }}>
          {open ? 'Đóng biểu mẫu' : 'Thêm biến thể'}
        </Button>
      </div>
      {!canWrite ? <p className="font-body text-caption text-graphite">{disabledReason}</p> : null}
      {open ? <>
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="SKU" maxLength={64} value={form.sku} disabled={busy || !canWrite} onChange={(event) => { setForm((current) => ({ ...current, sku: event.target.value })); setError(null); }} />
          <Input label="Màu" maxLength={64} value={form.color} disabled={busy || !canWrite} onChange={(event) => { setForm((current) => ({ ...current, color: event.target.value })); setError(null); }} />
          <Input label="Kích cỡ" maxLength={32} value={form.size} disabled={busy || !canWrite} onChange={(event) => { setForm((current) => ({ ...current, size: event.target.value })); setError(null); }} />
          <Input label="Giá VND (không bắt buộc)" inputMode="numeric" value={form.price} disabled={busy || !canWrite} onChange={(event) => { setForm((current) => ({ ...current, price: event.target.value })); setError(null); }} />
          <Input label="Barcode (không bắt buộc)" inputMode="numeric" maxLength={14} value={form.barcode} disabled={busy || !canWrite} onChange={(event) => { setForm((current) => ({ ...current, barcode: event.target.value })); setError(null); }} />
        </div>
        {error ? <p role="alert" className="font-body text-body-sm text-error">{error}</p> : null}
        {saved ? <p role="status" className="font-body text-body-sm text-badge-progress-text">Đã thêm {saved}; tồn kho hiện bằng 0.</p> : null}
        <Button disabled={!canWrite || busy} loading={busy} loadingLabel="Đang thêm…" onClick={() => void submit()} className="justify-self-start">Lưu biến thể</Button>
      </> : null}
    </section>
  );
}
