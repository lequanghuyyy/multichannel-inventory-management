import type { FulfillmentStatus, Order, OrderFilters, OrderStatus } from './order.types';

export const initialOrderFilters: OrderFilters = { query: '', channel: 'all', fulfillment: 'all', date: 'all' };

export const statusPresentation: Record<OrderStatus, { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' }> = {
  pending: { label: 'Chờ xử lý', tone: 'warning' },
  reserved: { label: 'Đang giữ hàng', tone: 'neutral' },
  confirmed: { label: 'Đã xác nhận', tone: 'success' },
  completed: { label: 'Hoàn tất', tone: 'success' },
  cancelled: { label: 'Đã hủy', tone: 'danger' },
  returned: { label: 'Đã trả hàng', tone: 'neutral' },
};

export const fulfillmentLabels: Record<FulfillmentStatus, string> = {
  processing: 'Đang soạn hàng',
  awaiting_dispatch: 'Chờ giao đi',
  in_transit: 'Đang vận chuyển',
  delivered: 'Đã giao',
  cancelled: 'Đã hủy',
  pending_clearance: 'Chờ xác nhận thanh toán',
};

export function filterOrders(orders: Order[], filters: OrderFilters, status: 'all' | OrderStatus): Order[] {
  const query = filters.query.trim().toLocaleLowerCase('vi');
  return orders.filter((order) => {
    const matchesQuery = !query || [order.reference, order.marketplaceReference, order.externalId, order.customer.name, ...order.items.flatMap((item) => [item.sku, item.name])].some((value) => value.toLocaleLowerCase('vi').includes(query));
    const matchesStatus = status === 'all' || order.status === status;
    const matchesChannel = filters.channel === 'all' || order.channel.id === filters.channel;
    const matchesFulfillment = filters.fulfillment === 'all' || order.fulfillmentStatus === filters.fulfillment;
    const matchesDate = filters.date === 'all' || (filters.date === 'today' ? order.placedAt.startsWith('2026-10-02') : order.placedAt < '2026-10-02');
    return matchesQuery && matchesStatus && matchesChannel && matchesFulfillment && matchesDate;
  });
}

export function formatOrderTime(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}
