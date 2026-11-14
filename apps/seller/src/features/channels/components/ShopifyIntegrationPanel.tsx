import { useEffect, useRef, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { Button } from '../../../components/ui/Button';
import { connectShopifyStore, getShopifyStatus, importShopifyMappings, reconcileShopifyOrders, verifyShopifyStore, type ShopifyMappingImport, type ShopifyStatus } from '../../../api/shopify';

export function ShopifyIntegrationPanel({ canManage, channelId, onUpdated, statusValue, statusLoading, onStatusChange, showMappingImport = true }: {
  canManage: boolean; channelId?: string; onUpdated?: () => void; statusValue?: ShopifyStatus | null; statusLoading?: boolean;
  onStatusChange?: (status: ShopifyStatus) => void; showMappingImport?: boolean;
}) {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<'connect' | 'verify' | 'import' | 'orders' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [importIssues, setImportIssues] = useState<ShopifyMappingImport['issues']>([]);
  const [attempt, setAttempt] = useState(0);
  const channelIdRef = useRef(channelId);
  const previousChannelId = useRef(channelId);
  channelIdRef.current = channelId;

  useEffect(() => {
    const controller = new AbortController();
    const channelChanged = previousChannelId.current !== channelId;
    previousChannelId.current = channelId;
    setStatus(null);
    setLoading(statusValue === undefined ? true : statusLoading ?? false);
    if (statusValue !== undefined) {
      setStatus(statusValue?.channel_id === channelId ? statusValue : null);
      setError(null);
      return () => controller.abort();
    }
    if (channelChanged) {
      setBusy(null);
      setMessage(null);
      setActionError(null);
      setImportIssues([]);
    }
    void getShopifyStatus(controller.signal).then((value) => {
      if (controller.signal.aborted || channelIdRef.current !== channelId) return;
      setStatus(channelId && value.channel_id !== channelId ? null : value);
      setError(null);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && channelIdRef.current === channelId) setError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái Shopify.');
    }).finally(() => {
      if (!controller.signal.aborted && channelIdRef.current === channelId) setLoading(false);
    });
    return () => controller.abort();
  }, [attempt, channelId, statusLoading, statusValue]);

  const run = async (action: 'connect' | 'verify' | 'import' | 'orders') => {
    if (busy) return;
    setBusy(action);
    setActionError(null);
    setMessage(null);
    setImportIssues([]);
    const requestedChannelId = channelId;
    try {
      if (action === 'connect') {
        const value = await connectShopifyStore();
        if (channelIdRef.current === requestedChannelId && (!requestedChannelId || value.channel_id === requestedChannelId)) { setStatus(value); onStatusChange?.(value); }
      }
      if (action === 'verify') {
        const value = await verifyShopifyStore();
        if (channelIdRef.current === requestedChannelId && (!requestedChannelId || value.channel_id === requestedChannelId)) { setStatus(value); onStatusChange?.(value); }
      }
      if (action === 'import') {
        const result = await importShopifyMappings();
        if (channelIdRef.current !== requestedChannelId) return;
        setMessage(`Đọc ${result.remote_variants} variant · đã ánh xạ ${result.mapped} · ${result.unmapped} chưa ghép · ${result.conflicts} xung đột · ${result.stale} cần xác minh lại.`);
        setImportIssues(result.issues);
      }
      if (action === 'orders') {
        const result = await reconcileShopifyOrders();
        if (channelIdRef.current !== requestedChannelId) return;
        setMessage(`Đối soát đơn Shopify hoàn tất · đã kiểm tra ${result.scanned} đơn. Kiểm tra trạng thái nhập và tồn kho trong Core.`);
      }
      if (channelIdRef.current === requestedChannelId) {
        setAttempt((value) => value + 1);
        onUpdated?.();
      }
    } catch (cause) {
      if (channelIdRef.current === requestedChannelId) {
        setActionError(cause instanceof Error ? cause.message : 'Shopify từ chối thao tác.');
        setAttempt((value) => value + 1);
      }
    } finally {
      if (channelIdRef.current === requestedChannelId) setBusy(null);
    }
  };

  const statusLabel = !status?.enabled ? 'Chưa bật cấu hình' : status.connected ? 'Đã xác minh' : status.channel_status === 'error' ? 'Lỗi kết nối' : 'Chưa kết nối';
  const statusTone = status?.connected ? 'text-emerald-800 bg-emerald-50' : status?.channel_status === 'error' ? 'text-red-800 bg-red-50' : 'text-graphite bg-surface-container-low';
  const webhook = webhookStatusInfo(status?.webhook_status);

  return (
    <Card className="grid gap-4 p-5" aria-label="Shopify Dev Store">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold text-on-surface">Shopify Dev Store</h2>
          <p className="mt-1 font-body text-caption text-graphite">Trạng thái lấy từ backend Shopify; không hiển thị dữ liệu mô phỏng.</p>
        </div>
        <span className={`rounded-full px-3 py-1 font-body text-xs font-semibold ${statusTone}`}>{loading ? 'Đang tải…' : statusLabel}</span>
      </div>

      {error ? <p role="alert" className="rounded-control bg-red-50 px-3 py-2 font-body text-caption text-red-800">{error}</p> : null}
      {actionError ? <p role="alert" className="rounded-control bg-red-50 px-3 py-2 font-body text-caption text-red-800">{actionError}</p> : null}
      {status?.last_error ? <p className="font-body text-caption text-red-800">Lỗi gần nhất: {status.last_error}</p> : null}
      {message ? <p role="status" className="font-body text-caption text-emerald-800">{message}</p> : null}

      <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section className="grid min-w-0 content-start gap-3 rounded-control border border-outline-variant/50 p-4"><h3 className="font-body text-sm font-semibold text-on-surface">Thông tin kết nối</h3><dl className="grid min-w-0 gap-3 sm:grid-cols-2"><Field label="Shop" value={status?.shop_name ?? 'Chưa xác minh'} /><Field label="Shop domain" value={status?.shop_domain ?? 'Chưa cấu hình'} /><Field label="Danh tính shop" value={status?.partner_development ? 'Development Store đã xác minh' : status?.shop_domain ? 'Chưa xác minh Development Store' : 'Chưa được xác minh'} /><Field label="Môi trường" value={status?.connected && status.environment === 'sandbox' ? 'sandbox · Development Store' : status?.partner_development && status.last_verified_at ? 'sandbox đã xác minh trước đó · cần kiểm tra lại kết nối' : 'Chưa xác minh'} /><Field label="Kênh · API version" value={`${status?.channel_status ?? '—'} · ${status?.api_version ?? '—'}`} /><Field label="Lần xác minh gần nhất" value={formatDate(status?.last_verified_at)} /></dl></section>
        <div className="grid min-w-0 gap-4">
          <section className="grid min-w-0 content-start gap-3 rounded-control border border-outline-variant/50 p-4"><h3 className="font-body text-sm font-semibold text-on-surface">Cấu hình và trạng thái đồng bộ</h3><dl className="grid min-w-0 gap-3 sm:grid-cols-2"><Field label="Tiền tệ Shopify / Core" value={`${status?.shop_currency ?? '—'} / ${status?.core_currency ?? '—'} · ${status ? (status.currency_compatible ? 'tương thích' : 'không tương thích') : 'chưa kiểm tra'}`} /><Field label="Vị trí tồn kho" value={status?.location_configured ? 'Đã cấu hình · cần xác minh khi import' : 'Chưa cấu hình'} /><Field label="SKU đã ánh xạ / chưa ghép" value={`${status?.mapping_count ?? 0} / ${status?.unmapped_count ?? 0}`} /><Field label="Xung đột / cần xác minh lại" value={`${status?.conflict_count ?? 0} / ${status?.stale_mapping_count ?? 0}`} /><Field label="Tồn Shopify đã đẩy / đã báo" value={`${formatQuantity(status?.pushed_quantity)} / ${formatQuantity(status?.reported_quantity)}`} /><Field label="Lần đồng bộ xác nhận gần nhất" value={formatDate(status?.last_successful_sync)} /><Field label="Listing lệch" value={formatQuantity(status?.drift_count)} /><Field label="Order recovery gần nhất" value={formatDate(status?.order_polling_last_success)} /><Field label="Đơn nhập / cách ly / lỗi" value={`${formatQuantity(status?.order_polling_imported)} / ${formatQuantity(status?.order_polling_quarantined)} / ${formatQuantity(status?.order_polling_failed)}`} /></dl>{status?.order_polling_last_error ? <p className="text-xs text-red-800">Lỗi recovery gần nhất: {status.order_polling_last_error}</p> : null}</section>
          <section className="grid min-w-0 content-start gap-3 rounded-control border border-outline-variant/50 p-4"><div className="flex flex-wrap items-center gap-2"><h3 className="font-body text-sm font-semibold text-on-surface">Webhook</h3><span className="rounded-full bg-surface-container-low px-2 py-1 text-caption text-on-surface">{webhook.label}</span></div><p className="text-xs leading-5 text-graphite">Endpoint {status?.webhook_url_configured ? 'đã được cấu hình ở backend' : 'chưa được cấu hình ở backend'}. {webhook.hint}</p></section>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t border-outline-variant/50 pt-4">
        {canManage ? <>
          {!status?.connected ? <Button size="sm" loading={busy === 'connect'} disabled={loading || busy !== null || !status?.enabled} onClick={() => void run('connect')}>Kết nối Dev Store</Button> : null}
          {status?.connected ? <Button size="sm" variant="secondary" loading={busy === 'verify'} disabled={busy !== null} onClick={() => void run('verify')}>Kiểm tra kết nối</Button> : null}
          {showMappingImport ? <Button size="sm" variant="secondary" loading={busy === 'import'} disabled={busy !== null || !status?.connected || !status.location_configured} onClick={() => void run('import')}>Đọc và ghép SKU</Button> : null}
          <Button size="sm" variant="secondary" loading={busy === 'orders'} disabled={busy !== null || !status?.connected || !status.order_polling_enabled} onClick={() => void run('orders')}>Đối soát đơn Shopify</Button>
        </> : <p className="font-body text-caption text-graphite">Thao tác kết nối và ghép SKU dành cho quản trị viên.</p>}
        <span className="font-body text-caption text-graphite">Cờ ghi tồn kho backend: {status?.write_enabled ? 'được bật' : 'đang tắt'}</span>
        <span className="font-body text-caption text-graphite">Cờ ghi sản phẩm backend: {status?.product_write_enabled ? 'được bật' : 'đang tắt'}</span>
      </div>
      {importIssues.length > 0 ? <div className="grid gap-2 rounded-control border border-outline-variant/60 p-3" aria-label="Kết quả cần xử lý">
        <h3 className="font-body text-sm font-semibold text-on-surface">Các dòng cần xử lý</h3>
        <ul className="grid gap-1 text-xs text-graphite">
          {importIssues.map((issue, index) => <li key={`${issue.sku ?? 'no-sku'}-${issue.reason}-${index}`} className="break-all">
            <code className="font-mono">{issue.sku || 'SKU trống'}</code> · {issueReasonLabel(issue.reason)}
          </li>)}
        </ul>
      </div> : null}
    </Card>
  );
}

