import { useCallback, useEffect, useMemo, useState } from 'react';
import { getProductChannelInventory, reconcileChannelListing, resyncChannelListing, type ProductInventoryRow } from '../../../api/channel-operations';
import { ApiRequestError } from '../../../core/api-error';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Modal } from '../../../components/ui/Modal';
import { newIdempotencyKey } from '../product.write';

const problems = (channelName: string): Record<string, string> => {
  const shopify = channelName === 'Shopify';
  return {
  BASELINE_REQUIRED: `Chưa có mốc tồn ${channelName} đã xác minh. Chọn “Đọc và xác minh tồn” cho SKU này, rồi gửi lại.`,
  ORDER_POLL_REQUIRED: shopify ? 'Chưa kiểm tra xong đơn Shopify gần đây. Kiểm tra chức năng nhập đơn, đợi lần kiểm tra thành công rồi đọc tồn lại.' : `Chưa nhập xong các đơn ${channelName} gần đây. Chờ đồng bộ đơn hàng rồi đọc tồn lại.`,
  ORDER_WEBHOOKS_REQUIRED: shopify ? 'Webhook nhận đơn Shopify chưa được xác minh. Cấu hình orders/create và orders/cancelled trong Cài đặt kênh.' : `Chưa xác minh được thông báo đơn hàng từ ${channelName}. Kiểm tra cấu hình nhập đơn hàng.`,
  ORDER_WEBHOOKS_PCD_REQUIRED: 'Shopify chưa duyệt quyền dữ liệu khách hàng được bảo vệ (Protected Customer Data) nên chưa tạo được webhook đơn hàng. Bật quyền này trong Shopify Partner/Dev Dashboard rồi bấm “Kiểm tra kết nối”.',
  ORDER_EVENT_PENDING: `Hoãn tăng tồn bán được: đơn ${channelName} liên quan chưa được nhập và hạch toán đủ dòng trong Core. Trạng thái đóng gói/giao hàng không quyết định bước này.`,
  ORDER_SCOPE_UNKNOWN: shopify ? 'Hoãn tăng tồn bán được: biên nhận đơn Shopify chưa đủ dòng hàng hoặc mapping tin cậy. Kiểm tra nhập đơn và ghép SKU; chưa thể xác định SKU này độc lập.' : `Hoãn tăng tồn bán được: chưa đối chiếu đủ dòng hàng của đơn ${channelName}. Kiểm tra nhập đơn và ghép SKU trước khi gửi tồn.`,
  BASELINE_STALE: 'SKU hoặc tồn Core đã đổi trong lúc đọc. Làm mới rồi đọc lại.',
  READ_ORDERS_SCOPE_REQUIRED: shopify ? 'Ứng dụng Shopify thiếu quyền đọc đơn hàng (read_orders). Cấp quyền và kết nối lại.' : `Kết nối ${channelName} chưa cấp đủ quyền đọc đơn hàng. Kiểm tra quyền rồi kết nối lại.`,
  WRITE_INVENTORY_SCOPE_REQUIRED: shopify ? 'Ứng dụng Shopify thiếu quyền ghi tồn (write_inventory). Cấp quyền và kết nối lại.' : `Kết nối ${channelName} chưa cấp đủ quyền cập nhật tồn kho. Kiểm tra quyền rồi kết nối lại.`,
  UNPROCESSED_ORDER: `Đơn ${channelName} chưa được nhập vào Core. Xử lý đơn trước khi tăng tồn.`,
  REMOTE_RESERVED: shopify ? 'Hoãn tăng tồn: Shopify đang giữ tồn của biến thể này, có thể từ Draft Order đặt giữ tồn. Kiểm tra khoản giữ tồn trên Shopify; chưa nhập draft thành đơn bán trong Core.' : `Tồn ${channelName} đang được giữ cho đơn hàng. Kiểm tra lượng giữ trước khi tăng tồn.`,
  MAPPING_INVALID: shopify ? 'SKU, theo dõi tồn hoặc địa điểm Shopify chưa khớp. Kiểm tra liên kết SKU.' : `SKU, theo dõi tồn hoặc vị trí hàng trên ${channelName} chưa khớp. Kiểm tra liên kết SKU.`,
  ALLOCATION_INVALID: 'Phân bổ tồn hoặc phiên bản Core đã đổi. Làm mới rồi gửi lại.',
  WRITE_DISABLED: `Chức năng ghi tồn ${channelName} đang tắt trong cấu hình máy chủ.`,
  CHANNEL_UNAVAILABLE: `Kênh ${channelName} chưa kết nối hoặc đang không khả dụng.`,
  REMOTE_READ_FAILED: `Không đọc được tồn ${channelName}. Kiểm tra kết nối rồi thử lại.`,
  };
};

