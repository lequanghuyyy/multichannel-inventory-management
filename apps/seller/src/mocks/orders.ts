import type { Order, OrderChannelId, OrderLifecycleEvent, OrderStatus } from '../features/orders/order.types';

const channels: Record<OrderChannelId, Order['channel']> = {
  shopee: { id: 'shopee', code: 'SH', name: 'Shopee Mall', mode: 'active', colorClass: 'bg-[#ee4d2d]' },
  tiktok: { id: 'tiktok', code: 'TK', name: 'TikTok Shop (giả lập)', mode: 'simulation', colorClass: 'bg-carbon' },
  pos: { id: 'pos', code: 'POS', name: 'Quầy bán hàng chính', mode: 'active', colorClass: 'bg-[#1e40af]' },
  lazada: { id: 'lazada', code: 'LZ', name: 'Lazada (dự kiến)', mode: 'planned', colorClass: 'bg-[#0f146d]' },
  web: { id: 'web', code: 'CW', name: 'Website bán hàng', mode: 'active', colorClass: 'bg-[#635e56]' },
};

function lifecycle(current: 'reserved' | 'confirmed' | 'completed' | 'cancelled' | 'pending'): OrderLifecycleEvent[] {
  const steps: OrderLifecycleEvent[] = [
    { id: 'received', label: 'Đã nhận đơn', detail: 'Đơn được nhận từ kênh bán.', timestamp: '14:18:00', state: 'complete' },
    { id: 'reserved', label: 'Đã giữ hàng', detail: 'Hàng được giữ theo đúng SKU của đơn.', timestamp: '14:18:02', state: current === 'pending' ? 'upcoming' : 'complete' },
    { id: 'confirmed', label: 'Đã xác nhận đơn', detail: 'Địa chỉ và thanh toán đã được kiểm tra.', timestamp: '14:20:15', state: current === 'confirmed' ? 'current' : current === 'completed' ? 'complete' : 'upcoming' },
    { id: 'completed', label: current === 'cancelled' ? 'Đơn đã hủy' : 'Đơn hoàn tất', detail: current === 'cancelled' ? 'Hàng giữ đã được trả về kho.' : 'Đơn vị vận chuyển giao hàng và xác nhận đã nhận.', timestamp: current === 'completed' || current === 'cancelled' ? 'Đã xong' : 'Sắp tới', state: current === 'completed' || current === 'cancelled' ? 'current' : 'upcoming' },
  ];
  if (current === 'reserved') steps[1] = { ...steps[1]!, state: 'current' };
  if (current === 'pending') steps[0] = { ...steps[0]!, state: 'current' };
  return steps;
}

const audit = [
  { id: 'audit-1', time: '14:18:02', event: 'Đã giữ hàng', mutation: 'Chờ xử lý → Đang giữ hàng', actor: 'Hệ thống' },
  { id: 'audit-2', time: '14:20:15', event: 'Đã xác nhận đơn', mutation: 'Đang giữ hàng → Đã xác nhận', actor: 'Quản trị viên' },
  { id: 'audit-3', time: '14:22:40', event: 'Đã xem phiếu soạn hàng', mutation: 'Đã xác nhận → Đang soạn hàng', actor: 'Nguyễn Thị Lan' },
];

export const orderStatusCounts: Record<'all' | OrderStatus, number> = { all: 1420, pending: 18, reserved: 42, confirmed: 65, completed: 962, cancelled: 28, returned: 14 };

const money = (amount: number) => ({ amount, currency: 'VND', formatted: `${new Intl.NumberFormat('vi-VN').format(amount)} ₫` });

