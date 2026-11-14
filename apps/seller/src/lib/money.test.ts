import { describe, expect, it } from 'vitest';
import { formatMinor, formatPriceRange, noPriceLabel } from './money';

const digits = (value: string) => value.replace(/\D/g, '');

// The single most valuable test in this file is that VND is not divided by 100. The seed's
// prices are the fixture's real values, so a scaling bug shows up as a specific wrong number
// rather than as a vague formatting difference.
describe('formatMinor', () => {
  it('renders VND minor units as whole đồng', () => {
    // 1850000 minor units is 1.850.000 ₫. A /100 here would print 18.500 ₫ and every price in
    // the catalogue would be 100x too small — the seed comment in catalog.sql calls this out
    // as the failure "a total ends up 100x out".
    expect(formatMinor(1850000, 'VND')).toContain('1.850.000');
    expect(digits(formatMinor(1850000, 'VND'))).toBe('1850000');
  });

  it('never scales a VND amount, whatever its size', () => {
    // 990000 is the seed price for SHOE-001-*, so a regression shows up on the catalogue's
    // most visible row rather than only on an edge case.
    expect(digits(formatMinor(990000, 'VND'))).toBe('990000');
    expect(digits(formatMinor(0, 'VND'))).toBe('0');
    expect(digits(formatMinor(1, 'VND'))).toBe('1');
    // Intl rounds to 0 fraction digits; the digits are still the whole amount at this size.
    expect(digits(formatMinor(123456789, 'VND'))).toBe('123456789');
  });

  it('scales currencies that do have a minor unit', () => {
    // USD 129.00 in minor units is 12900. This is the only place scaling belongs.
    const rendered = formatMinor(12900, 'USD');
    expect(rendered).toContain('129');
    expect(rendered).not.toContain('12.900');
    expect(rendered).toContain('US$');
    expect(digits(rendered)).toBe('12900');
  });

  it('does not scale zero-decimal currencies outside VND', () => {
    // A hardcoded "VND only" rule would pass the tests above and then be wrong for JPY and
    // KRW. Delegating to Intl means new currencies are right without touching this file.
    expect(digits(formatMinor(1850000, 'JPY'))).toBe('1850000');
    expect(digits(formatMinor(1850000, 'KRW'))).toBe('1850000');
  });

  it('distinguishes a missing price from a free one', () => {
    // The contract says price_minor = null means the variant cannot be sold. Rendering that
    // as 0 would advertise an unsellable SKU as a giveaway.
    expect(formatMinor(null, 'VND')).toBe(noPriceLabel);
    expect(formatMinor(undefined, 'VND')).toBe(noPriceLabel);
    expect(formatMinor(0, 'VND')).not.toBe(noPriceLabel);
  });

  it('survives an amount that is not a finite number', () => {
    // Defensive: JSON cannot carry NaN or Infinity, but a caller computing an amount in the
    // browser can, and a crashed render is worse than a missing price.
    expect(formatMinor(Number.NaN, 'VND')).toBe(noPriceLabel);
    expect(formatMinor(Number.POSITIVE_INFINITY, 'VND')).toBe(noPriceLabel);
  });

  it('shows an unknown currency code instead of throwing', () => {
    // currency is a database column. Intl throws RangeError on an unrecognised code, and a
    // bad row must not take the whole catalogue down.
    expect(() => formatMinor(1850000, 'NOT-A-CURRENCY')).not.toThrow();
    const rendered = formatMinor(1850000, 'NOT-A-CURRENCY');
    expect(digits(rendered)).toBe('1850000');
    expect(rendered).toContain('NOT-A-CURRENCY');
  });

  it('renders an empty currency as a plain number rather than throwing', () => {
    expect(() => formatMinor(1850000, '')).not.toThrow();
    expect(digits(formatMinor(1850000, ''))).toBe('1850000');
  });
});

describe('formatPriceRange', () => {
  it('shows one price when every variant shares it', () => {
    // The whole SHOE-001 product is priced 990000 across four variants. "990.000 – 990.000 ₫"
    // would be noise pretending to be information.
    expect(formatPriceRange([990000, 990000, 990000, 990000], 'VND')).toBe(formatMinor(990000, 'VND'));
  });

  it('shows a range only when the prices genuinely differ', () => {
    const rendered = formatPriceRange([420000, 790000, 1250000], 'VND');
    expect(rendered).toContain('420.000');
    expect(rendered).toContain('1.250.000');
    expect(rendered).toContain('–');
  });

  it('orders a reversed list rather than trusting the caller', () => {
    // Variant order in a response is not a price order, and a range that reads
    // "1.250.000 – 420.000" is worse than no range at all.
    expect(formatPriceRange([1250000, 420000], 'VND')).toBe(formatPriceRange([420000, 1250000], 'VND'));
  });

  it('skips missing prices instead of treating them as zero', () => {
    // A null price is "cannot be sold", not "free". Including it as the low end would print a
    // range starting at 0 ₫ for a product that merely has one unpriced variant.
    expect(formatPriceRange([null, 990000], 'VND')).toBe(formatMinor(990000, 'VND'));
  });

  it('says so when every price is missing', () => {
    expect(formatPriceRange([null, null], 'VND')).toBe(noPriceLabel);
    expect(formatPriceRange([], 'VND')).toBe(noPriceLabel);
  });
});
