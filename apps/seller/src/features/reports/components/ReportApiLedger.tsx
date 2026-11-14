import { categoryLabel } from '../../../lib/category';
import { channelName } from '../../orders/order.api';
import type { ReportChannelShare, ReportDayBucket, ReportInventoryHealth, ReportListingDrift, ReportSkuRow, ReportSummary, ReportSyncHealth } from '../../../api/reports';
import { cn } from '../../../lib/cn';
import { formatMinor } from '../../../lib/money';

// Every figure below is read off the rows the API returned. Nothing here is a constant, and
// nothing is derived from a SKU string: `category` arrives from products.category because the
// core is the only thing that knows what a SKU is.
//
// Money goes through formatMinor, which lets Intl decide the fraction digits. VND has none, so
// a `/100` here would have shown every đồng amount a hundred times too small — the money bug
// this screen used to carry.
const money = (minor: number, currency: string): string => formatMinor(minor, currency);

const count = (value: number): string => new Intl.NumberFormat('vi-VN').format(value);

function Tile({ label, value, detail, tone = 'neutral' }: { label: string; value: string; detail: string; tone?: 'neutral' | 'warning' | 'success' }) {
  const toneClass = tone === 'warning' ? 'text-badge-blocked-text' : tone === 'success' ? 'text-badge-progress-text' : 'text-on-surface';
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-metric-ink bg-metric-paper p-4 shadow-metric">
      <span className="font-body text-caption uppercase tracking-[0.1em] text-graphite">{label}</span>
      <strong className={cn('font-display text-2xl font-bold tabular-nums tracking-tight', toneClass)}>{value}</strong>
      <span className="font-body text-body-sm text-graphite">{detail}</span>
    </div>
  );
}

export function ReportApiKpis({ summary }: { summary: ReportSummary }) {
  const { metrics, inventory, sync, drift, currency } = summary;
  return (
    <section aria-label="Chỉ số báo cáo" className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Tile label="Đơn hàng" value={count(metrics.order_count)} detail={`${count(metrics.cancelled_orders)} đã hủy trong kỳ`} />
      <Tile label="Sản phẩm bán ra" value={count(metrics.units_sold)} detail={`${count(metrics.units_gross)} trước khi trừ đơn hủy`} />
      <Tile label="Giá trị đơn chưa hủy" value={money(metrics.non_cancelled_order_value_minor, currency)} detail={`Gồm cả đơn hủy là ${money(metrics.gross_order_value_minor, currency)}`} />
      <Tile label="Giá trị đơn trung bình" value={money(summary.average_order_value_minor, currency)} detail="Tính trên các đơn chưa hủy" />
      <Tile label="Trả hàng hoàn tất" value={count(metrics.completed_returns)} detail={`${count(metrics.returned_sellable_units)} sản phẩm đạt điều kiện nhập lại kho`} />
      <Tile label="Hết tồn" value={count(inventory.out_of_stock)} detail={`Trong ${count(inventory.variant_count)} biến thể đang bán`} tone={inventory.out_of_stock > 0 ? 'warning' : 'neutral'} />
      <Tile label="Sắp hết" value={count(inventory.low_stock)} detail="Số có thể bán còn rất ít" tone={inventory.low_stock > 0 ? 'warning' : 'neutral'} />
      <Tile label="SKU đăng bán bị lệch" value={count(drift.drifted)} detail={`${count(drift.awaiting_report)} chưa được kênh xác nhận`} tone={drift.drifted > 0 ? 'warning' : 'success'} />
      <Tile label="Sự kiện lỗi hẳn" value={count(sync.dead)} detail={`Trong ${count(sync.event_count)} sự kiện trong kỳ`} tone={sync.dead > 0 ? 'warning' : 'neutral'} />
    </section>
  );
}

