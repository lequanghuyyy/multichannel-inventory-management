import { StatusBadge } from '../../../components/common/StatusBadge';
import { Card } from '../../../components/ui/Card';
import { CopyButton } from './CopyButton';
import {
  channelName,
  unifiedShippingStatusLabels,
  verificationSourceLabels,
  type OrderApiRow,
} from '../order.api';
import { formatOrderTime } from '../order.utils';

function safeTrackingUrl(value?: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password || url.hostname === 'localhost' || url.hostname.endsWith('.local')) return null;
    return url.href;
  } catch {
    return null;
  }
}

export function OrderUnifiedShippingSection({ order }: { order: OrderApiRow }) {
  const shipping = order.unifiedShipping;
  const isPos = order.channelCode === 'pos';
  const isWoo = order.channelCode === 'woocommerce';
  const deliveryStatusKey = shipping?.delivery_status ?? 'pending_preparation';
  const deliveryStatusMeta = unifiedShippingStatusLabels[deliveryStatusKey] ?? {
    label: deliveryStatusKey,
    tone: 'neutral' as const,
  };

  const verificationSource = shipping?.verification_source ?? (isPos ? 'pos_direct' : 'core_lifecycle');
  const verificationSourceLabel = verificationSourceLabels[verificationSource] ?? verificationSource;
  const trackingUrl = safeTrackingUrl(shipping?.tracking_url);

  return (
    <section aria-labelledby="shipping-fulfillment-heading" className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 id="shipping-fulfillment-heading" className="font-display text-base font-bold text-on-surface">
            Vận chuyển & Bàn giao thực tế
          </h3>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge tone={deliveryStatusMeta.tone}>
            {deliveryStatusMeta.label}
          </StatusBadge>
          <span className="inline-flex items-center gap-1.5 rounded-control bg-surface-container-high px-2.5 py-1 font-body text-[11px] font-semibold text-on-surface">
            <span className="material-symbols-outlined text-[14px] text-graphite" aria-hidden="true">
              verified
            </span>
            {verificationSourceLabel}
          </span>
        </div>
      </div>

      <Card className="grid gap-5 border border-outline-variant/60 bg-surface p-5 shadow-none sm:p-6">
        {/* Informational banners for specific channels */}
        {isPos ? (
          <div className="flex items-center gap-2.5 rounded-control border border-outline-variant/50 bg-surface-container-low p-3 font-body text-caption text-graphite">
            <span className="material-symbols-outlined text-[18px] text-carbon" aria-hidden="true">
              storefront
            </span>
            <span>
              <strong>Bán trực tiếp tại quầy (POS):</strong> Giao dịch bàn giao hàng trực tiếp cho khách, không phát sinh hãng vận chuyển hay mã vận đơn trung gian.
            </span>
          </div>
        ) : null}

        {isWoo ? (
          <div className="flex items-center gap-2.5 rounded-control border border-outline-variant/50 bg-surface-container-low p-3 font-body text-caption text-graphite">
            <span className="material-symbols-outlined text-[18px] text-carbon" aria-hidden="true">
              sync_alt
            </span>
            <span>
              <strong>Kênh WooCommerce:</strong> Dữ liệu địa chỉ và thông tin giao nhận được đồng bộ từ đơn hàng WooCommerce. OctoFlow không tự sinh mã vận đơn qua API ngoài mà cập nhật theo thực tế xử lý.
            </span>
          </div>
        ) : null}

        {/* Carrier and Tracking Grid */}
        {shipping?.carrier || shipping?.tracking_number || trackingUrl ? <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Hãng vận chuyển */}
          {shipping?.carrier ? <div className="rounded-control bg-surface-container-low p-3.5">
            <span className="block font-body text-caption text-graphite">Hãng vận chuyển</span>
            <div className="mt-1 flex items-center gap-1.5 font-body text-body-sm font-semibold text-on-surface">
              <span>{shipping.carrier}</span>
              <CopyButton text={shipping.carrier} label="Sao chép tên hãng vận chuyển" />
            </div>
          </div> : null}

          {/* Mã vận đơn (Tracking Number) */}
          {shipping?.tracking_number ? <div className="rounded-control bg-surface-container-low p-3.5">
            <span className="block font-body text-caption text-graphite">Mã vận đơn (Tracking Number)</span>
            <div className="mt-1 flex items-center gap-1.5 font-mono text-body-sm font-semibold text-on-surface">
              <span className="break-all">{shipping.tracking_number}</span>
              <CopyButton text={shipping.tracking_number} label="Sao chép mã vận đơn" />
            </div>
          </div> : null}

          {/* Tracking URL */}
          {trackingUrl ? <div className="rounded-control bg-surface-container-low p-3.5">
            <span className="block font-body text-caption text-graphite">Đường dẫn tra cứu vận đơn</span>
            <div className="mt-1 font-body text-body-sm">
              <a
                  href={trackingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 font-medium text-channel-accent hover:underline break-all"
                >
                  <span>Tra cứu bưu gửi</span>
                  <span className="material-symbols-outlined text-[16px]" aria-hidden="true">
                    open_in_new
                  </span>
                </a>
            </div>
          </div> : null}
        </div> : null}

        {/* Milestone Dates */}
        <dl className="grid grid-cols-2 gap-3 border-t border-outline-variant/40 pt-4 font-body text-caption sm:grid-cols-4">
          <div>
            <dt className="text-graphite">Ngày bàn giao</dt>
            <dd className="mt-1 font-medium text-on-surface">
              {shipping?.handover_date ? (
                formatOrderTime(shipping.handover_date)
              ) : (
                <span className="italic text-graphite/70">Chưa bàn giao</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-graphite">Ngày gửi đi (Shipped)</dt>
            <dd className="mt-1 font-medium text-on-surface">
              {shipping?.shipped_date ? (
                formatOrderTime(shipping.shipped_date)
              ) : (
                <span className="italic text-graphite/70">Chưa xuất kho</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-graphite">Ngày giao thành công</dt>
            <dd className="mt-1 font-medium text-on-surface">
              {shipping?.delivered_date ? (
                formatOrderTime(shipping.delivered_date)
              ) : (
                <span className="italic text-graphite/70">Chưa hoàn tất</span>
              )}
            </dd>
          </div>

          <div>
            <dt className="text-graphite">Fulfillment Remote ID</dt>
            <dd className="mt-1 font-mono font-medium text-on-surface">
              {shipping?.remote_fulfillment_id ? (
                <span className="break-all">{shipping.remote_fulfillment_id}</span>
              ) : (
                <span className="italic font-body text-graphite/70">—</span>
              )}
            </dd>
          </div>
        </dl>

        {/* Remote Status Diagnostics for Marketplace */}
        {shipping?.remote_state ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/40 pt-3 font-body text-caption text-graphite">
            <span>
              Trạng thái ghi nhận từ API sàn ({channelName(order.channelCode)}):{' '}
              <strong className="text-on-surface">{shipping.remote_state}</strong>
            </span>
            <span className="text-[11px] italic">
              Bằng chứng xác thực từ nhật ký vận chuyển bền vững
            </span>
          </div>
        ) : null}
      </Card>
    </section>
  );
}