function requestProblem(cause: unknown, channelName: string): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === 'INVENTORY_RESYNC_CONFLICT') return 'Mục tiêu, phiên bản Core hoặc trạng thái SKU đã đổi; làm mới phần xem trước rồi xác nhận lại.';
    if (cause.code === 'INVENTORY_RESYNC_UNAVAILABLE') return `Chức năng ghi tồn chưa bật hoặc kết nối ${channelName} chưa sẵn sàng.`;
    if (cause.code === 'LISTING_NOT_FOUND') return 'Liên kết SKU không còn hợp lệ. Làm mới và kiểm tra ghép SKU.';
    if (cause.code === 'FORBIDDEN') return 'Cần quyền quản trị để gửi tồn.';
  }
  return 'Không thể xếp job đồng bộ. Kiểm tra kết nối rồi thử lại.';
}

function auditProblem(cause: unknown, channelName: string): string {
  if (cause instanceof ApiRequestError) {
    if (cause.code === 'LISTING_NOT_FOUND') return 'Không tìm thấy liên kết SKU. Kiểm tra ghép SKU rồi thử lại.';
    if (cause.code === 'INVENTORY_RECONCILIATION_UNAVAILABLE') return `Bộ đọc tồn ${channelName} chưa sẵn sàng. Kiểm tra kết nối kênh.`;
    if (cause.code === 'FORBIDDEN') return 'Tài khoản không có quyền đọc tồn kênh.';
  }
  return `Không đọc được tồn ${channelName}. Kiểm tra kết nối, ghép SKU và quyền đọc tồn rồi thử lại.`;
}

function rowStatus(row: ProductInventoryRow, channelName: string, requireListedForActions: boolean): string {
  const issue = problems(channelName);
  if (row.latest_job_status === 'queued') return 'Đã tiếp nhận yêu cầu; đang chờ worker.';
  if (row.latest_job_status === 'running') return `Đang đồng bộ; chờ đọc lại từ ${channelName}.`;
  if (row.latest_job_status === 'superseded') return 'Mục tiêu đã thay đổi; làm mới phần xem trước rồi gửi lại.';
  if (row.allocation_state === 'joining') return 'SKU đang chờ áp dụng kế hoạch phân bổ. Chọn SKU trong “Phân bổ tồn đa kênh”, xem trước rồi xác nhận áp dụng.';
  if (row.latest_sync_error_code === 'BASELINE_REQUIRED' && row.has_baseline) return 'Đã có mốc tồn; gửi lại để tiếp tục.';
  if (row.latest_sync_error_code === 'ORDER_EVENT_PENDING' || row.latest_sync_error_code === 'ORDER_SCOPE_UNKNOWN') {
    const order = row.blocking_order_reference ? ` (${row.blocking_order_reference})` : '';
    return `${issue[row.latest_sync_error_code]}${order}`;
  }
  if (row.latest_sync_error_code) return issue[row.latest_sync_error_code] ?? `Lần gửi chưa hoàn tất (${row.latest_sync_error_code}). Xem Tồn kho của kênh để kiểm tra.`;
  if (row.latest_job_status === 'dead' || row.latest_job_status === 'failed') return 'Đồng bộ thất bại; kiểm tra trạng thái kênh và thử lại.';
  if (row.latest_job_status === 'succeeded' && row.latest_sync_status === 'VERIFIED') return `Đã gửi và đọc lại từ ${channelName}.`;
  if (requireListedForActions && !row.listed) return channelName === 'WooCommerce' ? 'Bản nháp chưa mở bán. Sau khi đăng bán, hệ thống sẽ tự đọc lại tồn.' : 'Bản nháp chưa mở bán. Sau khi đăng bán, làm mới để đọc và đồng bộ tồn.';
  if (!row.write_enabled) return `Chức năng ghi tồn ${channelName} chưa bật; vẫn có thể xem số dự kiến.`;
  if (row.ready && !row.has_baseline) return `Cần đọc mốc tồn ${channelName} trước khi tăng tồn. Nút gửi sẽ kiểm tra bước này.`;
  return row.ready ? 'Sẵn sàng gửi.' : 'Cần ghép SKU, bật theo dõi tồn và kết nối kênh.';
}

