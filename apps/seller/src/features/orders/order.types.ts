export type OrderStatus = 'pending' | 'reserved' | 'confirmed' | 'completed' | 'cancelled' | 'returned';
export type OrderChannelId = 'shopee' | 'tiktok' | 'pos' | 'lazada' | 'web';
export type FulfillmentStatus = 'processing' | 'awaiting_dispatch' | 'in_transit' | 'delivered' | 'cancelled' | 'pending_clearance';

export interface OrderMoney {
  amount: number;
  currency: string;
  formatted: string;
}

export interface OrderLifecycleEvent {
  id: string;
  label: string;
  detail: string;
  timestamp: string;
  state: 'complete' | 'current' | 'upcoming';
}

export interface OrderAuditEvent {
  id: string;
  time: string;
  event: string;
  mutation: string;
  actor: string;
}

export interface OrderItem {
  sku: string;
  name: string;
  variant: string;
  quantity: number;
  total: OrderMoney;
  warehouse: string;
  inventoryStatus: string;
}

export interface Order {
  id: string;
  reference: string;
  marketplaceReference: string;
  externalId: string;
  status: OrderStatus;
  channel: {
    id: OrderChannelId;
    code: string;
    name: string;
    mode: 'active' | 'simulation' | 'planned';
    colorClass: string;
  };
  customer: {
    name: string;
    location: string;
  };
  itemCount: number;
  total: OrderMoney;
  paymentStatus: string;
  fulfillmentStatus: FulfillmentStatus;
  inventoryStatus: string;
  placedAt: string;
  updatedAt: string;
  items: OrderItem[];
  lifecycle: OrderLifecycleEvent[];
  audit: OrderAuditEvent[];
}

export interface OrderFilters {
  query: string;
  channel: 'all' | OrderChannelId;
  fulfillment: 'all' | FulfillmentStatus;
  date: 'all' | 'today' | 'previous';
}
