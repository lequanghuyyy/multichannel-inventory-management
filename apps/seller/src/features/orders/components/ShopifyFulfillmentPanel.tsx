import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { createShopifyFulfillment, getShopifyFulfillmentStatus, getShopifyStatus, reportShopifyOrderProgress, type ShopifyFulfillmentView } from '../../../api/shopify';
import { useAuth } from '../../auth/AuthProvider';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

function timestamp(value?: string): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? '—' : date.toLocaleString('vi-VN');
}

const syncLabels: Record<string, string> = {
  in_sync: 'Đã xác minh trên Shopify', pending: 'Đang chờ đồng bộ',
  failed: 'Đồng bộ thất bại', blocked: 'Cần xử lý trên Shopify',
  conflict: 'Dữ liệu không khớp', not_applicable: 'Trạng thái nội bộ OctoFlow',
};

const coreLabels: Record<string, string> = {
  placed: 'Mới đặt', confirmed: 'Đã xác nhận', packed: 'Đã đóng gói',
  shipped: 'Đã bàn giao vận chuyển', delivered: 'Đã giao tới khách', cancelled: 'Đã hủy',
};

const fulfillmentLabels: Record<string, string> = {
  OPEN: 'Chưa thực hiện', UNFULFILLED: 'Chưa fulfillment', IN_PROGRESS: 'Đang thực hiện',
  ON_HOLD: 'Đang tạm dừng', PARTIALLY_FULFILLED: 'Fulfillment một phần',
  FULFILLED: 'Đã fulfillment', UNKNOWN: 'Chưa xác minh',
};

const reasonLabels: Record<string, string> = {
  MISSING_SCOPE: 'Thiếu quyền Shopify. Kiểm tra quyền đọc/ghi fulfillment và write_fulfillments cho mốc đã giao.',
  AUTH_REJECTED: 'Shopify từ chối thông tin kết nối. Kết nối lại cửa hàng.',
  SHOP_NOT_PERMITTED: 'Ứng dụng chưa được phép thao tác với cửa hàng này.',
  SHOPIFY_CHANNEL_NOT_CONNECTED: 'Kết nối cửa hàng Shopify chưa được xác minh. Kiểm tra kênh Shopify.',
  SHOPIFY_UNAVAILABLE: 'Cấu hình Shopify chưa sẵn sàng. Kiểm tra SHOPIFY_ENABLED và kết nối cửa hàng.',
  SHOPIFY_ORDER_MAPPING_MISSING: 'Chưa có Shopify Order GID hợp lệ cho đơn này. Kiểm tra mapping đơn.',
  ORDER_PROGRESS_WRITE_DISABLED: 'Bật SHOPIFY_WRITE_ENABLED để gửi cập nhật.',
  SHOPIFY_ORDER_ON_HOLD: 'Đơn đang tạm dừng trên Shopify. Gỡ hold trên Shopify trước.',
  FULFILLMENT_LOCATION_MISMATCH: 'Location của Shopify không khớp cấu hình OctoFlow.',
  FULFILLMENT_QUANTITY_MISMATCH: 'Số lượng dòng hàng Core và Shopify không khớp.',
  FULFILLMENT_MAPPING_INCOMPLETE: 'Thiếu mapping biến thể sản phẩm Shopify.',
  FULFILLMENT_ORDER_MISSING: 'Shopify chưa có FulfillmentOrder phù hợp cho đơn này.',
  FULFILLMENT_ORDER_ID_INVALID: 'Shopify trả về FulfillmentOrder GID không hợp lệ.',
  SHOPIFY_ORDER_ALREADY_FULFILLED: 'Shopify báo đơn đã fulfillment; cần xác minh đủ dòng hàng và location trước khi đối soát.',
  FULFILLMENT_PROGRESS_REJECTED: 'Shopify từ chối cập nhật tiến độ. Kiểm tra quyền fulfill_and_ship_orders và trạng thái đơn.',
  FULFILLMENT_PROGRESS_READBACK_MISMATCH: 'Shopify chưa xác nhận tiến độ khi đọc lại; hệ thống sẽ thử lại.',
  DELIVERY_EVENT_REJECTED: 'Shopify từ chối ghi nhận đã giao. Kiểm tra quyền write_fulfillments và trạng thái fulfillment.',
  DELIVERY_READBACK_MISMATCH: 'Shopify chưa xác nhận mốc đã giao khi đọc lại; hệ thống sẽ thử lại.',
  SHIPMENT_EVENT_REJECTED: 'Shopify từ chối ghi nhận mốc vận chuyển. Kiểm tra quyền write_fulfillments và trạng thái fulfillment.',
  SHIPMENT_READBACK_MISMATCH: 'Shopify chưa xác nhận mốc vận chuyển khi đọc lại; hệ thống sẽ thử lại.',
  PROGRESS_LEASE_EXPIRED: 'Lần xử lý trước bị gián đoạn. Quản trị viên có thể thử lại.',
  RATE_LIMITED: 'Shopify giới hạn tốc độ; hệ thống sẽ thử lại.',
  REMOTE_TIMEOUT: 'Shopify không phản hồi kịp; hệ thống sẽ thử lại.',
  TEMPORARY: 'Shopify tạm thời không sẵn sàng; hệ thống sẽ thử lại.',
};

