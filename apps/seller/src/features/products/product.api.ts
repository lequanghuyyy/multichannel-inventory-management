import type { ProductSummary } from '../../api/products';
import type { ProductStatus } from './product.types';

/**
 * The ledger row an API product renders as.
 *
 * A separate shape from `ProductCatalogItem` on purpose. That type describes a prototype
 * product: variants with prices and barcodes, channel bindings, a sellable-rate percentage, a
 * created/updated timestamp. `ProductSummary` carries NONE of those — no variant SKUs, no
 * price, no channel state, no timestamps. Trying to fill one from the other is where an N+1
 * `GET /api/v1/products/{id}` per row would come from, or worse, where a fixture value would
 * be printed next to a live one and read as the same fact.
 *
 * The one thing `ProductSummary` genuinely cannot supply is a price: the contract sums
 * inventory in SQL and then stops, and a per-row detail fetch to recover prices would be a
 * request per catalogue row. So the table has no price column at all, rather than one that
 * says "Chưa có giá" down its entire length.
 */
export interface ProductApiRow {
  id: string;
  name: string;
  masterSku: string;
  brand: string;
  category: string;
  /** `products.status` is the API enum; it is a subset of the fixture's wider union. */
  status: ProductStatus;
  /** Authenticated content identifier for the product's primary image, if present. */
  primaryMediaId?: string;
  variantCount: number;
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  /**
   * Read from the API. The contract is explicit that this is summed in SQL over every variant
   * of the product and must never be re-derived from a page of variant rows — this screen has
   * no variant rows, so the temptation does not arise, but the number is still taken as given.
   */
  availableToSell: number;
}

export function toProductApiRow(summary: ProductSummary): ProductApiRow {
  return {
    id: summary.id,
    name: summary.name,
    // master_sku is optional and legitimately null for a product that predates the 00004
    // backfill; the contract calls it a business code, so it is never derived from the name.
    masterSku: summary.master_sku ?? '',
    brand: summary.brand ?? '',
    category: summary.category,
    status: summary.status,
    primaryMediaId: summary.primary_media_id,
    variantCount: summary.variant_count,
    onHand: summary.on_hand,
    reserved: summary.reserved,
    safetyBuffer: summary.safety_buffer,
    availableToSell: summary.available_to_sell,
  };
}

/**
 * Filters API rows.
 *
 * The backend can filter by status and by a name prefix search; everything else is done here
 * on the one page in hand, and deliberately so — see the note on `q` below.
 *
 * `q` is matched against the name, master SKU, brand and category. The prototype's search box
 * also promises variant SKUs, and a `ProductSummary` has none — matching them would need the
 * detail endpoint, once per row. Rather than quietly search a narrower set than the
 * placeholder claims, this takes `extraFor`, a resolver the caller supplies PER ROW for terms
 * it has already looked up, which is `undefined` today: the products screen has no second
 * source to resolve them from.
 *
 * Per row, and not a shared list of terms. An earlier version took a plain array and appended
 * it to every row's haystack, which meant supplying one term made the query match every row on
 * the page — the search box stopped discriminating at exactly the moment it was given something
 * extra to discriminate on.
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
 * a product can be `active` and sell nothing, and a totals card that counted statuses would
 * miss exactly the ones a shopkeeper needs to see.
 */
export function summariseProducts(rows: readonly ProductApiRow[]): { products: number; variants: number; lowStock: number; outOfStock: number } {
  return {
    products: rows.length,
    variants: rows.reduce((total, row) => total + row.variantCount, 0),
    lowStock: rows.filter((row) => row.availableToSell > 0 && row.availableToSell <= 10).length,
    outOfStock: rows.filter((row) => row.availableToSell === 0).length,
  };
}
