import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { formatMinor } from '../../../lib/money';
import { formatOrderTime } from '../order.utils';
import { channelName, paymentLabel, type OrderApiRow } from '../order.api';

const posMethodLabels: Record<string, string> = {
  cash: 'Tiền mặt',
  bank_transfer: 'Chuyển khoản',
  cod: 'Thu hộ khi giao',
};

function platformPaymentLabel(value: string | null | undefined): string {
  if (!value) return 'Chưa có trạng thái thanh toán từ nền tảng';
  const normalized = value.trim().toLowerCase();
  const labels: Record<string, string> = {
    paid: 'Đã thanh toán trên nền tảng',
    partially_paid: 'Đã thanh toán một phần trên nền tảng',
    partially_paid_out: 'Đã thanh toán một phần trên nền tảng',
    pending: 'Đang chờ thanh toán',
    unpaid: 'Chưa thanh toán',
    authorized: 'Đã ủy quyền, chưa xác nhận thu',
    refunded: 'Nền tảng ghi nhận đã hoàn tiền',
    partially_refunded: 'Nền tảng ghi nhận hoàn tiền một phần',
    failed: 'Thanh toán thất bại',
    success: 'Nền tảng ghi nhận thành công',
  };
  return labels[normalized] ?? value;
}

function paymentTone(value: string | null | undefined): 'neutral' | 'success' | 'warning' | 'danger' {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'paid' || normalized === 'success' || normalized === 'succeeded') return 'success';
  if (normalized === 'pending' || normalized === 'unpaid' || normalized === 'authorized' || normalized?.includes('partial')) return 'warning';
  if (normalized === 'failed' || normalized === 'failure') return 'danger';
  return 'neutral';
}

function Amount({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-outline-variant/40 py-2 last:border-0">
      <dt className="text-graphite">{label}</dt>
      <dd className="text-right font-medium tabular-nums text-on-surface">
        {value == null ? <span className="italic text-graphite">Chưa có dữ liệu</span> : value}
      </dd>
    </div>
  );
}

