export interface InventoryDetailStock {
  onHand: number;
  reserved: number;
  safetyBuffer: number;
  availableToSell: number;
}

export interface InventoryMovement {
  id: string;
  event: string;
  reference: string;
  actor: string;
  primaryDelta: string;
  secondaryDelta: string;
  status: string;
  tone: 'success' | 'warning' | 'neutral';
  timestamp: string;
  icon: string;
}

export interface InventoryChannelListing {
  id: string;
  name: string;
  initials: string;
  listingId: string;
  published: number;
  status: string;
  latency: string;
  note: string;
  accentClass: string;
}

export interface InventoryWarehouseNode {
  id: string;
  name: string;
  bin: string;
  onHand: number;
  reserved: number;
  capacity: number;
}

export interface InventoryDetailIdentity {
  sku: string;
  productName: string;
  category: string;
  color: string;
  size: string;
  productId?: string;
  variantId?: string;
  primaryMediaId?: string;
  productStatus?: string;
  isActive?: boolean;
  updatedAt?: string;
  barcode: string;
  icon: string;
}

export interface InventoryDetailFixture extends InventoryDetailIdentity {
  stock: InventoryDetailStock;
  movements: InventoryMovement[];
  channels: InventoryChannelListing[];
  warehouses: InventoryWarehouseNode[];
  procurement?: {
    purchaseOrder: string;
    status: string;
    supplier: string;
    quantity: number;
    destination: string;
    arrival: string;
    leadTime: string;
  };
  hasVelocityFixture: boolean;
}
