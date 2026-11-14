import { Button } from '../../../components/ui/Button';
import { PageIntroFrame } from '../../../components/common/PageIntroFrame';

export function ReportsHeader() {
  return (
    <PageIntroFrame>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
      <div className="max-w-3xl min-w-0">
        <div className="mb-3 flex items-center gap-2 font-body text-caption font-semibold uppercase tracking-[0.14em] text-channel-accent"><span className="size-1.5 rounded-full bg-channel-accent" aria-hidden="true" />Phân tích vận hành</div>
        <h1 className="whitespace-nowrap font-display text-2xl sm:text-3xl lg:text-headline-md font-bold leading-none tracking-[-0.045em] text-on-surface">Báo cáo</h1>
        <p className="mt-4 max-w-2xl font-body text-base leading-7 text-on-surface-variant">Xem tốc độ bán hàng, tình trạng tồn kho và tỷ trọng các kênh bán.</p>
      </div>
      <div className="grid shrink-0 gap-2 sm:grid-cols-3">
        <Button variant="secondary" disabled title="Chưa có">Xuất CSV</Button>
        <Button variant="secondary" disabled title="Chưa có">Xuất bản xem</Button>
        <Button disabled title="Chưa có" leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">schedule_send</span>}>Hẹn gửi báo cáo</Button>
      </div>
      </div>
    </PageIntroFrame>
  );
}
