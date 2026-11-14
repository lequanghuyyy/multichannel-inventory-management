import { Card } from '../../../components/ui/Card';
import { CopyButton } from './CopyButton';
import { channelName } from '../order.api';

export interface OrderCustomerDeliverySectionProps {
  customerName?: string | null;
  customerPhone?: string | null;
  customerEmail?: string | null;
  recipientName?: string | null;
  recipientPhone?: string | null;
  deliveryAddress?: string | null;
  deliveryNote?: string | null;
  deliveryMethod?: string | null;
  channelCode: string;
}

export function OrderCustomerDeliverySection({
  customerName,
  customerPhone,
  customerEmail,
  recipientName,
  recipientPhone,
  deliveryAddress,
  deliveryNote,
  deliveryMethod,
  channelCode,
}: OrderCustomerDeliverySectionProps) {
  const isPos = channelCode === 'pos';
  const resolvedDeliveryMethod = deliveryMethod || (isPos ? 'Mua tại quầy' : null);

  return (
    <section aria-labelledby="customer-delivery-heading" className="grid gap-4">
      <h3 id="customer-delivery-heading" className="font-display text-base font-bold text-on-surface">
        Khách hàng & Giao nhận
      </h3>
      <div className="grid gap-4 md:grid-cols-2">
        {/* Người mua (Buyer) */}
        <Card className="grid content-start gap-3 border border-outline-variant/60 bg-surface p-4 shadow-none">
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2.5">
            <span className="flex items-center gap-2 font-body text-caption font-bold uppercase tracking-wider text-graphite">
              <span className="material-symbols-outlined text-[18px] text-graphite" aria-hidden="true">
                person
              </span>
              Người mua
            </span>
            <span className="inline-flex items-center gap-1.5 rounded bg-surface-container-high px-2 py-0.5 font-body text-[11px] font-semibold text-on-surface">
              Nguồn: {channelName(channelCode)}
            </span>
          </div>

          <dl className="grid gap-2.5 font-body text-body-sm">
            <div className="grid grid-cols-[100px_1fr] items-baseline gap-2">
              <dt className="text-caption text-graphite">Họ tên:</dt>
              <dd className="font-medium text-on-surface">
                {customerName ? (
                  customerName
                ) : (
                  <span className="italic text-graphite/70">{isPos ? 'Khách lẻ tại quầy' : 'Chưa có thông tin khách hàng'}</span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[100px_1fr] items-baseline gap-2">
              <dt className="text-caption text-graphite">Điện thoại:</dt>
              <dd className="flex items-center gap-1.5 text-on-surface">
                {customerPhone ? (
                  <>
                    <span className="font-mono">{customerPhone}</span>
                    <CopyButton text={customerPhone} label="Sao chép SĐT người mua" />
                  </>
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[100px_1fr] items-baseline gap-2">
              <dt className="text-caption text-graphite">Email:</dt>
              <dd className="break-all text-on-surface">
                {customerEmail ? (
                  customerEmail
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>

        {/* Người nhận & Giao hàng (Recipient & Delivery) */}
        <Card className="grid content-start gap-3 border border-outline-variant/60 bg-surface p-4 shadow-none">
          <div className="flex items-center justify-between border-b border-outline-variant/40 pb-2.5">
            <span className="flex items-center gap-2 font-body text-caption font-bold uppercase tracking-wider text-graphite">
              <span className="material-symbols-outlined text-[18px] text-graphite" aria-hidden="true">
                local_shipping
              </span>
              Người nhận & Vận chuyển
            </span>
            {resolvedDeliveryMethod ? (
              <span className="inline-flex items-center gap-1 rounded bg-secondary-container/40 px-2 py-0.5 font-body text-[11px] font-semibold text-on-secondary-container">
                {resolvedDeliveryMethod}
              </span>
            ) : null}
          </div>

          <dl className="grid gap-2.5 font-body text-body-sm">
            <div className="grid grid-cols-[100px_1fr] items-baseline gap-2">
              <dt className="text-caption text-graphite">Người nhận:</dt>
              <dd className="font-medium text-on-surface">
                {recipientName ? (
                  recipientName
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[100px_1fr] items-baseline gap-2">
              <dt className="text-caption text-graphite">Điện thoại:</dt>
              <dd className="flex items-center gap-1.5 text-on-surface">
                {recipientPhone ? (
                  <>
                    <span className="font-mono">{recipientPhone}</span>
                    <CopyButton text={recipientPhone} label="Sao chép SĐT người nhận" />
                  </>
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[100px_1fr] items-baseline gap-2">
              <dt className="text-caption text-graphite">Địa chỉ:</dt>
              <dd className="text-on-surface">
                {deliveryAddress ? (
                  deliveryAddress
                ) : (
                  <span className="italic text-graphite/70">
                    {isPos ? 'Mua trực tiếp tại cửa hàng' : 'Chưa có thông tin'}
                  </span>
                )}
              </dd>
            </div>

            <div className="grid grid-cols-[100px_1fr] items-baseline gap-2">
              <dt className="text-caption text-graphite">Ghi chú:</dt>
              <dd className="text-on-surface">
                {deliveryNote ? (
                  deliveryNote
                ) : (
                  <span className="italic text-graphite/70">Chưa có thông tin</span>
                )}
              </dd>
            </div>
          </dl>
        </Card>
      </div>
    </section>
  );
}
