import { useCallback, useEffect, useState } from 'react';
import type { Channel } from '../../../api/channels';
import {
  disconnectWooCommerceChannel,
  getWooCommerceChannelStatus,
  verifyWooCommerceChannel,
  type WooCommerceChannelStatus,
} from '../../../api/woocommerce';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Modal } from '../../../components/ui/Modal';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';

export function WooCommerceSettingsPanel({ channel, canManage, onUpdated }: { channel: Channel; canManage: boolean; onUpdated: () => void }) {
  const [status, setStatus] = useState<WooCommerceChannelStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [disconnectOpen, setDisconnectOpen] = useState(false);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const current = await getWooCommerceChannelStatus(channel.id, signal);
      if (!signal?.aborted) setStatus(current);
    } catch (cause) {
      if (!signal?.aborted) setError(messageOf(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const run = async (operation: () => Promise<WooCommerceChannelStatus>) => {
    if (!canManage || busy) return;
    setBusy(true); setError(null);
    try {
      setStatus(await operation());
      await load();
      onUpdated();
    } catch (cause) {
      setError(messageOf(cause));
    } finally {
      setBusy(false);
      setDisconnectOpen(false);
    }
  };

  const verified = status?.connection_verified === true;
  const badge = verified ? { label: 'Kết nối đã xác minh', tone: 'success' as const }
    : status?.connection_status === 'error' ? { label: 'Có lỗi kết nối', tone: 'danger' as const }
      : { label: 'Chưa xác minh', tone: 'neutral' as const };

  return <div className="grid min-w-0 gap-5">
    <header><h2 className="font-display text-xl font-bold text-on-surface">Cấu hình cửa hàng</h2></header>
    <Card className="grid min-w-0 gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Kết nối WooCommerce</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">{status?.store_name || channel.name}</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-graphite">Kết nối chỉ được coi là đã xác minh sau khi backend đọc được sản phẩm qua WooCommerce REST API <code className="font-mono text-xs">wc/v3</code>. Kết nối không đồng nghĩa với quyền ghi tồn kho.</p></div>
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
            <Fact label="Địa chỉ cửa hàng" value={status.store_url || 'Chưa xác minh'} />
            <Fact label="Môi trường" value={status.environment || channel.environment || '—'} />
            <Fact label="Nền tảng · phiên bản" value={status.connection_verified ? `WooCommerce ${status.wc_version ?? '—'} · WordPress ${status.wp_version ?? '—'}` : 'Chưa xác minh'} />
            <Fact label="REST API" value={status.api_version || '—'} />
            <Fact label="Xác thực" value={authLabel(status.auth_mode)} />
            <Fact label="Xác minh gần nhất" value={formatTime(status.connection_verified_at)} />
            <Fact label="Kiểm tra gần nhất" value={formatTime(status.checked_at)} />
            <Fact label="Connector" value={status.connector || 'woocommerce'} />
          </dl>
        </section>
        <section className="grid min-w-0 gap-3 rounded-control border border-outline-variant/50 p-4">
          <h3 className="font-body text-sm font-semibold text-on-surface">Quyền đọc và ghi</h3>
          <dl className="grid min-w-0 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <Fact label="Đọc sản phẩm WooCommerce" value={status.products_read && status.read_available ? 'Đã xác minh' : 'Chưa sẵn sàng'} />
            <Fact label="Đọc và xác minh mapping" value={status.read_available ? 'Sẵn sàng' : 'Bị chặn'} />
            <Fact label="Cờ ghi tồn kho" value={status.inventory_write_enabled ? 'Đang bật' : 'Đang tắt'} />
            <Fact label="Ghi tồn kho khả dụng" value={status.inventory_write_available ? 'Sẵn sàng' : 'Chưa sẵn sàng'} />
            <Fact label="Mapping đã xác minh" value={`${(status.verified_mapping_count ?? 0).toLocaleString('vi-VN')} / ${(status.mapping_count ?? 0).toLocaleString('vi-VN')}`} />
            <Fact label="Listing lệch / mapping lỗi" value={`${(status.drift_count ?? 0).toLocaleString('vi-VN')} / ${(status.mapping_error_count ?? 0).toLocaleString('vi-VN')}`} />
          </dl>
          <p className="rounded-control bg-surface-container-low p-3 text-xs leading-5 text-graphite">
            {status.inventory_write_enabled
              ? 'Cờ ghi tồn kho đang bật. Mỗi lần ghi vẫn phải có mapping đã xác minh, đúng SKU và bật quản lý tồn kho trên WooCommerce; backend gửi số tuyệt đối và đọc lại để xác minh.'
              : 'Cờ ghi tồn kho đang tắt. Kênh chỉ đọc và xác minh mapping; không có lệnh ghi nào được gửi tới WooCommerce.'}
          </p>
        </section>
        <section className="grid min-w-0 gap-3 rounded-control border border-outline-variant/50 p-4">
          <h3 className="font-body text-sm font-semibold text-on-surface">Chưa hỗ trợ trong giai đoạn này</h3>
          <p className="text-sm leading-6 text-graphite">OctoFlow chưa nhập đơn hàng, chưa dùng webhook và chưa tạo/đăng bán sản phẩm trên WooCommerce. Các màn hình cũ cho đơn hàng hoặc đăng bán không phải bằng chứng về kết nối này.</p>
        </section>
      </> : null}
      {status?.last_error_code || status?.last_error_message ? <p role="status" className="rounded-control bg-error-container/40 p-3 text-sm text-error">Lỗi gần nhất: {status.last_error_code || 'WOO_ERROR'}{status.last_error_message ? ` · ${status.last_error_message}` : ''}</p> : null}
      {status && !status.connector_enabled ? <p role="status" className="rounded-control bg-surface-container-low p-3 text-sm text-graphite">Connector WooCommerce đang tắt ở backend. Bật <code className="font-mono text-xs">WOOCOMMERCE_ENABLED</code> và cấu hình credentials trên máy chủ.</p> : null}
      {status && status.connector_enabled && !status.connector_configured ? <p role="status" className="rounded-control bg-surface-container-low p-3 text-sm text-graphite">Connector đã bật nhưng chưa có đủ thông tin xác thực trên máy chủ.</p> : null}
      {status && !status.environment_allowed ? <p role="status" className="rounded-control bg-error-container/40 p-3 text-sm text-error">Môi trường của kênh không nằm trong danh sách được phép của connector.</p> : null}
      {canManage ? <div className="flex flex-wrap gap-2 border-t border-outline-variant/50 pt-4">
        <Button variant="secondary" size="sm" loading={busy} disabled={loading || !status?.connector_enabled} onClick={() => void run(() => verifyWooCommerceChannel(channel.id))}>Kiểm tra kết nối</Button>
        {verified ? <Button variant="ghost" size="sm" disabled={busy} onClick={() => setDisconnectOpen(true)}>Ngắt kết nối</Button> : null}
      </div> : <p className="border-t border-outline-variant/50 pt-4 text-xs leading-5 text-graphite">Nhân viên có thể xem trạng thái. Chỉ quản trị viên mới được xác minh hoặc ngắt kết nối cửa hàng.</p>}
    </Card>

    <Modal open={disconnectOpen} onClose={() => setDisconnectOpen(false)} title="Ngắt kết nối WooCommerce?" description="OctoFlow sẽ xóa trạng thái xác minh kết nối của kênh này. Mapping và bằng chứng tồn kho vẫn được giữ lại." footer={<><Button variant="ghost" onClick={() => setDisconnectOpen(false)}>Hủy</Button><Button variant="danger" loading={busy} onClick={() => void run(() => disconnectWooCommerceChannel(channel.id))}>Ngắt kết nối</Button></>}>
      <p className="text-sm leading-6 text-graphite">Thao tác này chỉ thay đổi dữ liệu cục bộ trong OctoFlow. Không có dữ liệu WordPress hoặc WooCommerce nào bị xóa.</p>
    </Modal>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-graphite">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-on-surface">{value}</dd></div>;
}

function authLabel(mode?: string | null): string {
  if (mode === 'basic_tls') return 'HTTP Basic qua TLS';
  if (mode === 'query_tls') return 'Query key qua TLS';
  if (mode === 'oauth1_dev_http' || mode === 'query_dev_http') return 'OAuth 1.0a · HTTP dev host';
  return 'Chưa xác minh';
}

function formatTime(value?: string | null): string {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : 'Không thể tải trạng thái WooCommerce.';
}