function webhookStatusInfo(value?: string): { label: string; hint: string } {
  switch (value) {
    case 'configured':
      return { label: 'Đã cấu hình', hint: 'Delivery và từng topic được xác minh riêng trong báo cáo capability.' };
    case 'scope_missing':
      return { label: 'Thiếu quyền', hint: 'Ứng dụng Shopify thiếu scope cần thiết để tạo webhook. Cấp quyền rồi bấm “Kiểm tra kết nối”.' };
    case 'pcd_required':
      return { label: 'Cần duyệt Protected Customer Data', hint: 'Shopify chặn webhook đơn hàng vì app chưa được duyệt dữ liệu khách hàng được bảo vệ. Bật quyền này trong Shopify Partner/Dev Dashboard rồi bấm “Kiểm tra kết nối”.' };
    case 'error':
      return { label: 'Lỗi', hint: 'Shopify từ chối tạo webhook. Xem lỗi gần nhất và báo cáo capability để biết chi tiết.' };
    case 'unconfigured':
      return { label: 'Chưa cấu hình', hint: 'Cấu hình URL công khai và bấm “Kiểm tra kết nối” để tạo webhook.' };
    default:
      return { label: 'Chưa xác minh', hint: 'Delivery và từng topic được xác minh riêng trong báo cáo capability.' };
  }
}

