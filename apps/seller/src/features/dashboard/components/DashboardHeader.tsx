import { navigate } from '../../../app/routes';
import { PageIntroFrame } from '../../../components/common/PageIntroFrame';
import { Button } from '../../../components/ui/Button';

export function DashboardHeader() {
  return (
    <PageIntroFrame>
      <div className="flex flex-col justify-between gap-5 md:flex-row md:items-end">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2 font-body text-caption">
            <span className="font-semibold uppercase tracking-[0.16em] text-channel-accent">Tổng quan</span>
            <span className="size-1.5 rounded-full bg-traffic-maximize motion-safe:animate-pulse" aria-hidden="true" />
            <span className="font-semibold text-badge-progress-text">Cập nhật liên tục</span>
          </div>
          <h1 className="whitespace-nowrap font-display text-headline-md font-bold tracking-tight text-on-surface">Không gian bán hàng</h1>
          <p className="mt-1 max-w-2xl font-body text-body-sm text-on-surface-variant">Theo dõi tồn kho, doanh số và trạng thái đồng bộ trên toàn bộ mạng lưới bán hàng.</p>
        </div>
        <div className="flex shrink-0 flex-col gap-3 sm:flex-row sm:items-center">
          <div className="flex min-h-10 items-center gap-2 rounded-control bg-pure-white px-3.5 font-body text-body-sm font-semibold text-on-surface shadow-card ring-1 ring-black/5" aria-label="Khoảng thời gian">
            <span className="material-symbols-outlined text-lg text-graphite" aria-hidden="true">calendar_today</span>
            <span>7 ngày gần nhất</span>
          </div>
          <Button variant="secondary" onClick={() => navigate('/products')} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>}>
            Sản phẩm
          </Button>
        </div>
      </div>
    </PageIntroFrame>
  );
}
