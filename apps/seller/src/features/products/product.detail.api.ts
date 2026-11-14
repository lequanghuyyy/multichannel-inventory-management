import { formatMinor } from '../../lib/money';
import type { ProductDetail } from '../../api/products';
// The API's status, not the prototype's. The fixture union carries 'under_review', which
// this backend has never had and cannot transition to; keeping both unions alive under the
// same name is how a screen ends up offering a move the server answers 409.
import type { ProductStatus } from '../../api/products';

/**
 * A live product, as the API describes it.
 *
 * The prototype `ProductCatalogItem` carries an icon, a sellable-rate percentage, channel
 * bindings, a created/updated pair and a secondary-action hint. `ProductDetail` has none of
 * them, and inventing them is precisely what this project's two-source rule forbids — a
 * sellable rate computed from a page of variants would look measured and be a guess.
 *
 * So the live view has its own type and its own components. What is here is what the server
 * sent; what the server did not send is absent from the screen rather than filled in.
 */
export interface ProductApiVariant {
  id: string;
  sku: string;
  color: string;
  colorDescription: string;
  size: string;
  priceMinor: number | null;
  barcode: string;
  isActive: boolean;
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
  return {
    id: detail.id,
    productVersion: detail.product_version,
    name: detail.name,
    category: detail.category,
    brand: detail.brand ?? '',
    description: detail.description ?? '',
    shortDescription: detail.short_description ?? '',
    attributes: detail.attributes ?? {},
    weightGrams: detail.weight_grams ?? null,
    lengthMM: detail.length_mm ?? null,
    widthMM: detail.width_mm ?? null,
    heightMM: detail.height_mm ?? null,
    condition: detail.condition ?? '',
    // A product that predates the master_sku backfill has none. That is an absent business
    // code, not permission to substitute the name or the first variant's SKU.
    masterSku: detail.master_sku ?? '',
    currency: detail.currency,
    status: detail.status,
    // The product totals come from SQL. They are NOT re-added from the variant rows below:
    // this page does happen to have every variant, but a second copy of the same arithmetic
    // is a second thing that can disagree with the first, and the contract says the sum is
    // the server's answer.
    variantCount: detail.variant_count,
    onHand: detail.on_hand,
    reserved: detail.reserved,
    safetyBuffer: detail.safety_buffer,
    availableToSell: detail.available_to_sell,
    variants: detail.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      color: variant.color ?? '',
      colorDescription: variant.color_description ?? '',
      size: variant.size ?? '',
      priceMinor: variant.price_minor ?? null,
      barcode: variant.barcode ?? '',
      isActive: variant.is_active,
      variantIsActive: variant.variant_is_active,
      onHand: variant.on_hand,
      reserved: variant.reserved,
      safetyBuffer: variant.safety_buffer,
      availableToSell: variant.available_to_sell,
    })),
  };
}

/**
 * The live view's own totals check.
 *
 * It is called from the page rather than exported for a test to call once, because a helper
 * nothing in the render path touches is a helper that will drift. The assertion is cheap and
 * the thing it protects is the number a seller reads before deciding to restock.
 */
export function totalsAreConsistent(product: ProductApiDetail): boolean {
  if (product.onHand - product.reserved - product.safetyBuffer !== product.availableToSell) return false;
  if (product.availableToSell < 0) return false;
  return product.variants.every(
    (variant) => variant.onHand - variant.reserved - variant.safetyBuffer === variant.availableToSell && variant.availableToSell >= 0,
  );
}

export function variantLabel(variant: ProductApiVariant): string {
  const parts = [variant.color, variant.size].filter((part) => part && part !== '—');
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function priceLabel(variant: ProductApiVariant, currency: string): string {
  return variant.priceMinor === null ? 'Chưa có giá' : formatMinor(variant.priceMinor, currency);
}