function issueReasonLabel(reason: string): string {
  const labels: Record<string, string> = {
    missing_sku: 'Shopify variant thiếu SKU',
    duplicate_shopify_sku: 'SKU xuất hiện trên nhiều Shopify variants',
    duplicate_shopify_variant_id: 'Shopify trả trùng variant ID',
    core_sku_missing: 'Không tìm thấy SKU chính xác trong Core',
    core_sku_duplicate: 'SKU trong Core không duy nhất',
    core_product_not_active: 'Sản phẩm Core chưa hoạt động',
    product_not_active: 'Sản phẩm Shopify chưa Active',
    inventory_item_missing: 'Thiếu inventory item',
    inventory_not_tracked: 'Inventory tracking đang tắt',
    location_missing: 'Không có tồn tại location đã cấu hình',
    mapping_conflict: 'Mapping hiện có khác Shopify listing',
    stale_shopify_listing: 'Listing cũ không còn trong snapshot Shopify',
    invalid_external_id: 'Shopify trả ID không hợp lệ',
  };
  return labels[reason] ?? reason;
}
function Field({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="font-body text-[11px] font-semibold uppercase tracking-wide text-graphite">{label}</dt><dd className="mt-1 break-words font-body text-sm font-medium text-on-surface">{value}</dd></div>;
}

function formatQuantity(value?: number): string {
  return value === undefined ? '—' : value.toLocaleString('vi-VN');
}

function formatDate(value?: string): string {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}
