import { useState } from 'react';
import { navigate } from '../../../../app/routes';
import { EmptyState, ErrorState, LoadingState } from '../../../../components/common/ScreenState';
import { ChannelBrandIcon } from '../../../../components/common/ChannelBrandIcon';
import { StatusBadge } from '../../../../components/common/StatusBadge';
import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { reconcileChannelListing, resyncChannelListing, type InventoryReconciliation, type ProductInventoryRow } from '../../../../api/channel-operations';
import { newIdempotencyKey } from '../../../products/product.write';
import type { InventoryChannelEntry } from '../../hooks/useInventoryChannelEvidence';

type EvidenceState = { label: string; tone: 'success' | 'warning' | 'danger' | 'neutral'; fresh: boolean; drift: boolean };

function dateTime(value?: string): string {
  if (!value) return 'Chưa xác minh';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? 'Chưa xác minh' : new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(date);
}

function quantity(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('vi-VN');
}

function jobStatusLabel(status?: string): string {
  const labels: Record<string, string> = {
    queued: 'Đang chờ xử lý', running: 'Đang xử lý', succeeded: 'Hoàn tất', completed: 'Hoàn tất', failed: 'Thất bại',
    VERIFIED: 'Đã xác minh', MISMATCH: 'Có chênh lệch', UNVERIFIED: 'Chưa xác minh', DEFERRED: 'Tạm hoãn', SUPERSEDED: 'Có yêu cầu mới hơn', BLOCKED: 'Bị chặn',
  };
  return status ? labels[status] ?? 'Đang cập nhật' : 'Chưa có lần xử lý';
}

function latestEvidenceAt(row: ProductInventoryRow): string | undefined {
  const candidates = [row.latest_sync_verified_at, row.reported_at].filter((value): value is string => Boolean(value));
  return candidates.sort((left, right) => Date.parse(right) - Date.parse(left))[0];
}

function evidenceState(row: ProductInventoryRow): EvidenceState {
  const evidenceAt = latestEvidenceAt(row);
  const targetAt = row.target_at ? Date.parse(row.target_at) : undefined;
  const observedAt = evidenceAt ? Date.parse(evidenceAt) : Number.NaN;
  const fresh = Number.isFinite(observedAt) && (targetAt === undefined || !Number.isFinite(targetAt) || observedAt >= targetAt) && row.reported_quantity !== null;
  const drift = fresh && row.target_quantity !== null && row.reported_quantity !== row.target_quantity;
  if (row.latest_job_status === 'queued') return { label: 'Đang chờ xử lý', tone: 'warning', fresh, drift };
  if (row.latest_job_status === 'running') return { label: 'Đang đồng bộ', tone: 'warning', fresh, drift };
  if (row.latest_sync_status === 'BLOCKED') return { label: 'Bị chặn', tone: 'danger', fresh, drift };
  if (row.latest_sync_status === 'DEFERRED') return { label: 'Chưa thể đồng bộ', tone: 'warning', fresh, drift };
  if (row.latest_sync_status === 'SUPERSEDED') return { label: 'Có yêu cầu mới hơn', tone: 'warning', fresh, drift };
  if (!row.listing_id) return { label: 'Chưa có mapping', tone: 'neutral', fresh: false, drift: false };
  if (row.mapping_status === 'needs_attention') return { label: 'Mapping cần xử lý', tone: 'danger', fresh, drift };
  if (row.mapping_status === 'stale') return { label: 'Mapping cũ', tone: 'warning', fresh, drift };
  if (row.mapping_status !== 'verified') return { label: 'Mapping chưa xác minh', tone: 'warning', fresh, drift };
  if (!row.has_baseline || row.target_quantity === null) return { label: 'Chưa đủ dữ liệu', tone: 'neutral', fresh, drift: false };
  if (!fresh) return { label: 'Chưa xác minh tồn', tone: 'warning', fresh: false, drift: false };
  return drift ? { label: 'Chênh lệch', tone: 'danger', fresh: true, drift: true } : { label: 'Khớp đã xác minh', tone: 'success', fresh: true, drift: false };
}

