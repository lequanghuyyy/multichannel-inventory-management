import type { InventoryRow as ApiInventoryRow } from '../../api/inventory';
import { formatMinor } from '../../lib/money';
import { inventoryManagementRows } from '../../mocks/inventory-management';
import type { InventoryChannel, InventoryLedgerRow, InventoryStatus, InventorySyncState } from './inventory.types';

const lowStockThreshold = 10;

// The same seven rows the fixture shows, so a SKU that exists in one source exists in the other.
// Anything not here gets a placeholder, which is honest: the API has no barcode and no channel
// binding, so those two columns are the ONLY thing the fixture can supply for a known SKU.
const fixtureBySku = new Map(inventoryManagementRows.map((row) => [row.sku, row]));

const iconByCategory: Record<string, string> = {
  FOOTWEAR: 'steps',
  APPAREL: 'checkroom',
  ACCESSORIES: 'account_balance_wallet',
};

const channelOrder: InventoryChannel['id'][] = ['shopee', 'tiktok', 'lazada', 'web', 'pos'];

// GET /api/v1/inventory carries no channel list, no per-SKU sync state and no updated_at, so
// these three are declared facts about a backend that does not track them. Rendering them as
// "Đã đồng bộ" would claim five marketplaces are publishing stock the system cannot confirm
// they can sell; the neutral label says only that the API did not say.
const channelLookup = (ids: readonly string[]): InventoryChannel[] => {
  const catalogue = new Map<string, InventoryChannel>(inventoryManagementRows.flatMap((row) => row.channels).map((channel) => [channel.id, channel]));
  return channelOrder.filter((id) => ids.includes(id)).flatMap((id) => {
    const channel = catalogue.get(id);
    return channel ? [channel] : [];
  });
};

/**
 * The backend has no low-stock threshold table, so this threshold is the client's.
 *
 * It lives here, named, rather than being scattered through the render — and it is a
 * prototype number, not a configured business rule. The fixture happens to draw the line at
 * the same place for its own rows, which is why switching sources does not reorder the ledger.
 */
export function inventoryStatusOf(row: { on_hand: number; available_to_sell: number }): InventoryStatus {
  if (row.available_to_sell <= 0) return 'out_of_stock';
  if (row.available_to_sell <= lowStockThreshold) return 'low_stock';
  return 'in_stock';
}

export function inventorySyncStateOf(source: 'api' | 'fixture'): InventorySyncState {
  return source === 'api' ? 'unavailable' : 'synced';
}

/** "BLACK / 42", the label the fixture writes as "Đen / EU 42". Colour is never parsed from a SKU. */
function variantLabelOf(row: ApiInventoryRow): string {
  const parts = [row.color, row.size].filter((part): part is string => typeof part === 'string' && part.trim() !== '');
  return parts.length > 0 ? parts.join(' / ') : 'Một biến thể';
}

/**
 * Projects one API row onto the ledger row the table already renders.
 *
 * The four canonical numbers come from the API and from nothing else — `available_to_sell`
 * in particular is READ, never recomputed as `on_hand - reserved - safety_buffer`. The
 * projection carries barcode, channels and sync state from the fixture row of the same SKU,
 * which is enrichment rather than a second source of truth: each is a fact about the SKU that
 * only the prototype knows. The numbers are never taken from that row even when it carries
 * different ones, so a stale fixture can lie about a channel but not about stock.
 *
 * The price rides along on the row so the table needs no second lookup keyed by id, and so it
 * is absent — not blank, absent — in fixture mode. `price_minor` is an integer in the product's
 * own currency and is never divided here; see `lib/money.ts` for why that is the load-bearing
 * part of D13.
 */
export function toInventoryLedgerRow(row: ApiInventoryRow, source: 'api' | 'fixture'): InventoryLedgerRow {
  const fallback = fixtureBySku.get(row.sku);
  const customBuffer = fallback?.customBuffer ?? false;
  const syncConflict = fallback?.syncConflict ?? false;

  return {
    id: row.variant_id,
    // Only live rows carry a catalogue image. The fallback icon stays on the row so fixture
    // rows and products without media still render something meaningful.
    ...(source === 'api' ? { productId: row.product_id, primaryMediaId: row.primary_media_id } : {}),
    productName: row.product_name ?? row.sku,
    variantLabel: variantLabelOf(row),
    icon: fallback?.icon ?? iconByCategory[row.category ?? ''] ?? 'qr_code_2',
    sku: row.sku,
    barcode: fallback?.barcode ?? '',
    onHand: row.on_hand,
    reserved: row.reserved,
    safetyBuffer: row.safety_buffer,
    availableToSell: row.available_to_sell,
    ...(source === 'api' ? { version: row.version } : {}),
    channels: source === 'api' ? [] : channelLookup(fallback?.channels.map((channel) => channel.id) ?? []),
    status: inventoryStatusOf(row),
    syncState: source === 'api' ? 'unavailable' : fallback?.syncState ?? inventorySyncStateOf(source),
    updatedLabel: source === 'api' ? 'Vừa cập nhật' : (fallback?.updatedLabel ?? 'Chưa rõ'),
    location: 'central',
    customBuffer,
    syncConflict: source === 'api' ? false : syncConflict,
    reservedNote: fallback?.reservedNote,
    ...(source === 'api' ? { priceLabel: formatMinor(row.price_minor, row.currency) } : {}),
  };
}
