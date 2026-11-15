import { useRef, useState } from 'react';
import { createProduct, type CreateProductInput } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { newIdempotencyKey } from '../product.write';

const CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]*$/;

type FormState = {
  name: string; masterSku: string; category: string; brand: string; description: string;
  shortDescription: string; attributesJson: string; weightGrams: string;
  lengthMM: string; widthMM: string; heightMM: string; condition: string;
  variants: VariantForm[];
};

type VariantForm = { sku: string; color: string; size: string; price: string; barcode: string };

const emptyVariant = (): VariantForm => ({ sku: '', color: '', size: '', price: '', barcode: '' });

const emptyForm: FormState = {
  name: '', masterSku: '', category: '', brand: '', description: '', shortDescription: '',
  attributesJson: '{}', weightGrams: '', lengthMM: '', widthMM: '', heightMM: '', condition: '',
  variants: [emptyVariant()],
};

function optionalPositiveInteger(value: string, maximum: number): boolean {
  return value === '' || (/^\d+$/.test(value) && Number.isSafeInteger(Number(value)) && Number(value) > 0 && Number(value) <= maximum);
}

function parseAttributes(value: string): Record<string, string> | null {
  try {
    const parsed: unknown = JSON.parse(value || '{}');
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const entries = Object.entries(parsed as Record<string, unknown>);
    if (entries.length > 100 || entries.some(([key, item]) => !key.trim() || key.length > 100 || typeof item !== 'string' || item.length > 1000)) return null;
    return Object.fromEntries(entries.map(([key, item]) => [key.trim(), (item as string).trim()]));
  } catch {
    return null;
  }
}

function validate(form: FormState): string | null {
  if (!form.name.trim() || form.name.trim().length > 200) return 'Tên sản phẩm là bắt buộc và tối đa 200 ký tự.';
  if (!CODE_PATTERN.test(form.masterSku.trim()) || form.masterSku.trim().length > 64) return 'Master SKU phải gồm A-Z, 0-9, dấu chấm, gạch dưới hoặc gạch ngang; tối đa 64 ký tự.';
  if (!form.category.trim()) return 'Danh mục là bắt buộc.';
  if (form.shortDescription.trim().length > 500) return 'Mô tả ngắn tối đa 500 ký tự.';
  if (!optionalPositiveInteger(form.weightGrams, 100_000_000) || !optionalPositiveInteger(form.lengthMM, 10_000_000) || !optionalPositiveInteger(form.widthMM, 10_000_000) || !optionalPositiveInteger(form.heightMM, 10_000_000)) return 'Trọng lượng và kích thước vượt giới hạn; dùng số nguyên dương hoặc để trống nếu chưa biết.';
  if (parseAttributes(form.attributesJson) === null) return 'Thuộc tính phải là JSON object gồm tối đa 100 cặp key/value dạng chuỗi.';
  if (form.condition && !['new', 'used', 'refurbished', 'for_parts'].includes(form.condition)) return 'Tình trạng sản phẩm không hợp lệ.';
  if (form.variants.length === 0) return 'Thêm ít nhất một biến thể.';
  const seenSKUs = new Set<string>();
  const seenAttributes = new Set<string>();
  const seenBarcodes = new Set<string>();
  for (let index = 0; index < form.variants.length; index += 1) {
    const variant = form.variants[index]!;
    const row = `Biến thể ${index + 1}: `;
    const sku = variant.sku.trim(); const color = variant.color.trim(); const size = variant.size.trim(); const barcode = variant.barcode.trim();
    if (!CODE_PATTERN.test(sku) || sku.length > 64) return `${row}SKU không đúng định dạng hoặc dài quá 64 ký tự.`;
    if (!CODE_PATTERN.test(color) || color.length > 64) return `${row}màu phải dùng mã A-Z/0-9 và tối đa 64 ký tự.`;
    if (!CODE_PATTERN.test(size) || size.length > 32) return `${row}kích cỡ phải dùng mã A-Z/0-9 và tối đa 32 ký tự.`;
    if (variant.price.trim() && (!/^\d+$/.test(variant.price) || !Number.isSafeInteger(Number(variant.price)))) return `${row}giá phải là số nguyên không âm.`;
    if (barcode && !/^\d{8,14}$/.test(barcode)) return `${row}barcode phải có từ 8 đến 14 chữ số.`;
    if (seenSKUs.has(sku)) return `${row}SKU bị trùng với một biến thể khác.`;
    if (seenAttributes.has(`${color}\0${size}`)) return `${row}cặp màu và kích cỡ bị trùng.`;
    if (barcode && seenBarcodes.has(barcode)) return `${row}barcode bị trùng với một biến thể khác.`;
    seenSKUs.add(sku); seenAttributes.add(`${color}\0${size}`); if (barcode) seenBarcodes.add(barcode);
  }
  return null;
}

