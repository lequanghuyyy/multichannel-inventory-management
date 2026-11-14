import { PageIntroFrame } from '../../../components/common/PageIntroFrame';

export type POSRuntimeStatus = 'checking' | 'connected' | 'offline' | 'demo';

const statusLabels: Partial<Record<POSRuntimeStatus, string>> = {
  checking: 'Đang kiểm tra kết nối',
  offline: 'Ngoại tuyến · không thể bán',
  demo: 'Dữ liệu minh họa · không thể bán',
};

export function POSHeader({ status }: { status: POSRuntimeStatus }) {
  return (
    <PageIntroFrame>
      <div className="flex min-w-0 flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <p className="mb-1 font-body text-caption font-bold uppercase tracking-[0.14em] text-channel-accent">Bán hàng · Quầy thu ngân</p>
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h1 className="font-display text-3xl font-bold tracking-tight text-on-surface sm:text-4xl">Bán tại quầy</h1>
            {statusLabels[status] ? <span className="inline-flex min-h-8 items-center gap-2 rounded-full bg-surface-container-low px-3 py-1 font-body text-caption font-bold text-graphite" role="status"><span className="size-2 shrink-0 rounded-full bg-graphite" aria-hidden="true" />{statusLabels[status]}</span> : null}
          </div>
        </div>
      </div>
    </PageIntroFrame>
  );
}
