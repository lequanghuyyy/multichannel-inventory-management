import { formatMinor } from '../../../lib/money';

/**
 * The payable total, and nothing else.
 *
 * It shows the subtotal and the total, and the two are always equal: the backend applies no
 * voucher, no VAT and no other line the till would have to invent, so any discount rendered
 * here would be a number the server never charged. The total here must equal the `total_minor`
 * the order endpoint confirms, or the till is showing the customer one price and taking
 * another.
 */
export function PaymentSummary({
  itemCount,
  subtotal,
  discount = 0,
  total,
  currency = 'VND',
}: {
  itemCount: number;
  subtotal: number | null;
  discount?: number | null;
  total?: number | null;
  /** Absent only on the fixture path, which has always been VND. */
  currency?: string;
}) {
  const amount = subtotal === null ? '—' : formatMinor(subtotal, currency);
  const discountAmount = discount === null ? '—' : formatMinor(discount, currency);
  const totalAmount = (total ?? subtotal) === null ? '—' : formatMinor((total ?? subtotal)!, currency);
  return (
    <dl className="grid gap-2 border-y border-outline-variant/60 py-4 font-body text-body-sm" aria-label="Tóm tắt thanh toán">
      <div className="flex items-center justify-between gap-3"><dt className="text-graphite">Tạm tính ({itemCount} sản phẩm)</dt><dd className="font-mono font-semibold text-on-surface">{amount}</dd></div>
      {discount !== 0 ? <div className="flex items-center justify-between gap-3"><dt className="text-graphite">Giảm giá</dt><dd className="font-mono font-semibold text-on-surface">−{discountAmount}</dd></div> : null}
      <div className="mt-2 flex items-end justify-between gap-3 border-t border-outline-variant/50 pt-4">
        <dt className="font-display text-lg font-bold text-on-surface">Tổng cộng</dt>
        <dd className="font-display text-2xl font-bold text-on-surface" aria-label="Tổng thanh toán">{totalAmount}</dd>
      </div>
    </dl>
  );
}
