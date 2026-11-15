import { listProducts, type ProductQuery, type ProductSummary } from '../../api/products';
import type { ProductApiRow } from './product.api';

export type ProductExportRecord = { name: string; master_sku?: string; category: string; brand?: string; status: string; variant_count: number; on_hand: number; reserved: number; safety_buffer: number; available_to_sell: number };

export function csvCell(value: unknown): string {
  const text = String(value ?? '');
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

export function productExportCsv(rows: readonly ProductExportRecord[]): string {
  const header = ['name', 'master_sku', 'category', 'brand', 'status', 'variant_count', 'on_hand', 'reserved', 'safety_buffer', 'available_to_sell'];
  const lines = rows.map((row) => [row.name, row.master_sku, row.category, row.brand ?? '', row.status, row.variant_count, row.on_hand, row.reserved, row.safety_buffer, row.available_to_sell].map(csvCell).join(','));
  return `\uFEFF${header.join(',')}\r\n${lines.join('\r\n')}${lines.length ? '\r\n' : ''}`;
}

/**
 * `GET /api/v1/products` returns the full catalogue in one response, so there is no cursor to
 * walk. The `load` seam stays injectable for tests that want to assert the query is passed
 * through unchanged.
 */
export async function walkProductExport(query: ProductQuery = {}, signal?: AbortSignal, load: typeof listProducts = listProducts): Promise<ProductSummary[]> {
  const page = await load(query, signal);
  return page.items;
}

export function productRowsCsv(rows: readonly ProductApiRow[]): string {
  return productExportCsv(rows.map((row) => ({
    name: row.name, master_sku: row.masterSku, category: row.category, brand: row.brand, status: row.status,
    variant_count: row.variantCount, on_hand: row.onHand, reserved: row.reserved, safety_buffer: row.safetyBuffer, available_to_sell: row.availableToSell,
  })));
}

export function downloadProductCsv(rows: readonly (ProductApiRow | ProductExportRecord | ProductSummary)[], filename = 'products.csv'): void {
  const records: ProductExportRecord[] = rows.map((row) => {
    if ('variant_count' in row) return row;
    return {
      name: row.name,
      master_sku: 'masterSku' in row ? row.masterSku : undefined,
      category: row.category,
      brand: 'brand' in row ? row.brand : undefined,
      status: row.status,
      variant_count: row.variantCount,
      on_hand: row.onHand,
      reserved: row.reserved,
      safety_buffer: row.safetyBuffer,
      available_to_sell: row.availableToSell,
    };
  });
  const blob = new Blob([productExportCsv(records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `products-${filename}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}
