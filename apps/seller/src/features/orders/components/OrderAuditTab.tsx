import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { CopyButton } from './CopyButton';
import { OrderApiHistory } from './OrderApiHistory';
import { OrderOperationalRecords } from './OrderOperationalRecords';
import { formatMinor } from '../../../lib/money';
import { formatOrderTime } from '../order.utils';
import { channelName, type OrderApiRow } from '../order.api';

export function OrderAuditTab({ order }: { order: OrderApiRow }) {
  const external = order.externalSnapshot;
  const externalLines = order.externalLines ?? [];
  const paymentObservations = order.paymentObservations ?? [];
  const shipping = order.unifiedShipping;

  const commercialAmounts = external ? [
    ['Tạm tính sản phẩm', external.items_subtotal],
    ['Chiết khấu / Giảm giá', external.discount_total],
    ['Phí vận chuyển', external.shipping_total],
    ['Thuế (VAT / Sales Tax)', external.tax_total],
    ['Phụ phí', external.extra_charges],
    ['Tổng giá trị ghi nhận từ sàn', external.marketplace_total],
  ] as const : [];

  return (
    <div className="grid gap-6">
      {/* 1. Lịch sử thay đổi trạng thái Core */}
      <section aria-labelledby="status-history-heading">
        <OrderApiHistory orderId={order.id} />
      </section>

      <OrderOperationalRecords orderId={order.id} />

      {/* 2. Nhật ký bằng chứng thanh toán */}
      <Card className="grid gap-4 border border-outline-variant/60 p-5 shadow-none sm:p-6" aria-label="Bằng chứng thanh toán ghi nhận">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-outline-variant/40 pb-3">
          <div>
            <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">
              Nhật ký thanh toán
            </span>
            <h3 className="mt-0.5 font-display text-base font-bold text-on-surface">
              Bằng chứng thanh toán quan sát ({paymentObservations.length})
            </h3>
          </div>
          <span className="font-body text-caption text-graphite">
            Dữ liệu ghi nhận từ webhook hoặc polling thực tế
          </span>
        </div>

        {paymentObservations.length === 0 ? (
          <div className="rounded-control bg-surface-container-low p-5 text-center font-body text-caption text-graphite">
            Chưa có bằng chứng thanh toán ngoài nào được ghi nhận cho đơn hàng này.
          </div>
        ) : (
          <div className="grid gap-3">
            {paymentObservations.map((payment, index) => (
              <div
                key={`${payment.evidence_fingerprint}-${index}`}
                className="flex flex-col gap-2 rounded-control border border-outline-variant/50 bg-surface-container-low p-4 font-body text-caption sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="font-semibold text-on-surface">
                      {payment.source.toUpperCase()}
                    </strong>
                    <span className="text-graphite">·</span>
                    <span className="text-graphite">
                      Trạng thái sàn: <strong className="text-on-surface">{payment.external_status ?? 'chưa rõ'}</strong>
                    </span>
                    {payment.payment_method ? (
                      <>
                        <span className="text-graphite">·</span>
                        <span className="text-graphite">Hình thức: {payment.payment_method}</span>
                      </>
                    ) : null}
                    {payment.provider ? (
                      <>
                        <span className="text-graphite">·</span>
                        <span className="text-graphite">Cổng: {payment.provider}</span>
                      </>
                    ) : null}
                  </div>
                  <details className="mt-2 font-mono text-[11px] text-graphite">
                    <summary className="w-fit cursor-pointer font-body">Chi tiết kỹ thuật</summary>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <span>Fingerprint:</span>
                      <span className="break-all font-semibold text-on-surface">{payment.evidence_fingerprint}</span>
                      <CopyButton text={payment.evidence_fingerprint} label="Sao chép fingerprint" />
                    </div>
                  </details>
                </div>

                <div className="text-right sm:shrink-0">
                  <div className="font-mono text-body-sm font-bold text-on-surface">
                    {payment.amount_paid == null ? (
                      <span className="italic text-graphite/70">Chưa có số tiền</span>
                    ) : (
                      `${payment.amount_paid} ${payment.currency}`
                    )}
                  </div>
                  <time className="mt-0.5 block text-[11px] text-graphite">
                    {formatOrderTime(payment.observed_at)}
                  </time>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* 3. Ảnh chụp thương mại từ sàn (Marketplace Commercial Snapshot) */}
      {external ? (
        <Card className="grid gap-5 border border-outline-variant/60 p-5 shadow-none sm:p-6" aria-label="Ảnh chụp thương mại từ sàn">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/40 pb-4">
            <div>
              <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">
                Thương mại sàn liên kết
              </span>
              <h3 className="mt-0.5 font-display text-base font-bold text-on-surface">
                Ảnh chụp thương mại từ {channelName(order.channelCode)}
              </h3>
              <p className="mt-1 font-body text-caption text-graphite">
                Mã đơn trên sàn: <code className="font-mono font-bold text-on-surface">{external.external_order_number ?? order.externalId}</code> · Trạng thái sàn: <strong className="text-on-surface">{external.external_status}</strong>
              </p>
            </div>
            <StatusBadge tone={external.amount_observation === 'observed' ? 'success' : 'warning'}>
              {external.amount_observation === 'observed'
                ? 'Đã đọc đủ dữ liệu'
                : external.amount_observation === 'partial'
                ? 'Đọc được một phần'
                : 'Chưa có dữ liệu'}
            </StatusBadge>
          </div>

          {/* Amount Breakdown Grid */}
          <dl className="grid grid-cols-2 gap-3 font-body text-caption sm:grid-cols-3">
            {commercialAmounts.map(([label, amount]) => (
              <div key={label} className="rounded-control bg-surface-container-low p-3.5 border border-outline-variant/40">
                <dt className="text-graphite">{label}</dt>
                <dd className="mt-1 font-semibold text-on-surface text-body-sm">
                  {amount == null ? (
                    <span className="italic text-graphite/70 font-normal">Chưa có thông tin</span>
                  ) : (
                    `${amount} ${external.currency}`
                  )}
                </dd>
              </div>
            ))}
          </dl>

          {/* Core Historical Value comparison */}
          <div className="rounded-control border border-outline-variant/60 bg-surface-container-low/60 p-3.5 font-body text-caption text-graphite">
            Tổng giá trị theo danh mục Core: <strong className="font-mono text-on-surface">{formatMinor(external.core_catalogue_total_minor, external.core_currency ?? order.currency)}</strong>. Giá trị lịch sử snapshot tại thời điểm đơn hàng phát sinh, không chịu ảnh hưởng của các thay đổi giá sau này.
          </div>

          {/* Observation Metadata */}
          <div className="grid gap-1.5 font-body text-caption text-graphite border-t border-outline-variant/40 pt-3">
            <p>
              Phương thức thu thập: <strong className="text-on-surface">{external.source}</strong> · Thời điểm quan sát: <strong className="text-on-surface">{formatOrderTime(external.last_observed_at)}</strong>
            </p>
            <p>
              Trạng thái thanh toán từ sàn: <strong className="text-on-surface">{external.payment_status ?? 'Chưa có thông tin'}</strong>
              {external.payment_method ? ` · Hình thức: ${external.payment_method}` : ''}
              {external.payment_provider ? ` · Cổng: ${external.payment_provider}` : ''}
            </p>
            <p>
              Trạng thái đối soát quyết toán (Settlement): <strong className="text-on-surface">{external.settlement_status ?? 'Chưa xác minh'}</strong>
            </p>
          </div>

          {/* External Line Items */}
          {externalLines.length > 0 ? (
            <div className="grid gap-2.5 border-t border-outline-variant/40 pt-3">
              <h4 className="font-body text-caption font-bold uppercase tracking-wider text-graphite">
                Dòng hàng quan sát trên sàn ({externalLines.length})
              </h4>
              <div className="grid gap-2">
                {externalLines.map((line, idx) => (
                  <div
                    key={`${line.external_line_id}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-surface-container-low p-3 font-body text-caption"
                  >
                    <div>
                      <strong className="block text-on-surface">
                        {line.product_name ?? line.sku ?? line.external_line_id}
                      </strong>
                      <span className="text-graphite">
                        SKU: <code className="font-mono">{line.sku ?? '—'}</code> · Số lượng: {line.quantity}
                      </span>
                    </div>
                    <span className="font-medium text-on-surface">
                      {line.final_line_total == null ? (
                        <span className="italic text-graphite/70">Chưa có giá</span>
                      ) : (
                        `${line.final_line_total} ${line.currency}`
                      )}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </Card>
      ) : null}

      {/* 4. Chẩn đoán kỹ thuật & Đồng bộ Fulfillment */}
      <Card className="border border-outline-variant/60 p-5 shadow-none sm:p-6" aria-label="Chẩn đoán kỹ thuật">
        <details>
          <summary className="cursor-pointer list-none border-b border-outline-variant/40 pb-3 [&::-webkit-details-marker]:hidden">
            <span className="font-body text-caption font-bold uppercase tracking-wider text-channel-accent">Đối soát mở rộng</span>
            <span className="mt-0.5 block font-display text-base font-bold text-on-surface">Chi tiết kỹ thuật và trạng thái đồng bộ</span>
            <span className="mt-1 block font-body text-caption text-graphite">Mã Core, fulfillment từ xa và mã lỗi nếu nguồn có ghi nhận.</span>
          </summary>
          <div className="mt-4 grid gap-4">
            {shipping?.diagnostic_error ? (
              <div className="flex items-start gap-3 rounded-control border border-danger/40 bg-danger/10 p-3.5 text-on-surface">
                <span className="material-symbols-outlined text-[20px] text-danger" aria-hidden="true">error</span>
                <div className="font-body text-caption"><strong className="block font-semibold text-danger">Lỗi ghi nhận từ API sàn</strong><p className="mt-0.5 text-graphite">Mã lỗi: <code className="break-all font-mono font-bold text-on-surface">{shipping.diagnostic_error}</code></p></div>
              </div>
            ) : <p className="font-body text-caption text-graphite">Chưa có mã lỗi đồng bộ được ghi nhận.</p>}
            <dl className="grid grid-cols-1 gap-3 font-body text-caption sm:grid-cols-2">
              <div className="min-w-0 rounded-control bg-surface-container-low p-3"><dt className="text-graphite">Mã Core ID</dt><dd className="mt-1 break-all font-mono text-[11px] font-semibold text-on-surface">{order.id}</dd></div>
              <div className="rounded-control bg-surface-container-low p-3"><dt className="text-graphite">Nguồn xác thực vận chuyển</dt><dd className="mt-1 break-words font-semibold text-on-surface">{shipping?.verification_source ?? 'core_lifecycle'}</dd></div>
              <div className="min-w-0 rounded-control bg-surface-container-low p-3"><dt className="text-graphite">Remote Fulfillment ID</dt><dd className="mt-1 break-all font-mono text-[11px] text-on-surface">{shipping?.remote_fulfillment_id ?? '—'}</dd></div>
              <div className="rounded-control bg-surface-container-low p-3"><dt className="text-graphite">Remote State</dt><dd className="mt-1 break-words font-semibold text-on-surface">{shipping?.remote_state ?? '—'}</dd></div>
              <div className="min-w-0 rounded-control bg-surface-container-low p-3"><dt className="text-graphite">External revision</dt><dd className="mt-1 break-all font-mono text-[11px] text-on-surface">{external?.external_revision ?? '—'}</dd></div>
              <div className="min-w-0 rounded-control bg-surface-container-low p-3"><dt className="text-graphite">Snapshot fingerprint</dt><dd className="mt-1 break-all font-mono text-[11px] text-on-surface">{external?.fingerprint ?? '—'}</dd></div>
            </dl>
          </div>
        </details>
      </Card>
    </div>
  );
}
