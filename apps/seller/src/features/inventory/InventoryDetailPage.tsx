import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { adjustInventory, type InventorySnapshot } from '../../api/inventory';
import { navigate } from '../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { PageHeader } from '../../components/common/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { getInventoryDetailFixture, type DemoMode } from '../../mocks/mock-api';
import { useRealtimeRefresh } from '../realtime/RealtimeProvider';
import { useMockData } from '../shared/useMockData';
import { InventoryAnchorMetrics } from './components/detail/InventoryAnchorMetrics';
import { InventoryDetailHeader } from './components/detail/InventoryDetailHeader';
import { InventoryMovementTimeline } from './components/detail/InventoryMovementTimeline';
import { InventoryAdjustmentModal, type AdjustmentFormValue } from './components/detail/InventoryAdjustmentModal';
import { InventoryVelocityCard } from './components/detail/InventoryVelocityCard';
import { InventoryReservationsPanel } from './components/detail/InventoryReservationsPanel';
import { InventoryReceiptsPanel } from './components/detail/InventoryReceiptsPanel';
import { InventoryChannelEvidence } from './components/detail/InventoryChannelEvidence';
import { useInventoryDetailSnapshot } from './hooks/useInventoryDetailSnapshot';
import { useInventoryAdjustmentLedger } from './hooks/useInventoryAdjustmentLedger';
import { useInventoryMovements } from './hooks/useInventoryMovements';
import { useInventoryChannelEvidence } from './hooks/useInventoryChannelEvidence';
import type { InventoryDetailFixture } from './inventory-detail.types';

type InventoryDetailTab = 'overview' | 'movements' | 'channels';
const detailTabs: { id: InventoryDetailTab; label: string; icon: string }[] = [
  { id: 'overview', label: 'Tổng quan', icon: 'dashboard' },
  { id: 'movements', label: 'Biến động tồn', icon: 'swap_vert' },
  { id: 'channels', label: 'Kênh bán', icon: 'storefront' },
];

