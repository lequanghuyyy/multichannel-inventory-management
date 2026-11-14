import { Select } from '../../../components/ui/Select';
import { Switch } from '../../../components/ui/Switch';
import type { SettingsDensity, SettingsTimeFormat } from '../settings.types';

export interface PreferencesPanelProps {
  density: SettingsDensity;
  timeFormat: SettingsTimeFormat;
  onDensityChange: (value: SettingsDensity) => void;
  onTimeFormatChange: (value: SettingsTimeFormat) => void;
}

export function PreferencesPanel({ density, onDensityChange, onTimeFormatChange, timeFormat }: PreferencesPanelProps) {
  const preview = timeFormat === '24-hour' ? '03/10/2026 · 14:42:08' : '03/10/2026 · 02:42:08 CH';
  return (
    <section className="grid gap-5" aria-labelledby="preferences-panel-title">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div className="min-w-0"><p className="font-body text-caption font-bold uppercase tracking-[0.14em] text-graphite">Thiết lập 04</p><h2 className="mt-1 whitespace-nowrap font-display text-2xl font-bold text-on-surface" id="preferences-panel-title">Tuỳ chọn hiển thị</h2></div><span className="w-fit shrink-0 rounded-full bg-badge-neutral-bg px-3 py-1 font-body text-caption font-bold text-badge-neutral-text">CHỈ TRONG PHIÊN</span></div>
      <div className="grid gap-5 lg:grid-cols-2">
        <article className="rounded-card border border-outline-variant/60 bg-pure-white p-5 shadow-card sm:p-6">
          <div className="mb-5 border-b border-outline-variant/50 pb-4"><p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-graphite">Giao diện</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">Tuỳ chọn xem thử</h3></div>
          <div className="grid gap-5"><Select label="Mật độ danh sách thành viên" value={density} onChange={(event) => onDensityChange(event.target.value as SettingsDensity)} hint="Chuyển sang mục Thành viên để thấy khoảng cách dòng thay đổi."><option value="comfortable">Thoải mái</option><option value="compact">Gọn</option></Select><Select label="Định dạng giờ" value={timeFormat} onChange={(event) => onTimeFormatChange(event.target.value as SettingsTimeFormat)} hint={`Ví dụ: ${preview}`}><option value="24-hour">Định dạng 24 giờ</option><option value="12-hour">Định dạng 12 giờ</option></Select><Select label="Ngôn ngữ giao diện" value="unavailable" disabled hint="Hiện chỉ hỗ trợ tiếng Việt."><option value="unavailable">Chưa có</option></Select><Select label="Màn hình mở đầu" value="unavailable" disabled hint="Chưa thể thay đổi."><option value="unavailable">Chưa có</option></Select></div>
        </article>
        <article className="rounded-card border border-outline-variant/60 bg-pure-white p-5 shadow-card sm:p-6">
          <div className="mb-5 border-b border-outline-variant/50 pb-4"><p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-graphite">Thông báo</p><h3 className="mt-1 font-display text-xl font-bold text-on-surface">Chưa gửi được thông báo</h3></div>
          <div className="grid gap-5"><Switch checked disabled label="Cảnh báo sắp hết hàng" description="Chưa có dịch vụ gửi thông báo." onCheckedChange={() => undefined} /><Switch checked disabled label="Lỗi đồng bộ với kênh bán" description="Chưa kết nối kênh bán thật." onCheckedChange={() => undefined} /><Switch checked disabled label="Thông báo đề xuất của AI" description="Trợ lý AI chưa hoạt động." onCheckedChange={() => undefined} /><Switch checked disabled label="Mất kết nối với sàn" description="Chưa kết nối sàn thật." onCheckedChange={() => undefined} /></div>
          <p className="mt-6 rounded-control bg-surface-container-low px-4 py-3 font-body text-caption leading-5 text-graphite">Các công tắc đang khoá và chỉ để minh hoạ, chưa có thông báo nào được gửi.</p>
        </article>
      </div>
    </section>
  );
}