function previewProblem(row: ProductInventoryRow, channelName: string): string {
  switch (row.preview_issue) {
    case 'CORE_BALANCE_MISSING': return 'Chưa có dữ liệu tồn Core hợp lệ.';
    case 'MAPPING_INVALID': return 'SKU chưa được ghép và xác minh.';
    case 'LISTING_NOT_ACTIVE': return 'Listing chưa mở bán hoặc không còn đủ điều kiện phân bổ.';
    case 'LISTING_NOT_IN_ALLOCATION': return 'Chưa áp dụng kế hoạch phân bổ cho SKU này.';
    case 'CHANNEL_UNAVAILABLE': return `Cửa hàng ${channelName} chưa kết nối.`;
    case 'TRACKING_NOT_READY': return `SKU chưa bật theo dõi tồn trên ${channelName}.`;
    case 'LOCATION_MISSING': return `Chưa xác minh địa điểm quản lý tồn ${channelName}.`;
    case 'LISTING_NOT_READY': return `Theo dõi tồn, vị trí hoặc kết nối ${channelName} chưa sẵn sàng.`;
    case 'ALLOCATION_INVALID': return 'Cấu hình phân bổ tồn chưa hợp lệ.';
    case 'QUANTITY_BASIS_INVALID': return 'SKU chưa dùng cơ sở tồn Core có thể bán.';
    default: return 'Core chưa trả về hạn mức phân bổ cho kênh này.';
  }
}

const amount = (value: number | null | undefined, fallback: string) => value == null ? fallback : value.toLocaleString('vi-VN');
const signed = (value: number) => `${value > 0 ? '+' : ''}${value.toLocaleString('vi-VN')}`;
const sum = (values: number[]) => values.reduce((total, value) => total + value, 0);
const formatTime = (value?: string | null) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
};

type VerificationTone = 'neutral' | 'success' | 'warning' | 'danger';
function verification(row: ProductInventoryRow): { label: string; tone: VerificationTone } {
  if (row.allocation_state === 'joining') return { label: 'Chờ áp dụng quota', tone: 'warning' };
  if (row.latest_sync_error_code) return { label: 'Có lỗi', tone: 'danger' };
  switch (row.latest_sync_status) {
    case 'VERIFIED': return { label: 'Đã xác minh', tone: 'success' };
    case 'MISMATCH': return { label: 'Lệch tồn', tone: 'danger' };
    case 'DEFERRED': return { label: 'Chờ điều kiện', tone: 'warning' };
    case 'SUPERSEDED': return { label: 'Đã thay đổi', tone: 'warning' };
    case 'BLOCKED': return { label: 'Bị chặn', tone: 'danger' };
    case 'UNVERIFIED': return { label: 'Chưa xác minh', tone: 'warning' };
    default: return { label: row.latest_job_status ? 'Đang xử lý' : 'Chưa gửi', tone: 'neutral' };
  }
}

type InventorySummary = {
  coreATS: number | null;
  projected: number | null;
  savedTarget: number | null;
  reported: number | null;
  delta: number | null;
  verified: number;
  verificationBase: number;
  mismatched: number;
  errors: number;
  unverified: number;
  missingTargets: ProductInventoryRow[];
  lastVerifiedAt?: string;
  hasListedRows: boolean;
  attention: boolean;
};

