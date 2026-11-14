import type { RefObject } from 'react';
import { Button } from '../../../components/ui/Button';
import { formatMinor } from '../../../lib/money';
import type { CartItem, PosSale, SalePaymentInstruction, SalePaymentMethod } from '../pos.types';
import type { CartReview } from '../pos.api';
import type { SaleAttemptStatus } from '../useSaleAttempt';
import { CartItemRow } from './CartItemRow';
import { PaymentSummary } from './PaymentSummary';

export function CurrentSalePanel({
  items,
  onQtyChange,
  onRemove,
  onClear,
  onConfirm,
  onOpenOrder,
  onStartNextSale,
  submitting,
  sale,
  saleError,
  attemptStatus,
  pendingReference,
  pendingOrderId,
  blockedReason,
  cartLocked,
  paymentLocked,
  cartError,
  currency,
  totalMinor,
  subtotalMinor,
  discountMinor,
  discountInput,
  discountReason,
  canDiscount,
  onDiscountInputChange,
  onDiscountReasonChange,
  paymentMethod,
  onPaymentMethodChange,
  cashReceived,
  onCashReceivedChange,
  cashReceivedMinor,
  externalVerified,
  onExternalVerifiedChange,
  paymentInstruction,
  checkoutEnabled,
  recoveryEnabled,
  stockReview,
  stockChecking,
  onAcceptStockReview,
  onDismissSaleError,
  checkoutRef,
}: {
  items: CartItem[];
  onQtyChange: (sku: string, qty: number) => void;
  onRemove: (sku: string) => void;
  onClear: () => void;
  onConfirm: () => void;
  onOpenOrder: (orderId: string) => void;
  onStartNextSale: () => void;
  submitting: boolean;
  sale: PosSale | null;
  saleError: unknown;
  attemptStatus: SaleAttemptStatus;
  pendingReference: string | null;
  pendingOrderId: string | null;
  blockedReason: string | null;
  cartLocked: boolean;
  paymentLocked: boolean;
  cartError: string | null;
  currency: string;
  totalMinor: number | null;
  subtotalMinor: number | null;
  discountMinor: number | null;
  discountInput: string;
  discountReason: string;
  canDiscount: boolean;
  onDiscountInputChange: (amount: string) => void;
  onDiscountReasonChange: (reason: string) => void;
  paymentMethod: SalePaymentMethod;
  onPaymentMethodChange: (method: SalePaymentMethod) => void;
  cashReceived: string;
  onCashReceivedChange: (amount: string) => void;
  cashReceivedMinor: number | null;
  externalVerified: boolean;
  onExternalVerifiedChange: (verified: boolean) => void;
  paymentInstruction: SalePaymentInstruction | null;
  checkoutEnabled: boolean;
  recoveryEnabled: boolean;
  stockReview: CartReview | null;
  stockChecking: boolean;
  onAcceptStockReview: () => void;
  onDismissSaleError: () => void;
  checkoutRef?: RefObject<HTMLDivElement | null>;
}) {
  const itemCount = items.reduce((total, item) => total + item.qty, 0);
  const cashChange = totalMinor !== null && cashReceivedMinor !== null ? cashReceivedMinor - totalMinor : null;
  const retryingPayment = ['payment-pending', 'payment-indeterminate'].includes(attemptStatus);
  const retryingOrder = attemptStatus === 'indeterminate';
  const complete = attemptStatus === 'confirmed' && sale?.paymentStatus === 'paid';
  const paymentInputsDisabled = paymentLocked || (cartLocked && !(attemptStatus === 'payment-pending' && paymentInstruction === null));
  const savedPaymentLabel = paymentInstruction?.method === 'cash'
    ? `Tiền mặt · đã nhận ${formatMinor(paymentInstruction.receivedMinor, currency)}${paymentInstruction.changeMinor > 0 ? ` · trả lại ${formatMinor(paymentInstruction.changeMinor, currency)}` : ''}`
    : paymentInstruction?.method === 'external'
      ? 'Thanh toán ngoài hệ thống · đã kiểm chứng thủ công'
      : null;

  return (
    <aside className="grid min-w-0 gap-5 rounded-lg border border-metric-ink bg-pure-white p-5 shadow-metric lg:sticky lg:top-6" aria-label="Giỏ hàng và thanh toán">
      <div className="grid gap-3 border-b border-outline-variant/50 pb-4">
        <div className="flex min-w-0 items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-graphite">Bước 1 · Kiểm tra đơn</p>
            <h2 className="mt-1 break-words font-display text-2xl font-bold text-on-surface">Giỏ hàng</h2>
            <p className="mt-1 font-body text-body-sm text-graphite">{itemCount} sản phẩm</p>
          </div>
          <Button disabled={items.length === 0 || cartLocked} size="sm" variant="ghost" onClick={onClear}>Xóa giỏ</Button>
        </div>
      </div>

      <ul className="max-h-96 overflow-y-auto pr-1" aria-label="Danh sách sản phẩm trong giỏ">
        {items.length ? items.map((item) => <CartItemRow disabled={cartLocked} item={item} key={item.sku} onQtyChange={onQtyChange} onRemove={onRemove} />) : (
          <li className="rounded-control bg-surface-container-low p-5 text-center font-body text-body-sm text-graphite">Giỏ hàng đang trống. Chọn sản phẩm ở danh mục để bắt đầu.</li>
        )}
      </ul>

      <PaymentSummary itemCount={itemCount} subtotal={subtotalMinor} discount={discountMinor} total={totalMinor} currency={currency} />
      {canDiscount && items.length > 0 ? <section className="grid gap-2 rounded-control border border-outline-variant/60 p-3" aria-label="Giảm giá POS">
        <label className="grid gap-1 font-body text-caption font-semibold text-on-surface" htmlFor="pos-discount">Giảm giá ({currency || 'chọn một loại tiền'})<input id="pos-discount" aria-label="Giảm giá" inputMode="decimal" type="text" value={discountInput} onChange={(event)=>onDiscountInputChange(event.target.value)} disabled={cartLocked} className="min-h-11 rounded-control border border-outline-variant bg-pure-white px-3 font-mono text-body-sm outline-none focus:border-carbon focus:ring-2 focus:ring-carbon/20 disabled:bg-surface-container-low" placeholder="0" /></label>
        {discountMinor !== null && discountMinor > 0 ? <label className="grid gap-1 font-body text-caption font-semibold text-on-surface" htmlFor="pos-discount-reason">Lý do giảm giá<input id="pos-discount-reason" value={discountReason} maxLength={500} onChange={(event)=>onDiscountReasonChange(event.target.value)} disabled={cartLocked} className="min-h-11 rounded-control border border-outline-variant bg-pure-white px-3 font-body text-body-sm outline-none focus:border-carbon focus:ring-2 focus:ring-carbon/20 disabled:bg-surface-container-low" placeholder="Nhập lý do" /></label> : null}
        <p className="font-body text-caption text-graphite">Chỉ ADMIN được ghi nhận giảm giá; lý do và người thao tác sẽ được lưu trong nhật ký.</p>
      </section> : null}
      {totalMinor === null && items.length > 0 ? <p className="rounded-control bg-error-container p-3 font-body text-caption text-on-error-container" role="alert">Tổng tiền vượt giới hạn tính toán an toàn. Hãy giảm số lượng trước khi tiếp tục.</p> : null}

      {stockReview ? (
        <section className="grid min-w-0 gap-3 rounded-control border border-outline-variant bg-badge-blocked-bg p-4" aria-labelledby="pos-stock-review-title">
          <div>
            <h3 id="pos-stock-review-title" className="font-display text-base font-bold text-badge-blocked-text">Giá hoặc tồn khả dụng đã thay đổi</h3>
            <p className="mt-1 font-body text-caption leading-5 text-badge-blocked-text">Chưa có đơn nào được tạo. Kiểm tra số lượng, giá và loại tiền mới của từng SKU; xác nhận giỏ và nhập lại thông tin tiền nhận trước khi tiếp tục.</p>
          </div>
          <ul className="grid gap-2">
            {stockReview.changes.map((change) => (
              <li className="min-w-0 rounded-control bg-pure-white/70 p-3 font-body text-caption text-on-surface" key={change.sku}>
                <code className="block break-all font-mono font-bold">{change.sku}</code>
                <span className="mt-1 block">Số lượng: {change.quantityBefore} → {change.quantityAfter} · {change.availabilityLabel}: {change.availableBefore} → {change.availableAfter}</span>
                <span className="mt-1 block">Đơn giá: {formatMinor(change.priceBeforeMinor, change.currencyBefore)} → {formatMinor(change.priceAfterMinor, change.currencyAfter)}</span>
                <span className="mt-1 block">Thành tiền: {formatMinor(change.lineTotalBefore, change.currencyBefore)} → {formatMinor(change.lineTotalAfter, change.currencyAfter)}</span>
              </li>
            ))}
          </ul>
          <div className="grid gap-1 border-t border-outline-variant/50 pt-3 font-body text-caption">
            <p>Tổng trước: <strong className="font-mono">{formatMinor(stockReview.totalBefore, stockReview.currencyBefore)}</strong></p>
            <p>Tổng sau khi xác nhận: <strong className="font-mono">{formatMinor(stockReview.totalAfter, stockReview.currencyAfter)}</strong></p>
          </div>
          <Button variant="secondary" onClick={onAcceptStockReview}>Xác nhận giỏ hàng mới</Button>
        </section>
      ) : null}

      <section className="grid min-w-0 gap-3" aria-labelledby="pos-payment-title">
        <div>
          <p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-graphite">Bước 2 · Chuẩn bị thanh toán</p>
          <h3 id="pos-payment-title" className="mt-1 font-display text-lg font-bold text-on-surface">{totalMinor === null ? 'Số tiền cần thu' : formatMinor(totalMinor, currency)}</h3>
        </div>
        {paymentLocked && savedPaymentLabel ? (
          <div className="rounded-control bg-surface-container-low p-3 font-body text-body-sm text-on-surface" role="status">{savedPaymentLabel}. Nội dung xác nhận đã lưu và không thể thay đổi khi đang đối soát.</div>
        ) : (
          <>
            <fieldset className="grid gap-2" disabled={paymentInputsDisabled}>
              <legend className="sr-only">Chọn phương thức thanh toán</legend>
              <label className="flex min-h-11 items-center gap-3 rounded-control border border-outline-variant p-3 font-body text-body-sm text-on-surface">
                <input type="radio" name="pos-payment-method" value="cash" checked={paymentMethod === 'cash'} onChange={() => onPaymentMethodChange('cash')} />
                Tiền mặt
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-control border border-outline-variant p-3 font-body text-body-sm text-on-surface">
                <input type="radio" name="pos-payment-method" value="external" checked={paymentMethod === 'external'} onChange={() => onPaymentMethodChange('external')} />
                Thanh toán ngoài hệ thống đã kiểm chứng
              </label>
            </fieldset>
            {paymentMethod === 'cash' ? (
              <div className="grid gap-2">
                <label className="grid gap-1 font-body text-caption font-semibold text-on-surface" htmlFor="pos-cash-received">
                  Tiền khách đưa ({currency || 'chọn một loại tiền'})
                  <input id="pos-cash-received" aria-label="Tiền khách đưa" className="min-h-11 w-full rounded-control border border-outline-variant bg-pure-white px-3 font-mono text-body-sm text-on-surface outline-none focus:border-carbon focus:ring-2 focus:ring-carbon/20 disabled:bg-surface-container-low" disabled={paymentInputsDisabled} inputMode="decimal" type="text" value={cashReceived} onChange={(event) => onCashReceivedChange(event.target.value)} placeholder="Nhập số tiền đã nhận" />
                </label>
                <p className="font-body text-caption text-graphite">Tiền phải thu: <strong className="font-mono text-on-surface">{totalMinor === null ? '—' : formatMinor(totalMinor, currency)}</strong></p>
                <p className="font-body text-caption text-graphite">Tiền thừa: <strong className="font-mono text-on-surface">{cashChange !== null && cashChange >= 0 ? formatMinor(cashChange, currency) : '—'}</strong></p>
                {cashReceivedMinor !== null && totalMinor !== null && cashReceivedMinor < totalMinor ? <p className="font-body text-caption text-error" role="alert">Tiền khách đưa chưa đủ để thanh toán.</p> : null}
              </div>
            ) : (
              <label className="flex min-h-11 items-start gap-3 rounded-control bg-surface-container-low p-3 font-body text-caption leading-5 text-on-surface">
                <input className="mt-1" type="checkbox" checked={externalVerified} disabled={paymentInputsDisabled} onChange={(event) => onExternalVerifiedChange(event.target.checked)} />
                Tôi đã trực tiếp kiểm chứng và xác nhận đã nhận khoản thanh toán ngoài hệ thống.
              </label>
            )}
          </>
        )}
      </section>

      {complete && sale ? (
        <div className="grid gap-3 rounded-control bg-badge-progress-bg p-4 font-body text-caption text-badge-progress-text" role="status">
          <div><strong className="block font-display text-base">Đã hoàn tất bán hàng và ghi nhận thanh toán</strong><span className="mt-1 block">Đơn {sale.reference} · {sale.itemCount} sản phẩm · {formatMinor(sale.totalMinor, sale.currency)}</span></div>
          <div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" onClick={() => onOpenOrder(sale.orderId)}>Mở chi tiết đơn</Button><Button size="sm" onClick={onStartNextSale}>Bán đơn tiếp theo</Button></div>
        </div>
      ) : null}

      {attemptStatus === 'payment-pending' ? (
        <div className="rounded-control bg-badge-blocked-bg p-4 font-body text-caption text-badge-blocked-text" role="alert">
          <strong className="block font-display text-base">Đơn đã tạo; thanh toán chưa được ghi nhận.</strong>
          Đơn {pendingReference ?? sale?.reference ?? 'đã tạo'} không được tạo lại. Hãy kiểm tra khoản tiền đã nhận rồi gửi lại xác nhận bằng cùng mã thao tác.
          {pendingOrderId ? <code className="mt-2 block break-all font-mono">Mã đơn nội bộ: {pendingOrderId}</code> : null}
        </div>
      ) : null}
      {attemptStatus === 'payment-indeterminate' ? (
        <div className="rounded-control bg-error-container p-4 font-body text-caption text-on-error-container" role="alert">
          <strong className="block font-display text-base">Chưa xác định được kết quả xác nhận thanh toán.</strong>
          Đơn đã tồn tại và giỏ hàng đang khóa. Khi có mạng, kiểm tra trạng thái trên máy chủ hoặc gửi lại cùng payload và khóa; không tạo đơn khác.
          {pendingReference ? <span className="mt-1 block">Mã tham chiếu: <code className="break-all font-mono font-bold">{pendingReference}</code>.</span> : null}
        </div>
      ) : null}
      {attemptStatus === 'blocked' ? (
        <div className="rounded-control bg-error-container p-4 font-body text-caption text-on-error-container" role="alert">
          <strong className="block font-display text-base">Quầy đang khóa giao dịch mới.</strong>
          {blockedReason ?? 'Cần kiểm tra giao dịch đang chờ trước khi bán tiếp.'}
          {pendingReference ? <span className="mt-1 block">Mã tham chiếu cần kiểm tra: <code className="break-all font-mono font-bold">{pendingReference}</code>.</span> : null}
        </div>
      ) : null}
      {retryingOrder ? (
        <div className="rounded-control bg-error-container p-4 font-body text-caption text-on-error-container" role="alert">
          <strong className="block font-display text-base">Chưa xác định được kết quả tạo đơn.</strong>
          Đơn có thể đã được máy chủ ghi nhận. Giỏ, khóa idempotency và thông tin thanh toán đã lưu để kiểm tra lại cùng giao dịch.
        </div>
      ) : null}
      {attemptStatus === 'rejected' && saleError ? (
        <div className="rounded-control bg-error-container p-4 font-body text-caption text-on-error-container" role="alert">
          <strong className="block font-display text-base">Giao dịch bị từ chối.</strong>
          Không có đơn nào được tạo. Giỏ hàng được giữ lại để bạn kiểm tra và thử lại.
          {saleError instanceof Error ? <p className="mt-2">{saleError.message}</p> : null}
          <Button className="mt-3" size="sm" variant="secondary" onClick={onDismissSaleError}>Đã hiểu</Button>
        </div>
      ) : null}
      {cartError ? <div role="alert" className="rounded-control bg-error-container p-4 font-body text-caption text-on-error-container">{cartError}</div> : null}
      {saleError && attemptStatus !== 'rejected' && attemptStatus !== 'blocked' ? <p role="alert" className="rounded-control bg-error-container p-4 font-body text-caption text-on-error-container">{saleError instanceof Error ? saleError.message : 'Máy chủ chưa xác nhận thao tác.'}</p> : null}

      <div ref={checkoutRef} className="grid scroll-mb-6 gap-2">
        <Button
          disabled={submitting || attemptStatus === 'blocked' || stockChecking || (!checkoutEnabled && !recoveryEnabled)}
          loading={submitting || stockChecking}
          loadingLabel={stockChecking ? 'Đang kiểm tra tồn kho…' : 'Đang xử lý giao dịch…'}
          aria-label={retryingPayment ? 'Kiểm tra hoặc gửi lại xác nhận thanh toán' : retryingOrder ? 'Kiểm tra hoặc gửi lại đơn hàng' : 'Xác nhận đã nhận tiền và tạo đơn'}
          size="lg"
          leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">point_of_sale</span>}
          onClick={onConfirm}
        >
          {retryingPayment ? 'Kiểm tra / gửi lại xác nhận thanh toán' : retryingOrder ? 'Kiểm tra / gửi lại đơn' : 'Xác nhận đã nhận tiền và tạo đơn'}
        </Button>
        {retryingPayment && pendingOrderId ? <Button disabled={submitting} size="sm" variant="secondary" onClick={() => onOpenOrder(pendingOrderId)}>Mở đơn đang chờ thanh toán</Button> : null}
        {stockChecking ? <p role="status" className="font-body text-caption text-graphite">Đang đọc tồn khả dụng mới nhất cho từng SKU…</p> : null}
      </div>
    </aside>
  );
}
