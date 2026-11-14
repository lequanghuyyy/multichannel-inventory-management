import type { SettingsFixture } from '../features/settings/settings.types';

export const settingsFixture: SettingsFixture = {
  store: {
    name: 'Cửa hàng Apex Official',
    code: 'APX-STORE-01',
    registeredName: 'Công ty TNHH Bán lẻ Apex',
    phone: '028 7300 1234',
    email: 'admin@apexstore.vn',
    address: '79 Nguyễn Huệ, Quận 1, TP. Hồ Chí Minh',
    timezone: 'UTC+07:00 · Hà Nội / TP. Hồ Chí Minh',
    currency: 'VND · Đồng Việt Nam',
    defaultChannel: 'Shopee (thử nghiệm)',
    fulfillmentSource: 'Kho chính · WH-001',
  },
  warehouse: {
    name: 'Kho trung tâm',
    code: 'WH-001',
    location: '20 Đường số 14, Quận 7, TP. Hồ Chí Minh',
    state: 'Kho mẫu',
    metrics: [
      { id: 'tracked', label: 'SKU đang theo dõi', value: '342', detail: 'Số liệu mẫu' },
      { id: 'on-hand', label: 'Tồn kho', value: '14.820', detail: 'Số liệu mẫu' },
      { id: 'reserved', label: 'Đang giữ', value: '1.124', detail: 'Số liệu mẫu' },
      { id: 'buffer', label: 'Tồn đệm an toàn', value: '410', detail: 'Số liệu mẫu' },
      { id: 'ats', label: 'Có thể bán', value: '13.286', detail: 'Số liệu mẫu', emphasis: true },
    ],
  },
  members: [
    { id: 'member-1', initials: 'AA', name: 'Quản trị viên Apex', email: 'admin@apexstore.vn', role: 'Admin', status: 'active', lastSession: '12 phút trước · Web' },
    { id: 'member-2', initials: 'TC', name: 'Trần Văn Cường', email: 'cuong.tv@apexstore.vn', role: 'Admin', status: 'active', lastSession: '2 giờ trước · Web' },
    { id: 'member-3', initials: 'NL', name: 'Nguyễn Thị Lan', email: 'lan.nt@apexstore.vn', role: 'Staff', status: 'active', lastSession: 'Hôm qua 18:40 · Bán tại quầy' },
    { id: 'member-4', initials: 'LD', name: 'Lê Văn Dũng', email: 'dung.lv@apexstore.vn', role: 'Staff', status: 'suspended', lastSession: '5 ngày trước · Web' },
  ],
};
