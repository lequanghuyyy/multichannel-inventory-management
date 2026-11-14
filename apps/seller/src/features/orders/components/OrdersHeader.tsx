import { StatusBadge } from '../../../components/common/StatusBadge';
import { PageIntroFrame } from '../../../components/common/PageIntroFrame';
import { Button } from '../../../components/ui/Button';
import { href, navigate } from '../../../app/routes';

export function OrdersHeader({ onExport, onBulk, exporting = false, exportEnabled = true, bulkEnabled = false }: { onExport: () => void; onBulk: () => void; exporting?: boolean; exportEnabled?: boolean; bulkEnabled?: boolean }) {
  return (
    <PageIntroFrame>
      <div className="grid w-full min-w-0 gap-4">
        <div className="flex w-full min-w-0 flex-col justify-between gap-3 md:flex-row md:items-center"><span className="min-w-0 whitespace-normal break-words font-body text-caption font-semibold uppercase tracking-[0.16em] text-channel-accent">Xử lý đơn hàng</span><div className="flex min-w-0 flex-wrap gap-2"><StatusBadge tone="neutral">Mọi kênh bán</StatusBadge></div></div>
        <div className="flex w-full min-w-0 flex-col justify-between gap-5 lg:flex-row lg:items-end"><div className="min-w-0"><h1 className="break-words font-display text-2xl sm:text-3xl lg:text-headline-md font-bold tracking-tight text-on-surface">Quản lý đơn hàng</h1><p className="mt-3 max-w-3xl font-body text-body-sm leading-6 text-on-surface-variant">Theo dõi đơn hàng, hàng đang giữ và tiến độ giao hàng từ mọi kênh bán trong một danh sách.</p></div><div className="flex w-full min-w-0 flex-wrap gap-2 lg:w-auto lg:shrink-0"><Button variant="secondary" loading={exporting} disabled={!exportEnabled} onClick={onExport} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">download</span>}>Xuất CSV phù hợp bộ lọc</Button><Button variant="secondary" disabled={!bulkEnabled} onClick={onBulk}>Giao hàng loạt</Button><Button onClick={() => navigate(href({ name: 'pos' }))} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>}>Tạo đơn bán tại quầy</Button></div></div>
      </div>
    </PageIntroFrame>
  );
}
