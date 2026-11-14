import { useEffect, useMemo, useRef, useState } from 'react';
import {
  deleteProductMedia,
  getProductMediaContent,
  listProductMedia,
  reorderProductMedia,
  uploadProductMedia,
  type ProductMedia,
  type ProductMediaCollection,
} from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { ProductApiDetail } from '../product.detail.api';
import { newIdempotencyKey } from '../product.write';

type Preview = { media: ProductMedia; url: string };

export function ProductMediaManager({ product, canWrite, disabledReason, onUpdated }: {
  product: ProductApiDetail;
  canWrite: boolean;
  disabledReason?: string;
  onUpdated: () => void;
}) {
  const [collection, setCollection] = useState<ProductMediaCollection | null>(null);
  const [previews, setPreviews] = useState<Preview[]>([]);
  const [scopeId, setScopeId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    let active = true;
    const urls: string[] = [];
    setCollection(null);
    setPreviews([]);
    setError(null);
    void (async () => {
      try {
        const result = await listProductMedia(product.id);
        const loaded = await Promise.all(result.media.map(async (media) => {
          const blob = await getProductMediaContent(product.id, media.id);
          const url = URL.createObjectURL(blob);
          urls.push(url);
          return { media, url };
        }));
        if (!active) {
          urls.forEach(URL.revokeObjectURL);
          return;
        }
        setCollection(result);
        setPreviews(loaded);
        if (scopeId && !product.variants.some((variant) => variant.id === scopeId)) setScopeId('');
      } catch (loadError) {
        if (active) setError(loadError instanceof Error ? loadError.message : 'Không thể tải ảnh sản phẩm.');
      }
    })();
    return () => {
      active = false;
      urls.forEach(URL.revokeObjectURL);
    };
  }, [product.id, product.productVersion, product.variants]);

  const scopedPreviews = useMemo(
    () => previews.filter(({ media }) => (media.variant_id ?? '') === scopeId).sort((a, b) => a.media.position - b.media.position),
    [previews, scopeId],
  );

  const updateOrder = async (media: ProductMedia[], primaryId: string) => {
    if (!collection) return;
    setBusy(true);
    setError(null);
    try {
      const next = await reorderProductMedia(product.id, {
        expected_product_version: collection.product_version,
        ...(scopeId ? { variant_id: scopeId } : {}),
        media_ids: media.map((item) => item.id),
        ...(primaryId ? { primary_media_id: primaryId } : {}),
      }, newIdempotencyKey('product-media-order'));
      setCollection(next);
      onUpdated();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể sắp xếp ảnh sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  const upload = async () => {
    if (!file || !collection) return;
    if (!['image/jpeg', 'image/png'].includes(file.type) || file.size < 1 || file.size > 5 * 1024 * 1024) {
      setError('Chọn ảnh JPEG hoặc PNG có dung lượng tối đa 5 MB.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const next = await uploadProductMedia(product.id, file, collection.product_version, newIdempotencyKey('product-media-upload'), scopeId || undefined);
      setCollection(next);
      setFile(null);
      if (fileInput.current) fileInput.current.value = '';
      onUpdated();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : 'Không thể tải ảnh lên.');
    } finally {
      setBusy(false);
    }
  };

  const remove = async (media: ProductMedia) => {
    if (!collection || !globalThis.confirm('Xóa ảnh này khỏi sản phẩm?')) return;
    setBusy(true);
    setError(null);
    try {
      const next = await deleteProductMedia(product.id, media.id, collection.product_version, newIdempotencyKey('product-media-delete'));
      setCollection(next);
      onUpdated();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : 'Không thể xóa ảnh.');
    } finally {
      setBusy(false);
    }
  };

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= scopedPreviews.length) return;
    const reordered = scopedPreviews.map(({ media }) => media);
    const current = reordered[index];
    const next = reordered[target];
    if (!current || !next) return;
    reordered[index] = next;
    reordered[target] = current;
    const primaryId = reordered.find((item) => item.is_primary)?.id ?? reordered[0]?.id ?? '';
    void updateOrder(reordered, primaryId);
  };

  const makePrimary = (mediaId: string) => {
    void updateOrder(scopedPreviews.map(({ media }) => media), mediaId);
  };

  return (
    <Card className="grid gap-5" aria-label="Quản lý ảnh sản phẩm">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="font-body text-caption font-semibold uppercase tracking-wide text-primary">Hình ảnh</p>
          <h2 className="font-display text-xl font-bold text-on-surface">Ảnh sản phẩm</h2>
          <p className="mt-1 max-w-2xl font-body text-body-sm text-on-surface-variant">Ảnh riêng tư trong danh mục. Chỉ nhận JPEG hoặc PNG tối đa 5 MB.</p>
        </div>
        <span className="font-mono text-caption text-on-surface-variant">{collection?.media.length ?? '…'} / 100 ảnh</span>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface">Phạm vi ảnh
          <select aria-label="Phạm vi ảnh" value={scopeId} disabled={busy || !canWrite} onChange={(event) => setScopeId(event.target.value)} className="min-h-11 rounded-control border border-outline-variant bg-pure-white px-3 text-body-sm">
            <option value="">Ảnh chung của sản phẩm</option>
            {product.variants.map((variant) => <option key={variant.id} value={variant.id}>{variant.sku}</option>)}
          </select>
        </label>
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface">Chọn tệp ảnh
          <input ref={fileInput} aria-label="Chọn tệp ảnh" type="file" accept="image/jpeg,image/png" disabled={busy || !canWrite} onChange={(event) => setFile(event.target.files?.[0] ?? null)} className="min-h-11 rounded-control border border-outline-variant bg-pure-white px-3 py-2 text-body-sm file:mr-3 file:rounded-control file:border-0 file:bg-surface-container file:px-3 file:py-1" />
        </label>
      </div>
      <Button size="sm" disabled={busy || !canWrite || !file || !collection} loading={busy} onClick={() => void upload()} className="justify-self-start">Tải ảnh lên</Button>

      {error ? <p role="alert" className="text-body-sm text-error">{error}</p> : null}
      {!canWrite ? <p className="text-caption text-graphite">{disabledReason}</p> : null}
      {!collection && !error ? <p role="status" className="text-body-sm text-on-surface-variant">Đang tải ảnh…</p> : null}
      {collection && scopedPreviews.length === 0 ? <p className="rounded-card border border-dashed border-outline-variant p-5 font-body text-body-sm text-on-surface-variant">Chưa có ảnh trong phạm vi này.</p> : null}

      {scopedPreviews.length > 0 ? (
        <ol className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Thứ tự ảnh">
          {scopedPreviews.map(({ media, url }, index) => (
            <li key={media.id} className="grid gap-3 rounded-card border border-outline-variant bg-pure-white p-3">
              <img src={url} alt={`Ảnh sản phẩm ${index + 1}`} className="aspect-square w-full rounded-control bg-surface-container object-contain" />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-mono text-caption text-on-surface-variant">Ảnh {index + 1} · {(media.byte_size / 1024).toFixed(0)} KB</span>
                {media.is_primary ? <span className="rounded-full bg-badge-progress-bg px-2 py-1 font-body text-caption font-semibold text-badge-progress-text">Ảnh đại diện</span> : null}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={busy || !canWrite || index === 0} aria-label={`Di chuyển ảnh ${index + 1} lên`} onClick={() => move(index, -1)}>Lên</Button>
                <Button size="sm" variant="secondary" disabled={busy || !canWrite || index === scopedPreviews.length - 1} aria-label={`Di chuyển ảnh ${index + 1} xuống`} onClick={() => move(index, 1)}>Xuống</Button>
                {!media.is_primary ? <Button size="sm" variant="secondary" disabled={busy || !canWrite} onClick={() => makePrimary(media.id)}>Đặt ảnh đại diện</Button> : null}
                <Button size="sm" variant="ghost" disabled={busy || !canWrite} onClick={() => void remove(media)}>Xóa</Button>
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </Card>
  );
}
