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
  title?: string;
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

export function toProductApiDetail(detail: ProductDetail | any): ProductApiDetail {
  const published = detail.status === 'active' || detail.status === 'PUBLISHED';
  const variants: any[] = Array.isArray(detail.variants) ? detail.variants : [];
  const variantCount = detail.variantCount ?? detail.variant_count ?? variants.length;
  const onHand = detail.onHand ?? detail.on_hand ?? variants.reduce((sum, v) => sum + (v.onHand ?? v.on_hand ?? 0), 0);
  const reserved = detail.reserved ?? detail.reserved ?? variants.reduce((sum, v) => sum + (v.reserved ?? 0), 0);
  const safetyBuffer = detail.safetyBuffer ?? detail.safety_buffer ?? variants.reduce((sum, v) => sum + (v.safetyBuffer ?? v.safety_buffer ?? 0), 0);
  const availableToSell = detail.availableToSell ?? detail.available_to_sell ?? variants.reduce((sum, v) => sum + (v.availableToSell ?? v.available_to_sell ?? 0), 0);

  return {
    id: String(detail.id ?? ''),
    productVersion: detail.productVersion ?? detail.product_version ?? 0,
    name: detail.name ?? '',
    category: detail.category ?? '',
    brand: detail.brand ?? '',
    description: detail.description ?? '',
    shortDescription: detail.shortDescription ?? detail.short_description ?? '',
    attributes: detail.attributes ?? {},
    weightGrams: detail.weightGrams ?? detail.weight_grams ?? null,
    lengthMM: detail.lengthMM ?? detail.length_mm ?? null,
    widthMM: detail.widthMM ?? detail.width_mm ?? null,
    heightMM: detail.heightMM ?? detail.height_mm ?? null,
    condition: detail.condition ?? '',
    masterSku: detail.masterSku ?? detail.master_sku ?? '',
    currency: detail.currency ?? variants[0]?.currency ?? 'VND',
    status: detail.status === 'PUBLISHED' ? 'active' : (detail.status ?? 'draft'),
    variantCount,
    onHand,
    reserved,
    safetyBuffer,
    availableToSell,
    variants: variants.map((variant) => ({
      id: String(variant.id ?? ''),
      sku: variant.sku ?? '',
      title: variant.title ?? (variant.color && variant.size ? `${variant.color} / ${variant.size}` : ''),
      color: variant.color ?? '',
      colorDescription: variant.colorDescription ?? variant.color_description ?? '',
      size: variant.size ?? '',
      priceMinor: variant.priceMinor !== undefined ? variant.priceMinor : (variant.price_minor ?? (variant.price !== undefined ? variant.price : null)),
      barcode: variant.barcode ?? '',
      isActive: variant.isActive ?? variant.is_active ?? published,
      variantIsActive: variant.variantIsActive ?? variant.variant_is_active ?? published,
      onHand: variant.onHand ?? variant.on_hand ?? 0,
      reserved: variant.reserved ?? 0,
      safetyBuffer: variant.safetyBuffer ?? variant.safety_buffer ?? 0,
      availableToSell: variant.availableToSell ?? variant.available_to_sell ?? 0,
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
  if (variant.title?.trim()) return variant.title;
  const parts = [variant.color, variant.size].filter((part) => part && part !== '—');
  return parts.length > 0 ? parts.join(' · ') : '—';
}

export function priceLabel(variant: ProductApiVariant, currency: string): string {
  return variant.priceMinor === null ? 'Chưa có giá' : formatMinor(variant.priceMinor, currency);
}
