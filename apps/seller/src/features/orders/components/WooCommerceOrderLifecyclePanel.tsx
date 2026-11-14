import { useEffect, useState } from 'react';
import { getWooCommerceOrderLifecycle, retryWooCommerceOrderLifecycle, type WooCommerceOrderLifecycle } from '../../../api/woocommerce';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { ApiOrderStatus } from '../order.api';

const coreStatusLabels: Record<string, string> = {
  placed: 'Mới đặt', confirmed: 'Đã xác nhận', packed: 'Đã đóng gói', shipped: 'Đang giao',
  delivered: 'Đã giao', cancelled: 'Đã hủy',
};

const wooStatusLabels: Record<string, string> = {
  pending: 'Chờ thanh toán', 'on-hold': 'Tạm giữ', processing: 'Đang xử lý', completed: 'Hoàn tất',
  cancelled: 'Đã hủy', refunded: 'Đã hoàn tiền', failed: 'Thanh toán thất bại', trash: 'Thùng rác',
};

const fulfillmentStatusLabels: Record<string, string> = {
  confirmed: 'Đã xác nhận', packed: 'Đã đóng gói', shipped: 'Đang giao', delivered: 'Đã giao',
};

const syncLabels: Record<string, string> = {
  pending: 'Chờ đồng bộ', processing: 'Đang đồng bộ', verified: 'Đã xác minh', failed: 'Lỗi đồng bộ',
  blocked: 'Cần xử lý', conflict: 'Xung đột', not_eligible: 'Chưa đủ điều kiện cập nhật',
  superseded: 'WooCommerce đã đi trước Core', not_required: 'Chưa cần đồng bộ', not_tracked: 'Chưa có lần đồng bộ',
};

const errorLabels: Record<string, string> = {
  PAYMENT_NOT_CONFIRMED: 'Mốc xử lý đã được đồng bộ riêng. WooCommerce vẫn giữ trạng thái thanh toán hiện tại vì đơn chưa được xác nhận đã trả tiền.',
  REMOTE_NOT_READY_FOR_FULFILLMENT: 'WooCommerce chưa ở trạng thái sẵn sàng xử lý. OctoFlow giữ nguyên đơn và chưa ghi nhận bước đóng gói hoặc giao hàng.',
  REMOTE_COMPLETED_AHEAD: 'WooCommerce đã hoàn tất trước bước hiện tại của OctoFlow. Hệ thống giữ nguyên trạng thái WooCommerce.',
  REMOTE_ORDER_TERMINAL: 'Đơn WooCommerce đã hủy, hoàn tiền hoặc thất bại. OctoFlow không ghi đè trạng thái này.',
  REMOTE_ORDER_CHANGED: 'Trạng thái hoặc dấu xác minh trên WooCommerce đã thay đổi sau lần đồng bộ gần nhất. Kiểm tra đơn trước khi thử đồng bộ lại.',
  REMOTE_FULFILLMENT_AHEAD: 'WooCommerce đã ghi nhận mốc xử lý mới hơn. OctoFlow không ghi lùi mốc đó.',
  REMOTE_STATUS_UNSUPPORTED: 'Trạng thái WooCommerce hiện tại không nằm trong luồng hỗ trợ nên chưa được cập nhật.',
  CORE_STATUS_ADVANCED: 'Đơn đã chuyển sang bước mới hơn trong OctoFlow. Yêu cầu cũ đã được bỏ qua.',
  CHANNEL_OWNERSHIP_OR_CONNECTION: 'Kênh WooCommerce chưa kết nối hoặc không khớp cửa hàng đã liên kết.',
  REMOTE_ORDER_ID_INVALID: 'Chưa xác minh được mã đơn WooCommerce cần cập nhật.',
  ORDER_READBACK_MISMATCH: 'Dữ liệu đọc lại chưa khớp với yêu cầu. Kiểm tra đơn trên WooCommerce rồi thử lại.',
  ORDER_NOTE_READBACK_MISMATCH: 'WooCommerce chưa xác nhận ghi chú nội bộ. Hệ thống sẽ thử lại mà không tạo ghi chú trùng.',
  TIMEOUT: 'WooCommerce phản hồi quá thời gian. Hệ thống sẽ tự thử lại.',
  OFFLINE: 'Chưa kết nối được WooCommerce. Hệ thống sẽ tự thử lại.',
  RATE_LIMITED: 'WooCommerce đang giới hạn yêu cầu. Hệ thống sẽ tự thử lại.',
  UPSTREAM_5XX: 'WooCommerce đang gặp lỗi tạm thời. Hệ thống sẽ tự thử lại.',
  LIFECYCLE_LEASE_EXPIRED: 'Lần xử lý trước bị gián đoạn. Có thể thử lại để tiếp tục đối soát.',
};

