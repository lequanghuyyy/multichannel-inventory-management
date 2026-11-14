import type { ReportFixture, ReportMetricFixture } from '../features/reports/report.types';

const metrics = (orders: string, units: string, cancelled: string, velocity: string, lowStock: string): ReportMetricFixture[] => [
  { id: 'orders', label: 'Tổng đơn hàng', value: orders, detail: 'Tổng theo kỳ', tone: 'success', icon: 'receipt_long' },
  { id: 'units', label: 'Sản phẩm đã bán', value: units, detail: 'Chưa trừ đơn hủy', tone: 'neutral', icon: 'package_2' },
  { id: 'cancelled', label: 'Đơn đã hủy', value: cancelled, detail: 'Trong kỳ', tone: 'neutral', icon: 'cancel' },
  { id: 'velocity', label: 'Tốc độ bán', value: velocity, detail: 'Trung bình mỗi ngày', tone: 'success', icon: 'speed' },
  { id: 'inventory', label: 'Tồn kho hiện tại', value: '14.820', detail: 'Tổng toàn kho', tone: 'neutral', icon: 'warehouse' },
  { id: 'low-stock', label: 'SKU sắp hết', value: lowStock, detail: 'Cần nhập thêm', tone: 'warning', icon: 'warning' },
];

const sevenDayChannels = [
  { id: 'shopee' as const, name: 'Shopee', code: 'SP', ordersDisplay: '1.192 đơn', shareDisplay: '42%', barClass: 'w-[42%]', colorClass: 'bg-on-tertiary-container' },
  { id: 'tiktok' as const, name: 'TikTok Shop', code: 'TT', ordersDisplay: '880 đơn', shareDisplay: '31%', barClass: 'w-[31%]', colorClass: 'bg-carbon' },
  { id: 'pos' as const, name: 'Bán tại quầy', code: 'POS', ordersDisplay: '512 đơn', shareDisplay: '18%', barClass: 'w-[18%]', colorClass: 'bg-badge-neutral-text' },
  { id: 'lazada' as const, name: 'Lazada', code: 'LZ', ordersDisplay: '256 đơn', shareDisplay: '9%', barClass: 'w-[9%]', colorClass: 'bg-secondary' },
];