function friendlyError(code?: string): string | null {
  if (!code) return null;
  const messages: Record<string, string> = {
    CHANNEL_DISCONNECTED: 'Kết nối kênh chưa sẵn sàng. Kết nối lại trong phần Channels.',
    INVENTORY_WRITE_DISABLED: 'Kênh hiện chưa cho phép gửi tồn từ Core.',
    MAPPING_NOT_VERIFIED: 'Cần xác minh mapping trước khi gửi tồn.',
    LISTING_NOT_READY: 'Listing chưa đủ điều kiện đồng bộ tồn.',
    RATE_LIMITED: 'Nền tảng đang giới hạn yêu cầu. Hãy thử lại sau.',
  };
  return messages[code] ?? 'Lần xử lý gần nhất có lỗi. Mở chi tiết channel để xem tình trạng kết nối.';
}

function statusCounts(entries: InventoryChannelEntry[]) {
  const mappedRows = entries.flatMap((entry) => entry.inventory?.listing_id ? [entry.inventory] : []);
  const states = mappedRows.map(evidenceState);
  return {
    mapped: mappedRows.length,
    verified: mappedRows.filter((row, index) => row.mapping_status === 'verified' && states[index]?.fresh).length,
    pending: states.filter((state) => ['Đang chờ xử lý', 'Đang đồng bộ', 'Chưa xác minh tồn'].includes(state.label)).length,
    drift: mappedRows.filter((row, index) => row.mapping_status === 'verified' && states[index]?.drift).length,
    insufficient: entries.filter((entry) => entry.inventoryError || !entry.inventory?.listing_id || entry.inventory.mapping_status !== 'verified' || !entry.inventory.has_baseline || entry.inventory.target_quantity === null).length,
  };
}

function mappingIssueLabel(reason: string): string {
  const labels: Record<string, string> = {
    missing_sku: 'Listing chưa có SKU trên kênh.',
    invalid_external_id: 'ID listing không hợp lệ.',
    duplicate_shopify_sku: 'Có nhiều listing dùng cùng SKU.',
    duplicate_shopify_variant_id: 'ID biến thể trên kênh bị trùng.',
    core_sku_missing: 'SKU chưa tồn tại trong Core.',
    core_sku_duplicate: 'SKU Core bị trùng.',
    inventory_item_missing: 'Chưa có mã mặt hàng tồn kho trên kênh.',
    inventory_not_tracked: 'Listing chưa bật theo dõi tồn.',
    location_missing: 'Chưa xác định được vị trí tồn của listing.',
    mapping_conflict: 'Mapping đang xung đột với listing khác.',
    product_not_active: 'Sản phẩm trên kênh chưa hoạt động.',
    core_product_not_active: 'Sản phẩm Core chưa hoạt động.',
    stale_shopify_listing: 'Listing đã cũ; cần xác minh lại.',
  };
  return labels[reason] ?? 'Mapping cần được kiểm tra trong phần Channels.';
}

function ChannelSummaryRow({ entry }: { entry: InventoryChannelEntry }) {
  const row = entry.inventory;
  const state = row ? evidenceState(row) : null;
  return <article className="grid min-w-0 gap-3 rounded-control border border-outline-variant/60 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
    <div className="flex min-w-0 items-center gap-3"><span className="grid size-9 shrink-0 place-items-center rounded-control bg-surface-container-low"><ChannelBrandIcon code={entry.channel.code} /></span><div className="min-w-0"><strong className="block truncate font-body text-body-sm text-on-surface">{row?.channel_name || entry.channel.name}</strong><span className="block truncate font-body text-caption text-graphite">{row?.shop_name || 'Tài khoản chưa có tên hiển thị'}</span></div></div>
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 sm:justify-end"><span className="font-body text-caption text-graphite">Core {quantity(row?.has_balance ? row.available_to_sell : null)} · mục tiêu {quantity(row?.target_quantity)} · kênh báo {quantity(row?.reported_quantity)}</span>{state ? <StatusBadge tone={state.tone}>{state.label}</StatusBadge> : <StatusBadge tone="warning">Chưa tải</StatusBadge>}</div>
    {entry.inventoryError ? <p role="status" className="sm:col-span-2 font-body text-caption text-amber-900">{entry.inventoryError}</p> : null}
  </article>;
}

