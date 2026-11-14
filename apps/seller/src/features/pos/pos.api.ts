import type { InventoryRow } from '../../api/inventory';
import { formatMinor } from '../../lib/money';
import type { CartItem, PosProductFixture } from './pos.types';

/**
 * Turns `GET /api/v1/inventory` rows into POS products.
 *
 * `GET /api/v1/inventory` is the one list that carries everything a till needs at once: the
 * canonical SKU the order endpoint takes, the price, the currency, Core balance values,
 * and the backend-approved `pos_sellable` quantity that caps the cart. Reaching for
 * `GET /api/v1/products` instead would cost one request per product and still leave the
 * price behind, because `ProductSummary` has none.
 *
 * Two things are carried from the fixture row of the same SKU and are enrichment, not a
 * second source of truth: the POS colour/size labels (the API stores `BLACK`/`42` as raw
 * attribute codes) and the category a till counter sorts by. A stale fixture can mislabel a
 * colour; it cannot invent stock, and the four numbers and the price never come from it.
 */
export function toPosProducts(rows: readonly InventoryRow[], fixtures: readonly PosProductFixture[] = []): PosProductFixture[] {
  const fixtureBySku = new Map(fixtures.map((fixture) => [fixture.sku, fixture]));

  return rows
    .filter((row) => Number.isSafeInteger(row.available_to_sell) && row.available_to_sell >= 0)
    .map((row) => {
      const fallback = fixtureBySku.get(row.sku);
      const hasPOSMode = row.pos_mode === 'shared' || row.pos_mode === 'dedicated';
      const posMode = hasPOSMode ? row.pos_mode! : 'unknown';
      const coreAts = row.available_to_sell;
      const hasPOSTransition = row.pos_transition_state === 'pending' || row.pos_transition_state === 'stable';
      const posTransitionState = row.pos_transition_state === 'pending' ? 'pending' : 'stable';
      const hasPOSSellable = Number.isSafeInteger(row.pos_sellable) && (row.pos_sellable ?? -1) >= 0;
      // Never infer a Shared grant when quota state is absent. Old persisted carts and
      // mismatched servers fail closed until the inventory API returns its POS snapshot.
      const hasPOSState = hasPOSMode && hasPOSTransition && hasPOSSellable;
      const ats = hasPOSState ? row.pos_sellable! : 0;
      const price = Number.isSafeInteger(row.price_minor) && (row.price_minor ?? -1) >= 0 ? row.price_minor! : null;
      const color = fallback?.color ?? row.color ?? '—';
      const size = fallback?.size ?? row.size ?? '—';
      const variant = color === '—' && size === '—' ? '' : [color, size === '—' ? '' : `Cỡ ${size}`].filter(Boolean).join(' / ');
      return {
        id: row.variant_id,
        ...(row.product_id ? { productId: row.product_id } : {}),
        ...(row.primary_media_id ? { primaryMediaId: row.primary_media_id } : {}),
        // product_name is `optional` in the contract, and `omitempty` on the Go side, so a
        // row can genuinely arrive without one. The SKU is the fallback because it is
        // required, canonical, and always readable to the cashier.
        name: row.product_name ?? row.sku,
        variant,
        sku: row.sku,
        category: categoryOf(row.category ?? '', fallback),
        color,
        size,
        // Missing or unsafe integer prices stay visibly unsellable; no fixture price is used.
        priceDisplay: formatMinor(price, row.currency),
        priceValue: price,
        onHand: row.on_hand,
        reserved: row.reserved,
        buffer: row.safety_buffer,
        coreAts,
        posMode,
        posRemaining: Number.isSafeInteger(row.pos_remaining) && (row.pos_remaining ?? -1) >= 0 ? row.pos_remaining! : 0,
        posTransitionState,
        // READ, not computed. `on_hand - reserved - safety_buffer` is what the backend
        // already did; recomputing it here is the one thing this screen must never do.
        ats,
        status: !hasPOSState
          ? 'unavailable'
          : posTransitionState === 'pending'
          ? 'transitioning'
          : posMode === 'dedicated' && ats === 0 && coreAts > 0
            ? 'pos-empty'
            : ats <= 0 ? 'out' : ats <= lowStockThreshold ? 'low' : 'instock',
        imageAlt: `Ảnh minh hoạ ${row.product_name ?? row.sku} ${variant}`.trim(),
        currency: row.currency,
      };
    });
}

/** Matches the inventory ledger's threshold so the two screens never disagree about "low". */
const lowStockThreshold = 10;

function categoryOf(category: string, fallback: PosProductFixture | undefined): PosProductFixture['category'] {
  if (fallback) return fallback.category;
  if (category === 'FOOTWEAR') return 'shoes';
  if (category === 'APPAREL') return 'apparel';
  if (category === 'ACCESSORIES') return 'accessories';
  // A category the fixture has no counter for still has to land somewhere. `bags` is the
  // prototype's "Túi & Da" bucket and is where an uncategorised leather good belongs.
  return 'bags';
}

