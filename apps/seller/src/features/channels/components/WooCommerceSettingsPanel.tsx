import { useCallback, useEffect, useState } from 'react';
import type { Channel } from '../../../api/channels';
import { connectWooCommerceStore, disconnectWooCommerceStore, getWooCommerceStatus, getWooCommerceWebhookHealth, verifyWooCommerceStore, type WooCommerceStatus, type WooCommerceWebhookHealth } from '../../../api/woocommerce';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';

export function WooCommerceSettingsPanel({ channel, canManage, onUpdated }: { channel: Channel; canManage: boolean; onUpdated: () => void }) {
  const [status, setStatus] = useState<WooCommerceStatus | null>(null);
  const [health, setHealth] = useState<WooCommerceWebhookHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const current = await getWooCommerceStatus(signal);
      if (signal?.aborted) return;
      setStatus(current);
      if (current.channel_id === channel.id) {
        try { setHealth(await getWooCommerceWebhookHealth(channel.id, signal)); }
        catch (cause) { if (!signal?.aborted) setHealth(null); }
      } else setHealth(null);
    } catch (cause) {
      if (!signal?.aborted) setError(messageOf(cause));
    } finally { if (!signal?.aborted) setLoading(false); }
  }, [channel.id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const run = async (operation: () => Promise<WooCommerceStatus>) => {
    if (!canManage || busy) return;
    setBusy(true); setError(null);
    try { setStatus(await operation()); await load(); onUpdated(); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); setDisconnectOpen(false); }
  };

  const connected = status?.connected === true && status.channel_id === channel.id;
  const badge = connected ? { label: 'Đã xác minh', tone: 'success' as const }
    : status?.connection_status === 'error' ? { label: 'Có lỗi', tone: 'danger' as const }
      : { label: 'Chưa kết nối', tone: 'neutral' as const };

  return <div className="grid min-w-0 gap-5">
    <header><h2 className="font-display text-xl font-bold text-on-surface">Cấu hình cửa hàng</h2></header>
    <Card className="grid min-w-0 gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Thông tin kết nối</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Cửa hàng WooCommerce</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-graphite">Kết nối WordPress, kiểm tra trạng thái đồng bộ và quản lý các quyền của cửa hàng.</p></div>
        <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
      </header>
      {loading ? <LoadingState label="Đang kiểm tra kết nối WooCommerce…" /> : null}
      {!loading && error ? <ErrorState error={error} retry={() => void load()} /> : null}
      {!loading && !error && !status ? <EmptyState title="Chưa đọc được trạng thái" detail="Hãy tải lại trạng thái từ backend." /> : null}
      {status ? <>
        <section className="grid min-w-0 gap-3 rounded-control border border-outline-variant/50 p-4">
          <h3 className="font-body text-sm font-semibold text-on-surface">Cửa hàng</h3>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Fact label="Tên cửa hàng" value={status.store_name || channel.name} />
            <Fact label="Địa chỉ cửa hàng" value={status.store_origin || 'Chưa xác minh'} />
            <Fact label="Môi trường" value="Cửa hàng phát triển · tự host" />
            <Fact label="Nền tảng · phiên bản" value={status.connected ? `WooCommerce ${status.wc_version ?? '—'} · WordPress ${status.wp_version ?? '—'}` : 'Chưa xác minh'} />
            <Fact label="Tiền tệ · Core" value={`${status.currency ?? '—'} · ${status.core_currency ?? '—'} · ${status.currency_compatible ? 'tương thích' : 'chưa khớp'}`} />
            <Fact label="Xác thực" value={status.auth_mode === 'basic_tls' ? 'HTTP Basic qua TLS' : status.auth_mode === 'oauth1a_header' ? 'OAuth 1.0a qua header' : 'Chưa cấu hình'} />
            <Fact label="Xác minh gần nhất" value={formatTime(status.last_verified_at)} />
            <Fact label="Thông tin đăng nhập API" value={status.configured ? 'Được lưu an toàn ở máy chủ' : 'Chưa cấu hình ở máy chủ'} />
            <Fact label="Lỗi kết nối gần nhất" value={status.last_error_code || 'Không có'} />
          </dl>
        </section>
        <section className="grid min-w-0 gap-3 rounded-control border border-outline-variant/50 p-4">
          <h3 className="font-body text-sm font-semibold text-on-surface">Quyền và đồng bộ</h3>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Fact label="Đọc sản phẩm" value={status.capabilities.products_read ? 'Đã bật' : 'Chưa sẵn sàng'} />
            <Fact label="Nhập đơn hàng" value={status.capabilities.orders_read ? 'Đã bật' : 'Chưa sẵn sàng'} />
            <Fact label="Tiền tệ VND" value={status.capabilities.currency_vnd ? 'Đã xác minh' : 'Chưa khớp'} />
            <Fact label="Cập nhật tồn kho" value={status.write_enabled ? 'Được bật · cần liên kết SKU đã xác minh' : 'Đang tắt'} />
            <Fact label="Cập nhật sản phẩm" value={status.product_write_enabled ? 'Được bật' : 'Đang tắt'} />
            <Fact label="Cập nhật đơn hàng" value={status.order_write_enabled ? 'Được bật' : 'Chưa hỗ trợ'} />
            <Fact label="Nhập và đối soát đơn" value={status.order_import_enabled ? 'Được bật' : 'Đang tắt'} />
            <Fact label="Webhook callback" value={status.callback_configured ? 'Đã cấu hình' : 'Chưa cấu hình'} />
          </dl>
        </section>
      </> : null}
      {canManage ? <div className="flex flex-wrap gap-2 border-t border-outline-variant/50 pt-4">
        {!connected ? <Button size="sm" loading={busy} disabled={loading} onClick={() => void run(connectWooCommerceStore)}>Kết nối cửa hàng</Button> : null}
        <Button variant="secondary" size="sm" loading={busy} disabled={loading || !status?.enabled} onClick={() => void run(verifyWooCommerceStore)}>Kiểm tra kết nối</Button>
        {connected ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDisconnectOpen(true)}>Ngắt kết nối</Button> : null}
      </div> : <p className="border-t border-outline-variant/50 pt-4 text-xs leading-5 text-graphite">Nhân viên có thể xem trạng thái. Chỉ quản trị viên mới được kết nối hoặc ngắt kết nối cửa hàng.</p>}
      {status?.last_error_code ? <p role="status" className="rounded-control bg-error-container/40 p-3 text-sm text-error">Lỗi kết nối gần nhất: {status.last_error_code}</p> : null}
    </Card>

    <Card className="grid min-w-0 gap-3 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Thông báo và khôi phục đơn hàng</p><h3 className="mt-1 font-display text-base font-bold text-on-surface">Webhook và đồng bộ dự phòng</h3></div><StatusBadge tone={health?.active ? 'success' : health?.status === 'partial' ? 'warning' : ['unavailable', 'error'].includes(health?.status ?? '') ? 'danger' : 'neutral'}>{webhookLabel(health?.status)}</StatusBadge></header>
      {health ? <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        <Fact label="Chủ đề webhook đang hoạt động" value={health.active_topics.join(', ') || 'Chưa có'} />
        <Fact label="Địa chỉ nhận webhook" value={health.callback_configured ? 'Đã cấu hình ở máy chủ' : 'Chưa cấu hình'} />
        <Fact label="Nhận thông báo thành công gần nhất" value={formatTime(health.last_successful_at)} />
        <Fact label="Thông báo lỗi / bị chặn" value={`${health.failed_receipts} cần thử lại · ${health.dead_receipts} bị chặn`} />
        <Fact label="Đồng bộ dự phòng" value={health.polling_enabled ? `Đang bật · lần chạy ${formatTime(health.last_poll_at)}` : 'Đang tắt'} />
        <Fact label="Lỗi đồng bộ gần nhất" value={health.poll_error_code || 'Không có'} />
      </dl> : <p className="text-sm leading-6 text-graphite">Chưa có dữ liệu webhook. OctoFlow lưu các thông báo đã nhận và dùng đồng bộ dự phòng để phát hiện đơn hàng.</p>}
      {health && !health.active && health.polling_enabled ? <p className="rounded-control bg-surface-container-low p-3 text-xs leading-5 text-graphite">Webhook đang tắt hoặc chưa đầy đủ. Đồng bộ dự phòng vẫn hoạt động nên đơn mới có thể được phát hiện trễ theo chu kỳ.</p> : null}
    </Card>

    <Modal open={disconnectOpen} onClose={() => setDisconnectOpen(false)} title="Ngắt kết nối WooCommerce?" description="OctoFlow sẽ ngừng nhận và đồng bộ đơn hàng, tồn kho từ cửa hàng này. Lịch sử thông báo và liên kết SKU vẫn được giữ lại." footer={<><Button variant="ghost" onClick={() => setDisconnectOpen(false)}>Hủy</Button><Button variant="danger" loading={busy} onClick={() => void run(disconnectWooCommerceStore)}>Ngắt kết nối</Button></>}>
      <p className="text-sm leading-6 text-graphite">Thao tác này không xóa WordPress, WooCommerce hoặc dữ liệu cửa hàng.</p>
    </Modal>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-graphite">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-on-surface">{value}</dd></div>; }
function formatTime(value?: string | null): string { if (!value) return 'Chưa có'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Không thể tải trạng thái WooCommerce.'; }
function webhookLabel(status?: string) { return ({ healthy: 'Đang hoạt động', active: 'Đang hoạt động', partial: 'Hoạt động một phần', unavailable: 'Chưa sẵn sàng', error: 'Cần kiểm tra', disconnected: 'Chưa kết nối', disabled: 'Đang tắt' } as Record<string, string>)[status ?? ''] ?? 'Chưa xác minh'; }
