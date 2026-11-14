import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { SyncFilters } from '../sync.types';

export function SyncFiltersPanel({ filters, onChange, live = false, errorsOnly = false }: { filters: SyncFilters; onChange: (filters: SyncFilters) => void; live?: boolean; errorsOnly?: boolean }) {
  return (
    <section className="grid gap-4 rounded-card border border-outline-variant/60 bg-pure-white p-4 shadow-card" aria-label="Bộ lọc đồng bộ">
      <Input aria-label="Tìm sự kiện đồng bộ" value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="Mã sự kiện, SKU, sản phẩm hoặc kênh…" leading={<span className="material-symbols-outlined text-xl" aria-hidden="true">search</span>} />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {live ? (
          <Select label="Trạng thái đồng bộ" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as SyncFilters['status'] })}>
            <option value="all">{errorsOnly ? 'Tất cả lỗi' : 'Tất cả trạng thái'}</option>{errorsOnly ? <><option value="failed">Đang thử lại</option><option value="dead">Thất bại hẳn</option></> : <><option value="pending">Đang chờ</option><option value="delivered">Đã giao</option><option value="failed">Đang thử lại</option><option value="dead">Cần xử lý</option></>}
          </Select>
        ) : <>
          <Select label="Kênh" value={filters.channel} onChange={(event) => onChange({ ...filters, channel: event.target.value as SyncFilters['channel'] })}><option value="all">Tất cả kênh</option><option value="shopee">Shopee</option><option value="tiktok">TikTok</option><option value="lazada">Lazada</option><option value="pos">Bán tại quầy</option><option value="shopify">Shopify</option></Select>
          <Select label="Trạng thái" value={filters.status} onChange={(event) => onChange({ ...filters, status: event.target.value as SyncFilters['status'] })}><option value="all">Tất cả trạng thái</option><option value="confirmed">Đã xác nhận</option><option value="processing">Đang xử lý</option><option value="conflict">Xung đột</option><option value="retrying">Đang thử lại</option><option value="failed">Thất bại</option></Select>
          <Select label="Loại sự kiện" value={filters.kind} onChange={(event) => onChange({ ...filters, kind: event.target.value as SyncFilters['kind'] })}><option value="all">Tất cả loại</option><option value="inventory_changed">Tồn kho thay đổi</option><option value="order_reserved">Đơn đã giữ hàng</option><option value="buffer_adjusted">Điều chỉnh tồn đệm</option><option value="mass_push">Gửi hàng loạt</option><option value="sku_ingestion">Nhận SKU mới</option><option value="stock_depleted">Hết hàng</option></Select>
          <Select label="Tình trạng" value={filters.health} onChange={(event) => onChange({ ...filters, health: event.target.value as SyncFilters['health'] })}><option value="all">Tất cả tình trạng</option><option value="optimal">Tốt</option><option value="degraded">Chậm</option><option value="discrepancy">Lệch</option></Select>
        </>}
      </div>
    </section>
  );
}