export const reportFixture: ReportFixture = {
  snapshots: {
    today: {
      period: 'today', periodLabel: 'Hôm nay (mẫu)', capturedAt: '2026-10-03 14:02 UTC', metrics: metrics('443', '486', '4', '443 sản phẩm/ngày', '7 SKU'),
      salesPoints: [
        { label: '08:00', ordersDisplay: '42 đơn', unitsDisplay: '46 sản phẩm', barClass: 'w-[32%]' },
        { label: '10:00', ordersDisplay: '68 đơn', unitsDisplay: '72 sản phẩm', barClass: 'w-[52%]' },
        { label: '12:00', ordersDisplay: '91 đơn', unitsDisplay: '98 sản phẩm', barClass: 'w-[70%]' },
        { label: '14:00', ordersDisplay: '128 đơn', unitsDisplay: '141 sản phẩm', barClass: 'w-full', highlight: true },
        { label: '16:00', ordersDisplay: '74 đơn', unitsDisplay: '82 sản phẩm', barClass: 'w-[58%]' },
        { label: '18:00', ordersDisplay: '40 đơn', unitsDisplay: '47 sản phẩm', barClass: 'w-[31%]' },
      ],
      channelShares: sevenDayChannels.map((channel) => ({ ...channel, ordersDisplay: channel.id === 'shopee' ? '186 đơn' : channel.id === 'tiktok' ? '137 đơn' : channel.id === 'pos' ? '80 đơn' : '40 đơn' })),
      observations: [
        { id: 'today-1', label: 'Về tốc độ bán', source: 'TikTok (mẫu)', title: '14:00 là giờ bán cao điểm', detail: 'Tốc độ bán quần áo tăng nhờ chiến dịch quảng cáo; chưa có dữ liệu để xác nhận nguyên nhân.', tone: 'growth' },
        { id: 'today-2', label: 'Về tồn kho', source: 'SKU (mẫu)', title: 'SHOE-001-BLK-42 vẫn thấp hơn mức tồn đệm', detail: 'Số có thể bán và ngưỡng ở đây là số liệu mẫu.', tone: 'risk' },
        { id: 'today-3', label: 'Về đồng bộ', source: 'Kênh (mẫu)', title: 'Chưa có số liệu đồng bộ thật', detail: 'Hệ thống chưa kết nối với sàn thương mại điện tử thật.', tone: 'neutral' },
      ],
      footer: 'Hôm nay · 443 đơn (mẫu)',
    },
    '7d': {
      period: '7d', periodLabel: '7 ngày qua (mẫu)', capturedAt: '2026-10-03 14:02 UTC', metrics: metrics('2.840', '3.118', '34', '405 sản phẩm/ngày', '7 SKU'),
      salesPoints: [
        { label: 'T2', ordersDisplay: '380 đơn', unitsDisplay: '418 sản phẩm', barClass: 'w-[70%]' },
        { label: 'T3', ordersDisplay: '410 đơn', unitsDisplay: '449 sản phẩm', barClass: 'w-[76%]' },
        { label: 'T4', ordersDisplay: '395 đơn', unitsDisplay: '432 sản phẩm', barClass: 'w-[73%]' },
        { label: 'T5', ordersDisplay: '440 đơn', unitsDisplay: '482 sản phẩm', barClass: 'w-[81%]' },
        { label: 'T6', ordersDisplay: '540 đơn', unitsDisplay: '592 sản phẩm', barClass: 'w-full', highlight: true },
        { label: 'T7', ordersDisplay: '510 đơn', unitsDisplay: '559 sản phẩm', barClass: 'w-[94%]' },
        { label: 'CN', ordersDisplay: '443 đơn', unitsDisplay: '486 sản phẩm', barClass: 'w-[82%]' },
      ],
      channelShares: sevenDayChannels,
      observations: [
        { id: 'week-1', label: 'Tăng trưởng', source: 'TikTok (mẫu)', title: 'Tốc độ bán quần áo tăng 34%', detail: 'Nguyên nhân tăng do chiến dịch chỉ là giả định, chưa có dữ liệu xác nhận.', tone: 'growth' },
        { id: 'week-2', label: 'Tồn kho nguy cấp', source: 'Tồn kho (mẫu)', title: 'Áo sơ mi lụa crepe có số bán được là -3', detail: 'Số âm chỉ là dữ liệu mẫu minh hoạ.', tone: 'risk' },
        { id: 'week-3', label: 'Về độ trễ', source: 'Shopee (mẫu)', title: 'Độ trễ chậm nhất khoảng 1,4 giây', detail: 'Chưa có số đo thật để kiểm chứng con số này.', tone: 'neutral' },
      ],
      footer: '7 ngày · 2.840 đơn · 3.118 sản phẩm (mẫu)',
    },
    '30d': {
      period: '30d', periodLabel: '30 ngày qua (mẫu)', capturedAt: '2026-10-03 14:02 UTC', metrics: metrics('11.420', '12.684', '128', '423 sản phẩm/ngày', '19 SKU'),
      salesPoints: [
        { label: 'W1', ordersDisplay: '2.510 đơn', unitsDisplay: '2.772 sản phẩm', barClass: 'w-[78%]' },
        { label: 'W2', ordersDisplay: '2.680 đơn', unitsDisplay: '2.955 sản phẩm', barClass: 'w-[83%]' },
        { label: 'W3', ordersDisplay: '2.940 đơn', unitsDisplay: '3.258 sản phẩm', barClass: 'w-[91%]' },
        { label: 'W4', ordersDisplay: '3.210 đơn', unitsDisplay: '3.566 sản phẩm', barClass: 'w-full', highlight: true },
        { label: 'Ngày 29–30', ordersDisplay: '80 đơn', unitsDisplay: '133 sản phẩm', barClass: 'w-[18%]' },
      ],
      channelShares: [
        { ...sevenDayChannels[0]!, ordersDisplay: '4.682 đơn', shareDisplay: '41%', barClass: 'w-[41%]' },
        { ...sevenDayChannels[1]!, ordersDisplay: '3.655 đơn', shareDisplay: '32%', barClass: 'w-[32%]' },
        { ...sevenDayChannels[2]!, ordersDisplay: '2.056 đơn', shareDisplay: '18%', barClass: 'w-[18%]' },
        { ...sevenDayChannels[3]!, ordersDisplay: '1.027 đơn', shareDisplay: '9%', barClass: 'w-[9%]' },
      ],
      observations: [
        { id: 'month-1', label: 'Cơ cấu kênh', source: 'Kênh (mẫu)', title: 'Shopee vẫn là kênh dẫn đầu', detail: 'Tỷ trọng 41% chỉ là số liệu mẫu, chưa tính từ đơn hàng thật.', tone: 'growth' },
        { id: 'month-2', label: 'Theo dõi tồn kho', source: 'Tồn kho (mẫu)', title: '19 SKU đang sắp hết hàng', detail: 'Con số này chỉ để minh hoạ.', tone: 'risk' },
        { id: 'month-3', label: 'Lưu ý', source: 'Báo cáo (mẫu)', title: 'Chưa có chốt sổ cuối tháng', detail: 'Chưa có đối soát thanh toán, trả hàng, hoàn tiền hay báo cáo chính thức.', tone: 'neutral' },
      ],
      footer: '30 ngày · 11.420 đơn (mẫu) · chưa chốt sổ cuối tháng',
    },
  },
  skus: [
    { id: 'sku-1', product: 'AeroGlide Runner', variant: 'Cỡ 42 · Đen nhám', sku: 'SHOE-001-BLK-42', category: 'footwear', channel: 'shopee', unitsSoldDisplay: '612', onHandDisplay: '140', reservedDisplay: '85', bufferDisplay: '40', atsDisplay: '15', status: 'low', topChannelDisplay: 'Shopee · 58%' },
    { id: 'sku-2', product: 'Minimalist Leather Tote', variant: 'Nâu caramel · Một cỡ', sku: 'BAG-204-TAN-OS', category: 'leather', channel: 'tiktok', unitsSoldDisplay: '488', onHandDisplay: '520', reservedDisplay: '42', bufferDisplay: '50', atsDisplay: '428', status: 'stable', topChannelDisplay: 'TikTok · 44%' },
    { id: 'sku-3', product: 'Nordic Oxford Derbies', variant: 'Cỡ 41 · Nâu cà phê', sku: 'SHOE-112-ESP-41', category: 'footwear', channel: 'pos', unitsSoldDisplay: '394', onHandDisplay: '310', reservedDisplay: '28', bufferDisplay: '30', atsDisplay: '252', status: 'stable', topChannelDisplay: 'POS D1 · 62%' },
    { id: 'sku-4', product: 'Silk Crepe Tailored Shirt', variant: 'Cỡ M · Xám than đậm', sku: 'APP-045-CHR-MD', category: 'apparel', channel: 'shopee', unitsSoldDisplay: '315', onHandDisplay: '48', reservedDisplay: '36', bufferDisplay: '15', atsDisplay: '-3', status: 'critical', topChannelDisplay: 'Shopee · 71%' },
    { id: 'sku-5', product: 'Chronograph Automatic 38mm', variant: 'Bạc nhám · Dây lưới thép', sku: 'ACC-908-SLV-38', category: 'accessories', channel: 'lazada', unitsSoldDisplay: '284', onHandDisplay: '195', reservedDisplay: '14', bufferDisplay: '25', atsDisplay: '156', status: 'stable', topChannelDisplay: 'Lazada · 52%' },
  ],
  gateways: [
    { id: 'performance', title: 'Hiệu năng đồng bộ', label: 'Số liệu mẫu', facts: [{ label: 'Tổng sự kiện đồng bộ', value: '142.890 (mẫu)' }, { label: 'Tỷ lệ thành công', value: '99,2% (mẫu)' }, { label: 'Độ trễ chậm nhất', value: '1,4 giây (mẫu)' }, { label: 'Xung đột', value: '1 sự kiện (mẫu)' }], note: 'Chưa có số đo thật.' },
    { id: 'failures', title: 'Phân loại lỗi', label: 'Phân bổ (mẫu)', facts: [{ label: 'Vượt giới hạn gọi', value: '48%' }, { label: 'Quá thời gian chờ', value: '28%' }, { label: 'Thiếu liên kết SKU', value: '16%' }, { label: 'Xác thực', value: '8%' }], note: 'Tỷ lệ chỉ để minh hoạ, không phải số đo thật.' },
    { id: 'diagnostics', title: 'Chẩn đoán đồng bộ', label: 'Tình trạng', facts: [{ label: 'Kết nối sàn thật', value: 'Chưa triển khai' }, { label: 'Cập nhật trực tiếp', value: 'Chưa triển khai' }, { label: 'Xuất báo cáo kiểm toán', value: 'Chưa triển khai' }, { label: 'Đối soát tự động', value: 'Chưa triển khai' }], note: 'Xem trang Đồng bộ để biết thêm chi tiết.' },
  ],
};
