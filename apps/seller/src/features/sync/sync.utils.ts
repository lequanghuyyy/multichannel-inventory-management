import type { SyncEventFixture, SyncEventHealth, SyncEventKind, SyncEventStatus, SyncFilters, SyncSection } from './sync.types';

export const initialSyncFilters: SyncFilters = { query: '', channel: 'all', status: 'all', kind: 'all', health: 'all' };

export const syncStatusLabels: Record<SyncEventStatus, string> = {
  confirmed: 'Đã xác nhận', processing: 'Đang xử lý', conflict: 'Xung đột', retrying: 'Đang thử lại', failed: 'Thất bại', pending: 'Đang chờ', delivered: 'Đã giao', dead: 'Cần xử lý',
};

export const syncKindLabels: Record<SyncEventKind, string> = {
  inventory_changed: 'Tồn kho thay đổi', order_reserved: 'Đơn đã giữ hàng', buffer_adjusted: 'Điều chỉnh tồn đệm', mass_push: 'Gửi hàng loạt', sku_ingestion: 'Nhận SKU mới', stock_depleted: 'Hết hàng',
};

export const syncHealthLabels: Record<SyncEventHealth, string> = {
  optimal: 'Tốt', degraded: 'Chậm', discrepancy: 'Lệch',
};

export function filterSyncEvents(events: SyncEventFixture[], filters: SyncFilters, section: SyncSection): SyncEventFixture[] {
  const query = filters.query.trim().toLowerCase();
  return events.filter((event) => {
    const sectionMatch = section === 'errors'
      ? ['conflict', 'retrying', 'failed'].includes(event.status)
      : section === 'reconciliation'
        ? event.health === 'discrepancy'
        : true;
    const queryMatch = !query || [event.id, event.correlationId, event.sku, event.product, event.source, event.destination].some((value) => value.toLowerCase().includes(query));
    return sectionMatch && queryMatch && (filters.channel === 'all' || event.channel === filters.channel) && (filters.status === 'all' || event.status === filters.status) && (filters.kind === 'all' || event.kind === filters.kind) && (filters.health === 'all' || event.health === filters.health);
  });
}
