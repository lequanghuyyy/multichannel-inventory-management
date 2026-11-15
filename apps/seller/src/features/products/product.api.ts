import type { ProductSummary } from '../../api/products';
import type { ProductStatus } from './product.types';

/**
 * The ledger row a live catalogue product renders as.
 *
 * `ProductResponse` carries the fields below and the variant rows, but no master SKU, brand or
 * primary media id. Those three stay in the shape because the table columns exist, and they are
 * filled with honest blanks rather than a fixture value: a product without a business code in
 * the backend should read as "no code", not borrow another product's.
 */
export interface ProductApiRow {
  id: string;
  name: string;
  masterSku: string;
  brand: string;
  category: string;
  /** The app's status union; `active` is the server's `PUBLISHED`. */
  status: ProductStatus;
  /** Authenticated content identifier for the product's primary image, if present. */
  primaryMediaId?: string;
  variantCount: number;
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  /**
   * Summed from the server-owned per-variant `available_to_sell`. It is never re-derived from
   * on-hand arithmetic here.
   */
  availableToSell: number;
}

export function toProductApiRow(summary: ProductSummary): ProductApiRow {
  const row = summary as any;
  return {
    id: String(row.id ?? ''),
    name: row.name ?? '',
    masterSku: row.masterSku ?? row.master_sku ?? '',
    brand: row.brand ?? '',
    category: row.category ?? '',
    status: row.status ?? 'draft',
    primaryMediaId: row.primaryMediaId ?? row.primary_media_id,
    variantCount: row.variantCount ?? row.variant_count ?? 0,
    onHand: row.onHand ?? row.on_hand ?? 0,
    reserved: row.reserved ?? 0,
    safetyBuffer: row.safetyBuffer ?? row.safety_buffer ?? 0,
    availableToSell: row.availableToSell ?? row.available_to_sell ?? 0,
  };
}

/**
 * Filters API rows on the page already in hand.
 *
 * The server list endpoint takes no query parameters, so this is the only filter. `extraFor` is
 * still per row: a shared list of terms would make one term match every row.
 */
export function filterProductApiRows(
  rows: readonly ProductApiRow[],
  filters: {
    query: string;
    category: string;
    status: ProductStatus | 'all';
    extraFor?: (row: ProductApiRow) => readonly string[];
  },
): ProductApiRow[] {
  const query = filters.query.trim().toLocaleLowerCase('vi-VN');
  return rows.filter((row) => {
    if (filters.category !== 'all' && row.category !== filters.category) return false;
    if (filters.status !== 'all' && row.status !== filters.status) return false;
    if (!query) return true;
    const searchable = [row.name, row.masterSku, row.brand, row.category, ...(filters.extraFor?.(row) ?? [])].join(' ').toLocaleLowerCase('vi-VN');
    return searchable.includes(query);
  });
}

/**
 * The four aggregates a catalogue totals row needs, counted from the rows on screen.
 *
 * `outOfStock` counts products whose available-to-sell is zero rather than reading `status`:
 * a published product can sell nothing, and a totals card that counted statuses would miss
 * exactly the ones a shopkeeper needs to see.
 */
export function summariseProducts(rows: readonly ProductApiRow[]): { products: number; variants: number; lowStock: number; outOfStock: number } {
  return {
    products: rows.length,
    variants: rows.reduce((total, row) => total + row.variantCount, 0),
    lowStock: rows.filter((row) => row.availableToSell > 0 && row.availableToSell <= 10).length,
    outOfStock: rows.filter((row) => row.availableToSell === 0).length,
  };
}