function ChannelRow({ entry, canManage, onRefresh }: { entry: InventoryChannelEntry; canManage: boolean; onRefresh: () => void }) {
  const [busy, setBusy] = useState<'reconcile' | 'resync' | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionError, setActionError] = useState('');
  const [reconciliation, setReconciliation] = useState<InventoryReconciliation | null>(null);
  const row = entry.inventory;
  const settings = entry.settings;
  const readCapability = settings?.capabilities.inventory_read;
  const writeCapability = settings?.capabilities.inventory_write;
  const state = row ? evidenceState(row) : null;
  const canReconcile = canManage && Boolean(row?.listing_id) && row?.listed === true && row?.mapping_status === 'verified' && row?.channel_status === 'connected' && readCapability?.can_execute === true;
  const canResync = canManage && Boolean(row?.listing_id) && row?.mapping_status === 'verified' && row?.ready === true && row?.write_enabled === true && writeCapability?.can_execute === true;

  const viewChannel = () => navigate(`/channels/${entry.channel.id}?tab=inventory${row?.listing_id ? `&listing=${encodeURIComponent(row.listing_id)}` : ''}`);
  const reconcile = async () => {
    if (!row?.listing_id) return;
    setBusy('reconcile'); setActionError(''); setActionMessage('');
    try {
      const result = await reconcileChannelListing(entry.channel.id, row.listing_id);
      setReconciliation(result);
      setActionMessage('Đã đọc lại listing. Kết quả đối soát được tải từ máy chủ; Core không bị thay đổi.');
      onRefresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Không thể hoàn tất đối soát.');
    } finally { setBusy(null); }
  };
  const resync = async () => {
    if (!row?.listing_id) return;
    const listingName = row.external_sku || row.external_variant_id || row.external_product_id || row.sku;
    if (!window.confirm(`Yêu cầu đồng bộ tồn cho listing “${listingName}” trên ${entry.channel.name}? Chỉ listing này được gửi.`)) return;
    setBusy('resync'); setActionError(''); setActionMessage('');
    try {
      const receipt = await resyncChannelListing(entry.channel.id, row.listing_id, newIdempotencyKey('inventory-listing-resync'));
      setActionMessage(`Máy chủ đã tiếp nhận yêu cầu (${jobStatusLabel(receipt.status)}). Đây chưa phải xác nhận đồng bộ thành công; kết quả sẽ hiện sau khi có dữ liệu đọc lại.`);
      onRefresh();
    } catch (error: unknown) {
      setActionError(error instanceof Error ? error.message : 'Không thể yêu cầu đồng bộ lại listing.');
    } finally { setBusy(null); }
  };

  return <article className="grid min-w-0 gap-4 rounded-lg border border-outline-variant/70 bg-pure-white p-4 sm:p-5">
    <header className="flex min-w-0 items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-container-low"><ChannelBrandIcon code={entry.channel.code} /></span><div className="min-w-0"><strong className="block truncate font-display text-base font-bold text-on-surface">{row?.channel_name || entry.channel.name}</strong><span className="block truncate font-body text-caption text-graphite">{row?.shop_name || 'Tài khoản chưa có tên hiển thị'}</span></div></div>
      <StatusBadge tone={row ? (row.listed ? 'success' : 'neutral') : 'warning'}>{row ? (row.listed ? 'Đang đăng bán' : 'Chưa đăng') : 'Chưa tải'}</StatusBadge>
    </header>

    {entry.inventoryError ? <p role="status" className="rounded-control bg-amber-50 p-3 font-body text-caption text-amber-900">{entry.inventoryError}</p> : null}
    {row && state ? <>
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-body text-caption text-graphite">{row.mapping_status === 'verified' ? 'Mapping đã xác minh' : row.mapping_status === 'unmapped' ? 'Chưa có mapping' : row.mapping_status === 'needs_attention' ? 'Mapping cần xử lý' : row.mapping_status === 'stale' ? 'Mapping cũ' : 'Mapping chưa xác minh'}</span><StatusBadge tone={state.tone}>{state.label}</StatusBadge></div>
      {row.issue_reason ? <p className="rounded-control bg-amber-50 p-3 font-body text-caption text-amber-950">{mappingIssueLabel(row.issue_reason)}</p> : null}
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-control bg-surface-container-low p-3 font-body text-caption sm:grid-cols-4">
        <div><dt className="text-graphite">Core ATS</dt><dd className="mt-1 font-mono font-bold text-on-surface">{quantity(row.has_balance ? row.available_to_sell : null)}</dd></div>
        <div><dt className="text-graphite">Mục tiêu listing</dt><dd className="mt-1 font-mono font-bold text-on-surface">{quantity(row.target_quantity)}</dd></div>
        <div><dt className="text-graphite">Kênh báo</dt><dd className="mt-1 font-mono font-bold text-on-surface">{quantity(row.reported_quantity)}</dd></div>
        <div><dt className="text-graphite">Xác minh lúc</dt><dd className="mt-1 font-semibold text-on-surface">{dateTime(latestEvidenceAt(row))}</dd></div>
      </dl>
      <details className="font-body text-caption text-graphite"><summary className="w-fit cursor-pointer underline decoration-outline-variant underline-offset-2">Chi tiết listing</summary><dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
        <div><dt className="inline">SKU Core: </dt><dd className="inline font-mono text-on-surface">{row.sku}</dd></div>
        <div><dt className="inline">SKU trên kênh: </dt><dd className="inline break-all font-mono text-on-surface">{row.external_sku || '—'}</dd></div>
        <div><dt className="inline">Listing ID: </dt><dd className="inline break-all font-mono text-on-surface">{row.listing_id || 'Chưa có'}</dd></div>
        <div><dt className="inline">Variant ID trên kênh: </dt><dd className="inline break-all font-mono text-on-surface">{row.external_variant_id || '—'}</dd></div>
        <div><dt className="inline">Mapping xác minh: </dt><dd className="inline text-on-surface">{dateTime(row.mapping_verified_at)}</dd></div>
        <div><dt className="inline">Mục tiêu cập nhật: </dt><dd className="inline text-on-surface">{dateTime(row.target_at)}</dd></div>
        <div><dt className="inline">Trạng thái đồng bộ: </dt><dd className="inline text-on-surface">{jobStatusLabel(row.latest_job_status || row.latest_sync_status)}</dd></div>
      </dl></details>
      {row.latest_sync_error_code ? <div className="rounded-control border border-amber-200 bg-amber-50 p-3 font-body text-caption text-amber-950"><p>{friendlyError(row.latest_sync_error_code)}</p><details className="mt-1"><summary className="w-fit cursor-pointer underline">Mã lỗi tham chiếu</summary><code className="mt-1 block font-mono text-[11px]">{row.latest_sync_error_code}</code></details></div> : null}
    </> : null}
    {entry.settingsError ? <p className="font-body text-caption text-amber-800">Không xác minh được quyền đọc/ghi của channel. Hãy thử tải lại trước khi thao tác.</p> : null}
    {reconciliation ? <div role="status" className="grid gap-1 rounded-control border border-outline-variant/70 bg-channel-paper p-3 font-body text-caption"><strong className="text-on-surface">Kết quả đối soát: {jobStatusLabel(reconciliation.state)}</strong><span>Core ATS {quantity(reconciliation.core_ats)} · Mục tiêu {quantity(reconciliation.expected_quantity)} · Kênh báo {quantity(reconciliation.remote_quantity)}</span><span className="text-graphite">Đọc lúc {dateTime(reconciliation.completed_at)} · {reconciliation.error_code ? friendlyError(reconciliation.error_code) : 'Không có mã lỗi'}</span></div> : null}
    {actionMessage ? <p role="status" className="rounded-control bg-surface-container-low p-3 font-body text-caption text-on-surface">{actionMessage}</p> : null}
    {actionError ? <p role="alert" className="rounded-control bg-error-container p-3 font-body text-caption text-on-error-container">{actionError}</p> : null}

    <footer className="flex flex-wrap items-center gap-2 border-t border-outline-variant/50 pt-3">
      <Button variant="ghost" size="sm" onClick={viewChannel}>Mở channel</Button>
      {canReconcile ? <Button variant="secondary" size="sm" loading={busy === 'reconcile'} disabled={busy !== null} onClick={() => void reconcile()}>Đọc và đối soát</Button> : null}
      {canResync ? <Button size="sm" loading={busy === 'resync'} disabled={busy !== null} onClick={() => void resync()}>Đồng bộ listing này</Button> : null}
      {!canManage ? <span className="font-body text-caption text-graphite">Thao tác đối soát và đồng bộ dành cho quản trị viên.</span> : null}
      {canManage && row?.listing_id && !canReconcile && !entry.settingsError ? <span className="font-body text-caption text-graphite">{readCapability?.reason_message || 'Channel chưa sẵn sàng để đọc tồn từ nền tảng.'}</span> : null}
      {canManage && row?.listing_id && !canResync && !entry.settingsError ? <span className="font-body text-caption text-graphite">{writeCapability?.reason_message || (row.mapping_status !== 'verified' ? 'Xác minh mapping trước khi đồng bộ.' : 'Listing hoặc quyền ghi tồn chưa sẵn sàng.')}</span> : null}
    </footer>
  </article>;
}