export function CreateProductPanel({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  const field = (name: Exclude<keyof FormState, 'variants'>) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
      setForm((current) => ({ ...current, [name]: event.target.value }));
      setError(null);
    },
  });

  const submit = async () => {
    const validation = validate(form);
    if (validation) { setError(validation); return; }
    const input: CreateProductInput = {
      name: form.name.trim(),
      master_sku: form.masterSku.trim(),
      category: form.category.trim(),
      currency: 'VND',
      variants: form.variants.map((formVariant) => ({
        sku: formVariant.sku.trim(),
        color: formVariant.color.trim(),
        size: formVariant.size.trim(),
        price_minor: formVariant.price.trim() ? Number(formVariant.price) : 0,
        price: formVariant.price.trim() ? Number(formVariant.price) : 0,
        title: [formVariant.color.trim(), formVariant.size.trim()].filter(Boolean).join(' / ') || formVariant.sku.trim() || 'Mặc định',
        ...(formVariant.barcode.trim() ? { barcode: formVariant.barcode.trim() } : {}),
      })),
      ...(form.brand.trim() ? { brand: form.brand.trim() } : {}),
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.shortDescription.trim() ? { short_description: form.shortDescription.trim() } : {}),
      attributes: parseAttributes(form.attributesJson) ?? {},
      ...(form.weightGrams ? { weight_grams: Number(form.weightGrams) } : {}),
      ...(form.lengthMM ? { length_mm: Number(form.lengthMM) } : {}),
      ...(form.widthMM ? { width_mm: Number(form.widthMM) } : {}),
      ...(form.heightMM ? { height_mm: Number(form.heightMM) } : {}),
      ...(form.condition ? { condition: form.condition as CreateProductInput['condition'] } : {}),
    };
    const payload = JSON.stringify(input);
    if (!attempt.current || attempt.current.payload !== payload) attempt.current = { payload, key: newIdempotencyKey('product-create') };
    setBusy(true);
    setError(null);
    try {
      await createProduct(input, attempt.current.key);
      attempt.current = null;
      setForm(emptyForm);
      onCreated();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không tạo được sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section aria-label="Tạo sản phẩm" className="grid gap-4 rounded-card border border-line bg-white p-5">
      <div className="flex items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold">Thêm sản phẩm</h2><p className="font-body text-caption text-graphite">Sản phẩm mới được tạo ở trạng thái draft với tồn kho bằng 0.</p></div><Button variant="ghost" size="sm" onClick={onClose}>Đóng</Button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Tên sản phẩm" maxLength={200} {...field('name')} />
        <Input label="Master SKU" maxLength={64} {...field('masterSku')} />
        <Input label="Danh mục" {...field('category')} />
        <Input label="Thương hiệu (không bắt buộc)" {...field('brand')} />
        <Input label="Mô tả (không bắt buộc)" className="sm:col-span-2" {...field('description')} />
        <Input label="Mô tả ngắn (tối đa 500 ký tự)" maxLength={500} className="sm:col-span-2" {...field('shortDescription')} />
        <Input label="Trọng lượng (g, tùy chọn)" type="number" min={1} max={100000000} step={1} inputMode="numeric" {...field('weightGrams')} />
        <Input label="Chiều dài (mm, tùy chọn)" type="number" min={1} max={10000000} step={1} inputMode="numeric" {...field('lengthMM')} />
        <Input label="Chiều rộng (mm, tùy chọn)" type="number" min={1} max={10000000} step={1} inputMode="numeric" {...field('widthMM')} />
        <Input label="Chiều cao (mm, tùy chọn)" type="number" min={1} max={10000000} step={1} inputMode="numeric" {...field('heightMM')} />
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface">Tình trạng (tùy chọn)
          <select value={form.condition} onChange={(event) => setForm((current) => ({ ...current, condition: event.target.value }))} className="min-h-11 rounded-control border border-outline-variant bg-pure-white px-3 text-body-sm">
            <option value="">Chưa xác định</option><option value="new">Mới</option><option value="used">Đã qua sử dụng</option><option value="refurbished">Tân trang</option><option value="for_parts">Lấy linh kiện</option>
          </select>
        </label>
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface sm:col-span-2">Thuộc tính marketplace (JSON object, tùy chọn)
          <textarea value={form.attributesJson} onChange={(event) => setForm((current) => ({ ...current, attributesJson: event.target.value }))} rows={4} className="rounded-control border border-outline-variant bg-pure-white p-3 font-mono text-caption" aria-label="Thuộc tính marketplace" />
        </label>
      </div>
      <div className="grid gap-3 rounded-control border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-display font-bold">Biến thể / SKU</h3><p className="font-body text-caption text-graphite">Khai báo các màu và kích cỡ của sản phẩm này.</p></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setForm((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }))}>+ Thêm SKU</Button>
        </div>
        {form.variants.map((variant, index) => (
          <fieldset key={index} className="grid gap-3 rounded-control bg-surface-container-low p-3 sm:grid-cols-2">
            <legend className="px-1 font-body text-caption font-semibold text-graphite">Biến thể {index + 1}</legend>
            <Input label="SKU" maxLength={64} value={variant.sku} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item) }))} />
            <Input label="Màu" maxLength={64} value={variant.color} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, color: event.target.value } : item) }))} />
            <Input label="Kích cỡ" maxLength={32} value={variant.size} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, size: event.target.value } : item) }))} />
            <Input label="Giá bán (VND)" type="number" min={0} step={1} inputMode="numeric" value={variant.price} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item) }))} />
            <Input label="Barcode (không bắt buộc)" inputMode="numeric" maxLength={14} value={variant.barcode} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, barcode: event.target.value } : item) }))} />
            {form.variants.length > 1 ? <Button type="button" size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, variants: current.variants.filter((_, itemIndex) => itemIndex !== index) }))}>Xóa biến thể {index + 1}</Button> : null}
          </fieldset>
        ))}
      </div>
      {error ? <p role="alert" className="font-body text-body-sm text-error">{error}</p> : null}
      <Button onClick={() => void submit()} loading={busy} loadingLabel="Đang tạo…" className="justify-self-start">Tạo sản phẩm</Button>
    </section>
  );
}
