import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { Select } from '../../../components/ui/Select';
import type { OrderFilters } from '../order.types';

export interface ApiOrderFilters {
  fulfillment: string;
  placedFrom: string;
  placedTo: string;
}

export function OrderFiltersPanel({ filters, onChange, isApi, channels, apiFilters, onApiChange }:
  {
    filters: OrderFilters;
    onChange: (filters: OrderFilters) => void;
    /**
     * The live API carries no customer location, no prototype fulfillment vocabulary and no
     * fixture calendar, so those three controls are REMOVED rather than disabled or left
     * offering values the server has never heard of. A filter that silently matches nothing
     * is the most misleading control a screen can have.
     */
    isApi?: boolean;
    /** Channels that currently have a live connection, so the list cannot promise a filter that returns nothing. */
    channels?: readonly { code: string; label: string }[];
    apiFilters?: ApiOrderFilters;
    onApiChange?: (filters: ApiOrderFilters) => void;
  }) {
  if (isApi) {
    return (
      <Card className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-5">
        <Input label="Tìm kiếm đơn hàng" value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="Mã đơn, mã đơn trên kênh, khách hàng…" leading={<span className="material-symbols-outlined text-xl">search</span>} />
        <Select label="Kênh" value={filters.channel} onChange={(event) => onChange({ ...filters, channel: event.target.value as OrderFilters['channel'] })}>
          <option value="all">Tất cả kênh</option>
          {(channels ?? []).map((channel) => <option key={channel.code} value={channel.code}>{channel.label}</option>)}
        </Select>
        <Select label="Trạng thái giao hàng" value={apiFilters?.fulfillment ?? 'all'} onChange={(event) => onApiChange?.({ ...(apiFilters ?? { fulfillment: 'all', placedFrom: '', placedTo: '' }), fulfillment: event.target.value })}>
          <option value="all">Tất cả trạng thái</option><option value="pending">Chờ xử lý</option><option value="picking">Đang lấy hàng</option><option value="shipped">Đang giao</option><option value="delivered">Đã giao</option><option value="returned">Đã trả hàng</option>
        </Select>
        <Input type="date" label="Từ ngày (UTC)" value={apiFilters?.placedFrom ?? ''} max={apiFilters?.placedTo || undefined} onChange={(event) => onApiChange?.({ ...(apiFilters ?? { fulfillment: 'all', placedFrom: '', placedTo: '' }), placedFrom: event.target.value })} />
        <Input type="date" label="Đến ngày (UTC)" value={apiFilters?.placedTo ?? ''} min={apiFilters?.placedFrom || undefined} onChange={(event) => onApiChange?.({ ...(apiFilters ?? { fulfillment: 'all', placedFrom: '', placedTo: '' }), placedTo: event.target.value })} />
      </Card>
    );
  }
  return <Card className="grid grid-cols-1 gap-3 p-4 md:grid-cols-2 xl:grid-cols-[2fr_repeat(3,1fr)]"><Input label="Tìm kiếm đơn hàng" value={filters.query} onChange={(event) => onChange({ ...filters, query: event.target.value })} placeholder="Mã đơn, khách hàng hoặc SKU…" leading={<span className="material-symbols-outlined text-xl">search</span>} /><Select label="Kênh" value={filters.channel} onChange={(event) => onChange({ ...filters, channel: event.target.value as OrderFilters['channel'] })}><option value="all">Tất cả kênh</option><option value="shopee">Shopee</option><option value="tiktok">TikTok Shop</option><option value="pos">Bán tại quầy</option><option value="lazada">Lazada</option><option value="web">Website bán hàng</option></Select><Select label="Ngày đặt" value={filters.date} onChange={(event) => onChange({ ...filters, date: event.target.value as OrderFilters['date'] })}><option value="all">Tất cả ngày</option><option value="today">02/10/2026</option><option value="previous">Trước 02/10/2026</option></Select><Select label="Giao hàng" value={filters.fulfillment} onChange={(event) => onChange({ ...filters, fulfillment: event.target.value as OrderFilters['fulfillment'] })}><option value="all">Tất cả trạng thái</option><option value="processing">Đang soạn hàng</option><option value="awaiting_dispatch">Chờ giao đi</option><option value="in_transit">Đang vận chuyển</option><option value="delivered">Đã giao</option><option value="pending_clearance">Chờ xác nhận thanh toán</option><option value="cancelled">Đã hủy</option></Select></Card>;
}