export function InventoryChannelEvidence({ entries, error, loading, refreshing, onRefresh, onViewDetails, canManage, view = 'full' }: { entries: InventoryChannelEntry[]; error: unknown; loading: boolean; refreshing: boolean; onRefresh: () => void; onViewDetails?: () => void; canManage: boolean; view?: 'summary' | 'full' }) {
  const counts = statusCounts(entries);
  const summary = view === 'summary';
  return <Card className="grid min-w-0 gap-4 p-5 sm:p-6">
    <header className="flex flex-wrap items-start justify-between gap-3"><div><h2 className="font-display text-lg font-bold text-on-surface">Tình trạng kênh bán</h2><p className="mt-1 font-body text-body-sm text-graphite">Đối chiếu từng listing với mục tiêu tồn của Core.</p></div><Button variant="secondary" size="sm" onClick={onRefresh} loading={loading || refreshing}>Làm mới</Button></header>
    {loading && entries.length === 0 ? <LoadingState label="Đang tải tồn theo listing…" /> : null}
    {!loading && error && entries.length === 0 ? <ErrorState error={error} retry={onRefresh} /> : null}
    {entries.length > 0 ? <>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">{[
        ['Có mapping', counts.mapped], ['Đã xác minh tồn', counts.verified], ['Chờ xử lý', counts.pending], ['Chênh lệch', counts.drift], ['Thiếu dữ liệu', counts.insufficient],
      ].map(([label, value]) => <div key={String(label)} className="rounded-control bg-surface-container-low px-3 py-2"><dt className="font-body text-caption text-graphite">{label}</dt><dd className="mt-1 font-display text-lg font-bold tabular-nums text-on-surface">{Number(value).toLocaleString('vi-VN')}</dd></div>)}</dl>
      {error ? <p role="status" className="font-body text-caption text-amber-800">Không thể làm mới danh sách channel. Dữ liệu đã tải trước đó vẫn hiển thị.</p> : null}
      {summary ? <div className="grid gap-2">{entries.slice(0, 3).map((entry) => <ChannelSummaryRow key={entry.channel.id} entry={entry} />)}{onViewDetails ? <Button variant="ghost" onClick={onViewDetails}>Xem chi tiết kênh bán</Button> : null}</div>
        : <div className="grid gap-3">{entries.map((entry) => <ChannelRow key={entry.channel.id} entry={entry} canManage={canManage} onRefresh={onRefresh} />)}</div>}
    </> : !loading && !error ? <EmptyState title="Chưa cấu hình kênh bán" detail="Các channel đã kết nối sẽ xuất hiện tại đây." /> : null}
  </Card>;
}