function reasonLabel(code?: string): string {
  if (!code) return '';
  if (reasonLabels[code]) return reasonLabels[code];
  if (code.startsWith('SHOPIFY_GQL_')) {
    return `Shopify từ chối cập nhật (${code.slice('SHOPIFY_GQL_'.length)}). Kiểm tra trạng thái fulfillment, location và các dòng hàng của đơn.`;
  }
  return code;
}

export function ShopifyFulfillmentPanel({ orderId, coreStatus, onUpdated }: { orderId: string; coreStatus: string; onUpdated?: () => void }) {
  const auth = useAuth();
  const canManage = auth?.user?.role === 'ADMIN';
  const [view, setView] = useState<ShopifyFulfillmentView | null>(null);
  const [shopDomain, setShopDomain] = useState('');
  const [writeEnabled, setWriteEnabled] = useState(false);
  const [confirmShipment, setConfirmShipment] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [progressSubmitting, setProgressSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    if (view?.progress_state !== 'pending' && view?.progress_state !== 'processing' &&
      !(view?.progress_state === 'failed' && view.progress_attempt_count < 8)) return;
    const timer = window.setTimeout(() => setRefresh((value) => value + 1),
      view?.progress_state === 'failed' ? 30_000 : 5_000);
    return () => window.clearTimeout(timer);
  }, [view?.progress_state, view?.progress_attempt_count, refresh]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void Promise.allSettled([
      getShopifyFulfillmentStatus(orderId, controller.signal),
      getShopifyStatus(controller.signal),
    ]).then(([fulfillment, status]) => {
      if (controller.signal.aborted) return;
      if (fulfillment.status === 'fulfilled') setView(fulfillment.value);
      else setError(fulfillment.reason);
      if (status.status === 'fulfilled') {
        setShopDomain(status.value.shop_domain ?? '');
        setWriteEnabled(status.value.write_enabled);
      }
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [orderId, coreStatus, refresh]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!confirmShipment) {
      setConfirmShipment(true);
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await createShopifyFulfillment(orderId, {});
      setView(await getShopifyFulfillmentStatus(orderId));
      setConfirmShipment(false);
      onUpdated?.();
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  };

  const reportProgress = async () => {
    setProgressSubmitting(true);
    setError(null);
    try {
      await reportShopifyOrderProgress(orderId);
      setView(await getShopifyFulfillmentStatus(orderId));
    } catch (cause) {
      setError(cause);
    } finally {
      setProgressSubmitting(false);
    }
  };

  const reconcileExistingFulfillment = async () => {
    setSubmitting(true);
    setError(null);
    try {
      await createShopifyFulfillment(orderId, {});
      setView(await getShopifyFulfillmentStatus(orderId));
      onUpdated?.();
    } catch (cause) {
      setError(cause);
    } finally {
      setSubmitting(false);
    }
  };

  const numericOrderID = view?.shopify_order_id.split('/').pop();
  const shopifyURL = shopDomain.endsWith('.myshopify.com') && numericOrderID && /^\d+$/.test(numericOrderID)
    ? `https://${shopDomain}/admin/orders/${numericOrderID}` : undefined;

  return <Card className="grid gap-4 p-4 sm:p-5" aria-label="Shopify fulfillment">
    <header>
      <h2 className="font-display text-lg font-bold text-on-surface">Shopify fulfillment</h2>
      <p className="mt-1 text-xs leading-5 text-graphite">Theo dõi riêng trạng thái xử lý OctoFlow và fulfillment Shopify. Fulfillment không xác nhận thanh toán hoặc đã giao tới khách.</p>
    </header>
    {loading ? <LoadingState label="Đang đọc Shopify fulfillment…" /> : null}
    {!loading && error && !view ? <ErrorState error={error} retry={() => setRefresh((value) => value + 1)} /> : null}
    {view ? <>
      <dl className="grid gap-3 text-xs sm:grid-cols-3">
        <div><dt className="text-graphite">Xử lý tại OctoFlow</dt><dd className="mt-1 font-semibold text-on-surface">{coreLabels[view.core_status] || view.core_status}</dd></div>
        <div><dt className="text-graphite">Fulfillment Shopify</dt><dd className="mt-1 font-semibold text-on-surface">{fulfillmentLabels[view.shopify_fulfillment_status] || view.shopify_fulfillment_status || 'Chưa xác minh'}{view.shopify_delivery_status === 'DELIVERED' ? ' · Đã giao tới khách' : view.shopify_shipment_status === 'IN_TRANSIT' ? ' · Đang vận chuyển' : ''}</dd></div>
        <div><dt className="text-graphite">Đồng bộ</dt><dd className="mt-1"><StatusBadge tone={view.sync_state === 'in_sync' ? 'success' : 'warning'}>{syncLabels[view.sync_state] || view.sync_state}</StatusBadge></dd></div>
        <div><dt className="text-graphite">Core / Shopify Order GID</dt><dd className="mt-1 break-all font-mono text-on-surface">{view.order_id}<br />{view.shopify_order_id}</dd></div>
        {view.fulfillment_order_ids?.length ? <div><dt className="text-graphite">FulfillmentOrder GID</dt><dd className="mt-1 break-all font-mono text-on-surface">{view.fulfillment_order_ids.join(', ')}</dd></div> : null}
        {view.progress_state ? <div><dt className="text-graphite">Yêu cầu đồng bộ</dt><dd className="mt-1 text-on-surface">{view.progress_state} · {view.progress_attempt_count} lần thử</dd></div> : null}
        {view.tracking_number ? <div><dt className="text-graphite">Tracking</dt><dd className="mt-1 break-all font-mono text-on-surface">{view.tracking_company} · {view.tracking_number}</dd></div> : null}
        {view.remote_fulfillment_id ? <div><dt className="text-graphite">Shopify Fulfillment GID</dt><dd className="mt-1 break-all font-mono text-on-surface">{view.remote_fulfillment_id}</dd></div> : null}
        {view.progress_verified_at ? <div><dt className="text-graphite">Tiến độ được xác minh</dt><dd className="mt-1 text-on-surface">{timestamp(view.progress_verified_at)}</dd></div> : null}
        {view.verified_at ? <div><dt className="text-graphite">Fulfillment được xác minh</dt><dd className="mt-1 text-on-surface">{timestamp(view.verified_at)}</dd></div> : null}
      </dl>
      {view.remote_read_error ? <p className="rounded-control bg-warning/10 p-3 text-xs text-on-surface">Chưa đọc được trạng thái Shopify hiện tại: {reasonLabels[view.remote_read_error] || view.remote_read_error}. Trạng thái OctoFlow vẫn được giữ.</p> : null}
      {view.progress_state === 'failed' && view.progress_attempt_count < 8 ? <p className="rounded-control bg-warning/10 p-3 text-xs text-on-surface">Shopify chưa xác nhận cập nhật; hệ thống đang thử lại{view.progress_next_attempt_at ? ` sau ${timestamp(view.progress_next_attempt_at)}` : ''}.</p> : null}
      {view.progress_error_code && !view.progress_synchronized ? <p className="text-xs text-danger">{reasonLabel(view.progress_error_code)}</p> : null}
      {view.progress_synchronized ? <p className="rounded-control bg-success/10 p-3 text-xs text-on-surface">Shopify đã xác nhận đơn đang được xử lý. Đây là trạng thái fulfillment; chưa có nghĩa đơn đã giao cho khách.</p> : null}
      {canManage && (['failed', 'blocked', 'conflict'].includes(view.progress_state || '') ||
        (view.progress_eligible && (!view.progress_state || view.progress_state === 'verified'))) ? <div className="grid gap-2 rounded-control bg-surface-container-low p-3">
        <p className="text-xs leading-5 text-graphite">Sau khi xử lý nguyên nhân, yêu cầu hệ thống đọc lại Shopify và thử đồng bộ an toàn.</p>
        {writeEnabled ? <Button type="button" size="sm" loading={progressSubmitting} disabled={submitting} onClick={() => void reportProgress()}>Thử đồng bộ lại</Button> : <p className="text-xs text-danger">Bật SHOPIFY_WRITE_ENABLED trước khi thử lại.</p>}
      </div> : null}
      {canManage && view.core_status === 'shipped' && view.fulfillment_recovery_eligible ? <div className="grid gap-2 rounded-control bg-success/10 p-3">
        <p className="text-xs leading-5 text-on-surface">Shopify đã xác nhận fulfillment hoàn tất và khớp dòng hàng, location. Đối soát sẽ ghi nhận fulfillment hiện có vào OctoFlow, không tạo fulfillment mới.</p>
        <Button type="button" size="sm" loading={submitting} disabled={submitting} onClick={() => void reconcileExistingFulfillment()}>Đối soát fulfillment đã có</Button>
      </div> : null}
      {view.progress_blocked_reason === 'SHOPIFY_ORDER_ON_HOLD' ? <p className="rounded-control bg-warning/10 p-3 text-xs text-on-surface">Đơn đang tạm dừng trên Shopify. Hãy gỡ trạng thái tạm dừng ở Shopify rồi thử đồng bộ lại; OctoFlow không tự gỡ hold.</p> : null}
      {view.progress_blocked_reason && view.progress_blocked_reason !== 'SHOPIFY_ORDER_ON_HOLD' && ['confirmed', 'packed'].includes(view.core_status) ? <p className="rounded-control bg-warning/10 p-3 text-xs text-on-surface">{reasonLabels[view.progress_blocked_reason] || view.progress_blocked_reason}</p> : null}
      {view.record_state === 'succeeded' && shopifyURL ? <a className="text-xs font-semibold text-secondary underline" href={shopifyURL} target="_blank" rel="noreferrer">Mở đơn hàng trên Shopify</a> : null}
      {canManage && view.eligible && writeEnabled && view.record_state !== 'succeeded' && view.progress_state !== 'pending' && view.progress_state !== 'processing' ? <form className="grid gap-3 rounded-control bg-surface-container-low p-3 sm:grid-cols-2" onSubmit={(event) => void submit(event)}>
        <p className="text-xs leading-5 text-graphite sm:col-span-2">Chỉ gửi khi Core đã giao hàng và Shopify xác nhận mapping, location cùng số lượng. Quyền fulfillment được kiểm tra khi gửi; thành công cần read-back độc lập. Không cần hãng vận chuyển hoặc mã vận đơn; có thể bổ sung sau.</p>
        {confirmShipment ? <p className="sm:col-span-2 rounded-control bg-warning/10 p-2 text-xs">Xác nhận tạo fulfillment cho {view.shopify_order_id} mà chưa kèm tracking information.</p> : null}
        <div className="sm:col-span-2"><Button type="submit" size="sm" loading={submitting} disabled={submitting}>{confirmShipment ? 'Xác nhận tạo fulfillment Shopify' : 'Kiểm tra trước khi gửi'}</Button></div>
      </form> : null}
      {view.blocked_reason && view.core_status === 'shipped' ? <p className="text-xs text-graphite">Điều kiện fulfillment: {reasonLabels[view.blocked_reason] || view.blocked_reason}</p> : null}
      {view.safe_error_code ? <p className="text-xs text-danger">{reasonLabel(view.safe_error_code)}</p> : null}
    </> : null}
    {error && view ? <p role="alert" className="text-xs text-danger">{error instanceof Error ? error.message : 'Shopify fulfillment failed'}</p> : null}
  </Card>;
}