export function InventoryDetailPage({ mode, sku, canAdjust = true, canManageChannels = false, canCreateReceipt = false }: { mode: DemoMode; sku: string; canAdjust?: boolean; canManageChannels?: boolean; canCreateReceipt?: boolean }) {
  const loadDetail = useCallback((currentMode: DemoMode) => currentMode === 'default' ? Promise.resolve(undefined) : getInventoryDetailFixture(sku, currentMode), [sku]);
  const { value: fixtureDetail, error: fixtureError, loading: fixtureLoading, refresh: refreshFixture } = useMockData(loadDetail, mode);
  const live = useInventoryDetailSnapshot(sku);
  const [activeTab, setActiveTab] = useState<InventoryDetailTab>('overview');
  const [refreshToken, setRefreshToken] = useState(0);
  const detail = mode === 'default' ? (live.snapshot ? detailFromInventorySnapshot(live.snapshot) : null) : fixtureDetail;
  const liveMode = mode === 'default';
  const movementEnabled = liveMode && activeTab === 'movements';
  const channelEnabled = liveMode && Boolean(live.snapshot?.product_id) && (activeTab === 'overview' || activeTab === 'channels');
  const ledger = useInventoryAdjustmentLedger(sku);
  const movements = useInventoryMovements(sku, movementEnabled);
  const channels = useInventoryChannelEvidence(sku, live.snapshot?.product_id ?? '', channelEnabled);
  const error = liveMode ? null : fixtureError;
  const loading = liveMode ? live.state === 'loading' : fixtureLoading;
  const mayAdjust = canAdjust && liveMode;
  const [adjustmentOpen, setAdjustmentOpen] = useState(false);
  const [adjustmentSubmitting, setAdjustmentSubmitting] = useState(false);
  const [adjustmentError, setAdjustmentError] = useState<unknown>(null);
  const [adjustmentResult, setAdjustmentResult] = useState<Awaited<ReturnType<typeof adjustInventory>> | null>(null);
  const adjustmentAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const adjustmentNonce = useRef(0);

  useRealtimeRefresh(['inventory', 'sync'], () => {
    live.revalidate();
    ledger.revalidate();
    movements.revalidate();
    channels.revalidate();
    setRefreshToken((value) => value + 1);
  }, {
    match: (change) => !change.sku || change.sku === sku,
    pollWhileDegradedMs: 15_000,
  });

  const submitAdjustment = async ({ delta, reason }: AdjustmentFormValue) => {
    if (adjustmentSubmitting) return;
    const current = live.snapshot;
    if (!current) return;
    if (delta === 0) return;
    const fingerprint = `${delta}|${reason}`;
    const attempt = adjustmentAttempt.current;
    const key = attempt?.fingerprint === fingerprint
      ? attempt.key
      : `adjust-${sku}-${Date.now()}-${adjustmentNonce.current++}`;
    adjustmentAttempt.current = { fingerprint, key };
    setAdjustmentSubmitting(true);
    setAdjustmentError(null);
    setAdjustmentResult(null);
    try {
      const result = await adjustInventory({ sku, delta, reason }, key);
      adjustmentAttempt.current = null;
      setAdjustmentResult(result);
      setAdjustmentOpen(false);
      live.revalidate();
      ledger.refresh();
      channels.revalidate();
      setRefreshToken((value) => value + 1);
    } catch (nextError: unknown) {
      setAdjustmentError(nextError);
    } finally {
      setAdjustmentSubmitting(false);
    }
  };

  const selectTab = (tab: InventoryDetailTab) => setActiveTab(tab);
  const handleTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    const currentIndex = detailTabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight' || event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % detailTabs.length;
    else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + detailTabs.length) % detailTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = detailTabs.length - 1;
    else return;
    event.preventDefault();
    const next = detailTabs[nextIndex];
    if (!next) return;
    selectTab(next.id);
    document.getElementById(`inventory-detail-tab-${next.id}`)?.focus();
  };

  if (loading) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><PageHeader eyebrow="KHO / CHI TIẾT SKU" title="Chi tiết tồn kho" description="Đang tải thông tin SKU…" /><LoadingState label="Đang tải dữ liệu tồn kho…" /></section>;
  if (error) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><PageHeader eyebrow="KHO / CHI TIẾT SKU" title="Chi tiết tồn kho" description="Không thể đọc thông tin SKU." /><ErrorState error={error} retry={refreshFixture} /></section>;
  if (live.error && !live.snapshot) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><Button variant="ghost" onClick={() => navigate('/inventory')} className="justify-self-start">← Kho</Button><ErrorState error={live.error} retry={live.refresh} /></section>;
  if (!detail || (!live.snapshot && liveMode)) return <section className="mx-auto grid w-full max-w-[1200px] gap-6 py-8"><Button variant="ghost" onClick={() => navigate('/inventory')} className="justify-self-start">← Kho</Button><EmptyState title="Không tìm thấy SKU" detail={`Chưa có dữ liệu tồn kho của SKU ${sku}.`} /></section>;

  const stock = liveMode
    ? { onHand: live.snapshot!.on_hand, reserved: live.snapshot!.reserved, safetyBuffer: live.snapshot!.safety_buffer, availableToSell: live.snapshot!.available_to_sell }
    : fixtureDetail!.stock;
  const updatedAt = liveMode ? live.snapshot?.updated_at : fixtureDetail?.updatedAt;
  const dataVersion = liveMode ? live.snapshot?.version : undefined;

  return (
    <section className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 py-8">
      <InventoryDetailHeader detail={detail} source={liveMode ? 'core' : 'fixture'} onAdjust={() => { setAdjustmentError(null); setAdjustmentOpen(true); }} adjustmentDisabled={adjustmentSubmitting || live.state !== 'success' || Boolean(live.error)} canAdjust={mayAdjust} canCreateReceipt={liveMode && canCreateReceipt} />
      {live.error && live.snapshot ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 font-body text-body-sm text-amber-900"><span>Đang hiển thị snapshot tồn gần nhất; lần xác minh mới nhất thất bại.</span><Button variant="secondary" size="sm" onClick={live.revalidate}>Thử tải lại</Button></div> : null}
      {adjustmentResult ? <div role="status" className="rounded-control border border-emerald-300 bg-emerald-50 px-4 py-3 font-body text-body-sm text-emerald-950"><strong>Đã ghi nhận điều chỉnh từ máy chủ.</strong><p className="mt-1">Tồn trong hệ thống: {adjustmentResult.on_hand.toLocaleString('vi-VN')} chiếc · Có thể bán: {adjustmentResult.available_to_sell.toLocaleString('vi-VN')} chiếc · Phiên bản {adjustmentResult.version}.</p></div> : null}
      <section aria-label="Stock snapshot">
        <InventoryAnchorMetrics stock={stock} source={liveMode ? 'api' : 'fixture'} version={dataVersion} apiState={liveMode ? live.state : 'success'} onRetry={live.revalidate} updatedAt={updatedAt} />
      </section>

      <nav className="flex min-w-0 gap-1 overflow-x-auto border-b border-outline-variant/60" role="tablist" aria-label="Thông tin tồn kho SKU">
        {detailTabs.map((tab) => <button key={tab.id} id={`inventory-detail-tab-${tab.id}`} type="button" role="tab" aria-selected={activeTab === tab.id} aria-controls="inventory-detail-panel" tabIndex={activeTab === tab.id ? 0 : -1} onClick={() => selectTab(tab.id)} onKeyDown={handleTabKey} className={`flex min-h-11 shrink-0 items-center gap-2 border-b-2 px-4 font-body text-sm font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary ${activeTab === tab.id ? 'border-channel-accent text-on-surface' : 'border-transparent text-graphite hover:text-on-surface'}`}><span className="material-symbols-outlined text-lg" aria-hidden="true">{tab.icon}</span>{tab.label}</button>)}
      </nav>

      <div id="inventory-detail-panel" role="tabpanel" tabIndex={0} aria-labelledby={`inventory-detail-tab-${activeTab}`} className="min-w-0 outline-none">
        {activeTab === 'overview' ? liveMode ? <div className="grid gap-5">
          <InventoryStockAlerts onHand={stock.onHand} reserved={stock.reserved} safetyBuffer={stock.safetyBuffer} available={stock.availableToSell} />
          <InventoryAdjustmentHistoryCard entries={ledger.entries} error={ledger.error} loading={ledger.state === 'loading'} onRetry={ledger.refresh} sku={sku} />
          <div className="grid items-start gap-5 lg:grid-cols-2"><InventoryReservationsPanel sku={sku} variantId={live.snapshot!.variant_id} reserved={stock.reserved} refreshToken={refreshToken} /><InventoryReceiptsPanel sku={sku} canCreate={canCreateReceipt} refreshToken={refreshToken} /></div>
          <InventoryChannelEvidence entries={channels.entries} error={channels.error} loading={channels.loading} refreshing={channels.refreshing} onRefresh={channels.refresh} onViewDetails={() => selectTab('channels')} canManage={canManageChannels} view="summary" />
          <InventoryVelocityCard />
        </div> : <div className="grid gap-5"><Card className="p-5"><p className="font-body text-body-sm text-graphite">Thông tin mẫu · dữ liệu này không phản ánh tồn kho hoặc reservation đang vận hành.</p></Card><InventoryVelocityCard /></div> : null}

        {activeTab === 'movements' ? liveMode ? <InventoryMovementTimeline entries={movements.entries} error={movements.error} filters={movements.filters} loading={movements.state === 'loading'} loadingMore={movements.loadingMore} nextCursor={movements.nextCursor} onFilterChange={movements.setFilters} onLoadMore={() => void movements.loadMore()} onRetry={movements.refresh} sku={detail.sku} /> : <EmptyState title="Chưa có lịch sử mẫu" detail="Biến động tồn chỉ hiển thị trong chế độ dữ liệu thật." /> : null}

        {activeTab === 'channels' ? liveMode ? <InventoryChannelEvidence entries={channels.entries} error={channels.error} loading={channels.loading} refreshing={channels.refreshing} onRefresh={channels.refresh} canManage={canManageChannels} /> : <EmptyState title="Chưa có dữ liệu kênh bán mẫu" detail="Tab này chỉ hiển thị các listing và bằng chứng đồng bộ từ backend." /> : null}
      </div>

      {mayAdjust ? <InventoryAdjustmentModal open={adjustmentOpen} sku={sku} currentOnHand={live.snapshot!.on_hand} version={live.snapshot!.version} submitting={adjustmentSubmitting} error={adjustmentError} onClose={() => setAdjustmentOpen(false)} onSubmit={(value) => void submitAdjustment(value)} /> : null}
    </section>
  );
}