function timestamp(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('vi-VN');
}

function syncTone(state: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (state === 'verified') return 'success';
  if (state === 'conflict' || state === 'failed' || state === 'blocked') return 'danger';
  if (state === 'not_eligible' || state === 'pending' || state === 'processing') return 'warning';
  return 'neutral';
}

function reasonLabel(code?: string): string {
  if (!code) return '';
  return errorLabels[code] ?? `Cần kiểm tra lại trạng thái trên WooCommerce (${code}).`;
}

export function WooCommerceOrderLifecyclePanel({ orderId, coreStatus }: { orderId: string; coreStatus: ApiOrderStatus }) {
  const [view, setView] = useState<WooCommerceOrderLifecycle | null>(null);
  const [loading, setLoading] = useState(true);
  const [retrying, setRetrying] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (view?.sync_state !== 'pending' && view?.sync_state !== 'processing' && view?.sync_state !== 'failed') return;
    const timer = window.setTimeout(() => setRefresh((value) => value + 1), view.sync_state === 'failed' ? 30_000 : 5_000);
    return () => window.clearTimeout(timer);
  }, [view?.sync_state, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getWooCommerceOrderLifecycle(orderId, controller.signal).then(setView).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [orderId, coreStatus, refresh]);

  const retry = async () => {
    setRetrying(true);
    setError(null);
    try {
      await retryWooCommerceOrderLifecycle(orderId);
      setRefresh((value) => value + 1);
    } catch (cause) {
      setError(cause);
    } finally {
      setRetrying(false);
    }
  };

  return <Card className="grid gap-3 border border-outline-variant/60 p-4 shadow-none" aria-label="Đồng bộ vòng đời WooCommerce">
    <header className="flex items-center justify-between gap-3">
      <div>
        <h2 className="font-display text-base font-bold text-on-surface">Trạng thái WooCommerce</h2>
        <p className="mt-0.5 text-xs text-graphite">Trạng thái thanh toán WooCommerce và tiến trình giao hàng OctoFlow được theo dõi riêng.</p>
      </div>
      <Button size="sm" variant="ghost" disabled={loading || retrying} onClick={() => setRefresh((value) => value + 1)}>
        Đọc lại
      </Button>
    </header>
    {loading && !view ? <LoadingState label="Đang đọc trạng thái WooCommerce…" /> : null}
    {!loading && error && !view ? <ErrorState error={error} retry={() => setRefresh((value) => value + 1)} /> : null}
    {view ? <>
      <dl className="grid gap-3 text-xs sm:grid-cols-2 xl:grid-cols-4">
        <div><dt className="text-graphite">Xử lý OctoFlow</dt><dd className="mt-1 font-semibold text-on-surface">{coreStatusLabels[view.core_status] ?? view.core_status}</dd></div>
        <div><dt className="text-graphite">Trạng thái WooCommerce</dt><dd className="mt-1 font-semibold text-on-surface">{wooStatusLabels[view.woocommerce_status ?? ''] ?? view.woocommerce_status ?? 'Chưa đọc được'}</dd></div>
        <div><dt className="text-graphite">Tiến trình trên WooCommerce</dt><dd className="mt-1 font-semibold text-on-surface">{fulfillmentStatusLabels[view.woocommerce_fulfillment_status ?? ''] ?? 'Chưa đồng bộ'}</dd></div>
        <div><dt className="text-graphite">Đồng bộ</dt><dd className="mt-1"><StatusBadge tone={syncTone(view.sync_state)}>{syncLabels[view.sync_state] ?? view.sync_state}</StatusBadge></dd></div>
      </dl>
      {view.error_code ? <p role="status" className="rounded-control bg-surface-container-low px-3 py-2 text-xs leading-5 text-on-surface">{reasonLabel(view.error_code)}</p> : null}
      {view.remote_read_state !== 'live' ? <p className="text-xs leading-5 text-graphite">{view.remote_read_state === 'last_verified'
        ? `Đang hiển thị lần đọc WooCommerce gần nhất: ${timestamp(view.last_verified_at)}.`
        : 'Chưa đọc được trạng thái trực tiếp từ WooCommerce.'}</p> : null}
      {view.last_verified_at ? <p className="text-xs text-graphite">Xác minh lần gần nhất: {timestamp(view.last_verified_at)}</p> : null}
      {error && view ? <p role="alert" className="text-xs text-danger">{error instanceof Error ? error.message : 'Không thể cập nhật trạng thái WooCommerce.'}</p> : null}
      {view.can_retry ? <div><Button size="sm" loading={retrying} disabled={loading} onClick={() => void retry()}>Thử đồng bộ lại</Button></div> : null}
    </> : null}
  </Card>;
}
