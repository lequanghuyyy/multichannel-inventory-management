import type { InventoryRow } from '../../api/inventory';
import { formatMinor } from '../../lib/money';
import type { CartItem, PosProductFixture } from './pos.types';

/**
 * Turns `GET /api/v1/inventory` rows into POS products.
 *
 * `GET /api/v1/inventory` is the one list that carries everything a till needs at once: the
 * canonical SKU the order endpoint takes, the price, the currency, Core balance values,
 * and the available-to-sell quantity that caps the cart.
 */
export function toPosProducts(rows: readonly InventoryRow[], fixtures: readonly PosProductFixture[] = []): PosProductFixture[] {
  const fixtureBySku = new Map(fixtures.map((fixture) => [fixture.sku, fixture]));

  return rows
    .filter((row) => Number.isSafeInteger(row.available_to_sell) && (row.available_to_sell ?? -1) >= 0)
    .map((row) => {
      const fallback = fixtureBySku.get(row.sku ?? '');
      const coreAts = row.available_to_sell ?? 0;
      const posMode = row.pos_mode ?? 'shared';
      const posTransitionState = row.pos_transition_state ?? 'stable';
      const posRemaining = row.pos_remaining !== undefined ? row.pos_remaining : (posMode === 'dedicated' ? 0 : coreAts);
      const ats = posMode === 'dedicated'
        ? (row.pos_sellable !== undefined ? row.pos_sellable : posRemaining)
        : (row.pos_sellable !== undefined ? row.pos_sellable : coreAts);
      const price = Number.isSafeInteger(row.price_minor) && (row.price_minor ?? -1) >= 0 ? row.price_minor! : null;
      const color = fallback?.color ?? '—';
      const size = fallback?.size ?? '—';
      const variant = row.variant_title || fallback?.variant || (color === '—' && size === '—' ? '' : [color, size === '—' ? '' : `Cỡ ${size}`].filter(Boolean).join(' / '));
      const currency = row.currency ?? 'VND';

      let status: PosProductFixture['status'];
      if (posTransitionState === 'pending') {
        status = 'transitioning';
      } else if (posMode === 'dedicated' && ats <= 0 && coreAts > 0) {
        status = 'pos-empty';
      } else if (ats <= 0) {
        status = 'out';
      } else if (ats <= lowStockThreshold) {
        status = 'low';
      } else {
        status = 'instock';
      }

      return {
        id: row.variant_id,
        ...(row.product_id ? { productId: row.product_id } : {}),
        name: row.product_name ?? row.sku ?? '',
        variant,
        sku: row.sku ?? '',
        category: fallback?.category ?? 'shoes',
        color,
        size,
        priceDisplay: formatMinor(price, currency),
        priceValue: price,
        onHand: row.on_hand ?? 0,
        reserved: row.reserved ?? 0,
        buffer: row.safety_buffer ?? 0,
        coreAts,
        posMode,
        posRemaining,
        posTransitionState,
        ats,
        status,
        imageAlt: `Ảnh minh hoạ ${row.product_name ?? row.sku ?? ''} ${variant}`.trim(),
        currency,
      };
    });
}

/** Matches the inventory ledger's threshold so the two screens never disagree about "low". */
const lowStockThreshold = 10;

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

/** Compare the cart with fresh server-owned price, currency, Core ATS. */
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
    const available = Number.isSafeInteger(snapshot.pos_sellable) && (snapshot.pos_sellable ?? -1) >= 0
      ? snapshot.pos_sellable!
      : (snapshot.pos_mode === 'dedicated' && Number.isSafeInteger(snapshot.pos_remaining)
        ? snapshot.pos_remaining!
        : snapshot.available_to_sell);
    const price = snapshot.price_minor;
    const currency = snapshot.currency ?? 'VND';
    if (!Number.isSafeInteger(available) || available === undefined || available < 0
      || !Number.isSafeInteger(price) || price === undefined || price === null || price < 0
      || typeof currency !== 'string' || currency.length !== 3) return null;
    const quantityAfter = Math.min(item.qty, available);
    if (available !== item.maxQty || price !== item.unitPrice || currency !== item.currency) {
      changes.push({
        sku: item.sku,
        quantityBefore: item.qty,
        quantityAfter,
        availableBefore: item.maxQty,
        availableAfter: available,
        availabilityLabel: snapshot.pos_mode === 'dedicated' ? 'POS remaining' : 'Core ATS',
        priceBeforeMinor: item.unitPrice,
        priceAfterMinor: price,
        currencyBefore: item.currency,
        currencyAfter: currency,
        lineTotalBefore: item.unitPrice * item.qty,
        lineTotalAfter: price * quantityAfter,
      });
    }
    if (quantityAfter > 0) proposedCart.push({
      ...item,
      unitPrice: price,
      currency,
      qty: quantityAfter,
      maxQty: available,
    });
  }
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
