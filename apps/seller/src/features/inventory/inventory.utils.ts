import type { InventoryFilters, InventoryLedgerRow } from './inventory.types';

export const initialInventoryFilters: InventoryFilters = {
  query: '',
  product: 'all',
  status: 'all',
  channel: 'all',
  location: 'all',
  quick: 'all',
};

export function filterInventoryRows(rows: InventoryLedgerRow[], filters: InventoryFilters): InventoryLedgerRow[] {
  const query = filters.query.trim().toLocaleLowerCase('vi');
  return rows.filter((row) => {
    const matchesQuery = !query || [row.productName, row.variantLabel, row.sku, row.barcode].some((value) => value.toLocaleLowerCase('vi').includes(query));
    const matchesProduct = filters.product === 'all' || row.productName === filters.product;
    const matchesStatus = filters.status === 'all' || (filters.status === 'reserved_only' ? row.reserved > 0 : row.status === filters.status);
    const matchesChannel = filters.channel === 'all' || row.channels.some((channel) => channel.id === filters.channel);
    const matchesLocation = filters.location === 'all' || row.location === filters.location;
    const matchesQuick = filters.quick === 'all'
      || (filters.quick === 'low' && row.status === 'low_stock')
      || (filters.quick === 'out' && row.status === 'out_of_stock')
      || (filters.quick === 'conflict' && row.syncConflict)
      || (filters.quick === 'custom' && row.customBuffer);
    return matchesQuery && matchesProduct && matchesStatus && matchesChannel && matchesLocation && matchesQuick;
  });
}
