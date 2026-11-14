// Money arrives from the API as integer MINOR units (`price_minor`, `total_minor`), never as
// a decimal or a float: the OpenAPI contract says so, and the Go side stores bigint. This
// module's only job is turning those integers into text without ever doing arithmetic on them.
//
// A minor-unit integer must be converted by the currency's own fraction scale before Intl sees
// it: VND/JPY/KRW use 0 digits, USD uses 2 and KWD uses 3. Hardcoding `/100` would make VND 100x
// too small; passing USD cents straight to Intl would make USD 100x too large. Intl's resolved
// fraction digits are the single source of that scale.
//
// Nothing here computes a total. Totals are summed in SQL (`line_total_minor` is a generated
// column), and available-to-sell is computed by the backend too. A price formatter that could
// multiply quantities would be one more place for the two to disagree.

/** Shown when the backend reports no price. Distinct from 0 — see formatMinor. */
export const noPriceLabel = 'Chưa có giá';

const groupers = new Map<string, Intl.NumberFormat>();
const currencyFormatters = new Map<string, Intl.NumberFormat>();

function grouper(currency: string): Intl.NumberFormat {
  const cached = groupers.get(currency);
  if (cached) return cached;
  const created = new Intl.NumberFormat('vi-VN');
  groupers.set(currency, created);
  return created;
}

/**
 * True when Intl can format this currency code. `Intl` throws RangeError on an unknown code,
 * and currency comes from a database column — a render must not die because someone typed
 * "VND " or because a row predates a currency rename.
 */
function currencyFormatter(currency: string): Intl.NumberFormat | null {
  const cached = currencyFormatters.get(currency);
  if (cached) return cached;
  try {
    const created = new Intl.NumberFormat('vi-VN', { style: 'currency', currency });
    currencyFormatters.set(currency, created);
    return created;
  } catch {
    return null;
  }
}

/**
 * Formats an integer amount of minor units.
 *
 * `null`/`undefined` renders as {@link noPriceLabel} rather than 0: the contract states a null
 * `price_minor` means the variant CANNOT be sold through `POST /api/v1/orders`, which is a
 * different and much louder fact than "it is free". Collapsing the two would let an unsellable
 * SKU read as a giveaway.
 */
export function formatMinor(amount: number | null | undefined, currency: string = 'VND'): string {
  if (amount === null || amount === undefined) return noPriceLabel;
  if (!Number.isFinite(amount)) return noPriceLabel;
  const formatter = currency ? currencyFormatter(currency) : null;
  if (!formatter) {
    // Unknown currency: show the number and the code rather than guessing a scale. The raw
    // minor amount is still truthful — it is what the database holds.
    return `${grouper(currency || 'VND').format(amount)}${currency ? ` ${currency}` : ''}`;
  }
  const fractionDigits = formatter.resolvedOptions().maximumFractionDigits ?? 0;
  return formatter.format(amount / (10 ** fractionDigits));
}

/**
 * Formats a set of variant prices as one label.
 *
 * A product with six variants all priced the same shows ONE price, not "420.000 – 420.000 ₫":
 * the range is over distinct values, so it only appears when there is genuinely a spread to
 * report. Prices that are null are skipped rather than treated as 0, because a missing price
 * is not a cheap one — and if every price is missing the result is {@link noPriceLabel}.
 */
export function formatPriceRange(amounts: readonly (number | null | undefined)[], currency: string): string {
  const distinct = [...new Set(amounts.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)))].sort((a, b) => a - b);
  if (distinct.length === 0) return noPriceLabel;
  if (distinct.length === 1) return formatMinor(distinct[0]!, currency);
  return `${formatMinor(distinct[0]!, currency)} – ${formatMinor(distinct[distinct.length - 1]!, currency)}`;
}
