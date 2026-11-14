import { PageIntroFrame } from '../../../components/common/PageIntroFrame';

export function SettingsHeader() {
  return (
    <PageIntroFrame>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl min-w-0">
        <div className="mb-3 flex items-center gap-2 font-body text-caption font-semibold uppercase tracking-[0.14em] text-channel-accent">
          <span className="size-1.5 rounded-full bg-channel-accent" aria-hidden="true" />
          Thiết lập cửa hàng
        </div>
        <h1 className="whitespace-nowrap font-display text-2xl sm:text-3xl lg:text-headline-md font-bold leading-none tracking-[-0.045em] text-on-surface">Cài đặt</h1>
        <p className="mt-4 max-w-2xl font-body text-base leading-7 text-on-surface-variant">Xem thông tin cửa hàng, kho hàng, thành viên và tuỳ chọn hiển thị.</p>
      </div>
      </div>
    </PageIntroFrame>
  );
}
