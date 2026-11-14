import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import { orderStatusCounts } from '../../../mocks/orders';
import type { OrderStatus } from '../order.types';
import { apiStatusPresentation, type ApiOrderStatus } from '../order.api';

export type OrderStatusTab = 'all' | OrderStatus;
export type OrderStatusTabApi = 'all' | ApiOrderStatus;

// The API's lifecycle is a DIFFERENT six values from the prototype's, with four names in
// common. Reusing the fixture's tab list would offer "Completed" and filter for a status the
// API cannot return, so a click would silently show nothing — which reads as "no completed
// orders exist" rather than "this vocabulary does not apply here".
const statuses: { value: OrderStatusTab; label: string }[] = [
  { value: 'all', label: 'Tất cả' }, { value: 'pending', label: 'Chờ xử lý' }, { value: 'reserved', label: 'Đang giữ hàng' }, { value: 'confirmed', label: 'Đã xác nhận' }, { value: 'completed', label: 'Hoàn tất' }, { value: 'cancelled', label: 'Đã hủy' }, { value: 'returned', label: 'Đã trả hàng' },
];

const apiStatuses: { value: OrderStatusTabApi; label: string }[] = [
  { value: 'all', label: 'Tất cả' },
  ...(Object.keys(apiStatusPresentation) as ApiOrderStatus[]).map((value) => ({
    value: value as OrderStatusTabApi,
    label: apiStatusPresentation[value].label,
  })),
];

export function OrderStatusTabs({ value, onChange, isApi, apiValue, onApiChange, apiCounts }:
  {
    value: OrderStatusTab;
    onChange: (value: OrderStatusTab) => void;
    /** Switches to the API's own lifecycle vocabulary. Counts default to the live rows. */
    isApi?: boolean;
    apiValue?: OrderStatusTabApi;
    onApiChange?: (value: OrderStatusTabApi) => void;
    apiCounts?: Record<string, number>;
  }) {
  if (isApi) {
    const items: TabItem<OrderStatusTabApi>[] = apiStatuses.map((status) => ({
      value: status.value,
      label: <span>{status.label}<span className="ml-2 rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] tabular-nums">{(apiCounts?.[status.value] ?? 0).toLocaleString('vi-VN')}</span></span>,
    }));
    return <Tabs items={items} value={apiValue ?? 'all'} onValueChange={(next) => onApiChange?.(next as OrderStatusTabApi)} ariaLabel="Trạng thái đơn hàng" className="w-fit max-w-full" />;
  }
  const items: TabItem<OrderStatusTab>[] = statuses.map((status) => ({ value: status.value, label: <span>{status.label}<span className="ml-2 rounded-full bg-surface-container px-1.5 py-0.5 text-[10px] tabular-nums">{orderStatusCounts[status.value].toLocaleString('vi-VN')}</span></span> }));
  return <Tabs items={items} value={value} onValueChange={onChange} ariaLabel="Trạng thái đơn hàng" className="w-fit max-w-full" />;
}
