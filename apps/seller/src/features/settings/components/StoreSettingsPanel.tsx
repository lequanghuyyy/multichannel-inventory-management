import { Button } from '../../../components/ui/Button';
import { Input } from '../../../components/ui/Input';
import type { StoreSettingsFixture } from '../settings.types';

export function StoreSettingsPanel({ store }: { store: StoreSettingsFixture }) {
  const fields = [
    { id: 'store-name', label: 'Tên cửa hàng', value: store.name, hint: 'Tên hiển thị trên các sàn.' },
    { id: 'store-code', label: 'Mã cửa hàng', value: store.code, hint: 'Mã dùng nội bộ.' },
    { id: 'registered-name', label: 'Tên pháp nhân', value: store.registeredName, hint: 'Chưa được xác minh.' },
    { id: 'contact-phone', label: 'Số điện thoại liên hệ', value: store.phone, hint: 'Số điện thoại vận hành.' },
    { id: 'support-email', label: 'Email hỗ trợ', value: store.email, hint: 'Chưa cấu hình gửi thông báo.' },
    { id: 'hq-address', label: 'Địa chỉ trụ sở', value: store.address, hint: 'Địa chỉ xuất hoá đơn.' },
    { id: 'timezone', label: 'Múi giờ mặc định', value: store.timezone, hint: 'Chưa thể thay đổi.' },
    { id: 'currency', label: 'Đơn vị tiền tệ', value: store.currency, hint: 'Chỉ để tham khảo.' },
  ] as const;
  return (
    <section className="grid gap-5" aria-labelledby="store-panel-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="font-body text-caption font-bold uppercase tracking-[0.14em] text-graphite">Thiết lập 01</p><h2 className="mt-1 whitespace-nowrap font-display text-2xl font-bold text-on-surface" id="store-panel-title">Hồ sơ cửa hàng</h2><p className="mt-0.5 font-body text-body-sm text-graphite">{store.name}</p></div><span className="w-fit shrink-0 rounded-full bg-secondary-fixed px-3 py-1 font-body text-caption font-bold text-on-surface">CHỈ ĐỂ XEM</span></div>
      <div className="rounded-card border border-outline-variant/60 bg-pure-white p-5 shadow-card sm:p-7">
        <div className="grid gap-6 md:grid-cols-2">{fields.map((field) => <Input className="cursor-default bg-surface-container-low font-mono text-body-sm" id={field.id} key={field.id} label={field.label} value={field.value} hint={field.hint} readOnly />)}</div>
        <div className="mt-7 grid gap-3 border-y border-outline-variant/50 py-5 md:grid-cols-2">
          <div className="flex items-start gap-3"><span className="material-symbols-outlined text-xl text-graphite" aria-hidden="true">hub</span><div><strong className="font-body text-body-sm text-on-surface">Kênh bán mặc định</strong><p className="mt-1 font-body text-caption text-graphite">{store.defaultChannel}</p></div></div>
          <div className="flex items-start gap-3"><span className="material-symbols-outlined text-xl text-graphite" aria-hidden="true">local_shipping</span><div><strong className="font-body text-body-sm text-on-surface">Nơi xuất hàng</strong><p className="mt-1 font-body text-caption text-graphite">{store.fulfillmentSource}</p></div></div>
        </div>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><p className="font-body text-caption leading-5 text-graphite">Chưa thể lưu thay đổi cấu hình cửa hàng.</p><div className="flex gap-2"><Button variant="secondary" disabled>Huỷ thay đổi</Button><Button disabled>Lưu thay đổi</Button></div></div>
      </div>
    </section>
  );
}
