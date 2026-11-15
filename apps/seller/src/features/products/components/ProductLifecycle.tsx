import { useRef, useState } from 'react';
import { PRODUCT_TRANSITIONS, transitionProduct, type ProductStatus } from '../../../api/products';
import { Button } from '../../../components/ui/Button';
import { newIdempotencyKey } from '../product.write';

const labels: Record<ProductStatus, string> = { draft: 'Nháp', active: 'Đang bán', out_of_stock: 'Hết hàng', archived: 'Lưu trữ' };

export function ProductLifecycle({ availableToSell, canWrite, disabledReason, onTransitioned, productId, status }: {
  productId: string; status: ProductStatus; availableToSell: number; canWrite: boolean; disabledReason?: string; onTransitioned: () => void;
}) {
  const [busy, setBusy] = useState<ProductStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ operation: string; key: string } | null>(null);
  const options = PRODUCT_TRANSITIONS[status] ?? [];

  const move = async (next: ProductStatus) => {
    const operation = `${productId}:${status}:${next}`;
    if (!attempt.current || attempt.current.operation !== operation) attempt.current = { operation, key: newIdempotencyKey('product-lifecycle') };
    setBusy(next);
    setError(null);
    try {
      await transitionProduct(productId, next, attempt.current.key);
      attempt.current = null;
      onTransitioned();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không chuyển được trạng thái.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section aria-label="Vòng đời sản phẩm" className="rounded-card border border-line bg-white p-5">
      <h2 className="font-display text-lg font-bold text-on-surface">Vòng đời sản phẩm</h2>
      <p className="mt-1 font-body text-body-sm text-graphite">Trạng thái hiện tại: <strong className="text-on-surface">{labels[status]}</strong>. {options.length === 0 ? 'Đây là trạng thái cuối, không thể chuyển sang trạng thái khác.' : 'Chỉ chuyển được sang các trạng thái bên dưới.'}</p>
      {!canWrite ? <p className="mt-2 font-body text-caption text-graphite">{disabledReason}</p> : null}
      <div className="mt-4 flex flex-wrap gap-2">{options.map((option) => {
        const stockBlocked = option === 'out_of_stock' && availableToSell > 0;
        return <Button key={option} size="sm" variant="secondary" disabled={!canWrite || busy !== null || stockBlocked} title={stockBlocked ? `Không thể chuyển hết hàng khi ATS còn ${availableToSell}.` : !canWrite ? disabledReason : undefined} onClick={() => void move(option)}>{busy === option ? 'Đang lưu…' : `Chuyển sang ${labels[option]}`}</Button>;
      })}</div>
      {error ? <p role="alert" className="mt-3 font-body text-body-sm text-error">{error}</p> : null}
    </section>
  );
}