function summarize(rows: ProductInventoryRow[]): InventorySummary {
  const balanceRows = rows.filter((row) => row.has_balance);
  const projectedRows = rows.filter((row) => row.preview_quantity != null);
  const targetRows = rows.filter((row) => row.target_quantity != null);
  const reportedRows = rows.filter((row) => row.reported_quantity != null);
  const deltaRows = rows.filter((row) => row.preview_delta != null);
  const listedRows = rows.filter((row) => row.listed);
  const baseRows = listedRows.length ? listedRows : rows;
  const verifiedAt = rows.map((row) => row.latest_sync_verified_at).filter((value): value is string => Boolean(value)).sort().at(-1);
  const mismatched = rows.filter((row) => (row.preview_delta != null && row.preview_delta !== 0) || row.latest_sync_status === 'MISMATCH').length;
  const errors = rows.filter((row) => Boolean(row.latest_sync_error_code) || ['failed', 'dead'].includes(row.latest_job_status ?? '')).length;
  const unverified = baseRows.filter((row) => row.latest_sync_status !== 'VERIFIED').length;
  const missingTargets = listedRows.filter((row) => row.preview_quantity == null);
  return {
    coreATS: balanceRows.length ? sum(balanceRows.map((row) => row.available_to_sell)) : null,
    projected: rows.length > 0 && projectedRows.length === rows.length ? sum(projectedRows.map((row) => row.preview_quantity as number)) : null,
    savedTarget: rows.length > 0 && targetRows.length === rows.length ? sum(targetRows.map((row) => row.target_quantity as number)) : null,
    reported: reportedRows.length ? sum(reportedRows.map((row) => row.reported_quantity as number)) : null,
    delta: rows.length > 0 && deltaRows.length === rows.length ? sum(deltaRows.map((row) => row.preview_delta as number)) : null,
    verified: baseRows.filter((row) => row.latest_sync_status === 'VERIFIED').length,
    verificationBase: baseRows.length,
    mismatched,
    errors,
    unverified,
    missingTargets,
    lastVerifiedAt: verifiedAt,
    hasListedRows: listedRows.length > 0,
    attention: errors > 0 || (listedRows.length > 0 && (mismatched > 0 || unverified > 0)),
  };
}

