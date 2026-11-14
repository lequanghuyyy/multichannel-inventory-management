import type { ProductCatalogItem, ProductChannel, ProductChannelId } from '../features/products/product.types';

const channelDefinitions: Record<ProductChannelId, Omit<ProductChannel, 'state'>> = {
  shopee: { id: 'shopee', label: 'Shopee', shortLabel: 'SP', colorClass: 'bg-on-tertiary-container' },
  tiktok: { id: 'tiktok', label: 'TikTok Shop', shortLabel: 'TT', colorClass: 'bg-primary-container' },
  lazada: { id: 'lazada', label: 'Lazada', shortLabel: 'LZ', colorClass: 'bg-apricot' },
  web: { id: 'web', label: 'Website bán hàng', shortLabel: 'WS', colorClass: 'bg-badge-neutral-text' },
  pos: { id: 'pos', label: 'Bán tại quầy', shortLabel: 'POS', colorClass: 'bg-secondary' },
};

function channels(ids: readonly ProductChannelId[], state: ProductChannel['state'] = 'active'): ProductChannel[] {
  return ids.map((id) => ({ ...channelDefinitions[id], state }));
}

export const products: ProductCatalogItem[] = [
  {
    id: 'product-runner-001', name: 'Pro Lightweight Runner 001', masterSku: 'MSKU-RUN-4819', brand: 'Apex Kinetic', category: 'Giày thể thao', icon: 'steps', status: 'active',
    variants: [
      { id: 'runner-black-41', sku: 'SHOE-001-BLK-41', color: 'Đen', colorDescription: 'Đen nhám', size: '41', barcode: '893521400141', price: 2350000, inventory: { onHand: 75, reserved: 8, safetyBuffer: 3, available: 64, state: 'healthy' } },
      { id: 'runner-black-42', sku: 'SHOE-001-BLK-42', color: 'Đen', colorDescription: 'Đen nhám', size: '42', barcode: '893521400142', price: 2350000, inventory: { onHand: 15, reserved: 10, safetyBuffer: 2, available: 3, state: 'critical' } },
      { id: 'runner-white-41', sku: 'SHOE-001-WHT-41', color: 'Trắng', colorDescription: 'Trắng phấn', size: '41', barcode: '893521400241', price: 2350000, inventory: { onHand: 90, reserved: 5, safetyBuffer: 3, available: 82, state: 'healthy' } },
      { id: 'runner-white-42', sku: 'SHOE-001-WHT-42', color: 'Trắng', colorDescription: 'Trắng phấn', size: '42', barcode: '893521400242', price: 2350000, inventory: { onHand: 100, reserved: 2, safetyBuffer: 2, available: 96, state: 'healthy' } },
    ],
    inventory: { total: 280, available: 245, reserved: 25, safetyBuffer: 10, sellableRate: 87.5, note: '25 đang giữ · 10 tồn đệm an toàn', state: 'healthy' }, channels: channels(['shopee', 'tiktok', 'lazada', 'web']), updatedAt: '2026-10-01T10:24:00+07:00', secondaryAction: 'variants',
    description: 'Đế foam hai lớp siêu nhẹ kết hợp thân giày dệt kim chống ẩm.', canonicalId: 'PRD-9042', createdAt: '2024-09-12T00:00:00Z', basePrice: 2350000, currency: 'VND', focusSku: 'SHOE-001-BLK-42',
    channelMappings: [
      { channel: channels(['shopee'])[0]!, context: 'Gian hàng Apex Official', connection: 'Đang kết nối', remoteIdLabel: 'Mã sản phẩm', remoteId: '28491024', channelSku: 'SHOPEE-LR-B42', published: 3 },
      { channel: channels(['tiktok'])[0]!, context: 'Gian hàng livestream', connection: 'Đang kết nối', remoteIdLabel: 'Mã sản phẩm', remoteId: 'TT-98124', channelSku: 'TT-RUN-BLK42', published: 3 },
      { channel: channels(['lazada'])[0]!, context: 'Gian hàng Lazada', connection: 'Đang kết nối', remoteIdLabel: 'Mã sản phẩm', remoteId: 'LZ-4491', channelSku: 'LAZ-RUN-B42', published: 3 },
      { channel: channels(['web'])[0]!, context: 'Bán trực tiếp cho khách', connection: 'Đang kết nối', remoteIdLabel: 'Mã biến thể', remoteId: '48102941', channelSku: 'SHOE-001-BLK-42', published: 3 },
    ],
  },
  {
    id: 'product-tee-1092', name: 'Oversized Boxy Heavy Tee', masterSku: 'MSKU-TEE-1092', brand: 'Apex Atelier', category: 'Áo', icon: 'apparel', status: 'active',
    variants: [
      { id: 'tee-cream-m', sku: 'TEE-OVS-CREAM-M', color: 'Kem', size: 'M' }, { id: 'tee-cream-l', sku: 'TEE-OVS-CREAM-L', color: 'Kem', size: 'L' },
      { id: 'tee-white-m', sku: 'TEE-OVS-WHT-M', color: 'Trắng', size: 'M' }, { id: 'tee-white-l', sku: 'TEE-OVS-WHT-L', color: 'Trắng', size: 'L' },
      { id: 'tee-black-m', sku: 'TEE-OVS-BLK-M', color: 'Đen', size: 'M' }, { id: 'tee-black-l', sku: 'TEE-OVS-BLK-L', color: 'Đen', size: 'L' },
    ],
    inventory: { total: 520, available: 490, reserved: 20, safetyBuffer: 10, sellableRate: 94.2, note: '20 đang giữ · 10 tồn đệm', state: 'healthy' }, channels: channels(['shopee', 'tiktok', 'lazada', 'web', 'pos']), updatedAt: '2026-10-01T08:15:00+07:00', secondaryAction: 'variants',
  },
  {
    id: 'product-wallet-9930', name: 'Minimalist Leather Zip Wallet', masterSku: 'MSKU-WLT-9930', brand: 'Apex Goods', category: 'Đồ da', icon: 'wallet', status: 'active',
    variants: [{ id: 'wallet-black', sku: 'WLT-ZIP-BLK', color: 'Đen', size: 'Một cỡ' }, { id: 'wallet-tan', sku: 'WLT-ZIP-TAN', color: 'Nâu', size: 'Một cỡ' }],
    inventory: { total: 18, available: 4, reserved: 4, safetyBuffer: 10, sellableRate: 22.2, note: '4 đang giữ · 10 tồn đệm an toàn', state: 'critical' }, channels: channels(['web', 'pos']), updatedAt: '2026-09-30T16:45:00+07:00', secondaryAction: 'variants',
  },
  {
    id: 'product-bottle-750', name: 'Thermal Insulated Bottle 750ml', masterSku: 'MSKU-BOT-750', brand: 'Apex Hydro', category: 'Phụ kiện', icon: 'water_bottle', status: 'active',
    variants: [{ id: 'bottle-black', sku: 'BOT-750-BLK', color: 'Đen', size: '750ml' }, { id: 'bottle-steel', sku: 'BOT-750-STL', color: 'Bạc', size: '750ml' }, { id: 'bottle-olive', sku: 'BOT-750-OLV', color: 'Xanh rêu', size: '750ml' }],
    inventory: { total: 0, available: 0, reserved: 0, safetyBuffer: 0, sellableRate: 0, note: 'Đã tự động gỡ khỏi các sàn', state: 'out_of_stock' }, channels: channels(['shopee', 'tiktok', 'lazada'], 'delisted'), updatedAt: '2026-09-29T11:10:00+07:00', secondaryAction: 'restock',
  },
  {
    id: 'product-socks-302', name: 'Performance Grip Socks (3-Pack)', masterSku: 'MSKU-SCK-302', brand: 'Apex Kinetic', category: 'Phụ kiện', icon: 'apparel', status: 'active',
    variants: [{ id: 'socks-black', sku: 'SCK-GRIP-BLK', color: 'Đen', size: 'M-L' }, { id: 'socks-white', sku: 'SCK-GRIP-WHT', color: 'Trắng', size: 'M-L' }],
    inventory: { total: 1420, available: 1380, reserved: 40, safetyBuffer: 0, sellableRate: 97.2, note: '40 sản phẩm chờ checkout', state: 'healthy' }, channels: channels(['shopee', 'tiktok', 'lazada', 'web']), updatedAt: '2026-09-28T14:02:00+07:00', secondaryAction: 'variants',
  },
  {
    id: 'product-overshirt-8841', name: 'Corduroy Overshirt Autumn Edition', masterSku: 'MSKU-SHT-8841', brand: 'Apex Atelier', category: 'Áo khoác', icon: 'checkroom', status: 'active',
    variants: [
      { id: 'overshirt-olive-s', sku: 'SHT-CORD-OLV-S', color: 'Xanh rêu', size: 'S' }, { id: 'overshirt-olive-m', sku: 'SHT-CORD-OLV-M', color: 'Xanh rêu', size: 'M' },
      { id: 'overshirt-olive-l', sku: 'SHT-CORD-OLV-L', color: 'Xanh rêu', size: 'L' }, { id: 'overshirt-tan-m', sku: 'SHT-CORD-TAN-M', color: 'Nâu', size: 'M' },
      { id: 'overshirt-tan-l', sku: 'SHT-CORD-TAN-L', color: 'Nâu', size: 'L' },
    ],
    inventory: { total: 88, available: 72, reserved: 16, safetyBuffer: 0, sellableRate: 81.8, note: '16 sản phẩm dành cho chương trình Shopee Flash', state: 'healthy' }, channels: channels(['shopee', 'lazada', 'web']), updatedAt: '2026-09-27T09:18:00+07:00', secondaryAction: 'variants',
  },
  {
    id: 'product-hoodie-4401', name: 'Heavyweight French Terry Hoodie', masterSku: 'MSKU-HD-4401', brand: 'Apex Atelier', category: 'Áo', icon: 'apparel', status: 'draft',
    variants: [
      { id: 'hoodie-black-m', sku: 'HD-FTR-BLK-M', color: 'Đen', size: 'M' }, { id: 'hoodie-black-l', sku: 'HD-FTR-BLK-L', color: 'Đen', size: 'L' },
      { id: 'hoodie-grey-m', sku: 'HD-FTR-GRY-M', color: 'Xám', size: 'M' }, { id: 'hoodie-grey-l', sku: 'HD-FTR-GRY-L', color: 'Xám', size: 'L' },
    ],
    inventory: { total: 310, available: 290, reserved: 20, safetyBuffer: 0, sellableRate: 93.5, note: '20 sản phẩm đang chờ chuyển kho', state: 'healthy' }, channels: channels(['shopee', 'tiktok', 'web'], 'paused'), updatedAt: '2026-09-26T17:40:00+07:00', secondaryAction: 'publish',
  },
];