export const orders: Order[] = [
  { id: '20000000-0000-4000-8000-000000000001', reference: 'ORD-DEMO-001', marketplaceReference: '#SHP-2410981', externalId: '241024-SP-8994102', status: 'reserved', channel: channels.shopee, customer: { name: 'Nguyễn Thị Lan', location: 'Quận 1, TP. Hồ Chí Minh' }, itemCount: 1, total: money(2350000), paymentStatus: 'Đã thanh toán · Cổng thanh toán', fulfillmentStatus: 'processing', inventoryStatus: 'Đang giữ hàng · Kho trung tâm', placedAt: '2026-10-02T14:18:00+07:00', updatedAt: '2026-10-02T14:22:40+07:00', items: [{ sku: 'SHOE-001-BLK-42', name: 'Pro Lightweight Runner 001', variant: 'Đen / EU 42', quantity: 1, total: money(2350000), warehouse: 'Kho trung tâm', inventoryStatus: 'Đang giữ hàng' }], lifecycle: lifecycle('reserved'), audit },
  { id: '20000000-0000-4000-8000-000000000002', reference: 'ORD-DEMO-002', marketplaceReference: '#TTS-9812401', externalId: 'TT-9812401', status: 'confirmed', channel: channels.tiktok, customer: { name: 'Trần Minh Khôi', location: 'Quận Hải Châu, Đà Nẵng' }, itemCount: 2, total: money(1960000), paymentStatus: 'Đã thanh toán · Cổng thanh toán', fulfillmentStatus: 'awaiting_dispatch', inventoryStatus: 'Đang giữ hàng · Kho phía Đông', placedAt: '2026-10-02T13:44:00+07:00', updatedAt: '2026-10-02T14:05:00+07:00', items: [{ sku: 'BOTL-AERO-750', name: 'Aeroflow Hydration Flask', variant: 'Carbon / 750ml', quantity: 2, total: money(1960000), warehouse: 'Kho phía Đông', inventoryStatus: 'Đang giữ hàng' }], lifecycle: lifecycle('confirmed'), audit: [] },
  { id: '20000000-0000-4000-8000-000000000003', reference: 'ORD-DEMO-003', marketplaceReference: '#SFY-11094', externalId: 'WEB-11094', status: 'cancelled', channel: channels.web, customer: { name: 'Lê Quốc Bảo', location: 'Quận Ninh Kiều, Cần Thơ' }, itemCount: 1, total: money(8625000), paymentStatus: 'Đã hoàn tiền', fulfillmentStatus: 'cancelled', inventoryStatus: 'Đã trả hàng về kho', placedAt: '2026-10-01T18:30:00+07:00', updatedAt: '2026-10-02T09:10:00+07:00', items: [{ sku: 'JKT-APX-CHR-M', name: 'Apex Storm Shell Jacket', variant: 'Xám than / M', quantity: 1, total: money(8625000), warehouse: 'Kho trung tâm', inventoryStatus: 'Đã trả hàng về kho' }], lifecycle: lifecycle('cancelled'), audit: [] },
  { id: '20000000-0000-4000-8000-000000000004', reference: 'ORD-DEMO-004', marketplaceReference: '#POS-09418', externalId: 'POS-09418', status: 'completed', channel: channels.pos, customer: { name: 'Khách mua tại quầy', location: 'Quầy bán hàng số 2' }, itemCount: 1, total: money(1620000), paymentStatus: 'Đã thanh toán · Tại quầy', fulfillmentStatus: 'delivered', inventoryStatus: 'Đã trừ kho ngay · Kệ trưng bày', placedAt: '2026-10-02T12:14:00+07:00', updatedAt: '2026-10-02T12:15:00+07:00', items: [{ sku: 'BAG-SLG-4L-OLV', name: 'Tactical Daily Sling 4L', variant: 'Xanh rêu', quantity: 1, total: money(1620000), warehouse: 'Quầy bán hàng chính', inventoryStatus: 'Đã trừ kho ngay' }], lifecycle: lifecycle('completed'), audit: [] },
  { id: '20000000-0000-4000-8000-000000000005', reference: 'ORD-DEMO-005', marketplaceReference: '#LZD-5509211', externalId: 'LZ-5509211', status: 'confirmed', channel: channels.lazada, customer: { name: 'Phạm Ngọc Anh', location: 'Quận Cầu Giấy, Hà Nội' }, itemCount: 2, total: money(870000), paymentStatus: 'Đã thanh toán · Cổng thanh toán', fulfillmentStatus: 'processing', inventoryStatus: 'Đang giữ hàng · Kho trung tâm', placedAt: '2026-10-02T11:58:00+07:00', updatedAt: '2026-10-02T12:20:00+07:00', items: [{ sku: 'ACC-MRN-GRY-L', name: 'Merino Cushion Socks 3-Pack', variant: 'Xám nhạt / L', quantity: 2, total: money(870000), warehouse: 'Kho trung tâm', inventoryStatus: 'Đang giữ hàng' }], lifecycle: lifecycle('confirmed'), audit: [] },
  { id: '20000000-0000-4000-8000-000000000006', reference: 'ORD-DEMO-006', marketplaceReference: '#SHP-2410840', externalId: 'SP-2410840', status: 'pending', channel: channels.shopee, customer: { name: 'Võ Thanh Tùng', location: 'TP. Biên Hòa, Đồng Nai' }, itemCount: 1, total: money(1090000), paymentStatus: 'Đang chờ xác nhận thanh toán', fulfillmentStatus: 'pending_clearance', inventoryStatus: 'Chờ xác nhận thanh toán', placedAt: '2026-10-02T10:42:00+07:00', updatedAt: '2026-10-02T10:44:00+07:00', items: [{ sku: 'HAT-AERO-NVY-OS', name: 'AeroCap Ventilated Hat', variant: 'Xanh navy / Một cỡ', quantity: 1, total: money(1090000), warehouse: 'Kho trung tâm', inventoryStatus: 'Chờ xác nhận thanh toán' }], lifecycle: lifecycle('pending'), audit: [] },
];
