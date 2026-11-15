import { useEffect, useRef, useState } from 'react';
import { updateProductCatalog, type UpdateProductCatalogInput } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { newIdempotencyKey } from '../product.write';
import { toProductApiDetail, type ProductApiDetail } from '../product.detail.api';

type Draft = {
  name: string;
  category: string;
  brand: string;
  description: string;
  shortDescription: string;
  attributesJson: string;
  weightGrams: string;
  lengthMM: string;
  widthMM: string;
  heightMM: string;
  condition: string;
};

function draftFrom(product: ProductApiDetail): Draft {
  return {
    name: product.name,
    category: product.category,
    brand: product.brand,
    description: product.description,
    shortDescription: product.shortDescription,
    attributesJson: JSON.stringify(product.attributes, null, 2),
    weightGrams: product.weightGrams?.toString() ?? '',
    lengthMM: product.lengthMM?.toString() ?? '',
    widthMM: product.widthMM?.toString() ?? '',
    heightMM: product.heightMM?.toString() ?? '',
    condition: product.condition,
  };
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

function parseMeasurement(value: string, maximum: number): number | null | undefined {
  if (value.trim() === '') return null;
  if (!/^\d+$/.test(value.trim())) return undefined;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= maximum ? parsed : undefined;
}

export function ProductCatalogEditor({ product, canWrite, disabledReason, onUpdated }: {
  product: ProductApiDetail;
  canWrite: boolean;
  disabledReason?: string;
  onUpdated: () => void;
}) {
  const [draft, setDraft] = useState(() => draftFrom(product));
  const [open, setOpen] = useState(false);
  const [baseVersion, setBaseVersion] = useState(product.productVersion);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const attempt = useRef<{ payload: string; key: string } | null>(null);
  const canonical = draftFrom(product);
  const dirty = JSON.stringify(draft) !== JSON.stringify(canonical);

  useEffect(() => {
    if (dirty || busy) return;
    setDraft(canonical);
    setBaseVersion(product.productVersion);
  }, [busy, dirty, product]);

  const save = async () => {
    const attributes = parseAttributes(draft.attributesJson);
    if (attributes === null) {
      setError('Thuộc tính phải là JSON object gồm tối đa 100 cặp key/value dạng chuỗi.');
      return;
    }
    if (!draft.name.trim() || !draft.category.trim()) {
      setError('Tên sản phẩm và danh mục là bắt buộc.');
      return;
    }
    if (draft.name.trim().length > 200 || draft.category.trim().length > 200 || draft.brand.trim().length > 200 || draft.description.length > 10_000 || draft.shortDescription.length > 500) {
      setError('Một hoặc nhiều trường vượt quá độ dài cho phép.');
      return;
    }
    const weight = parseMeasurement(draft.weightGrams, 100_000_000);
    const length = parseMeasurement(draft.lengthMM, 10_000_000);
    const width = parseMeasurement(draft.widthMM, 10_000_000);
    const height = parseMeasurement(draft.heightMM, 10_000_000);
    if (weight === undefined || length === undefined || width === undefined || height === undefined) {
      setError('Trọng lượng và kích thước phải là số nguyên dương hoặc để trống.');
      return;
    }
    if (draft.condition && !['new', 'used', 'refurbished', 'for_parts'].includes(draft.condition)) {
      setError('Tình trạng sản phẩm không hợp lệ.');
      return;
    }
    const input: UpdateProductCatalogInput = {
      name: draft.name.trim(),
      category: draft.category.trim(),
      brand: draft.brand.trim(),
      description: draft.description.trim(),
      short_description: draft.shortDescription.trim(),
      attributes,
      weight_grams: weight ?? null,
      length_mm: length ?? null,
      width_mm: width ?? null,
      height_mm: height ?? null,
      condition: draft.condition as UpdateProductCatalogInput['condition'],
      expected_product_version: baseVersion,
      ...(reason.trim() ? { reason: reason.trim() } : {}),
    };
    const payload = JSON.stringify(input);
    if (!attempt.current || attempt.current.payload !== payload) {
      attempt.current = { payload, key: newIdempotencyKey(`catalog-${product.id}`) };
    }
    setBusy(true);
    setError(null);
    setSaved(false);
    try {
      const result = await updateProductCatalog(product.id, input, attempt.current.key);
      setBaseVersion(result.product_version ?? baseVersion);
      setDraft(draftFrom(toProductApiDetail(result)));
      setReason('');
      attempt.current = null;
      setSaved(true);
      onUpdated();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không cập nhật được thông tin sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="grid gap-4 p-5" aria-label="Chỉnh sửa thông tin sản phẩm">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-on-surface">Thông tin sản phẩm</h2>
          <p className="mt-1 text-caption text-graphite">Cập nhật danh mục, mô tả và thông số marketplace.</p>
        </div>
        <Button size="sm" variant="secondary" disabled={!canWrite || busy} title={!canWrite ? disabledReason : undefined} aria-expanded={open} onClick={() => setOpen((value) => !value)}>
          {open ? 'Đóng chỉnh sửa' : 'Chỉnh sửa thông tin'}
        </Button>
      </header>
      {open ? <>
      <p className="text-caption text-graphite">Trọng lượng lưu bằng gram, kích thước bằng millimeter. Thuộc tính chưa xác minh có thể để trống.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Tên sản phẩm" maxLength={200} value={draft.name} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
        <Input label="Danh mục" maxLength={200} value={draft.category} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, category: event.target.value }))} />
        <Input label="Thương hiệu" maxLength={200} value={draft.brand} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, brand: event.target.value }))} />
        <Input label="Mô tả ngắn" maxLength={500} value={draft.shortDescription} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, shortDescription: event.target.value }))} />
        <Input label="Trọng lượng (g)" type="number" min={1} max={100000000} step={1} value={draft.weightGrams} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, weightGrams: event.target.value }))} />
        <Input label="Chiều dài (mm)" type="number" min={1} max={10000000} step={1} value={draft.lengthMM} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, lengthMM: event.target.value }))} />
        <Input label="Chiều rộng (mm)" type="number" min={1} max={10000000} step={1} value={draft.widthMM} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, widthMM: event.target.value }))} />
        <Input label="Chiều cao (mm)" type="number" min={1} max={10000000} step={1} value={draft.heightMM} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, heightMM: event.target.value }))} />
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface">Tình trạng
          <select value={draft.condition} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, condition: event.target.value }))} className="min-h-11 rounded-control border border-outline-variant bg-pure-white px-3 text-body-sm">
            <option value="">Chưa xác định</option><option value="new">Mới</option><option value="used">Đã qua sử dụng</option><option value="refurbished">Tân trang</option><option value="for_parts">Lấy linh kiện</option>
          </select>
        </label>
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface sm:col-span-2">Mô tả chi tiết
          <textarea value={draft.description} maxLength={10000} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} rows={5} className="rounded-control border border-outline-variant bg-pure-white p-3 text-body-sm" />
        </label>
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface sm:col-span-2">Thuộc tính marketplace (JSON object gồm chuỗi)
          <textarea value={draft.attributesJson} disabled={busy || !canWrite} onChange={(event) => setDraft((current) => ({ ...current, attributesJson: event.target.value }))} rows={5} className="rounded-control border border-outline-variant bg-pure-white p-3 font-mono text-caption" />
        </label>
        <Input label="Lý do cập nhật (tùy chọn)" maxLength={500} value={reason} disabled={busy || !canWrite} onChange={(event) => setReason(event.target.value)} />
      </div>
      {error ? <p role="alert" className="text-body-sm text-error">{error}</p> : null}
      {saved ? <p role="status" className="text-body-sm text-badge-progress-text">Đã lưu thông tin sản phẩm.</p> : null}
      {!canWrite ? <p className="text-caption text-graphite">{disabledReason}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" disabled={busy || !canWrite || !dirty} loading={busy} onClick={() => void save()}>Lưu thông tin sản phẩm</Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => { setDraft(draftFrom(product)); setReason(''); setError(null); setSaved(false); setOpen(false); }}>Hủy</Button>
      </div>
      </> : !canWrite ? <p className="text-caption text-graphite">{disabledReason}</p> : null}
    </Card>
  );
}