export function cartTotalMinor(items: readonly CartItem[]): number | null {
  let total = 0n;
  for (const item of items) {
    if (!Number.isSafeInteger(item.unitPrice) || item.unitPrice < 0 || !Number.isSafeInteger(item.qty) || item.qty <= 0) return null;
    total += BigInt(item.unitPrice) * BigInt(item.qty);
    if (total > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  }
  return Number(total);
}

/** Parse a major-unit input as an exact integer minor-unit amount, without float math. */
export function parseMoneyInput(value: string, currency: string): number | null {
  let fractionDigits: number;
  try {
    fractionDigits = new Intl.NumberFormat('en-US', { style: 'currency', currency }).resolvedOptions().maximumFractionDigits ?? 0;
  } catch {
    return null;
  }
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] ?? '';
  if (fraction.length > fractionDigits) return null;
  const scale = 10n ** BigInt(fractionDigits);
  const fractionMinor = fractionDigits === 0 ? 0n : BigInt((fraction + '0'.repeat(fractionDigits)).slice(0, fractionDigits) || '0');
  const minor = BigInt(match[1]!) * scale + fractionMinor;
  return minor <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(minor) : null;
}

export interface CartReviewChange {
  sku: string;
  quantityBefore: number;
  quantityAfter: number;
  availableBefore: number;
  availableAfter: number;
  availabilityLabel: string;
  priceBeforeMinor: number;
  priceAfterMinor: number;
  currencyBefore: string;
  currencyAfter: string;
  lineTotalBefore: number;
  lineTotalAfter: number;
}

export interface CartReview {
  proposedCart: CartItem[];
  changes: CartReviewChange[];
  totalBefore: number;
  totalAfter: number;
  currencyBefore: string;
  currencyAfter: string;
}

/** Compare the cart with fresh server-owned price, currency, Core ATS and POS sellable values. */
export function reviewCartAvailability(
  items: readonly CartItem[],
  inventoryBySku: ReadonlyMap<string, InventoryRow>,
): CartReview | null {
  const totalBefore = cartTotalMinor(items);
  if (totalBefore === null) return null;
  const proposedCart: CartItem[] = [];
  const changes: CartReviewChange[] = [];
  for (const item of items) {
    const snapshot = inventoryBySku.get(item.sku);
    if (!snapshot) return null;
    if ((snapshot.pos_mode !== 'shared' && snapshot.pos_mode !== 'dedicated')
      || (snapshot.pos_transition_state !== 'stable' && snapshot.pos_transition_state !== 'pending')
      || !Number.isSafeInteger(snapshot.pos_sellable) || (snapshot.pos_sellable ?? -1) < 0) return null;
    const available = snapshot.pos_sellable!;
    const price = snapshot.price_minor;
    if (!Number.isSafeInteger(available) || available < 0
      || !Number.isSafeInteger(price) || price === undefined || price === null || price < 0
      || typeof snapshot.currency !== 'string' || snapshot.currency.length !== 3) return null;
    const quantityAfter = Math.min(item.qty, available);
    if (available !== item.maxQty || price !== item.unitPrice || snapshot.currency !== item.currency) {
      changes.push({
        sku: item.sku,
        quantityBefore: item.qty,
        quantityAfter,
        availableBefore: item.maxQty,
        availableAfter: available,
        availabilityLabel: snapshot.pos_mode === 'dedicated' ? 'POS remaining' : 'Core ATS dùng chung',
        priceBeforeMinor: item.unitPrice,
        priceAfterMinor: price,
        currencyBefore: item.currency,
        currencyAfter: snapshot.currency,
        lineTotalBefore: item.unitPrice * item.qty,
        lineTotalAfter: price * quantityAfter,
      });
    }
    if (quantityAfter > 0) proposedCart.push({
      ...item,
      unitPrice: price,
      currency: snapshot.currency,
      qty: quantityAfter,
      maxQty: available,
    });
  }
  // A manual checkout supports one currency per order. Never produce a proposed basket
  // whose refreshed prices cross currencies, even if the old basket was valid.
  const proposedCurrencies = new Set(proposedCart.map((item) => item.currency));
  if (proposedCurrencies.size > 1) return null;
  const totalAfter = cartTotalMinor(proposedCart);
  if (totalAfter === null) return null;
  return {
    proposedCart,
    changes,
    totalBefore,
    totalAfter,
    currencyBefore: items[0]?.currency ?? '',
    currencyAfter: proposedCart[0]?.currency ?? items[0]?.currency ?? '',
  };
}
