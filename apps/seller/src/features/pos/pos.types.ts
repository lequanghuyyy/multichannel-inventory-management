export type PosSimMode = 'normal' | 'conflict' | 'network' | 'success';
export type PosStockStatus = 'instock' | 'low' | 'out' | 'pos-empty' | 'transitioning' | 'unavailable';
export type PosInventoryMode = 'shared' | 'dedicated' | 'unknown';
export type PosCategory = 'shoes' | 'bags' | 'apparel' | 'accessories';

export interface PosProductFixture {
  id: string;
  /** Present on live API rows so the catalog can load the authenticated primary image. */
  productId?: string;
  primaryMediaId?: string;
  name: string;
  variant: string;
  sku: string;
  category: PosCategory;
  color: string;
  size: string;
  priceDisplay: string;
  /** Integer minor units, straight from `price_minor`; null means this row cannot be sold. */
  priceValue: number | null;
  onHand: number;
  reserved: number;
  buffer: number;
  coreAts?: number;
  posMode?: PosInventoryMode;
  posRemaining?: number;
  posTransitionState?: 'stable' | 'pending';
  ats: number;
  status: PosStockStatus;
  imageAlt: string;
  /** Absent on fixture rows, which predate the backend and carry no currency at all. */
  currency?: string;
}

export interface PosFixture {
  products: PosProductFixture[];
  sessionMetrics: {
    totalSalesDisplay: string;
    unitsMoved: string;
    inventoryHealth: string;
  };
}

export interface CartItem {
  sku: string;
  name: string;
  variant: string;
  unitPrice: number;
  /** ISO 4217 code for unitPrice. A cart may contain exactly one currency. */
  currency: string;
  qty: number;
  maxQty: number;
}

/** What one completed sale looked like, for the receipt the till shows afterwards. */
export interface PosSale {
  orderId: string;
  reference: string;
  status: string;
  paymentStatus: string;
  currency: string;
  totalMinor: number;
  itemCount: number;
  /** True when the backend replayed a previous answer instead of selling again. */
  replayed: boolean;
}

export type SalePaymentMethod = 'cash' | 'external';

/** Immutable manual-payment confirmation details retained with a pending POS attempt. */
export interface SalePaymentInstruction {
  method: SalePaymentMethod;
  receivedMinor: number;
  changeMinor: number;
  /** Exact note sent to the existing manual payment-confirm endpoint. */
  note: string;
}