function InventoryAdjustmentHistoryCard({
  entries,
  error,
  loading,
  onRetry,
  sku,
}: {
  entries: ReturnType<typeof useInventoryAdjustmentLedger>['entries'];
  error: unknown;
  loading: boolean;
  onRetry: () => void;
  sku: string;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-bold text-on-surface">Nhật ký thay đổi tồn kho</h2>
          <p className="mt-1 font-body text-body-sm text-graphite">Adjustment history đọc từ backend, newest first.</p>
        </div>
        <Button variant="secondary" size="sm" onClick={onRetry} loading={loading}>
          Làm mới
        </Button>
      </header>
      <div className="border-b border-outline-variant/30 bg-surface-container-low/40 px-5 py-2 font-body text-caption text-graphite">
        Cơ chế PostgreSQL row locking đảm bảo tính nhất quán của số liệu tồn kho.
      </div>
      {loading && entries.length === 0 ? (
        <div className="p-5">
          <LoadingState label="Đang tải nhật ký điều chỉnh…" />
        </div>
      ) : null}
      {!loading && error && entries.length === 0 ? (
        <div className="p-5">
          <ErrorState error={error} retry={onRetry} />
        </div>
      ) : null}
      {!loading && !error && entries.length === 0 ? (
        <p className="p-6 font-body text-body-sm text-graphite">SKU này chưa có biến động tồn kho.</p>
      ) : null}
      {entries.length > 0 ? (
        <>
          <div className="px-5 py-3 font-body text-caption text-graphite">
            Hiển thị {entries.length} adjustment từ server.
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full min-w-[700px] border-collapse text-left">
              <caption className="sr-only">Nhật ký thay đổi tồn kho của {sku}</caption>
              <thead>
                <tr className="h-10 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
                  <th className="px-5">Thời gian</th>
                  <th className="px-4">Thay đổi</th>
                  <th className="px-4">Trước → Sau</th>
                  <th className="px-4">Lý do</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-surface-container">
                {entries.map((entry) => (
                  <tr className="font-body text-body-sm hover:bg-surface-container-low/50" key={entry.id}>
                    <td className="whitespace-nowrap px-5 py-4 text-caption text-graphite">
                      {entry.created_at ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(entry.created_at)) : '—'}
                    </td>
                    <td className="px-4 py-4">
                      <strong className={`font-mono ${entry.delta < 0 ? 'text-error' : 'text-badge-progress-text'}`}>
                        {entry.delta > 0 ? `+${entry.delta}` : entry.delta}
                      </strong>
                    </td>
                    <td className="px-4 py-4 font-mono text-caption text-graphite">
                      {entry.on_hand_before} → {entry.on_hand_after}
                    </td>
                    <td className="px-4 py-4 font-body text-body-sm text-on-surface">
                      {entry.reason}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="grid gap-3 p-4 md:hidden">
            {entries.map((entry) => (
              <article className="grid gap-2 rounded-card bg-surface-container-low p-4 font-body text-body-sm" key={entry.id}>
                <div className="flex items-center justify-between">
                  <strong className={`font-mono ${entry.delta < 0 ? 'text-error' : 'text-badge-progress-text'}`}>
                    {entry.delta > 0 ? `+${entry.delta}` : entry.delta} chiếc
                  </strong>
                  <span className="text-caption text-graphite">
                    {entry.created_at ? new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(entry.created_at)) : '—'}
                  </span>
                </div>
                <p className="text-on-surface">{entry.reason}</p>
                <p className="font-mono text-caption text-graphite">Tồn: {entry.on_hand_before} → {entry.on_hand_after}</p>
              </article>
            ))}
          </div>
        </>
      ) : null}
    </Card>
  );
}

function InventoryStockAlerts({ onHand, reserved, safetyBuffer, available }: { onHand: number; reserved: number; safetyBuffer: number; available: number }) {
  const alerts: { icon: string; text: string; tone: string }[] = [];
  if (available <= 0) alerts.push({ icon: 'error', text: 'Đã hết hàng có thể bán.', tone: 'border-error bg-error-container text-on-error-container' });
  if (onHand > 0 && reserved > onHand / 2) alerts.push({ icon: 'lock_clock', text: 'Hàng đang giữ chiếm phần lớn tồn trong hệ thống.', tone: 'border-amber-300 bg-amber-50 text-amber-950' });
  if (onHand > 0 && safetyBuffer > onHand / 2) alerts.push({ icon: 'shield', text: 'Tồn đệm an toàn chiếm phần lớn tồn trong hệ thống.', tone: 'border-amber-300 bg-amber-50 text-amber-950' });
  return <Card className="grid gap-3 p-5">
    <div><h2 className="font-display text-lg font-bold text-on-surface">Cảnh báo tồn kho</h2><p className="mt-1 font-body text-caption text-graphite">Chỉ dựa trên số liệu Core hiện tại.</p></div>
    {alerts.length > 0 ? <ul className="grid gap-2">{alerts.map((alert) => <li key={alert.text} className={`flex items-start gap-2 rounded-control border px-3 py-2 font-body text-body-sm ${alert.tone}`}><span className="material-symbols-outlined text-base" aria-hidden="true">{alert.icon}</span>{alert.text}</li>)}</ul> : <p className="rounded-control bg-surface-container-low px-3 py-2 font-body text-body-sm text-graphite">Không có cảnh báo từ dữ liệu hiện có.</p>}
    <p className="font-body text-caption text-graphite">Hệ thống chưa cung cấp ngưỡng tồn thấp cho SKU này.</p>
  </Card>;
}

function detailFromInventorySnapshot(snapshot: InventorySnapshot): InventoryDetailFixture {
  const category = 'Chưa phân loại';
  const icon = 'inventory_2';
  return {
    sku: snapshot.sku,
    productName: snapshot.product_name || snapshot.sku,
    category,
    color: snapshot.variant_title || '—',
    size: '—',
    productId: snapshot.product_id,
    variantId: snapshot.variant_id,
    primaryMediaId: undefined,
    productStatus: undefined,
    isActive: true,
    updatedAt: snapshot.updated_at,
    barcode: '',
    icon,
    stock: { onHand: snapshot.on_hand, reserved: snapshot.reserved, safetyBuffer: snapshot.safety_buffer, availableToSell: snapshot.available_to_sell },
    movements: [],
    channels: [],
    warehouses: [],
    hasVelocityFixture: false,
  };
}