export function ProductInventorySync({ channelId, productId, canWrite, channelName = 'Shopify', requireListedForActions = false, autoRefresh = channelName === 'WooCommerce', onRowsChange }: {
  channelId: string;
  productId: string;
  canWrite: boolean;
  channelName?: string;
  requireListedForActions?: boolean;
  autoRefresh?: boolean;
  onRowsChange?: (rows: ProductInventoryRow[]) => void;
}) {
  const [rows, setRows] = useState<ProductInventoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [previewRows, setPreviewRows] = useState<ProductInventoryRow[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [auditing, setAuditing] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsTouched, setDetailsTouched] = useState(false);
  const refresh = useCallback(async (signal?: AbortSignal, quiet = false) => {
    if (!quiet) setLoading(true);
    if (!quiet) setError('');
    try { const next = await getProductChannelInventory(channelId, productId, signal); if (!signal?.aborted) setRows(next); return next; }
    catch { if (!signal?.aborted) setError(autoRefresh ? 'Không thể tải trạng thái tồn theo SKU. Hệ thống sẽ tự thử lại.' : 'Không thể tải trạng thái tồn theo SKU. Hãy thử làm mới.'); }
    finally { if (!signal?.aborted && !quiet) setLoading(false); }
  }, [autoRefresh, channelId, productId]);
  useEffect(() => { const controller = new AbortController(); void refresh(controller.signal); return () => controller.abort(); }, [refresh]);
  useEffect(() => {
    const pending = rows.some((row) => ['queued', 'running', 'failed'].includes(row.latest_job_status ?? ''));
    if (!pending && !autoRefresh) return;
    const timer = window.setInterval(() => void refresh(undefined, true), pending ? 3000 : 15000);
    return () => window.clearInterval(timer);
  }, [autoRefresh, refresh, rows]);
  useEffect(() => { onRowsChange?.(rows); }, [onRowsChange, rows]);

  const summary = useMemo(() => summarize(rows), [rows]);
  useEffect(() => {
    if (!detailsTouched && summary.attention) setDetailsOpen(true);
  }, [detailsTouched, summary.attention]);

  const audit = async (row: ProductInventoryRow) => {
    setAuditing(row.listing_id); setMessage(''); setError('');
    try {
      const result = await reconcileChannelListing(channelId, row.listing_id);
      const updated = await refresh(undefined, true);
      const baselineSaved = updated?.find((item) => item.listing_id === row.listing_id)?.has_baseline;
      const issue = problems(channelName);
      setMessage(result.error_code ? `${row.sku}: ${issue[result.error_code] ?? result.error_code}`
        : baselineSaved ? `${row.sku}: Đã đọc tồn ${channelName} (${result.remote_quantity ?? 'không rõ'}) và ghi mốc xác minh. Bây giờ có thể gửi tồn.`
          : `${row.sku}: Chưa ghi được mốc tồn. Kiểm tra kết nối và ghép SKU rồi đọc lại.`);
    } catch (cause) { setError(`${row.sku}: ${auditProblem(cause, channelName)}`); }
    finally { setAuditing(''); }
  };
  const openPreview = async (only?: ProductInventoryRow) => {
    setPreviewLoading(true); setMessage(''); setError('');
    const latest = await refresh();
    const base = latest ?? rows;
    setPreviewRows(only ? base.filter((row) => row.listing_id === only.listing_id) : base);
    setPreviewLoading(false);
  };
  const send = async (confirmedRows: ProductInventoryRow[] = rows) => {
    if (!canWrite || sending) return;
    setPreviewRows(null);
    setSending(true); setMessage(''); setError('');
    const queued: string[] = [];
    const failures: string[] = [];
    for (const row of confirmedRows.filter((item) => item.ready && item.write_enabled && (!requireListedForActions || item.listed) && (channelName !== 'Shopify' || item.preview_quantity != null))) {
      let checkingBaseline = !row.has_baseline;
      try {
        if (!row.has_baseline) {
          const baseline = await reconcileChannelListing(channelId, row.listing_id);
          if (baseline.error_code) {
            failures.push(`${row.sku}: ${problems(channelName)[baseline.error_code] ?? baseline.error_code}`);
            continue;
          }
          const updated = await refresh(undefined, true);
          if (!updated?.find((item) => item.listing_id === row.listing_id)?.has_baseline) {
            failures.push(`${row.sku}: Chưa ghi được mốc tồn ${channelName}. Kiểm tra kết nối và trạng thái nhập đơn rồi thử lại.`);
            continue;
          }
        }
        checkingBaseline = false;
        await resyncChannelListing(channelId, row.listing_id, newIdempotencyKey('product-inventory'), channelName === 'Shopify' ? { quantity: row.preview_quantity!, version: row.core_version } : undefined);
        queued.push(row.sku);
      }
      catch (cause) { failures.push(`${row.sku}: ${checkingBaseline ? auditProblem(cause, channelName) : requestProblem(cause, channelName)}`); }
    }
    setMessage(queued.length ? `${queued.join(', ')}: đã nhận yêu cầu. Đang chờ ${channelName} xử lý và đọc lại; xem trạng thái từng SKU trong phần chi tiết.` : '');
    setError(failures.join(' '));
    setSending(false);
    void refresh(undefined, true);
  };
  const readyCount = rows.filter((row) => row.ready && row.write_enabled && (!requireListedForActions || row.listed) && (channelName !== 'Shopify' || row.preview_quantity != null)).length;
  const joiningCount = rows.filter((row) => row.listed && row.allocation_state === 'joining').length;
  const attentionNotes = [
    summary.errors ? `${summary.errors} SKU có lỗi đồng bộ cần xử lý.` : '',
    summary.mismatched ? `${summary.mismatched} SKU lệch giữa phân bổ dự kiến và số ${channelName} đọc lại.` : '',
    summary.hasListedRows && summary.unverified ? `${summary.unverified} SKU chưa được ${channelName} đọc lại để xác minh.` : '',
  ].filter(Boolean);

  return <section className="grid gap-3 rounded-lg border border-sandstone bg-pure-white p-4" aria-label={`Tồn kho và phân bổ ${channelName}`}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h4 className="text-sm font-semibold text-on-surface">Tồn kho và phân bổ</h4>
      </div>
      {!autoRefresh ? <Button size="sm" variant="ghost" disabled={loading || sending} onClick={() => void refresh()}>Làm mới</Button> : null}
    </div>
    {loading ? <p role="status" className="text-sm text-graphite">Đang tải tồn kho…</p> : null}
    {error ? <p role="alert" className="text-xs leading-5 text-error">{error}</p> : null}
    {joiningCount > 0 ? <p role="status" className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-950">{joiningCount} SKU đang chờ áp dụng quota. Xem trước chỉ tính số dự kiến; chọn từng SKU và xác nhận áp dụng trong <a className="font-semibold underline underline-offset-2" href="?tab=operations&amp;allocation=1">Phân bổ tồn đa kênh</a> để bắt đầu gửi tồn.</p> : null}
    {!loading ? <dl className="grid grid-cols-2 gap-2 rounded-lg bg-surface-container-low p-3 sm:grid-cols-3 xl:grid-cols-6">
      <SummaryMetric label="Core có thể bán" value={amount(summary.coreATS, 'Chưa có tồn')} hint="Tổng ATS của các SKU" />
      <SummaryMetric label={`Dự kiến ${channelName}`} value={amount(summary.projected, 'Chưa xác định')} hint={summary.projected == null ? 'Xem lý do bên dưới' : 'Phân bổ mới nhất từ Core'} />
      <SummaryMetric label="Mục tiêu đã ghi" value={amount(summary.savedTarget, 'Chưa ghi')} hint="Số worker đã lưu, không phải phân bổ mới" />
      <SummaryMetric label={`${channelName} báo`} value={amount(summary.reported, 'Chưa đọc')} hint="Số đọc lại gần nhất" />
      <SummaryMetric label="Chênh lệch" value={summary.delta == null ? 'Chưa xác minh' : signed(summary.delta)} hint="Dự kiến − số kênh báo" tone={summary.delta == null ? 'neutral' : summary.delta === 0 ? 'success' : 'danger'} />
      <SummaryMetric label="Xác minh" value={summary.verificationBase ? `${summary.verified}/${summary.verificationBase} SKU` : 'Chưa có SKU'} hint={summary.lastVerifiedAt ? `Gần nhất ${formatTime(summary.lastVerifiedAt)}` : summary.hasListedRows ? 'Chưa có lần đọc lại' : 'Chưa có listing đang bán'} tone={summary.verificationBase > 0 && summary.verified === summary.verificationBase ? 'success' : summary.attention ? 'warning' : 'neutral'} />
    </dl> : null}
    {attentionNotes.length ? <div role="alert" className="rounded-control border border-badge-blocked-text/25 bg-badge-blocked-bg px-3 py-2 text-xs leading-5 text-badge-blocked-text">
      <strong className="block text-on-surface">Cần kiểm tra lại tồn {channelName}</strong>
      <ul className="mt-1 list-disc pl-5">{attentionNotes.map((note) => <li key={note}>{note}</li>)}</ul>
    </div> : null}
    {summary.missingTargets.length ? <div role="status" className="rounded-control border border-sandstone bg-warm-alabaster px-3 py-2 text-xs leading-5 text-graphite">
      <strong className="block text-on-surface">Chưa có hạn mức phân bổ cho {summary.missingTargets.length} SKU đang bán.</strong>
      <ul className="mt-1 list-disc pl-5">{summary.missingTargets.map((row) => <li key={row.listing_id}><code className="font-mono text-on-surface">{row.sku}</code>: {previewProblem(row, channelName)}</li>)}</ul>
    </div> : null}
    {!loading && rows.length === 0 ? <p className="text-xs text-graphite">Sản phẩm chưa có SKU.</p> : null}
    {!loading && rows.length > 0 && !summary.hasListedRows ? <p className="text-xs leading-5 text-graphite">{requireListedForActions ? channelName === 'WooCommerce' ? 'Bản nháp chưa mở bán. Sau khi đăng bán, hệ thống sẽ tự đọc lại tồn.' : 'Bản nháp chưa mở bán. Sau khi đăng bán, làm mới để đọc và đồng bộ tồn.' : `Listing chưa mở bán. Phân bổ và đồng bộ tồn chỉ được xác minh sau khi sản phẩm được đăng bán trên ${channelName}.`}</p> : null}
    {message ? <p role="status" className="text-xs leading-5 text-on-surface">{message}</p> : null}
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/50 pt-3">
      <p className="text-xs leading-5 text-graphite">{readyCount}/{rows.length} SKU sẵn sàng đồng bộ tồn. Kết quả chỉ hoàn tất sau khi {channelName} được đọc lại.</p>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="ghost" aria-expanded={detailsOpen} onClick={() => { setDetailsTouched(true); setDetailsOpen((open) => !open); }}>{detailsOpen ? 'Ẩn chi tiết SKU' : 'Xem chi tiết SKU'}</Button>
        <Button size="sm" variant={summary.attention ? 'primary' : 'secondary'} loading={sending || previewLoading} disabled={!canWrite || loading || readyCount === 0 || sending || previewLoading || Boolean(auditing)} onClick={() => void (channelName === 'Shopify' ? openPreview() : send())}>{summary.attention ? `Khắc phục chênh lệch tồn ${channelName}` : `Đồng bộ lại tồn ${channelName}`}</Button>
      </div>
    </div>
    {detailsOpen && !loading ? <div className="overflow-x-auto">
      <table className="w-full min-w-[980px] text-left text-xs">
        <thead><tr className="border-b border-outline-variant text-graphite">
          <th className="py-2">SKU</th><th className="py-2 text-right">Core có thể bán</th><th className="py-2 text-right">Dự kiến {channelName}</th><th className="py-2 text-right">Mục tiêu đã ghi</th><th className="py-2 text-right">{channelName} báo</th><th className="py-2 text-right">Chênh lệch</th><th className="py-2">Xác minh</th><th className="py-2">Trạng thái và cách xử lý</th><th className="py-2 text-right">Thao tác</th>
        </tr></thead>
        <tbody>{rows.map((row) => {
          const verified = verification(row);
          const sendDisabled = !canWrite || sending || !row.ready || !row.write_enabled || (channelName === 'Shopify' && row.preview_quantity == null) || (requireListedForActions && !row.listed) || Boolean(auditing);
          return <tr key={row.sku} className="border-b border-outline-variant/50 align-top">
            <th className="py-2 font-mono font-medium">{row.sku}</th>
            <td className="py-2 text-right tabular-nums">{amount(row.has_balance ? row.available_to_sell : null, 'Chưa có tồn')}</td>
            <td className="py-2 text-right tabular-nums">{row.preview_quantity == null ? <span title={previewProblem(row, channelName)}>{previewProblem(row, channelName)}</span> : amount(row.preview_quantity, '')}</td>
            <td className="py-2 text-right tabular-nums">{amount(row.target_quantity, 'Chưa ghi')}</td>
            <td className="py-2 text-right tabular-nums">{amount(row.reported_quantity, 'Chưa đọc')}{row.reported_quantity != null && row.preview_delta == null ? <span className="block text-graphite">Chưa đủ số đọc tin cậy</span> : null}</td>
            <td className="py-2 text-right tabular-nums">{row.preview_delta == null ? 'Chưa xác minh' : signed(row.preview_delta)}</td>
            <td className="px-2 py-2"><StatusBadge tone={verified.tone}>{verified.label}</StatusBadge>{row.latest_sync_verified_at ? <span className="mt-1 block text-graphite">{formatTime(row.latest_sync_verified_at)}</span> : null}{row.latest_sync_error_code ? <code className="mt-1 block break-all font-mono text-[10px] text-error">{row.latest_sync_error_code}</code> : null}</td>
            <td className="max-w-[300px] px-3 py-2 leading-5">{rowStatus(row, channelName, requireListedForActions)}</td>
            <td className="py-2 text-right"><div className="inline-flex flex-wrap justify-end gap-1">{row.allocation_state === 'joining' ? <a className="px-2 py-1.5 font-semibold text-octo-ember underline underline-offset-2" href="?tab=operations&amp;allocation=1">Mở phân bổ</a> : <><Button size="sm" variant="ghost" loading={auditing === row.listing_id} disabled={!row.listing_id || (requireListedForActions && !row.listed) || Boolean(auditing) || sending} onClick={() => void audit(row)}>Đọc và xác minh tồn</Button><Button size="sm" variant="secondary" disabled={sendDisabled} onClick={() => void (channelName === 'Shopify' ? openPreview(row) : send([row]))}>Gửi SKU</Button></>}</div></td>
          </tr>;
        })}</tbody>
      </table>
    </div> : null}
    <Modal open={previewRows !== null} onClose={() => { if (!sending) setPreviewRows(null); }} title={`Xem trước tồn ${channelName}`} description={`Số lượng có thể đổi nếu Core hoặc chính sách phân bổ thay đổi trước khi worker xử lý. Đây là phần hạn mức chung, không phải tồn riêng của ${channelName}.`} footer={<><Button variant="ghost" disabled={sending} onClick={() => setPreviewRows(null)}>Quay lại</Button><Button loading={sending} disabled={!previewRows?.some((row) => row.ready && row.write_enabled && row.preview_quantity != null)} onClick={() => void send(previewRows ?? [])}>Xác nhận gửi tồn</Button></>}>
      <p className="text-sm text-on-surface">Bạn sắp yêu cầu cập nhật tồn cho {previewRows?.filter((row) => row.ready && row.write_enabled && row.preview_quantity != null).length ?? 0} SKU trên {channelName}.</p>
      <ul className="mt-3 grid gap-2">{previewRows?.map((row) => <li key={row.sku} className="rounded-control border border-sandstone p-3 text-xs leading-5"><strong className="font-mono text-on-surface">{row.sku}</strong><p>Core: {amount(row.has_balance ? row.available_to_sell : null, 'chưa có tồn')} · Dự kiến {channelName}: {amount(row.preview_quantity, previewProblem(row, channelName))}</p><p>{channelName} đọc gần nhất: {amount(row.reported_quantity, 'chưa đọc')} · Chênh lệch: {row.preview_delta == null ? 'chưa đủ số đọc tin cậy' : signed(row.preview_delta)}</p><p>Mục tiêu đã ghi: {amount(row.target_quantity, 'chưa ghi')}</p>{!row.write_enabled || !row.ready || row.preview_quantity == null ? <p className="text-error">Chưa thể gửi: {row.write_enabled ? previewProblem(row, channelName) : `Chức năng ghi tồn ${channelName} chưa bật.`}</p> : null}</li>)}</ul>
    </Modal>
  </section>;
}

function SummaryMetric({ label, value, hint, tone = 'neutral' }: { label: string; value: string; hint: string; tone?: 'neutral' | 'success' | 'warning' | 'danger' }) {
  const valueTone = tone === 'success' ? 'text-badge-progress-text' : tone === 'warning' ? 'text-badge-blocked-text' : tone === 'danger' ? 'text-error' : 'text-on-surface';
  return <div className="min-w-0"><dt className="text-[11px] font-semibold uppercase tracking-wide text-graphite">{label}</dt><dd className={`mt-1 break-words font-display text-lg font-bold tabular-nums ${valueTone}`}>{value}</dd><p className="mt-1 text-[11px] leading-4 text-graphite">{hint}</p></div>;
}
