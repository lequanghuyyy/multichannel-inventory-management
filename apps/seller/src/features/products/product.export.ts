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

export async function walkProductExport(query: Omit<ProductQuery, 'cursor' | 'limit'> = {}, signal?: AbortSignal, load: typeof listProducts = listProducts): Promise<ProductSummary[]> {
  const rows: ProductSummary[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  do {
    const page = await load({ limit: 100, ...(cursor ? { cursor } : {}), ...query }, signal);
    for (const row of page.items) if (!seen.has(row.id)) { seen.add(row.id); rows.push(row); }
    cursor = page.nextCursor ?? undefined;
  } while (cursor);
  return rows;
}

export function productRowsCsv(rows: readonly ProductApiRow[]): string {
  return productExportCsv(rows.map((row) => ({
    name: row.name, master_sku: row.masterSku, category: row.category, brand: row.brand, status: row.status,
    variant_count: row.variantCount, on_hand: row.onHand, reserved: row.reserved, safety_buffer: row.safetyBuffer, available_to_sell: row.availableToSell,
  })));
}

export function downloadProductCsv(rows: readonly (ProductApiRow | ProductExportRecord)[], filename = 'products.csv'): void {
  const records: ProductExportRecord[] = rows.map((row) => {
    if (!('variantCount' in row)) return row;
    return { name: row.name, master_sku: row.masterSku, category: row.category, brand: row.brand, status: row.status,
      variant_count: row.variantCount, on_hand: row.onHand, reserved: row.reserved, safety_buffer: row.safetyBuffer, available_to_sell: row.availableToSell };
  });
  const blob = new Blob([productExportCsv(records)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a'); anchor.href = url; anchor.download = `products-${filename}.csv`; anchor.click();
  URL.revokeObjectURL(url);
}
