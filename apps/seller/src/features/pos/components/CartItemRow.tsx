import { Button } from '../../../components/ui/Button';
import { formatMinor } from '../../../lib/money';
import type { CartItem } from '../pos.types';

export function CartItemRow({
  item,
  onQtyChange,
  onRemove,
  disabled = false,
}: {
  item: CartItem;
  onQtyChange: (sku: string, qty: number) => void;
  onRemove: (sku: string) => void;
  disabled?: boolean;
}) {
  const lineTotal = item.unitPrice * item.qty;
  return (
    <li className="grid gap-3 border-b border-outline-variant/50 py-4 last:border-b-0">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-display text-base font-bold text-on-surface">{item.name}</h3>
          <p className="font-body text-caption text-graphite">{item.variant}</p>
          <code className="mt-1 block truncate font-mono text-caption text-on-surface">{item.sku}</code>
        </div>
        <Button disabled={disabled} aria-label={`Xóa ${item.sku} khỏi giỏ`} size="sm" variant="ghost" onClick={() => onRemove(item.sku)}>
          <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
        </Button>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center rounded-control border border-outline-variant bg-pure-white">
          <button aria-label={`Giảm số lượng ${item.sku}`} className="grid min-h-9 min-w-9 place-items-center text-on-surface disabled:opacity-40" disabled={disabled || item.qty <= 1} type="button" onClick={() => onQtyChange(item.sku, item.qty - 1)}>−</button>
          <span className="min-w-9 text-center font-mono text-sm font-bold text-on-surface" aria-label={`Số lượng ${item.sku}`}>{item.qty}</span>
          <button aria-label={`Tăng số lượng ${item.sku}`} className="grid min-h-9 min-w-9 place-items-center text-on-surface disabled:opacity-40" disabled={disabled || item.qty >= item.maxQty} type="button" onClick={() => onQtyChange(item.sku, item.qty + 1)}>+</button>
        </div>
        <strong className="font-mono text-body-sm text-on-surface">{formatMinor(lineTotal, item.currency)}</strong>
      </div>
    </li>
  );
}
