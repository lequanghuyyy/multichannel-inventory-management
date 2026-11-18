import type { LazadaStatus } from '../../../api/lazada';
import { PageIntroFrame } from '../../../components/common/PageIntroFrame';
import { Button } from '../../../components/ui/Button';

export function ChannelsHeader({
  onRefresh,
  refreshing,
  canManage,
  ebayEnabled,
  ebayConnections,
  ebayConnecting,
  onConnectEbay,
  lazadaStatus,
  lazadaConnecting,
  onConnectLazada,
  onOpenLazada,
}: {
  onRefresh: () => void;
  refreshing: boolean;
  canManage: boolean;
  ebayEnabled: boolean;
  ebayConnections: number;
  ebayConnecting: boolean;
  onConnectEbay: () => void;
  lazadaStatus: LazadaStatus | null;
  lazadaConnecting: boolean;
  onConnectLazada: () => void;
  onOpenLazada: () => void;
}) {
  return (
    <PageIntroFrame>
      <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
        <div className="min-w-0">
          <p className="mb-2 font-body text-caption font-semibold uppercase tracking-[0.14em] text-channel-accent">Bán hàng đa kênh</p>
          <h1 className="font-display text-2xl font-bold tracking-tight text-on-surface sm:text-3xl">Kênh bán</h1>
        </div>
        <div className="flex min-w-0 flex-wrap gap-2">
          <Button variant="secondary" loading={refreshing} loadingLabel="Đang làm mới…" onClick={onRefresh} leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">refresh</span>}>
            Làm mới trạng thái
          </Button>
          {canManage && ebayEnabled ? <Button loading={ebayConnecting} loadingLabel="Đang mở eBay…" onClick={onConnectEbay} leadingIcon={<span className="font-display text-sm font-black tracking-tight" aria-hidden="true"><span className="text-[#e53238]">e</span><span className="text-[#0064d2]">B</span><span className="text-[#f5af02]">a</span><span className="text-[#86b817]">y</span></span>}>
            {ebayConnections ? 'Kết nối thêm eBay' : 'Kết nối eBay Sandbox'}
          </Button> : null}
          {canManage && lazadaStatus?.enabled ? <Button variant="secondary" loading={lazadaConnecting} loadingLabel="Đang mở Lazada…" onClick={onConnectLazada}>
            {lazadaStatus.connection?.status === 'connected' ? 'Kết nối lại Lazada' : 'Kết nối Lazada VN'}
          </Button> : null}
          {lazadaStatus?.connection?.channel_id ? <Button variant="ghost" onClick={onOpenLazada}>Mở Lazada</Button> : null}
          <Button disabled title="Backend chưa có luồng tạo kênh chung. Dùng luồng kết nối riêng của nền tảng khi được hỗ trợ." leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">add</span>}>
            Thêm kênh bán
          </Button>
        </div>
      </div>
    </PageIntroFrame>
  );
}
