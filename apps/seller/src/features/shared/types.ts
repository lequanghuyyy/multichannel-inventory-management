export type ProductStatus = 'active' | 'draft';

export interface Variant {
  id: string;
  sku: string;
  color: string;
  size: string;
}

export interface Product {
  id: string;
  name: string;
  status: ProductStatus;
  category: string;
  variants: Variant[];
}

export interface InventorySnapshot {
  variant_id: string;
  product_id: string;
  sku: string;
  color: string;
  size: string;
  on_hand: number;
  reserved: number;
  safety_buffer: number;
  available_to_sell: number;
  version: number;
}
