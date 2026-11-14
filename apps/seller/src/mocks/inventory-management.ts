import type { InventoryChannel, InventoryLedgerRow } from '../features/inventory/inventory.types';

const channelCatalog: Record<InventoryChannel['id'], InventoryChannel> = {
  shopee: { id: 'shopee', label: 'Shopee', shortLabel: 'S', colorClass: 'bg-[#ee4d2d]' },
  tiktok: { id: 'tiktok', label: 'TikTok Shop', shortLabel: 'TT', colorClass: 'bg-carbon' },
  lazada: { id: 'lazada', label: 'Lazada', shortLabel: 'L', colorClass: 'bg-[#0f146d]' },
  web: { id: 'web', label: 'Website bán hàng', shortLabel: 'W', colorClass: 'bg-[#635e56]' },
  pos: { id: 'pos', label: 'Bán tại quầy', shortLabel: 'POS', colorClass: 'bg-[#1e40af]' },
};

function channels(ids: InventoryChannel['id'][]): InventoryChannel[] {
  return ids.map((id) => channelCatalog[id]);
}

const marketplaceChannels: InventoryChannel['id'][] = ['shopee', 'tiktok', 'lazada', 'web'];

// Management-list fields are local fixtures. availableToSell is declared, not derived in React.
export const inventoryManagementRows: InventoryLedgerRow[] = [
  { id: 'runner-black-41', productName: 'Pro Lightweight Runner 001', variantLabel: 'Đen / EU 41', icon: 'steps', sku: 'SHOE-001-BLK-41', barcode: '893521400141', onHand: 75, reserved: 8, safetyBuffer: 3, availableToSell: 64, channels: channels(marketplaceChannels), status: 'in_stock', syncState: 'synced', updatedLabel: 'Vừa xong', location: 'central', customBuffer: false, syncConflict: false, reservedNote: '8 đơn đang đóng gói' },
  { id: 'runner-black-42', productName: 'Pro Lightweight Runner 001', variantLabel: 'Đen / EU 42', icon: 'steps', sku: 'SHOE-001-BLK-42', barcode: '893521400142', onHand: 15, reserved: 10, safetyBuffer: 2, availableToSell: 3, channels: channels(marketplaceChannels), status: 'low_stock', syncState: 'synced', updatedLabel: '12 phút trước', location: 'central', customBuffer: false, syncConflict: false },
  { id: 'runner-white-41', productName: 'Pro Lightweight Runner 001', variantLabel: 'Trắng / EU 41', icon: 'steps', sku: 'SHOE-001-WHT-41', barcode: '893521400241', onHand: 90, reserved: 5, safetyBuffer: 3, availableToSell: 82, channels: channels(marketplaceChannels), status: 'in_stock', syncState: 'synced', updatedLabel: '24 phút trước', location: 'central', customBuffer: false, syncConflict: false },
  { id: 'tee-cream-l', productName: 'Oversized Boxy Tee', variantLabel: 'Kem / L', icon: 'checkroom', sku: 'TEE-OVS-CRM-L', barcode: '893521410301', onHand: 120, reserved: 15, safetyBuffer: 5, availableToSell: 100, channels: channels([...marketplaceChannels, 'pos']), status: 'in_stock', syncState: 'synced', updatedLabel: '48 phút trước', location: 'central', customBuffer: true, syncConflict: false },
  { id: 'tee-black-xl', productName: 'Oversized Boxy Tee', variantLabel: 'Đen / XL', icon: 'checkroom', sku: 'TEE-OVS-BLK-XL', barcode: '893521410402', onHand: 4, reserved: 2, safetyBuffer: 2, availableToSell: 0, channels: channels([...marketplaceChannels, 'pos']), status: 'out_of_stock', syncState: 'paused', updatedLabel: '1 giờ trước', location: 'central', customBuffer: true, syncConflict: false },
  { id: 'wallet-tan', productName: 'Vintage Leather Zip Wallet', variantLabel: 'Nâu vàng / Một cỡ', icon: 'account_balance_wallet', sku: 'WLT-ZIP-TAN-01', barcode: '893521420001', onHand: 22, reserved: 18, safetyBuffer: 2, availableToSell: 2, channels: channels(marketplaceChannels), status: 'low_stock', syncState: 'synced', updatedLabel: '2 giờ trước', location: 'central', customBuffer: false, syncConflict: false },
  { id: 'bottle-black', productName: 'Thermal Bottle 750ml', variantLabel: 'Đen mờ', icon: 'water_bottle', sku: 'BTL-750-BLK', barcode: '893521430750', onHand: 0, reserved: 0, safetyBuffer: 0, availableToSell: 0, channels: channels(['shopee', 'tiktok', 'web']), status: 'out_of_stock', syncState: 'unavailable', updatedLabel: '3 giờ trước', location: 'central', customBuffer: false, syncConflict: false },
];
