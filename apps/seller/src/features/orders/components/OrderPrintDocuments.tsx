import { formatMinor } from '../../../lib/money';
import { apiStatusPresentation, channelName, paymentLabel, type OrderApiRow } from '../order.api';
import { formatOrderTime } from '../order.utils';

export type OrderPrintKind = 'sale' | 'packing';

const paymentSourceLabels: Record<string, string> = {
  webhook: 'Webhook nền tảng',
  polling: 'Đồng bộ API nền tảng',
  simulator: 'Dữ liệu mô phỏng',
  manual: 'Nhân viên Core',
};

const platformPaymentLabels: Record<string, string> = {
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

function DocumentFrame({ order, title, children }: { order: OrderApiRow; title: string; children: React.ReactNode }) {
  return <article id="order-print-document" className="order-print-document" lang="vi">
    <header className="border-b-2 border-black pb-4">
      <p className="text-xs font-semibold uppercase tracking-wide">OctoFlow · Hệ thống quản lý cửa hàng</p>
      <h1 className="mt-2 text-2xl font-bold">{title}</h1>
      <p className="mt-1 text-sm">Mã đơn: <strong>{order.reference}</strong></p>
    </header>
    {children}
    <footer className="mt-8 border-t border-gray-400 pt-3 text-xs text-gray-700">
      Tài liệu nghiệp vụ nội bộ · In từ OctoFlow lúc {formatOrderTime(new Date().toISOString())}
    </footer>
  </article>;
}

function ItemTable({ order, includePrices }: { order: OrderApiRow; includePrices: boolean }) {
  return <table className="mt-5 w-full border-collapse text-left text-sm">
    <thead><tr className="border-b border-black">
      <th className="py-2 pr-2">Sản phẩm / SKU / Biến thể</th>
      <th className="w-20 py-2 text-center">SL</th>
      {includePrices ? <><th className="w-32 py-2 text-right">Đơn giá</th><th className="w-32 py-2 pl-2 text-right">Thành tiền</th></> : <th className="w-10 py-2 text-center">Đã lấy</th>}
    </tr></thead>
    <tbody>{order.items.map((item, index) => <tr key={item.id ?? `${item.sku}-${index}`} className="border-b border-gray-300 align-top">
      <td className="py-2 pr-2">
        <strong className="block">{item.name}</strong>
        <span className="block font-mono text-xs">SKU: {item.sku}</span>
        {(item.color || item.size) ? <span className="block text-xs">{[item.color, item.size].filter(Boolean).join(' · ')}</span> : null}
      </td>
      <td className="py-2 text-center font-semibold tabular-nums">{item.quantity}</td>
      {includePrices ? <><td className="py-2 text-right tabular-nums">{formatMinor(item.unitPriceMinor, order.currency)}</td><td className="py-2 pl-2 text-right font-semibold tabular-nums">{formatMinor(item.lineTotalMinor, order.currency)}</td></> : <td className="py-2 text-center"><span className="inline-block size-4 border border-black" aria-label="Ô đánh dấu đã lấy hàng" /></td>}
    </tr>)}</tbody>
  </table>;
}

function SaleDocument({ order }: { order: OrderApiRow }) {
  const external = order.externalSnapshot;
  const isMarketplace = order.channelCode !== 'pos' && Boolean(external || order.channelId || order.externalId);
  const platformEvidence = order.paymentObservations.find((item) => item.source === 'webhook' || item.source === 'polling');
  const posEvidence = order.paymentObservations.find((item) => item.source === 'manual' && item.amount_paid != null);
  const paidAmount = isMarketplace
    ? platformEvidence?.amount_paid ?? external?.amount_paid
    : posEvidence?.amount_paid;
  const paidCurrency = isMarketplace
    ? platformEvidence?.currency ?? external?.currency
    : posEvidence?.currency;
  const rawPaymentStatus = isMarketplace ? platformEvidence?.external_status ?? external?.payment_status : order.paymentStatus;
  const paymentStatus = rawPaymentStatus
    ? isMarketplace ? platformPaymentLabels[rawPaymentStatus.toLowerCase()] ?? rawPaymentStatus : paymentLabel(rawPaymentStatus)
    : isMarketplace ? 'Chưa có trạng thái từ nền tảng' : 'Chưa có thông tin';
  const posMethodLabels: Record<string, string> = { cash: 'Tiền mặt', bank_transfer: 'Chuyển khoản', cod: 'Thu hộ khi giao' };
  const paymentMethodRaw = platformEvidence?.payment_method ?? external?.payment_method ?? order.posPayment?.method;
  const paymentMethod = paymentMethodRaw ? posMethodLabels[paymentMethodRaw] ?? paymentMethodRaw : 'Chưa có thông tin';
  const paymentSource = isMarketplace
    ? platformEvidence?.source ?? external?.payment_observation_source ?? (paidAmount != null ? external?.source : null)
    : posEvidence?.source;
  const hasObservedPayment = paidAmount != null && Boolean(paidCurrency);

  return <DocumentFrame order={order} title="Phiếu bán hàng">
    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
      <p>Ngày đặt: <strong>{formatOrderTime(order.placedAt)}</strong></p>
      <p>Nguồn đơn: <strong>{channelName(order.channelCode)}</strong></p>
      {order.customerName ? <p>Khách hàng: <strong>{order.customerName}</strong></p> : null}
      {order.recipientName ? <p>Người nhận: <strong>{order.recipientName}</strong></p> : null}
      {order.externalId ? <p>Mã đơn nguồn: <strong>{order.externalSnapshot?.external_order_number ?? order.externalId}</strong></p> : null}
    </div>
    <ItemTable order={order} includePrices />

    <div className="mt-5 ml-auto w-full max-w-sm text-sm">
      <div className="flex justify-between gap-4 border-b border-gray-300 py-1.5"><span>Tạm tính Core</span><strong>{order.subtotalFormatted ?? 'Chưa có dữ liệu'}</strong></div>
      {order.discountMinor != null ? <div className="flex justify-between gap-4 border-b border-gray-300 py-1.5"><span>Giảm giá Core</span><strong>{order.discountMinor > 0 ? `-${order.discountFormatted}` : order.discountFormatted}</strong></div> : null}
      <div className="flex justify-between gap-4 border-b-2 border-black py-2 text-base"><span>Tổng đơn Core</span><strong>{order.totalFormatted} · {order.currency}</strong></div>
    </div>

    {isMarketplace && external ? <section className="mt-5 rounded border border-gray-400 p-3 text-sm">
      <h2 className="font-bold">Giá trị nguồn {channelName(order.channelCode)} · {external.currency}</h2>
      <dl className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1">
        {([['Tạm tính', external.items_subtotal], ['Giảm giá', external.discount_total], ['Phí vận chuyển', external.shipping_total], ['Thuế', external.tax_total], ['Phụ phí khác', external.extra_charges], ['Tổng giá trị nền tảng', external.marketplace_total]] as const).filter(([, amount]) => amount != null).map(([label, amount]) => <div key={label} className="flex justify-between gap-3"><dt>{label}</dt><dd className="font-semibold">{amount} {external.currency}</dd></div>)}
      </dl>
    </section> : null}

    <section className="mt-5 border-t border-gray-400 pt-3 text-sm">
      <h2 className="font-bold">Thanh toán</h2>
      <p className="mt-1">Phương thức: <strong>{paymentMethod}</strong></p>
      <p>Trạng thái {isMarketplace ? 'nền tảng' : 'Core'}: <strong>{paymentStatus}</strong></p>
      {hasObservedPayment ? <p>Số tiền được nguồn ghi nhận đã thu: <strong>{paidAmount} {paidCurrency}</strong>{paymentSource ? ` · ${paymentSourceLabels[paymentSource] ?? paymentSource}` : ''}</p> : null}
      {order.posPayment ? <>
        <p>Tổng tiền phải thu tại POS: <strong>{formatMinor(order.posPayment.amount_due_minor, order.posPayment.currency)}</strong></p>
        {order.posPayment.cash_received_minor != null ? <p>Tiền khách đưa: <strong>{formatMinor(order.posPayment.cash_received_minor, order.posPayment.currency)}</strong></p> : null}
        {order.posPayment.change_minor != null ? <p>Tiền thối: <strong>{formatMinor(order.posPayment.change_minor, order.posPayment.currency)}</strong></p> : null}
        <p className="text-xs">Ghi nhận phương thức: {formatOrderTime(order.posPayment.created_at)} · {order.posPayment.recorded_by_email ?? 'Không có thông tin người ghi nhận'}</p>
      </> : null}
      {order.manualPaymentConfirmation ? <p className="text-xs">Core xác nhận thủ công lúc {formatOrderTime(order.manualPaymentConfirmation.confirmed_at)} · {order.manualPaymentConfirmation.confirmed_by_email ?? 'Không có thông tin người xác nhận'}</p> : null}
      {isMarketplace ? <p className="mt-1 text-xs">Trạng thái thanh toán của nền tảng không xác nhận tiền đã quyết toán vào tài khoản người bán.</p> : null}
    </section>

    {order.deliveryNote ? <section className="mt-4 border-t border-gray-400 pt-3 text-sm"><h2 className="font-bold">Ghi chú giao hàng</h2><p className="mt-1 whitespace-pre-wrap">{order.deliveryNote}</p></section> : null}
    <p className="mt-5 text-xs font-semibold">Phiếu bán hàng nội bộ — không thay thế hóa đơn GTGT.</p>
  </DocumentFrame>;
}

function PackingDocument({ order }: { order: OrderApiRow }) {
  return <DocumentFrame order={order} title="Phiếu soạn hàng">
    <div className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 text-sm">
      <p>Ngày tạo đơn: <strong>{formatOrderTime(order.placedAt)}</strong></p>
      <p>Kênh bán: <strong>{channelName(order.channelCode)}</strong></p>
      <p>Trạng thái xử lý: <strong>{apiStatusPresentation[order.status].label}</strong></p>
      {(order.recipientName || (order.channelCode === 'pos' && order.customerName)) ? <p>Người nhận: <strong>{order.recipientName || order.customerName}</strong></p> : null}
      {(order.recipientPhone || (order.channelCode === 'pos' && order.customerPhone)) ? <p className="col-span-2">Điện thoại: <strong>{order.recipientPhone || order.customerPhone}</strong></p> : null}
      {order.deliveryAddress ? <p className="col-span-2">Địa chỉ giao: <strong>{order.deliveryAddress}</strong></p> : null}
    </div>
    <ItemTable order={order} includePrices={false} />
    <section className="mt-6 border-t border-gray-400 pt-3 text-sm">
      <h2 className="font-bold">Ghi chú đóng gói</h2>
      <p className="mt-1 min-h-8 whitespace-pre-wrap">{order.deliveryNote || 'Không có ghi chú đóng gói.'}</p>
      {order.unifiedShipping?.tracking_number ? <p className="mt-3">Mã vận đơn: <strong className="font-mono">{order.unifiedShipping.tracking_number}</strong></p> : null}
    </section>
  </DocumentFrame>;
}

export function OrderPrintDocuments({ order, kind }: { order: OrderApiRow; kind: OrderPrintKind | null }) {
  if (!kind) return null;
  return <>
    <style>{`
      .order-print-document { display: none; }
      @media print {
        @page { size: A4; margin: 14mm; }
        html, body { background: #fff !important; color: #111 !important; }
        body * { visibility: hidden !important; }
        #order-print-document, #order-print-document * { visibility: visible !important; }
        #order-print-document { display: block !important; position: absolute; inset: 0 auto auto 0; width: 100%; padding: 0; color: #111; background: #fff; font-family: Arial, sans-serif; }
      }
    `}</style>
    {kind === 'sale' ? <SaleDocument order={order} /> : <PackingDocument order={order} />}
  </>;
}