export function ReportApiVelocity({ buckets, currency }: { buckets: ReportDayBucket[]; currency: string }) {
  const peak = buckets.reduce((max, bucket) => Math.max(max, bucket.units_sold), 0);
  return (
    <section aria-label="Tốc độ bán theo ngày" className="rounded-card border border-line bg-white p-5">
      <h3 className="font-display text-lg font-bold text-on-surface">Tốc độ bán theo ngày</h3>
      <p className="mt-1 font-body text-body-sm text-graphite">
        Mỗi dòng là một ngày trong kỳ, kể cả ngày không có đơn.
      </p>
      <table className="mt-4 w-full text-left font-body text-body-sm">
        <caption className="sr-only">Tốc độ bán theo ngày</caption>
        <thead><tr className="text-caption uppercase tracking-[0.1em] text-graphite"><th className="py-2">Ngày</th><th className="py-2">Đơn</th><th className="py-2">Sản phẩm</th><th className="py-2">Giá trị đơn</th></tr></thead>
        <tbody>
          {buckets.map((bucket) => (
            <tr key={bucket.date} className="border-t border-line">
              <td className="py-2">
                <span className="block">{bucket.date}</span>
                {peak > 0 ? (
                  <span className="mt-1 block h-1 w-full max-w-40 rounded-full bg-line">
                    <span className="block h-1 rounded-full bg-brand-primary" style={{ width: `${Math.round((bucket.units_sold / peak) * 100)}%` }} />
                  </span>
                ) : null}
              </td>
              <td className="py-2 tabular-nums">{count(bucket.order_count)}</td>
              <td className="py-2 tabular-nums">{count(bucket.units_sold)}</td>
              <td className="py-2 tabular-nums">{money(bucket.non_cancelled_order_value_minor, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

export function ReportApiSkuLedger({ skus, currency }: { skus: ReportSkuRow[]; currency: string }) {
  if (skus.length === 0) {
    return <p className="font-body text-body-sm text-graphite">Không có SKU nào bán trong kỳ này.</p>;
  }
  return (
    <table aria-label="Bảng SKU bán chạy" className="w-full text-left font-body text-body-sm">
      <caption className="sr-only">Bảng SKU bán chạy</caption>
      <thead><tr className="text-caption uppercase tracking-[0.1em] text-graphite"><th className="py-2">SKU</th><th className="py-2">Tên</th><th className="py-2">Nhóm</th><th className="py-2">Đơn</th><th className="py-2">Bán ra</th><th className="py-2">Giá trị đơn</th></tr></thead>
      <tbody>
        {skus.map((row) => (
          <tr key={row.sku} className="border-t border-line">
            <td className="py-2 font-mono text-caption">{row.sku}</td>
            <td className="py-2">{row.name}</td>
            {/* Straight from products.category. Never parsed out of the SKU: "this code looks
                like footwear" is an inference the core refuses to make, and so does this. */}
            <td className="py-2">{categoryLabel(row.category)}</td>
            <td className="py-2 tabular-nums">{count(row.order_count)}</td>
            <td className="py-2 tabular-nums">{count(row.units_sold)}</td>
            <td className="py-2 tabular-nums">{money(row.non_cancelled_order_value_minor, currency)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportApiChannels({ channels, currency }: { channels: ReportChannelShare[]; currency: string }) {
  return (
    <table aria-label="Giá trị đơn theo kênh" className="w-full text-left font-body text-body-sm">
      <caption className="sr-only">Giá trị đơn theo kênh</caption>
      <thead><tr className="text-caption uppercase tracking-[0.1em] text-graphite"><th className="py-2">Kênh</th><th className="py-2">Đơn</th><th className="py-2">Bán ra</th><th className="py-2">Giá trị đơn</th><th className="py-2">Tỷ trọng</th></tr></thead>
      <tbody>
        {channels.map((row) => (
          <tr key={row.channel_code} className="border-t border-line">
            <td className="py-2">{channelName(row.channel_code)}</td>
            <td className="py-2 tabular-nums">{count(row.order_count)}</td>
            <td className="py-2 tabular-nums">{count(row.units_sold)}</td>
            <td className="py-2 tabular-nums">{money(row.non_cancelled_order_value_minor, currency)}</td>
            <td className="py-2 tabular-nums">{count(row.share_pct)}%</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ReportApiLedger({ inventory, sync, drift }: { inventory: ReportInventoryHealth; sync: ReportSyncHealth; drift: ReportListingDrift }) {
  const rows: [string, number, string][] = [
    ['Tồn thực tế', inventory.on_hand, 'Tổng số hàng đang có trong kho'],
    ['Đang giữ', inventory.reserved, 'Giữ cho đơn chưa chốt'],
    ['Biến thể có giữ', inventory.with_open_holds, 'Số biến thể đang bị giữ hàng'],
    ['Sự kiện đã giao', sync.delivered, 'Kênh đã xác nhận đã nhận'],
    ['Sự kiện đang chờ', sync.pending, 'Đang chờ gửi'],
    ['Sự kiện thất bại', sync.failed, 'Đang được tự động thử lại'],
    ['Sự kiện chết', sync.dead, 'Đã hết số lần thử, cần người xử lý'],
    ['Chết trước kỳ này', sync.dead_before_period, 'Chưa được xử lý từ trước đó'],
    ['SKU đang đăng bán', drift.listing_count, 'Tổng SKU trên các kênh đang hoạt động'],
    ['Tính theo số có thể bán', drift.ats_basis, 'Đối chiếu theo số có thể bán, là số được báo cho kênh'],
    ['Tính theo tồn kho gộp (cũ)', drift.legacy_basis, 'Các dòng cũ đối chiếu theo tổng tồn kho'],
    ['Chưa đăng bán', drift.unlisted, 'Biến thể chưa được kênh nào đăng bán'],
    ['Kênh chưa xác nhận', drift.awaiting_report, 'Đã gửi nhưng chưa có phản hồi'],
    ['Chậm hơn hệ thống', drift.behind_core, 'Kênh đang giữ phiên bản cũ hơn hệ thống'],
  ];
  return (
    <table aria-label="Tình trạng tồn kho và đồng bộ" className="w-full text-left font-body text-body-sm">
      <caption className="sr-only">Tình trạng tồn kho và đồng bộ</caption>
      <thead><tr className="text-caption uppercase tracking-[0.1em] text-graphite"><th className="py-2">Chỉ số</th><th className="py-2">Giá trị</th><th className="py-2">Ý nghĩa</th></tr></thead>
      <tbody>
        {rows.map(([label, value, detail]) => (
          <tr key={label} className="border-t border-line">
            <td className="py-2">{label}</td>
            <td className="py-2 tabular-nums">{count(value)}</td>
            <td className="py-2 text-graphite">{detail}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