export function OrderFinancialPaymentSection({
  order,
  onOpenPaymentModal,
  busy = false,
}: {
  order: OrderApiRow;
  onOpenPaymentModal?: () => void;
  busy?: boolean;
}) {
  const external = order.externalSnapshot;
  const posPayment = order.posPayment;
  const isPos = Boolean(posPayment) || order.channelCode === 'pos';
  const isWooCommerce = order.channelCode === 'woocommerce';
  const isMarketplace = !isPos && Boolean(external || order.channelId || order.externalId);
  const latestExternalPayment = order.paymentObservations.find((entry) => entry.source === 'webhook' || entry.source === 'polling');
  const wooManualPayment = isWooCommerce ? order.paymentObservations.find((entry) =>
    entry.source === 'manual' && entry.external_status === 'paid') : undefined;
  const latestManualPayment = order.paymentObservations.find((entry) => entry.source === 'manual' && entry.amount_paid != null);
  const marketStatus = wooManualPayment?.external_status ?? latestExternalPayment?.external_status ?? external?.payment_status;
  const marketPaid = wooManualPayment?.amount_paid ?? (latestExternalPayment ? latestExternalPayment.amount_paid : external?.amount_paid);
  const marketDue = wooManualPayment?.amount_due ?? (latestExternalPayment ? latestExternalPayment.amount_due : external?.amount_due);
  const marketMethod = wooManualPayment?.payment_method ?? (latestExternalPayment ? latestExternalPayment.payment_method : external?.payment_method);
  const marketProvider = latestExternalPayment ? latestExternalPayment.provider : external?.payment_provider;
  const sourceSaysPaid = ['paid', 'success', 'succeeded'].includes((latestExternalPayment?.external_status ?? external?.payment_status ?? '').toLowerCase());
  const wooStatus = external?.external_status?.toLowerCase();
  const canConfirmWooPayment = isWooCommerce && !wooManualPayment && !sourceSaysPaid && order.status !== 'cancelled' &&
    (!wooStatus || ['pending', 'on-hold', 'processing', 'failed'].includes(wooStatus));
  const canConfirmPayment = canConfirmWooPayment || (!isMarketplace && !order.channelId && order.paymentStatus === 'pending' && order.status !== 'cancelled');
  const showWooPaymentAction = canConfirmWooPayment;
  const coreStatusTone = order.paymentStatus === 'paid' ? 'success' : order.paymentStatus === 'pending' ? 'warning' : 'neutral';
  const manualConfirmation = order.manualPaymentConfirmation;

  return (
    <Card className="grid gap-4 border border-outline-variant/60 p-5 shadow-none sm:p-6" aria-label="Giá trị đơn và thanh toán">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 pb-3">
        <div>
          <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">Giá trị & dòng tiền</span>
          <h3 className="mt-0.5 font-display text-base font-bold text-on-surface">Thanh toán đơn hàng</h3>
        </div>
        {isMarketplace ? (
          <StatusBadge tone={paymentTone(marketStatus)}>{wooManualPayment ? 'Đã nhận tiền · nhân viên xác nhận' : platformPaymentLabel(marketStatus)}</StatusBadge>
        ) : (
          <StatusBadge tone={coreStatusTone}>{paymentLabel(order.paymentStatus)}</StatusBadge>
        )}
      </header>

      <section className="grid gap-2" aria-label="Giá trị theo Core">
        <h4 className="font-body text-caption font-semibold text-on-surface">Giá trị đơn trong Core · {order.currency}</h4>
        <dl className="grid gap-x-6 sm:grid-cols-2">
          <Amount label="Tạm tính hàng hóa" value={order.subtotalFormatted} />
          <Amount label="Giảm giá Core" value={order.discountMinor == null ? null : order.discountMinor > 0 ? `-${order.discountFormatted}` : order.discountFormatted} />
          <Amount label="Tổng đơn Core" value={order.totalFormatted} />
        </dl>
      </section>

      {isMarketplace && external ? (
        <>
          <section className="grid gap-2 border-t border-outline-variant/50 pt-3" aria-label="Giá trị quan sát từ nền tảng">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h4 className="font-body text-caption font-semibold text-on-surface">Giá trị nguồn {channelName(order.channelCode)}</h4>
              <span className="font-body text-caption text-graphite">Tiền tệ nguồn: {external.currency}</span>
            </div>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Amount label="Tạm tính" value={external.items_subtotal == null ? null : `${external.items_subtotal} ${external.currency}`} />
              <Amount label="Giảm giá" value={external.discount_total == null ? null : `${external.discount_total} ${external.currency}`} />
              <Amount label="Phí vận chuyển" value={external.shipping_total == null ? null : `${external.shipping_total} ${external.currency}`} />
              <Amount label="Thuế" value={external.tax_total == null ? null : `${external.tax_total} ${external.currency}`} />
              <Amount label="Phụ phí khác" value={external.extra_charges == null ? null : `${external.extra_charges} ${external.currency}`} />
              <Amount label="Tổng đơn trên nền tảng" value={external.marketplace_total == null ? null : `${external.marketplace_total} ${external.currency}`} />
            </dl>
            <p className="rounded-control bg-surface-container-low p-3 font-body text-caption text-graphite">
              Tổng danh mục Core tại thời điểm nhập đơn: <strong className="text-on-surface">{external.core_currency ? formatMinor(external.core_catalogue_total_minor, external.core_currency) : 'Chưa có thông tin tiền tệ Core'}</strong>. Đây là giá trị Core, không phải số tiền khách đã trả trên nền tảng.
            </p>
          </section>

          <section className="grid gap-2 border-t border-outline-variant/50 pt-3" aria-label="Bằng chứng thanh toán nền tảng">
            <h4 className="font-body text-caption font-semibold text-on-surface">Bằng chứng thanh toán</h4>
            <dl className="grid gap-x-6 sm:grid-cols-2">
              <Amount label={wooManualPayment ? 'Nhân viên OctoFlow ghi nhận đã nhận' : 'Nền tảng ghi nhận đã thu'} value={marketPaid == null ? null : `${marketPaid} ${wooManualPayment?.currency ?? latestExternalPayment?.currency ?? external.currency}`} />
              <Amount label="Còn phải thu theo nguồn" value={marketDue == null ? null : `${marketDue} ${latestExternalPayment?.currency ?? external.currency}`} />
              <Amount label="Phương thức" value={marketMethod === 'bacs_no_payment_test' ? 'Offline test (mô phỏng)' : marketMethod} />
              <Amount label="Nhà cung cấp thanh toán" value={marketProvider} />
              <Amount label="Trạng thái quyết toán từ nguồn" value={external.settlement_status ?? null} />
              {wooManualPayment ? <Amount label="Mã giao dịch / tham chiếu" value={wooManualPayment.transaction_reference} /> : null}
              {wooManualPayment ? <Amount label="Người ghi nhận" value={wooManualPayment.actor_email} /> : null}
            </dl>
            {wooManualPayment?.note ? <p className="font-body text-caption text-graphite">Ghi chú đối chiếu: <strong className="text-on-surface">{wooManualPayment.note}</strong></p> : null}
            {wooManualPayment ? <p className="font-body text-caption text-graphite">OctoFlow đã ghi nhận thanh toán thủ công và cập nhật WooCommerce sang Processing.</p> : null}
          </section>
        </>
      ) : isPos ? (
        <section className="grid gap-2 border-t border-outline-variant/50 pt-3" aria-label="Chi tiết thanh toán POS">
          <h4 className="font-body text-caption font-semibold text-on-surface">Ghi nhận tại quầy</h4>
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <Amount label="Phương thức" value={posPayment ? posMethodLabels[posPayment.method] ?? posPayment.method : null} />
            <Amount label="Tổng tiền hàng" value={order.subtotalFormatted} />
            <Amount label="Giảm giá" value={order.discountMinor == null ? null : order.discountMinor > 0 ? `-${order.discountFormatted}` : order.discountFormatted} />
            <Amount label="Tổng tiền phải thu tại POS" value={posPayment ? formatMinor(posPayment.amount_due_minor, posPayment.currency) : null} />
            <Amount label="Tiền khách đưa" value={posPayment?.cash_received_minor == null ? null : formatMinor(posPayment.cash_received_minor, posPayment.currency)} />
            <Amount label="Tiền thối" value={posPayment?.change_minor == null ? null : formatMinor(posPayment.change_minor, posPayment.currency)} />
            <Amount label="Số tiền Core ghi nhận đã thu" value={latestManualPayment?.amount_paid == null ? null : `${latestManualPayment.amount_paid} ${latestManualPayment.currency}`} />
          </dl>
          <div className="grid gap-1 rounded-control bg-surface-container-low p-3 font-body text-caption text-graphite sm:grid-cols-2">
            <p>Ghi nhận phương thức lúc: <strong className="text-on-surface">{posPayment ? formatOrderTime(posPayment.created_at) : 'Chưa có dữ liệu'}</strong></p>
            <p>Nhân viên ghi nhận: <strong className="text-on-surface">{posPayment?.recorded_by_email ?? 'Chưa có dữ liệu'}</strong></p>
            <p>Xác nhận đã thu lúc: <strong className="text-on-surface">{manualConfirmation ? formatOrderTime(manualConfirmation.confirmed_at) : 'Chưa xác nhận trong Core'}</strong></p>
            <p>Người xác nhận: <strong className="text-on-surface">{manualConfirmation?.confirmed_by_email ?? 'Chưa có dữ liệu'}</strong></p>
          </div>
          {manualConfirmation?.note ? <p className="font-body text-caption text-graphite">Ghi chú xác nhận: {manualConfirmation.note}</p> : null}
          <p className="font-body text-caption text-graphite">Đây là xác nhận thủ công của nhân viên; không phải xác minh từ ngân hàng hoặc cổng thanh toán.</p>
        </section>
      ) : (
        <section className="grid gap-2 border-t border-outline-variant/50 pt-3" aria-label="Thanh toán nội bộ">
          <h4 className="font-body text-caption font-semibold text-on-surface">Ghi nhận thanh toán Core</h4>
          <dl className="grid gap-x-6 sm:grid-cols-2">
            <Amount label="Số tiền Core ghi nhận đã thu" value={latestManualPayment?.amount_paid == null ? null : `${latestManualPayment.amount_paid} ${latestManualPayment.currency}`} />
          <Amount label="Số tiền còn phải thu theo Core" value={order.paymentStatus === 'pending' ? order.totalFormatted : null} />
            <Amount label="Xác nhận lúc" value={manualConfirmation ? formatOrderTime(manualConfirmation.confirmed_at) : null} />
            <Amount label="Người xác nhận" value={manualConfirmation?.confirmed_by_email} />
          </dl>
          <p className="font-body text-caption text-graphite">Xác nhận của nhân viên không phải xác minh từ ngân hàng hoặc cổng thanh toán.</p>
        </section>
      )}

      {(canConfirmPayment || showWooPaymentAction) && onOpenPaymentModal ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
          <p className="max-w-2xl font-body text-caption text-graphite">{canConfirmWooPayment ? 'Ghi nhận thanh toán cho đơn WooCommerce; OctoFlow sẽ lưu người xác nhận và mã tham chiếu, rồi cập nhật WooCommerce sang Processing mà không đổi tiến trình giao hàng.' : 'Chỉ ghi nhận sau khi nhân viên đã nhận tiền. Thao tác lưu xác nhận thủ công và không thay đổi trạng thái giao hàng.'}</p>
          <Button size="sm" variant="secondary" onClick={onOpenPaymentModal} disabled={busy}>{canConfirmWooPayment ? 'Ghi nhận đã nhận tiền' : 'Ghi nhận đã thu tiền'}</Button>
        </div>
      ) : null}
    </Card>
  );
}
