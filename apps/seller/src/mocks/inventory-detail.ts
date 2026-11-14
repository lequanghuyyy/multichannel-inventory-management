import type { InventoryDetailFixture } from '../features/inventory/inventory-detail.types';
import { inventoryManagementRows } from './inventory-management';

const runnerDetail: InventoryDetailFixture = {
  sku: 'SHOE-001-BLK-42',
  productName: 'Pro Lightweight Runner 001',
  category: 'Giày thể thao',
  color: 'Đen',
  size: 'EU 42',
  barcode: '893521400142',
  icon: 'steps',
  stock: { onHand: 15, reserved: 10, safetyBuffer: 2, availableToSell: 3 },
  hasVelocityFixture: true,
  movements: [
    { id: 'movement-1', event: 'Đặt đơn và giữ hàng', reference: 'Đơn #ORD-8921', actor: 'TikTok Shop', primaryDelta: '-1 Có thể bán', secondaryDelta: '+1 Đang giữ', status: 'Thành công', tone: 'success', timestamp: '12 phút trước', icon: 'shopping_cart_checkout' },
    { id: 'movement-2', event: 'Đơn đã giao đi', reference: 'Đơn #ORD-8894', actor: 'Shopee', primaryDelta: '-1 Tồn kho', secondaryDelta: '-1 Đang giữ', status: 'Hoàn tất', tone: 'neutral', timestamp: '1 giờ trước', icon: 'local_shipping' },
    { id: 'movement-3', event: 'Điều chỉnh tồn đệm an toàn', reference: 'Tồn đệm tăng từ 1 → 2', actor: 'Quản trị viên', primaryDelta: '-1 Có thể bán', secondaryDelta: '+1 Tồn đệm', status: 'Cập nhật thủ công', tone: 'warning', timestamp: '3 giờ trước', icon: 'tune' },
    { id: 'movement-4', event: 'Hết hạn giữ hàng / Huỷ', reference: 'Đơn #ORD-8870 (chưa thanh toán)', actor: 'Lazada', primaryDelta: '+1 Có thể bán', secondaryDelta: '-1 Đang giữ', status: 'Tự giải phóng', tone: 'neutral', timestamp: '5 giờ trước', icon: 'restore' },
    { id: 'movement-5', event: 'Kiểm kê / Điều chỉnh thủ công', reference: 'Quét mã vạch đối chiếu', actor: 'Kho chính (A)', primaryDelta: '+5 Tồn kho', secondaryDelta: '+5 Có thể bán', status: 'Đã ghi', tone: 'neutral', timestamp: 'Hôm qua 16:30', icon: 'qr_code_scanner' },
    { id: 'movement-6', event: 'Đồng bộ lên các kênh', reference: 'Đã gửi 3 sản phẩm có thể bán', actor: 'Hệ thống', primaryDelta: '4 kênh', secondaryDelta: '0 sai lệch', status: 'Dữ liệu mẫu', tone: 'warning', timestamp: 'Hôm qua 14:00', icon: 'broadcast_on_personal' },
  ],
  channels: [
    { id: 'shopee', name: 'Shopee Mall', initials: 'SP', listingId: '#SP-99214', published: 3, status: 'Đang bán', latency: '45 ms', note: 'Dữ liệu mẫu', accentClass: 'bg-[#ee4d2d]' },
    { id: 'tiktok', name: 'TikTok Shop', initials: 'TT', listingId: '#TT-44102', published: 3, status: 'Bán chạy', latency: '62 ms', note: 'Dữ liệu mẫu', accentClass: 'bg-carbon' },
    { id: 'lazada', name: 'Lazada LazMall', initials: 'LZ', listingId: '#LZ-88231', published: 3, status: 'Đang bán', latency: '110 ms', note: 'Dữ liệu mẫu', accentClass: 'bg-[#0f146d]' },
    { id: 'web', name: 'Website bán hàng', initials: 'SH', listingId: '#WS-10029', published: 3, status: 'Đang bán', latency: '38 ms', note: 'Dữ liệu mẫu', accentClass: 'bg-[#065f46]' },
  ],
  warehouses: [
    { id: 'tuas', name: 'Kho chính', bin: 'Kệ B-14-02', onHand: 12, reserved: 8, capacity: 80 },
    { id: 'changi', name: 'Kho khu vực', bin: 'Kệ A-08-01', onHand: 3, reserved: 2, capacity: 20 },
  ],
  procurement: { purchaseOrder: 'Đơn nhập #PO-2024-884', status: 'Đang sản xuất', supplier: 'Công ty Apex Footwear Lab (Việt Nam)', quantity: 150, destination: 'Kho chính', arrival: '24/11', leadTime: '14 ngày' },
};

export function inventoryDetailFixtureBySku(sku: string): InventoryDetailFixture | undefined {
  if (sku === runnerDetail.sku) return runnerDetail;
  const row = inventoryManagementRows.find((item) => item.sku === sku);
  if (!row) return undefined;
  return {
    sku: row.sku,
    productName: row.productName,
    category: 'Danh mục mẫu',
    color: row.variantLabel.split(' / ')[0] ?? row.variantLabel,
    size: row.variantLabel.split(' / ')[1] ?? 'Một cỡ',
    barcode: row.barcode,
    icon: row.icon,
    stock: { onHand: row.onHand, reserved: row.reserved, safetyBuffer: row.safetyBuffer, availableToSell: row.availableToSell },
    hasVelocityFixture: false,
    movements: [],
    channels: [],
    warehouses: [],
  };
}
