import { useRef, useState } from 'react';
import { createProduct, type CreateProductInput } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import { newIdempotencyKey } from '../product.write';

const CODE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

type VariantForm = { sku: string; title: string; price: string };

type FormState = {
  name: string;
  category: string;
  description: string;
  variants: VariantForm[];
};

const emptyVariant = (): VariantForm => ({ sku: '', title: '', price: '' });

const emptyForm: FormState = { name: '', category: '', description: '', variants: [emptyVariant()] };

function validate(form: FormState): string | null {
  if (!form.name.trim() || form.name.trim().length > 255) return 'Tên sản phẩm là bắt buộc và tối đa 255 ký tự.';
  if (form.category.trim().length > 64) return 'Danh mục tối đa 64 ký tự.';
  if (form.description.length > 10_000) return 'Mô tả tối đa 10.000 ký tự.';
  if (form.variants.length === 0) return 'Thêm ít nhất một biến thể.';
  const seen = new Set<string>();
  for (let index = 0; index < form.variants.length; index += 1) {
    const variant = form.variants[index]!;
    const row = `Biến thể ${index + 1}: `;
    const sku = variant.sku.trim();
    if (!CODE_PATTERN.test(sku) || sku.length > 64) return `${row}SKU không đúng định dạng hoặc dài quá 64 ký tự.`;
    if (!variant.title.trim() || variant.title.trim().length > 128) return `${row}tên biến thể là bắt buộc và tối đa 128 ký tự.`;
    if (!variant.price.trim()) return `${row}giá bán là bắt buộc.`;
    if (!/^\d+$/.test(variant.price) || !Number.isSafeInteger(Number(variant.price))) return `${row}giá phải là số nguyên không âm.`;
    const key = sku.toLocaleLowerCase('vi-VN');
    if (seen.has(key)) return `${row}SKU bị trùng với một biến thể khác.`;
    seen.add(key);
  }
  return null;
}

export function CreateProductPanel({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [form, setForm] = useState(emptyForm);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ payload: string; key: string } | null>(null);

  const field = (name: 'name' | 'category' | 'description') => ({
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
      ...(form.description.trim() ? { description: form.description.trim() } : {}),
      ...(form.category.trim() ? { category: form.category.trim() } : {}),
      // The backend refuses opening stock. Stock enters only through a receipt or a reasoned
      // adjustment, so the create payload always asks for zero.
      variants: form.variants.map((formVariant) => ({
        sku: formVariant.sku.trim(),
        title: formVariant.title.trim(),
        price: Number(formVariant.price),
        currency: 'VND',
        initialStock: 0,
      })),
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
        <Input label="Tên sản phẩm" maxLength={255} {...field('name')} />
        <Input label="Danh mục (không bắt buộc)" maxLength={64} {...field('category')} />
        <Input label="Mô tả (không bắt buộc)" maxLength={10000} className="sm:col-span-2" {...field('description')} />
      </div>
      <div className="grid gap-3 rounded-control border border-line p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-display font-bold">Biến thể / SKU</h3><p className="font-body text-caption text-graphite">Tên biến thể là thứ hiển thị ở quầy và trên phiếu nhập.</p></div>
          <Button type="button" size="sm" variant="secondary" onClick={() => setForm((current) => ({ ...current, variants: [...current.variants, emptyVariant()] }))}>+ Thêm SKU</Button>
        </div>
        {form.variants.map((variant, index) => (
          <fieldset key={index} className="grid gap-3 rounded-control bg-surface-container-low p-3 sm:grid-cols-2">
            <legend className="px-1 font-body text-caption font-semibold text-graphite">Biến thể {index + 1}</legend>
            <Input label="SKU" maxLength={64} value={variant.sku} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, sku: event.target.value } : item) }))} />
            <Input label="Tên biến thể" maxLength={128} value={variant.title} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) }))} />
            <Input label="Giá bán (VND)" type="number" min={0} step={1} inputMode="numeric" required value={variant.price} onChange={(event) => setForm((current) => ({ ...current, variants: current.variants.map((item, itemIndex) => itemIndex === index ? { ...item, price: event.target.value } : item) }))} />
            {form.variants.length > 1 ? <Button type="button" size="sm" variant="ghost" onClick={() => setForm((current) => ({ ...current, variants: current.variants.filter((_, itemIndex) => itemIndex !== index) }))}>Xóa biến thể {index + 1}</Button> : null}
          </fieldset>
        ))}
      </div>
      {error ? <p role="alert" className="font-body text-body-sm text-error">{error}</p> : null}
      <Button onClick={() => void submit()} loading={busy} loadingLabel="Đang tạo…" className="justify-self-start">Tạo sản phẩm</Button>
    </section>
  );
}
