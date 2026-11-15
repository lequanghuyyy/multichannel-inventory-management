import { formatMinor } from '../../lib/money';
import type { ProductDetail } from '../../api/products';
// The app's status, not the prototype's. The Spring Boot catalogue cannot reach
// `under_review` or `out_of_stock`; keeping those states alive here would offer moves the
// server answers 409.
import type { ProductStatus } from '../../api/products';

/**
 * A live product, as the API describes it.
 *
 * The Spring Boot `ProductResponse` has no brand, media, measurements, condition, attributes or
 * revision. Those fields remain in this shape because the legacy channel screens and the media
 * manager read them, and they are filled with empty values — absent from the screen rather than
 * borrowed from a fixture.
 *
 * `productVersion: 0` means "the server exposes no revision". The legacy channel routes are the
 * only callers that put it in a header, and those routes are not served yet.
 */
export interface ProductApiVariant {
  id: string;
  sku: string;
  title: string;
  color: string;
  colorDescription: string;
  size: string;
  priceMinor: number | null;
  barcode: string;
  /** True when the product is published. The server tracks status at product level only. */
  isActive: boolean;
  /** Same product-level signal, kept under the variant-level name the legacy screens read. */
  variantIsActive: boolean;
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  availableToSell: number;
}

export interface ProductApiDetail {
  id: string;
  productVersion: number;
  name: string;
  category: string;
  brand: string;
  description: string;
  shortDescription: string;
  attributes: Record<string, string>;
  weightGrams: number | null;
  lengthMM: number | null;
  widthMM: number | null;
  heightMM: number | null;
  condition: string;
  masterSku: string;
  currency: string;
  status: ProductStatus;
  variantCount: number;
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  availableToSell: number;
  variants: ProductApiVariant[];
}

export function toProductApiDetail(detail: ProductDetail): ProductApiDetail {
  const published = detail.status === 'active';
  return {
    id: detail.id,
    // No revision exists on the Spring Boot product record.
    productVersion: 0,
    name: detail.name,
    category: detail.category,
    brand: '',
    description: detail.description,
    shortDescription: '',
    attributes: {},
    weightGrams: null,
    lengthMM: null,
    widthMM: null,
    heightMM: null,
    condition: '',
    masterSku: '',
    // Every variant of a product is created under the product's currency. Falling back to VND
    // keeps a product with zero variants renderable; it never prices anything on its own.
    currency: detail.variants[0]?.currency ?? 'VND',
    status: detail.status,
    // The totals are sums of server-owned per-variant values computed in the adapter. A second
    // copy of the arithmetic here would be a second thing that can disagree with the first.
    variantCount: detail.variantCount,
    onHand: detail.onHand,
    reserved: detail.reserved,
    safetyBuffer: detail.safetyBuffer,
    availableToSell: detail.availableToSell,
    variants: detail.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      title: variant.title,
      color: '',
      colorDescription: '',
      size: '',
      priceMinor: variant.priceMinor,
      barcode: '',
      isActive: published,
      variantIsActive: published,
      onHand: variant.onHand,
      reserved: variant.reserved,
      safetyBuffer: variant.safetyBuffer,
      availableToSell: variant.availableToSell,
    })),
  };
}

/**
 * The live view's own totals check.
 *
 * ATS is server-owned on every variant, so this asserts the identity the server promises
 * (`on_hand - reserved - safety_buffer`) rather than using it to compute availability.
 */
export function totalsAreConsistent(product: ProductApiDetail): boolean {
  if (product.onHand - product.reserved - product.safetyBuffer !== product.availableToSell) return false;
  if (product.availableToSell < 0) return false;
  return product.variants.every(
    (variant) => variant.onHand - variant.reserved - variant.safetyBuffer === variant.availableToSell && variant.availableToSell >= 0,
  );
}

export function variantLabel(variant: ProductApiVariant): string {
  if (variant.title.trim()) return variant.title;
  const parts = [variant.color, variant.size].filter((part) => part && part !== '—');
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function priceLabel(variant: ProductApiVariant, currency: string): string {
  return variant.priceMinor === null ? 'Chưa có giá' : formatMinor(variant.priceMinor, currency);
}
