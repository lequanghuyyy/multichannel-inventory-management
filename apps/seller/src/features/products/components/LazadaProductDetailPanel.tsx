import { useEffect, useRef, useState } from 'react';
import { getLazadaStatus, type LazadaStatus } from '../../../api/lazada';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Button } from '../../../components/ui/Button';
import { Drawer } from '../../../components/ui/Drawer';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { ProductChannelNotice } from './ProductChannelUi';
import { LazadaPublicationPanel } from '../../channels/components/LazadaPublicationPanel';
import { LazadaProductPreflightPanel, type LazadaSetupSummary } from '../../channels/components/LazadaProductPreflightPanel';
import type { ProductApiDetail } from '../product.detail.api';

export function LazadaProductDetailPanel({ product, canWrite }: { product: ProductApiDetail; canWrite: boolean }) {
  const [status, setStatus] = useState<LazadaStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);
  const [setupOpen, setSetupOpen] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [publishReady, setPublishReady] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [summary, setSummary] = useState<LazadaSetupSummary | null>(null);
  const submitRef = useRef<(() => Promise<void>) | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getLazadaStatus(controller.signal).then(setStatus).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt]);

  const channelId = status?.connection?.channel_id;
  const connected = Boolean(status?.enabled && status.configured && status.connection?.status === 'connected' && channelId);
  const mayWrite = canWrite && Boolean(status?.product_write_enabled);
  const openSetup = () => { setPublishReady(false); setSetupOpen(true); };
  const confirmPublish = async () => {
    if (!publishReady || !submitRef.current || publishing) return;
    setPublishing(true);
    try { await submitRef.current(); } catch { /* The setup panel displays the actionable error. */ }
    finally { setPublishing(false); }
  };

  return <div className="grid gap-4">
    {loading ? <LoadingState label="Đang kiểm tra kết nối Lazada…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /> : null}

    {!loading && !error && connected && channelId ? <>
      <header className="flex flex-wrap items-end justify-between gap-3 border-b border-outline-variant/60 pb-4">
        <div><p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-octo-ember">HIỆN DIỆN TRÊN KÊNH</p><h2 className="mt-1 font-display text-xl font-bold text-on-surface">Đăng và đồng bộ</h2></div>
        <StatusBadge tone="success">Lazada đã kết nối</StatusBadge>
      </header>
      <LazadaPublicationPanel
        channelId={channelId}
        productId={product.id}
        currency={product.currency}
        canWrite={mayWrite}
        refreshToken={refreshToken}
        onEditFields={openSetup}
        onStartPublish={openSetup}
      />
      {!status?.product_write_enabled ? <ProductChannelNotice kind="warning">
        Đăng sản phẩm Lazada đang tắt trên server. Bạn vẫn xem được trạng thái và lịch sử; bật quyền ghi sản phẩm trước khi tạo hoặc cập nhật listing.
      </ProductChannelNotice> : null}

      <Drawer open={setupOpen} onClose={() => { if (!publishing) setSetupOpen(false); }} title="Thông tin riêng cho Lazada" description="Chọn ngành hàng và thương hiệu Lazada, kiểm tra thuộc tính, ảnh và kiện hàng trước khi đăng." className="max-w-4xl">
        <LazadaProductPreflightPanel
          channelId={channelId}
          product={product}
          canWrite={mayWrite}
          writeBlockedReason={!canWrite ? 'Chỉ quản trị viên được cấu hình và đăng sản phẩm Lazada.' : !status?.product_write_enabled ? 'Máy chủ chưa bật quyền ghi sản phẩm Lazada.' : undefined}
          onReadinessChange={setPublishReady}
          onSubmitReady={(submit) => { submitRef.current = submit; }}
          onSummaryChange={setSummary}
          onSaved={() => undefined}
          onQueued={() => { setSetupOpen(false); setRefreshToken((value) => value + 1); }}
        />
        <div className="mt-5 flex flex-col-reverse items-start justify-between gap-3 border-t border-outline-variant/60 pt-4 sm:flex-row sm:items-center">
          <Button variant="secondary" onClick={() => setSetupOpen(false)} disabled={publishing}>Quay lại sản phẩm</Button>
          <div className="text-right"><p className="mb-2 text-xs text-graphite">{publishReady ? 'Đã kiểm tra điều kiện đăng.' : 'Lưu và kiểm tra điều kiện trước khi xác nhận.'}</p><Button disabled={!mayWrite || !publishReady || publishing} loading={publishing} onClick={() => void confirmPublish()}>{summary?.operation === 'update' ? 'Xác nhận cập nhật Lazada' : 'Xác nhận đăng Lazada'}</Button></div>
        </div>
      </Drawer>
    </> : null}

    {!loading && !error && status?.connection && !connected ? <ProductChannelNotice kind="warning">
      {status.connection.status !== 'connected' ? `Gian hàng Lazada cần kết nối lại trước khi đọc ngành hàng và kiểm tra dữ liệu sản phẩm. Tình trạng: ${connectionStatusLabel(status.connection.status)}.` : 'Gian hàng đã lưu nhưng kết nối Lazada hiện chưa được bật hoặc cấu hình đầy đủ ở API.'}
    </ProductChannelNotice> : null}
    {!loading && !error && !status?.connection ? <ProductChannelNotice kind="info">
      {status?.enabled && status.configured ? 'Chưa có gian hàng Lazada được kết nối. Kết nối gian hàng trong mục Kênh bán để mở form thông tin Lazada.' : 'Lazada chưa được bật hoặc cấu hình ở API; form thông tin riêng chưa thể tải dữ liệu ngành hàng.'}
    </ProductChannelNotice> : null}
  </div>;
}

function connectionStatusLabel(status: string): string {
  return ({ connected: 'đã kết nối', disconnected: 'đã ngắt kết nối', reauthorization_required: 'cần ủy quyền lại', error: 'đang gặp lỗi kết nối' } as Record<string, string>)[status] ?? 'chưa được xác minh';
}
