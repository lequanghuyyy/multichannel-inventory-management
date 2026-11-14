import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ApiRequestError, presentApiError } from '../../../core/api-error';
import {
  executeAllocation,
  getAllocationExecution,
  previewAllocation,
  type AllocationExecution,
  type AllocationExecutionStep,
  type AllocationPlanItem,
  type AllocationPlanPreview,
  type AllocationPreviewInput,
  type POSMode,
} from '../../../api/allocations';
import type { ProductInventoryRow } from '../../../api/channel-operations';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Checkbox } from '../../../components/ui/Checkbox';
import { Input } from '../../../components/ui/Input';
import { Modal } from '../../../components/ui/Modal';
import { Select } from '../../../components/ui/Select';
import { variantLabel, type ProductApiDetail } from '../../products/product.detail.api';
import { useProductChannelAllocations } from '../hooks/useProductChannelAllocations';
import { usePOSAllocation } from '../hooks/usePOSAllocation';
import {
  allocationDateTime,
  allocationDirectionLabel,
  allocationIssueMessage,
  allocationPhaseLabel,
  allocationPlanStatusLabel,
  allocationPlanStatusTone,
  allocationQuantity,
  allocationRuntimeError,
  allocationStepStatusLabel,
  allocationStepStatusTone,
  channelCodeLabel,
  summarizeAllocationPreview,
  type AllocationPreviewSummary,
  type StatusTone,
} from '../allocation.presentation';

type PolicyMode = 'current' | 'equal' | 'weighted';
type BusyAction = 'preview' | 'execute' | 'progress' | null;

const allocationErrorMessages: Record<string, string> = {
  ALLOCATION_PLAN_BLOCKED: 'Kế hoạch còn điều kiện chưa đạt nên máy chủ chưa cho thực thi.',
  ALLOCATION_PLAN_STALE: 'Kế hoạch đã cũ hoặc dữ liệu đã thay đổi. Hãy xem trước lại.',
  ALLOCATION_PLAN_NOT_FOUND: 'Không tìm thấy kế hoạch phân bổ.',
  ALLOCATION_INPUT_NOT_FOUND: 'Không tìm thấy biến thể hoặc một listing đã chọn.',
  ALLOCATION_PREVIEW_FAILED: 'Máy chủ chưa thể tạo kế hoạch xem trước.',
  ALLOCATION_PREVIEW_UNAVAILABLE: 'Chức năng xem trước phân bổ chưa sẵn sàng.',
  ALLOCATION_EXECUTION_FAILED: 'Máy chủ chưa thể nhận kế hoạch thực thi.',
  ALLOCATION_EXECUTION_UNAVAILABLE: 'Chức năng thực thi phân bổ chưa sẵn sàng.',
  QUOTA_EXCEEDS_ATS: 'Tổng quota listing vượt ngân sách online sau khi dành quota POS.',
  POS_ALLOCATION_STALE: 'POS revision đã thay đổi. Tải lại trạng thái POS và xem trước kế hoạch mới.',
  POS_ALLOCATION_NOT_FOUND: 'Không tìm thấy phân bổ POS của SKU. Tải lại dữ liệu rồi thử lại.',
};

function presentAllocationError(cause: unknown, fallback: string): string {
  if (!(cause instanceof ApiRequestError)) return cause instanceof Error ? cause.message : fallback;
  const mapped = allocationErrorMessages[cause.code];
  if (mapped) return mapped;
  const presentation = presentApiError(cause);
  return presentation.requestId ? `${presentation.detail} (Mã yêu cầu: ${presentation.requestId})` : presentation.detail;
}

const connectionLabels: Record<string, string> = {
  connected: 'Đã kết nối',
  disconnected: 'Chưa kết nối',
  error: 'Kết nối cần xử lý',
  syncing: 'Đang kết nối',
};

function connectionTone(status: string): StatusTone {
  if (status === 'connected') return 'success';
  if (status === 'error') return 'danger';
  if (status === 'syncing') return 'warning';
  return 'neutral';
}

function allocationRecoveryReason(error?: string): string {
  const normalized = error?.toLowerCase() ?? '';
  if (normalized.includes('channel_superseded')) {
    return 'Kế hoạch cũ dừng vì mapping hoặc quota Core thay đổi. Hãy xem trước lại để tạo kế hoạch theo tồn Core hiện tại.';
  }
  if (normalized.includes('inbound_orders_pending')) {
    return 'Kế hoạch cũ dừng khi phát hiện đơn chưa nhập. Bản xem trước mới chỉ bị chặn nếu dòng hàng của đơn trùng SKU đang phân bổ.';
  }
  if (normalized.includes('baseline_required') || normalized.includes('verified remote quantity baseline')) {
    return 'Chưa có mốc tồn Shopify đã xác minh; kế hoạch mới sẽ đọc lại listing trước khi cấp quota.';
  }
  if (normalized.includes('remote_read_unverified')) {
    return 'Máy chủ chưa đọc được tồn hiện tại từ Shopify; kế hoạch mới sẽ thử đọc lại trước khi ghi.';
  }
  return error || 'Kế hoạch cũ chưa hoàn tất; cần đọc lại listing trước khi tiếp tục.';
}

const syncLabels: Record<string, string> = {
  VERIFIED: 'Đã xác minh',
  MISMATCH: 'Có chênh lệch',
  UNVERIFIED: 'Chưa xác minh',
  DEFERRED: 'Tạm hoãn',
  SUPERSEDED: 'Có yêu cầu mới hơn',
  BLOCKED: 'Bị chặn',
  queued: 'Đang chờ đồng bộ',
  running: 'Đang đồng bộ',
};

function syncTone(status?: string): StatusTone {
  if (status === 'VERIFIED') return 'success';
  if (status === 'MISMATCH' || status === 'BLOCKED') return 'danger';
  if (status === 'DEFERRED' || status === 'UNVERIFIED' || status === 'SUPERSEDED' || status === 'queued' || status === 'running') return 'warning';
  return 'neutral';
}

const syncErrorMessages: Record<string, string> = {
  CHANNEL_DISCONNECTED: 'Kết nối kênh chưa sẵn sàng.',
  INVENTORY_WRITE_DISABLED: 'Kênh chưa cho phép ghi tồn từ Core.',
  MAPPING_NOT_VERIFIED: 'Mapping chưa được xác minh.',
  LISTING_NOT_READY: 'Listing chưa đủ điều kiện đồng bộ tồn.',
  RATE_LIMITED: 'Nền tảng đang giới hạn yêu cầu. Hãy thử lại sau.',
  ALLOCATION_INVALID: 'Quota phân bổ đã thay đổi; cần đồng bộ lại.',
  REMOTE_CHANGED: 'Tồn trên kênh đã thay đổi ngoài Core.',
};

function syncErrorMessage(code?: string): string {
  if (!code) return 'Lần xử lý gần nhất không có mã lỗi.';
  return syncErrorMessages[code] ?? 'Lần xử lý gần nhất có lỗi. Mở kênh để xem chi tiết.';
}

const mappingIssueMessages: Record<string, string> = {
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

function mappingIssueMessage(reason?: string): string | null {
  if (!reason) return null;
  return mappingIssueMessages[reason] ?? 'Mapping cần được kiểm tra trong phần Channels.';
}

function participationView(item: AllocationPlanItem | undefined, row: ProductInventoryRow | undefined): { label: string; tone: StatusTone } {
  if (item) {
    if (item.planned_state === 'continuing') return { label: 'Tiếp tục tham gia', tone: 'success' };
    if (item.planned_state === 'joining') return { label: 'Sẽ tham gia', tone: 'warning' };
    if (item.planned_state === 'leaving' || (item.currently_participating && !item.will_participate)) return { label: 'Sẽ rời phân bổ', tone: 'danger' };
    return { label: 'Không tham gia', tone: 'neutral' };
  }
  if (!row?.listing_id) return { label: 'Chưa có listing', tone: 'neutral' };
  if (row.allocation_state === 'participating') return { label: 'Đang tham gia', tone: 'success' };
  if (row.allocation_state === 'joining') return { label: 'Đang chuyển vào', tone: 'warning' };
  if (row.allocation_state === 'leaving') return { label: 'Đang chuyển ra', tone: 'danger' };
  return { label: 'Không tham gia', tone: 'neutral' };
}

function signedDelta(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Chưa xác định';
  if (value === 0) return '0';
  return value > 0 ? `+${value.toLocaleString('vi-VN')}` : `−${Math.abs(value).toLocaleString('vi-VN')}`;
}

function policyLabel(preview: AllocationPlanPreview): string {
  const entries = Object.entries(preview.policy.weights);
  if (preview.policy.type === 'equal' || entries.length === 0) return 'Chia đều';
  return `Theo trọng số: ${entries.map(([code, weight]) => `${channelCodeLabel(code)} ${weight.toLocaleString('vi-VN')}`).join(' · ')}`;
}

function Stat({ detail, label, tone = 'default', value }: { detail?: string; label: string; tone?: 'default' | 'danger' | 'success'; value: string }) {
  return <div className="min-w-0 rounded-control bg-surface-container-low px-3 py-2">
    <dt className="font-body text-caption text-graphite">{label}</dt>
    <dd className={`mt-1 font-display text-lg font-bold tabular-nums ${tone === 'danger' ? 'text-error' : tone === 'success' ? 'text-emerald-800' : 'text-on-surface'}`}>{value}</dd>
    {detail ? <p className="mt-1 font-body text-[11px] leading-4 text-graphite">{detail}</p> : null}
  </div>;
}

function ChangeList({ changes, title }: { changes: { item: AllocationPlanItem; amount: number }[]; title: string }) {
  return <section className="grid gap-2" aria-label={title}>
    <h3 className="font-body text-sm font-semibold text-on-surface">{title}</h3>
    <ul className="grid gap-1.5">
      {changes.map(({ item, amount }) => <li key={item.listing_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 rounded-control border border-outline-variant/50 px-3 py-2 font-body text-body-sm">
        <span className="min-w-0"><strong className="text-on-surface">{channelCodeLabel(item.channel_code)}</strong>{item.planned_state === 'leaving' ? <span className="ml-2 text-caption text-graphite">rời phân bổ</span> : null}</span>
        <span className="tabular-nums text-on-surface-variant">{allocationQuantity(item.current_target_quantity ?? 0)} → {allocationQuantity(item.proposed_quantity)} <span className={item.delta !== null && item.delta < 0 ? 'font-semibold text-error' : 'font-semibold text-emerald-800'}>({amount.toLocaleString('vi-VN')})</span></span>
      </li>)}
    </ul>
  </section>;
}

function ChannelQuantityPreview({ item }: { item: AllocationPlanItem }) {
  const deltaBasis = item.delta_basis === 'target' ? 'quota hiện tại' : item.delta_basis === 'reported' ? 'số kênh báo' : 'chưa có mốc';
  return <article className="grid gap-2 rounded-control border border-outline-variant/60 bg-pure-white p-3">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <strong className="font-body text-body-sm text-on-surface">{channelCodeLabel(item.channel_code)}</strong>
      <StatusBadge tone={item.issues.length > 0 ? 'warning' : item.will_participate ? 'success' : 'neutral'}>{item.will_participate ? 'Dự kiến nhận quota' : 'Không nhận quota'}</StatusBadge>
    </div>
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Kênh báo gần nhất" value={allocationQuantity(item.reported_quantity)} detail={item.reported_at ? allocationDateTime(item.reported_at) : 'Chưa có lần đọc lại'} />
      <Stat label="Quota hiện tại" value={allocationQuantity(item.current_target_quantity ?? 0)} />
      <Stat label="Quota sau áp dụng" value={allocationQuantity(item.will_participate ? item.proposed_quantity : 0)} detail={item.will_participate ? undefined : 'Listing được đưa khỏi phân bổ'} />
      <Stat label="Thay đổi" value={item.delta === null ? 'Chưa xác định' : signedDelta(item.delta)} detail={`So với ${deltaBasis}`} tone={item.delta !== null && item.delta < 0 ? 'danger' : 'default'} />
    </dl>
  </article>;
}

function PreviewSummaryDetails({ preview, summary }: { preview: AllocationPlanPreview; summary: AllocationPreviewSummary }) {
  const plannedOnlineBudget = preview.online_budget ?? preview.available_to_sell;
  return <div className="grid gap-4">
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="POS mode đang hiệu lực" value={preview.pos_mode === 'dedicated' ? 'Dedicated' : 'Shared'} />
      <Stat label="POS remaining hiện tại" value={allocationQuantity(preview.pos_remaining ?? 0)} detail="Quyền bán trước khi áp dụng plan" />
      <Stat label="POS quota sau xác minh" value={allocationQuantity(preview.planned_pos_remaining ?? preview.desired_pos_quota ?? 0)} detail={preview.planned_pos_transition_state === 'pending' ? 'Chưa có hiệu lực' : 'Mục tiêu kế hoạch'} />
      <Stat label="Ngân sách online sau plan" value={allocationQuantity(plannedOnlineBudget)} detail={`Chưa phân bổ: ${allocationQuantity(preview.unallocated)}`} />
    </dl>
    {preview.planned_pos_transition_state === 'pending' ? <p role="status" className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 font-body text-body-sm leading-5 text-amber-950">OctoFlow cần giảm và xác minh tồn trên các kênh online trước khi số lượng mới được phép bán tại quầy. POS quota mới chỉ có hiệu lực sau khi plan hoàn tất.</p> : null}
    <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      <Stat label="Kênh giảm" value={summary.decreases.length.toLocaleString('vi-VN')} />
      <Stat label="Kênh tăng" value={summary.increases.length.toLocaleString('vi-VN')} />
      <Stat label="Tổng thu hồi" value={summary.reclaimed.toLocaleString('vi-VN')} detail="Tổng số lượng giảm" />
      <Stat label="Tổng cấp mới" value={summary.granted.toLocaleString('vi-VN')} detail="Tổng số lượng tăng" />
    </dl>

    <section className="grid gap-2" aria-label="Số lượng tồn dự kiến theo kênh">
      <div><h3 className="font-body text-sm font-semibold text-on-surface">Số lượng theo từng kênh</h3></div>
      {plannedOnlineBudget === 0 ? <p role="status" className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 font-body text-caption text-amber-950">Ngân sách online hiện bằng 0 sau khi dành quota POS hoặc do Core ATS đã hết. Kiểm tra Core ATS và POS quota trước khi phân bổ online.</p> : null}
      <div className="grid gap-2">{preview.items.map((item) => <ChannelQuantityPreview key={item.listing_id} item={item} />)}</div>
    </section>

    {summary.decreases.length > 0 ? <ChangeList title="Giảm quota theo kênh" changes={summary.decreases} /> : <p className="font-body text-body-sm text-graphite">Không có kênh nào giảm quota.</p>}
    {summary.increases.length > 0 ? <ChangeList title="Tăng quota theo kênh" changes={summary.increases} /> : <p className="font-body text-body-sm text-graphite">Không có kênh nào tăng quota.</p>}
    {summary.unquantified.length > 0 ? <section className="grid gap-2" aria-label="Chênh lệch chưa xác định">
      <h3 className="font-body text-sm font-semibold text-on-surface">Chênh lệch chưa xác định</h3>
      <ul className="grid gap-1.5">{summary.unquantified.map((item) => <li key={item.listing_id} className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 font-body text-body-sm text-amber-950">{channelCodeLabel(item.channel_code)} chưa có mốc quota hiện tại. Máy chủ sẽ đọc lại tồn trước khi ghi.</li>)}</ul>
    </section> : null}

    {preview.issues.length > 0 ? <section className="grid gap-2" aria-label="Điểm chặn của kế hoạch">
      <h3 className="font-body text-sm font-semibold text-error">Điểm chặn</h3>
      <ul className="grid gap-1.5">{preview.issues.map((code) => <li key={code} className="rounded-control border border-error/20 bg-error-container/40 px-3 py-2 font-body text-body-sm text-error">{allocationIssueMessage(code)} <code className="ml-1 break-all font-mono text-[11px]">{code}</code></li>)}</ul>
    </section> : null}

    {summary.blockedItems.length > 0 ? <section className="grid gap-2" aria-label="Kênh cần xử lý">
      <h3 className="font-body text-sm font-semibold text-error">Kênh cần xử lý</h3>
      <ul className="grid gap-1.5">{summary.blockedItems.map((item) => <li key={item.listing_id} className="rounded-control border border-error/20 bg-error-container/40 px-3 py-2 font-body text-body-sm text-error">
        <strong>{channelCodeLabel(item.channel_code)}</strong>
        <span className="mt-1 block">{item.issues.length > 0 ? item.issues.map((code) => allocationIssueMessage(code)).join(' ') : 'Listing chưa đủ điều kiện thực thi.'}</span>
      </li>)}</ul>
    </section> : null}

    {summary.projectedTotal > (preview.online_budget ?? preview.available_to_sell) ? <p role="alert" className="rounded-control border border-error/20 bg-error-container/40 px-3 py-2 font-body text-body-sm text-error">Tổng quota online dự kiến {summary.projectedTotal.toLocaleString('vi-VN')} vượt ngân sách online {(preview.online_budget ?? preview.available_to_sell).toLocaleString('vi-VN')}. POS quota đã được dành trước. Không thể xác nhận.</p> : null}
  </div>;
}

function AllocationStep({ step }: { step: AllocationExecutionStep }) {
  const error = allocationRuntimeError(step.last_error);
  const finalError = allocationRuntimeError(step.final_verification_error);
  const observed = step.final_observed_quantity ?? step.observed_quantity ?? null;
  return <article className="grid min-w-0 gap-2 rounded-control border border-outline-variant/60 bg-pure-white p-3">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <strong className="font-body text-body-sm text-on-surface">{channelCodeLabel(step.channel_code)}</strong>
        <span className="font-body text-caption text-graphite">{allocationDirectionLabel(step.direction)}</span>
      </div>
      <StatusBadge tone={allocationStepStatusTone(step.status)}>{allocationStepStatusLabel(step.status)}</StatusBadge>
    </header>
    <dl className="grid grid-cols-2 gap-x-3 gap-y-2 font-body text-caption sm:grid-cols-4">
      <div><dt className="text-graphite">Trước</dt><dd className="mt-0.5 font-semibold tabular-nums text-on-surface">{allocationQuantity(step.before_quantity)}</dd></div>
      <div><dt className="text-graphite">Mục tiêu</dt><dd className="mt-0.5 font-semibold tabular-nums text-on-surface">{allocationQuantity(step.target_quantity)}</dd></div>
      <div><dt className="text-graphite">Kênh báo gần nhất</dt><dd className="mt-0.5 font-semibold tabular-nums text-on-surface">{allocationQuantity(observed)}</dd></div>
      <div><dt className="text-graphite">Số lần thử</dt><dd className="mt-0.5 font-semibold tabular-nums text-on-surface">{step.attempt_count.toLocaleString('vi-VN')}</dd></div>
    </dl>
    <p className="font-body text-caption text-graphite">Xác minh lúc: {allocationDateTime(step.verified_at)} {step.final_verified_at ? `· Xác minh cuối: ${allocationDateTime(step.final_verified_at)}` : ''}</p>
    {error ? <p role="status" className="rounded-control bg-amber-50 px-2 py-1.5 font-body text-caption text-amber-950">{error.message} {error.detail ? <span className="block break-words">{error.detail}</span> : null} <code className="break-all font-mono text-[11px]">{error.code}</code></p> : null}
    {finalError ? <p role="status" className="rounded-control bg-error-container/40 px-2 py-1.5 font-body text-caption text-error">{finalError.message} <code className="break-all font-mono text-[11px]">{finalError.code}</code></p> : null}
  </article>;
}

export function ProductAllocationPanel({ product, canExecute, onRefreshProduct }: { product: ProductApiDetail; canExecute: boolean; onRefreshProduct?: () => void }) {
  const { entries, error: loadError, loading, refresh, refreshing } = useProductChannelAllocations(product.id);
  const [variantId, setVariantId] = useState(product.variants[0]?.id ?? '');
  const variant = product.variants.find((item) => item.id === variantId) ?? product.variants[0];
  const { snapshot: posState, loading: posLoading, error: posLoadError, refresh: refreshPOSState } = usePOSAllocation(variant?.sku);
  const [desiredPOSMode, setDesiredPOSMode] = useState<POSMode>('shared');
  const [desiredPOSQuota, setDesiredPOSQuota] = useState('0');
  const [selectedOverride, setSelectedOverride] = useState<Set<string> | null>(null);
  const [policyMode, setPolicyMode] = useState<PolicyMode>('current');
  const [weightInputs, setWeightInputs] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<AllocationPlanPreview | null>(null);
  const [execution, setExecution] = useState<AllocationExecution | null>(null);
  const [busy, setBusy] = useState<BusyAction>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [progressError, setProgressError] = useState<string | null>(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const refreshedPlanRef = useRef('');
  const previewRunRef = useRef(0);

  useEffect(() => {
    if (!posState) return;
    setDesiredPOSMode(posState.desired_pos_mode);
    setDesiredPOSQuota(String(posState.desired_pos_quota));
  }, [posState]);

  const channelViews = useMemo(() => entries.map((entry) => {
    const row = variant ? entry.rows.find((item) => item.sku === variant.sku) : undefined;
    return { channel: entry.channel, error: entry.error, row };
  }), [entries, variant]);
  const hasLazadaChannel = channelViews.some(({ channel }) => channel.code === 'lazada');
  const lazadaListingExists = channelViews.some(({ channel, row }) => channel.code === 'lazada' && Boolean(row?.listing_id));
  const lazadaRow = channelViews.find(({ channel }) => channel.code === 'lazada')?.row;

  const availableListingIds = useMemo(() => channelViews.flatMap((view) => view.row?.listing_id ? [view.row.listing_id] : []), [channelViews]);
  const planEligibleListingIds = useMemo(() => channelViews.flatMap(({ row }) => {
    if (!row?.listing_id) return [];
    const alreadyParticipating = ['participating', 'joining', 'leaving'].includes(row.allocation_state);
    return row.write_enabled || alreadyParticipating ? [row.listing_id] : [];
  }), [channelViews]);
  const selectedListingIds = useMemo(
    () => selectedOverride === null ? planEligibleListingIds : planEligibleListingIds.filter((id) => selectedOverride.has(id)),
    [planEligibleListingIds, selectedOverride],
  );

  const selectedListingIdSet = useMemo(() => new Set(selectedListingIds), [selectedListingIds]);
  const weightCodes = useMemo(() => {
    const codes = new Set<string>();
    for (const view of channelViews) {
      const row = view.row;
      if (!row?.listing_id || !selectedListingIdSet.has(row.listing_id)) continue;
      codes.add(row.channel_code);
    }
    return [...codes].sort();
  }, [channelViews, selectedListingIdSet]);

  const parsedWeights = useMemo(() => {
    if (policyMode !== 'weighted' || weightCodes.length === 0) return null;
    const weights: Record<string, number> = {};
    let total = 0;
    for (const code of weightCodes) {
      const value = Number(weightInputs[code] ?? '1');
      if (!Number.isInteger(value) || value <= 0 || value > 1_000_000 || total + value > 1_000_000) return null;
      weights[code] = value;
      total += value;
    }
    return weights;
  }, [policyMode, weightCodes, weightInputs]);

  const weightIsValid = policyMode !== 'weighted' || parsedWeights !== null;

  const transitionSignals = useMemo(() => {
    const signals: { channel: string; reason: string }[] = [];
    for (const view of channelViews) {
      const row = view.row;
      if (!row?.listing_id) continue;
      const reasons: string[] = [];
      if (row.allocation_state === 'joining' && row.allocation_plan_status === 'applying') reasons.push('kế hoạch phân bổ đang được xử lý');
      if (row.allocation_state === 'leaving') reasons.push('listing đang chuyển ra khỏi phân bổ');
      if (row.latest_job_status === 'queued' || row.latest_job_status === 'running') reasons.push('đang có lần đồng bộ tồn chưa xong');
      if (reasons.length > 0) signals.push({ channel: row.channel_name || channelCodeLabel(row.channel_code), reason: reasons.join('; ') });
    }
    return signals;
  }, [channelViews]);

  const versionSignals = useMemo(() => channelViews.flatMap(({ row }) => {
    if (!row?.listing_id) return [];
    const recoverableJoining = row.allocation_state === 'joining' && row.allocation_plan_status !== 'applying';
    const participating = !recoverableJoining && (['participating', 'joining', 'leaving'].includes(row.allocation_state) || row.target_quantity !== null);
    if (!participating) return [];
    const channel = row.channel_name || channelCodeLabel(row.channel_code);
    const reasons: string[] = [];
    if (row.target_quantity !== null && row.target_version !== row.core_version) reasons.push(`quota Core v${row.target_version} · tồn Core v${row.core_version}`);
    if (row.target_quantity !== null && row.current_allocation_revision > 0 && row.target_allocation_revision !== row.current_allocation_revision) reasons.push(`revision listing ${row.target_allocation_revision} · revision Core ${row.current_allocation_revision}`);
    if (row.allocation_core_version > 0 && row.allocation_core_version !== row.core_version) reasons.push(`phân bổ Core v${row.allocation_core_version} · tồn Core v${row.core_version}`);
    return reasons.length > 0 ? [{ channel, reason: reasons.join('; ') }] : [];
  }), [channelViews]);

  const recoverableTransitions = useMemo(() => {
    const seenPlans = new Set<string>();
    return channelViews.flatMap((view) => {
      const row = view.row;
      if (!row?.listing_id || row.allocation_state !== 'joining' || row.allocation_plan_status === 'applying' ||
        row.latest_job_status === 'queued' || row.latest_job_status === 'running') return [];
      if (row.allocation_plan_id) {
        if (seenPlans.has(row.allocation_plan_id)) return [];
        seenPlans.add(row.allocation_plan_id);
      }
      return [{ key: row.allocation_plan_id || row.listing_id,
        channel: row.allocation_plan_id ? `Kế hoạch SKU ${row.sku}` : row.channel_name || channelCodeLabel(row.channel_code),
        status: row.allocation_plan_status, error: row.allocation_plan_error }];
    });
  }, [channelViews]);

  const applying = execution?.status === 'applying';
  const locked = applying || transitionSignals.length > 0;

  const currentTotal = useMemo(() => channelViews.reduce((total, view) => total + (view.row?.target_quantity ?? 0), 0), [channelViews]);
  const previewByListing = useMemo(() => new Map((preview?.items ?? []).map((item) => [item.listing_id, item])), [preview]);
  const summary = useMemo(() => preview ? summarizeAllocationPreview(preview) : null, [preview]);
  const projectedTotal = preview ? preview.items.reduce((total, item) => item.will_participate ? total + item.proposed_quantity : total, 0) : null;
  const coreAts = posState?.available_to_sell ?? variant?.availableToSell ?? 0;
  const physicalOnHand = posState?.on_hand;
  const currentReserved = posState?.reserved;
  const currentSafetyBuffer = posState?.safety_buffer;
  const quotaInputValid = desiredPOSMode === 'shared' || (/^\d+$/.test(desiredPOSQuota.trim()) && Number.isSafeInteger(Number(desiredPOSQuota)) && Number(desiredPOSQuota) >= 0);
  const desiredQuotaNumber = desiredPOSMode === 'shared' ? 0 : quotaInputValid ? Number(desiredPOSQuota) : null;
  const effectiveOnlineBudget = preview?.online_budget ?? posState?.online_budget ?? coreAts;
  const unallocated = preview?.unallocated ?? (posState ? effectiveOnlineBudget - currentTotal : null);
  const effectiveMode = posState?.pos_mode ?? 'shared';
  const posRemaining = posState?.pos_remaining ?? 0;
  const currentTargetsByChannel = useMemo(() => {
    const totals = new Map<string, number>();
    for (const view of channelViews) {
      if (view.row) totals.set(view.row.channel_code.toLowerCase(), (totals.get(view.row.channel_code.toLowerCase()) ?? 0) + (view.row.target_quantity ?? 0));
    }
    return totals;
  }, [channelViews]);
  const previewTargetsByChannel = useMemo(() => {
    const totals = new Map<string, number>();
    for (const item of preview?.items ?? []) {
      if (item.will_participate) totals.set(item.channel_code.toLowerCase(), (totals.get(item.channel_code.toLowerCase()) ?? 0) + item.proposed_quantity);
    }
    return totals;
  }, [preview]);
  const targetForChannel = (code: string) => (preview ? previewTargetsByChannel : currentTargetsByChannel).get(code) ?? 0;
  const latestVerifiedAt = channelViews.flatMap(({ row }) => row?.latest_sync_verified_at ? [row.latest_sync_verified_at] : [])
    .sort((left, right) => new Date(right).getTime() - new Date(left).getTime())[0];
  const allocationStatus = useMemo((): { label: string; tone: StatusTone } => {
    if (execution) return { label: allocationPlanStatusLabel(execution.status), tone: allocationPlanStatusTone(execution.status) };
    if (loading) return { label: 'Đang tải dữ liệu', tone: 'neutral' };
    if (transitionSignals.length > 0) return { label: 'Đang chuyển đổi', tone: 'warning' };
    if (posState?.pos_transition_state === 'pending') return { label: 'POS đang chuyển quota', tone: 'warning' };
    if (preview) return preview.can_execute ? { label: 'Sẵn sàng áp dụng', tone: 'success' } : { label: 'Có điểm chặn', tone: 'danger' };
    if (recoverableTransitions.length > 0) return { label: 'Cần xem trước lại', tone: 'warning' };
    if (versionSignals.length > 0) return { label: 'Cần xem trước lại', tone: 'warning' };
    if (currentTotal > effectiveOnlineBudget) return { label: 'Vượt ngân sách online', tone: 'danger' };
    if (currentTotal === 0) return { label: 'Chưa phân bổ', tone: 'neutral' };
    if (currentTotal === effectiveOnlineBudget) return { label: 'Đã phân bổ đủ ngân sách online', tone: 'success' };
    return { label: 'Phân bổ một phần', tone: 'warning' };
  }, [coreAts, currentTotal, effectiveOnlineBudget, execution, loading, posState, preview, recoverableTransitions.length, transitionSignals.length, versionSignals.length]);

  const invalidatePreview = useCallback(() => {
    previewRunRef.current += 1;
    setPreview(null);
    setConfirmationOpen(false);
    setError(null);
    setNotice(null);
    setProgressError(null);
  }, []);

  const changeVariant = (id: string) => {
    previewRunRef.current += 1;
    setVariantId(id);
    setSelectedOverride(null);
    setPreview(null);
    setExecution(null);
    setConfirmationOpen(false);
    setError(null);
    setNotice(null);
    setProgressError(null);
    refreshedPlanRef.current = '';
  };

  const toggleListing = (listingId: string, checked: boolean) => {
    if (locked) return;
    const next = new Set(selectedListingIds);
    if (checked) next.add(listingId); else next.delete(listingId);
    setSelectedOverride(next);
    invalidatePreview();
  };

  const changePolicy = (mode: PolicyMode) => {
    setPolicyMode(mode);
    invalidatePreview();
  };

  const changeWeight = (code: string, value: string) => {
    setWeightInputs((current) => ({ ...current, [code]: value }));
    invalidatePreview();
  };

  const refreshData = () => {
    invalidatePreview();
    refresh();
    refreshPOSState();
    onRefreshProduct?.();
  };

  const canPreview = Boolean(variant && posState && !posLoading && !posLoadError && quotaInputValid && !loading && availableListingIds.length > 0 && selectedListingIds.length > 0 && !locked && busy === null && weightIsValid);
  const canConfirmPlan = Boolean(preview && summary && canExecute && preview.can_execute && preview.issues.length === 0 && summary.blockedItems.length === 0 && !summary.exceedsAts && !locked && busy !== 'execute' && execution?.plan_id !== preview.id);

  const runPreview = async () => {
    if (!variant || !canPreview) return;
    const run = previewRunRef.current + 1;
    previewRunRef.current = run;
    setBusy('preview');
    setError(null);
    setNotice(null);
    setProgressError(null);
    try {
      const input: AllocationPreviewInput = { variant_id: variant.id, listing_ids: selectedListingIds };
      if (canExecute && posState && desiredQuotaNumber !== null) {
        input.pos_revision = posState.pos_revision;
        input.desired_pos_mode = desiredPOSMode;
        input.desired_pos_quota = desiredQuotaNumber;
      }
      if (policyMode === 'equal') input.weights = {};
      if (policyMode === 'weighted' && parsedWeights) input.weights = parsedWeights;
      const plan = await previewAllocation(input);
      // A variant change, policy edit, or channel refresh while this request was in flight
      // makes the answer describe a plan the seller is no longer looking at.
      if (previewRunRef.current !== run) return;
      setPreview(plan);
      setExecution(null);
      setConfirmationOpen(false);
      setNotice(`Đã tính quota cho ${plan.sku}. Chưa gửi tồn lên kênh: bấm “Xác nhận áp dụng” và xác nhận trong hộp thoại.`);
    } catch (cause: unknown) {
      if (previewRunRef.current === run) setError(presentAllocationError(cause, 'Không thể xem trước phân bổ.'));
    } finally {
      setBusy(null);
    }
  };

  const confirmExecute = async () => {
    if (!preview || !canConfirmPlan) return;
    setBusy('execute');
    setError(null);
    setNotice(null);
    setProgressError(null);
    try {
      const started = await executeAllocation(preview.id);
      setExecution(started);
      setConfirmationOpen(false);
      setNotice('Máy chủ đã tiếp nhận kế hoạch. Chỉ khi trạng thái là “Hoàn tất” thì các kênh mới được coi là đã xác minh.');
      refresh();
      refreshPOSState();
    } catch (cause: unknown) {
      setError(presentAllocationError(cause, 'Không thể bắt đầu áp dụng kế hoạch.'));
      setConfirmationOpen(false);
    } finally {
      setBusy(null);
    }
  };

  const refreshProgress = async () => {
    if (!execution) return;
    setBusy('progress');
    try {
      const next = await getAllocationExecution(execution.plan_id);
      setExecution(next);
      setProgressError(null);
      refreshPOSState();
    } catch (cause: unknown) {
      setProgressError(presentAllocationError(cause, 'Chưa đọc được tiến trình phân bổ.'));
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => {
    if (!variant || preview || execution) return;
    const activePlan = channelViews.map((view) => view.row).find((row) => row?.allocation_plan_status === 'applying' && row.allocation_plan_id);
    if (!activePlan?.allocation_plan_id) return;
    let cancelled = false;
    void getAllocationExecution(activePlan.allocation_plan_id).then((current) => {
      if (!cancelled) setExecution(current);
    }).catch((cause: unknown) => {
      if (!cancelled) setProgressError(presentAllocationError(cause, 'Chưa đọc được tiến trình phân bổ.'));
    });
    return () => { cancelled = true; };
  }, [variant?.id, channelViews, preview, execution]);

  useEffect(() => {
    if (!execution || execution.status !== 'applying') return;
    let cancelled = false;
    let timer = 0;
    const poll = async () => {
      try {
        const next = await getAllocationExecution(execution.plan_id);
        if (cancelled) return;
        setExecution(next);
        setProgressError(null);
        refreshPOSState();
      } catch (cause: unknown) {
        if (!cancelled) setProgressError(presentAllocationError(cause, 'Chưa đọc được tiến trình phân bổ.'));
      }
      if (!cancelled) timer = window.setTimeout(() => void poll(), 2500);
    };
    timer = window.setTimeout(() => void poll(), 1200);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [execution?.plan_id, execution?.status]);

  useEffect(() => {
    if (!execution || execution.status === 'applying') return;
    if (refreshedPlanRef.current === execution.plan_id) return;
    refreshedPlanRef.current = execution.plan_id;
    refresh();
    refreshPOSState();
  }, [execution, refresh]);

  if (product.variants.length === 0) {
    return <EmptyState title="Chưa có biến thể" detail="Thêm ít nhất một SKU trước khi phân bổ tồn kho theo kênh." />;
  }

  if (loading && entries.length === 0) return <LoadingState label="Đang tải listing và quota theo kênh…" />;
  if (loadError && entries.length === 0) return <ErrorState error={loadError} retry={refresh} />;

  return <section role="region" aria-label="Phân bổ tồn đa kênh" className="grid min-w-0 gap-4">
    <header className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/60 pb-4">
      <div>
        <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-octo-ember">PHÂN BỔ TỒN KHO</p>
        <h2 className="mt-1 font-display text-xl font-bold text-on-surface">Quota theo kênh bán</h2>
      </div>
      <StatusBadge tone={allocationStatus.tone}>{allocationStatus.label}</StatusBadge>
    </header>

    {loadError && entries.length > 0 ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 font-body text-body-sm text-amber-950"><span>Không thể làm mới danh sách kênh. Dữ liệu đã tải trước đó vẫn hiển thị.</span><Button size="sm" variant="secondary" onClick={refreshData} loading={refreshing}>Thử tải lại</Button></div> : null}
    {error ? <p role="alert" className="rounded-control border border-error/20 bg-error-container/40 px-4 py-3 font-body text-body-sm text-error">{error}</p> : null}
    {notice ? <p role="status" className="rounded-control border border-badge-progress-text/15 bg-badge-progress-bg px-4 py-3 font-body text-body-sm text-badge-progress-text">{notice}</p> : null}
    {posState?.pos_transition_state === 'pending' && !execution ? <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 font-body text-body-sm text-amber-950"><span>Chuyển quota chưa hoàn tất. POS bị khóa; quota mong muốn chưa có hiệu lực. Làm mới dữ liệu để xem kênh chưa xác minh và tiếp tục xử lý.</span><Button size="sm" variant="secondary" onClick={refreshData} loading={posLoading || loading || refreshing}>Làm mới trạng thái</Button></div> : null}

    <Card className="grid gap-4 p-5">
      <div className="grid gap-3 lg:grid-cols-[minmax(14rem,22rem)_auto] lg:items-end lg:justify-between">
        <Select label="Biến thể (SKU)" value={variant?.id ?? ''} disabled={loading || applying || busy === 'execute'} onChange={(event) => changeVariant(event.target.value)}>
          {product.variants.map((item) => <option key={item.id} value={item.id}>{item.sku} · {variantLabel(item)}</option>)}
        </Select>
        <Button variant="secondary" onClick={refreshData} loading={loading || refreshing} disabled={applying || busy === 'execute'}>Làm mới dữ liệu phân bổ</Button>
      </div>

      {variant ? <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label={`Tổng quan phân bổ ${variant.sku}`}>
        <Stat label="Tồn kho thực tế" value={allocationQuantity(physicalOnHand)} detail={posState ? `Core version ${posState.version}` : posLoading ? 'Đang đọc snapshot Core' : 'Chưa đọc được snapshot Core'} />
        <Stat label="Đang giữ" value={allocationQuantity(currentReserved)} detail="Reservation đang hoạt động" />
        <Stat label="Tồn đệm an toàn" value={allocationQuantity(currentSafetyBuffer)} detail="Không đưa vào quota" />
        <Stat label="Core ATS" value={allocationQuantity(posState?.available_to_sell)} detail="Snapshot Core mới nhất · không phải quota POS" tone="success" />
        <Stat label="POS mode hiệu lực" value={posState ? effectiveMode === 'dedicated' ? 'Dedicated' : 'Shared' : '—'} detail={effectiveMode === 'shared' ? 'Dùng chung tồn; chưa có quota POS được bảo vệ' : posState?.pos_transition_state === 'pending' ? 'Đang chuyển quota; POS tạm khóa' : 'POS dùng quota riêng'} />
        <Stat label="Quota POS đang có hiệu lực" value={posState ? allocationQuantity(posState.active_pos_quota) : '—'} detail="Không phải quota mong muốn" />
        <Stat label="POS remaining" value={posState ? allocationQuantity(posRemaining) : '—'} detail="Quyền bán còn lại theo Backend" tone={posState?.pos_transition_state === 'pending' ? 'danger' : 'default'} />
        <Stat label="Ngân sách dành cho online" value={posState || preview ? allocationQuantity(effectiveOnlineBudget) : '—'} detail="Backend tính sau khi dành quota POS" />
        <Stat label="Quota Shopify" value={allocationQuantity(targetForChannel('shopify'))} detail={preview ? 'Mục tiêu xem trước' : 'Target Core hiện tại'} />
        <Stat label="Quota WooCommerce" value={allocationQuantity(targetForChannel('woocommerce'))} detail={preview ? 'Mục tiêu xem trước' : 'Target Core hiện tại'} />
        {hasLazadaChannel ? <Stat label="Quota Lazada" value={lazadaListingExists ? allocationQuantity(targetForChannel('lazada')) : '—'} detail={lazadaListingExists ? lazadaRow?.write_enabled ? (preview ? 'Mục tiêu xem trước' : 'Target Core hiện tại') : 'Đã có listing; ghi tồn Lazada chưa được cấp quyền' : 'Ghép SKU Lazada trước khi lập quota'} tone={lazadaListingExists && !lazadaRow?.write_enabled ? 'danger' : 'default'} /> : null}
        <Stat label="Tổng quota hiện tại" value={allocationQuantity(currentTotal)} detail="Tổng quota listing Core đang giữ" />
        <Stat label="Tổng quota dự kiến" value={projectedTotal === null ? '—' : allocationQuantity(projectedTotal)} detail={projectedTotal === null ? 'Chưa có kế hoạch xem trước' : 'Theo kế hoạch đang xem trước'} />
        <Stat label="Chưa phân bổ" value={allocationQuantity(unallocated)} detail="Ngân sách online − tổng target listing" tone={unallocated !== null && unallocated < 0 ? 'danger' : 'default'} />
        <Stat label="Trạng thái phân bổ" value={allocationStatus.label} detail={preview ? policyLabel(preview) : 'Theo dữ liệu listing hiện tại'} />
        <Stat label="Xác minh gần nhất" value={allocationDateTime(latestVerifiedAt)} detail="Lần đọc lại tồn gần nhất từ kênh online" />
      </dl> : null}

      <div className="grid gap-3 rounded-control border border-outline-variant/60 bg-warm-alabaster p-4 sm:grid-cols-[minmax(12rem,1fr)_minmax(10rem,0.7fr)] sm:items-end">
        <Select label="Chế độ tồn POS mong muốn" value={desiredPOSMode} disabled={!canExecute || !posState || posLoading || locked || busy !== null} onChange={(event) => { const nextMode = event.target.value as POSMode; setDesiredPOSMode(nextMode); if (nextMode === 'shared') setDesiredPOSQuota('0'); invalidatePreview(); }}>
          <option value="shared">Dùng chung tồn (Shared)</option>
          <option value="dedicated">Dành quota riêng cho POS (Dedicated)</option>
        </Select>
        <Input label="Quota POS mong muốn" type="number" inputMode="numeric" min="0" step="1" value={desiredPOSQuota} disabled={!canExecute || desiredPOSMode === 'shared' || !posState || posLoading || locked || busy !== null} onChange={(event) => { setDesiredPOSQuota(event.target.value); invalidatePreview(); }} />
        <p className="font-body text-caption leading-5 text-graphite sm:col-span-2">Quota mong muốn chưa có hiệu lực. POS chỉ được bán theo quota đang có hiệu lực và số POS remaining do Backend trả về.</p>
        {desiredPOSMode === 'shared' ? <p className="font-body text-caption leading-5 text-graphite sm:col-span-2">Shared dùng Core ATS chung với các kênh; chế độ này không bảo vệ POS khỏi việc tồn đã được công bố online.</p> : null}
        {desiredPOSMode === 'dedicated' && !quotaInputValid ? <p role="alert" className="font-body text-caption text-error sm:col-span-2">Nhập quota là số nguyên không âm trong giới hạn an toàn.</p> : null}
        {desiredPOSMode === 'dedicated' && desiredQuotaNumber !== null && desiredQuotaNumber > posRemaining ? <p className="rounded-control bg-amber-50 px-3 py-2 font-body text-body-sm leading-5 text-amber-950 sm:col-span-2">OctoFlow cần giảm và xác minh tồn trên các kênh online trước khi số lượng mới được phép bán tại quầy.</p> : null}
        {posLoading ? <p role="status" className="font-body text-caption text-graphite sm:col-span-2">Đang đọc quota POS và revision mới nhất…</p> : null}
        {posLoadError ? <div className="flex flex-wrap items-center justify-between gap-2 rounded-control bg-error-container/50 px-3 py-2 font-body text-caption text-error sm:col-span-2"><span>{posLoadError instanceof Error ? posLoadError.message : 'Không thể đọc trạng thái POS quota.'}</span><Button size="sm" variant="secondary" onClick={refreshPOSState}>Tải lại quota POS</Button></div> : null}
        {!canExecute ? <p className="font-body text-caption text-graphite sm:col-span-2">Chỉ Admin được thay đổi chế độ và quota POS; tài khoản hiện tại vẫn có thể xem kế hoạch.</p> : null}
      </div>
    </Card>

    {recoverableTransitions.length > 0 && !execution && !preview ? <div role="status" className="grid gap-2 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 font-body text-body-sm text-amber-950">
      <strong>{recoverableTransitions.some((item) => item.status === 'blocked') ? 'Kế hoạch trước đã bị chặn' : recoverableTransitions.some((item) => item.status === 'paused') ? 'Kế hoạch trước đã tạm dừng' : 'Listing chưa hoàn tất đưa vào phân bổ'}; quota chưa được xác minh đầy đủ.</strong>
      <ul className="grid gap-1">{recoverableTransitions.map((item) => <li key={item.key}><strong>{item.channel}:</strong> {allocationRecoveryReason(item.error)}</li>)}</ul>
      <p>{recoverableTransitions.some((item) => item.error?.includes('INBOUND_ORDERS_PENDING')) ? 'Hãy tạo bản xem trước mới. Đơn của SKU khác không chặn việc phân bổ sản phẩm này.' : 'Chọn từng SKU và xem trước kế hoạch mới. Máy chủ sẽ đọc lại listing trước khi gửi tồn.'}</p>
    </div> : null}
    {versionSignals.length > 0 && !execution ? <div role="status" className="grid gap-2 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 font-body text-body-sm text-amber-950">
      <strong>Phiên bản quota trên kênh đang cũ so với tồn Core.</strong>
      <ul className="grid gap-1">{versionSignals.map((signal, index) => <li key={`${signal.channel}-${index}`}>{signal.channel}: {signal.reason}.</li>)}</ul>
      <p>{preview ? `Bản xem trước dùng Core v${preview.core_version}; chưa gửi thay đổi lên kênh.` : 'Bấm “Xem trước phân bổ” để tính theo tồn Core mới. Bản xem trước chưa gửi thay đổi; chỉ xác nhận mới bắt đầu đồng bộ.'}</p>
    </div> : null}
    {locked ? <div role="status" className="grid gap-2 rounded-control border border-amber-300 bg-amber-50 px-4 py-3 font-body text-body-sm text-amber-950">
      <strong>{applying ? 'Kế hoạch đang được áp dụng; tạm khóa thay đổi.' : 'Có lần đồng bộ hoặc chuyển listing đang chạy; tạm khóa phân bổ.'}</strong>
      {transitionSignals.length > 0 ? <ul className="grid gap-1">{transitionSignals.map((signal, index) => <li key={`${signal.channel}-${index}`}>{signal.channel}: {signal.reason}.</li>)}</ul> : null}
      <div><Button size="sm" variant="secondary" onClick={refreshData} loading={loading || refreshing} disabled={applying}>Làm mới trạng thái</Button></div>
    </div> : null}

    <Card className="grid gap-4 p-5">
      <fieldset className="grid gap-3">
        <legend className="font-body text-sm font-semibold text-on-surface">Chính sách phân bổ</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {([
            { value: 'current', label: 'Theo chính sách hiện tại', description: 'Dùng trọng số của kế hoạch đã hoàn tất gần nhất; nếu chưa có, chia đều.' },
            { value: 'equal', label: 'Chia đều', description: 'Chia ngân sách online đều cho các kênh được chọn.' },
            { value: 'weighted', label: 'Theo trọng số', description: 'Máy chủ chia theo trọng số từng kênh; kênh không có trọng số nhận 0.' },
          ] as const).map((option) => <label key={option.value} className={`grid cursor-pointer gap-1 rounded-control border px-3 py-3 font-body text-body-sm transition-colors focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-primary ${policyMode === option.value ? 'border-carbon bg-carbon text-pure-white' : 'border-outline-variant bg-warm-alabaster text-on-surface hover:border-carbon'}`}>
            <span className="flex items-center gap-2"><input type="radio" name="allocation-policy" value={option.value} checked={policyMode === option.value} disabled={locked || busy !== null} onChange={() => changePolicy(option.value)} className="size-4 accent-current" /> <strong>{option.label}</strong></span>
            <span className={`text-caption leading-5 ${policyMode === option.value ? 'text-pure-white/75' : 'text-graphite'}`}>{option.description}</span>
          </label>)}
        </div>
      </fieldset>

      {policyMode === 'weighted' ? <div className="grid gap-3 rounded-control border border-outline-variant/60 bg-surface-container-low p-3">
        <div><h3 className="font-body text-sm font-semibold text-on-surface">Trọng số từng kênh</h3><p className="mt-1 font-body text-caption text-graphite">Số nguyên dương. Tổng trọng số không quá 1.000.000. Kênh không được chọn sẽ không tham gia.</p></div>
        {weightCodes.length === 0 ? <p className="font-body text-caption text-graphite">Chọn ít nhất một kênh để nhập trọng số.</p> : <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {weightCodes.map((code) => <Input key={code} label={`Trọng số ${channelCodeLabel(code)}`} type="number" min={1} max={1_000_000} step={1} value={weightInputs[code] ?? '1'} disabled={locked || busy !== null} onChange={(event) => changeWeight(code, event.target.value)} hint={weightIsValid ? undefined : 'Trọng số phải là số nguyên dương và tổng không quá 1.000.000.'} />)}
        </div>}
      </div> : null}

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
        <div className="flex flex-wrap items-center gap-2">
          {selectedListingIds.length === 0 && planEligibleListingIds.length > 0 ? <span className="font-body text-caption text-amber-900">Chọn ít nhất một kênh tham gia.</span> : null}
          {planEligibleListingIds.length === 0 && availableListingIds.length > 0 ? <span className="font-body text-caption text-amber-900">Chưa có listing nào được bật quyền ghi tồn từ Core.</span> : null}
          <Button onClick={() => void runPreview()} loading={busy === 'preview'} disabled={!canPreview}>Xem trước phân bổ</Button>
          {preview?.can_execute ? <Button onClick={() => setConfirmationOpen(true)} disabled={!canConfirmPlan}>Xác nhận áp dụng {preview.sku}</Button> : null}
        </div>
      </div>
    </Card>

    <section className="grid gap-3" aria-label="Danh sách kênh tham gia phân bổ">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div><h3 className="font-display text-lg font-bold text-on-surface">Kênh bán</h3></div>
        <StatusBadge tone="neutral">{availableListingIds.length.toLocaleString('vi-VN')} listing</StatusBadge>
      </div>
      {channelViews.length === 0 ? <EmptyState title="Chưa có kênh bán" detail="Kết nối kênh bán và mapping SKU trước khi phân bổ." /> : <div className="grid gap-3">
        {channelViews.map(({ channel, error: rowError, row }) => {
          const item = row?.listing_id ? previewByListing.get(row.listing_id) : undefined;
          const participation = participationView(item, row);
          const selected = row?.listing_id ? selectedListingIds.includes(row.listing_id) : false;
          const alreadyParticipating = Boolean(row && ['participating', 'joining', 'leaving'].includes(row.allocation_state));
          const writeUnavailable = Boolean(row && !row.write_enabled && !alreadyParticipating);
          const current = item?.current_target_quantity ?? row?.target_quantity ?? 0;
          const projected = item ? (item.will_participate ? item.proposed_quantity : 0) : null;
          const reported = item?.reported_quantity ?? row?.reported_quantity ?? null;
          const verifiedAt = item?.reported_at ?? row?.latest_sync_verified_at ?? row?.reported_at;
          const delta = item?.delta ?? null;
          const connection = row?.channel_status || channel.status;
          const mappingIssue = mappingIssueMessage(row?.issue_reason);
          return <article key={channel.id} className="grid min-w-0 gap-3 rounded-lg border border-outline-variant/70 bg-pure-white p-4 sm:p-5" aria-label={`Kênh ${channel.name}`}>
            <header className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-container-low"><ChannelBrandIcon code={channel.code} /></span>
                <div className="min-w-0">
                  <strong className="block truncate font-display text-base font-bold text-on-surface">{row?.channel_name || channel.name}</strong>
                  <span className="block truncate font-body text-caption text-graphite">{row?.shop_name || channel.environment || 'Tài khoản chưa có tên hiển thị'}</span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <StatusBadge tone={connectionTone(connection)}>{connectionLabels[connection] ?? 'Trạng thái kết nối chưa rõ'}</StatusBadge>
                <StatusBadge tone={participation.tone}>{participation.label}</StatusBadge>
              </div>
            </header>

            {rowError ? <p role="status" className="rounded-control bg-amber-50 px-3 py-2 font-body text-caption text-amber-950">{rowError}</p> : null}

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-control bg-surface-container-low px-3 py-2">
              <Checkbox
                label={`Cho ${row?.channel_name || channel.name} tham gia phân bổ`}
                description={writeUnavailable ? `${channel.name} chưa bật quyền ghi tồn từ Core nên được bỏ khỏi kế hoạch mặc định.` : row?.listing_id ? 'Kênh được chọn sẽ nhận quota theo chính sách; bỏ chọn sẽ thu hồi quota hiện tại.' : channel.code === 'lazada' ? 'Đọc catalog và nhập mapping SKU Lazada trước khi lập quota cho SKU này.' : 'Kênh này chưa có listing đã mapping cho SKU đang chọn.'}
                checked={selected}
                disabled={!row?.listing_id || (writeUnavailable && !selected) || locked || busy !== null}
                onChange={(event) => row?.listing_id ? toggleListing(row.listing_id, event.target.checked) : undefined}
              />
              <StatusBadge tone={row ? (row.listed ? 'success' : 'neutral') : 'warning'}>{row ? (row.listed ? 'Đã đăng bán' : 'Chưa đăng') : rowError ? 'Chưa tải listing' : 'Chưa mapping SKU'}</StatusBadge>
            </div>

            {!row && channel.code === 'lazada' && !rowError ? <p className="rounded-control border border-outline-variant/60 bg-surface-container-low px-3 py-2 font-body text-caption leading-5 text-graphite">Chưa có quota cho SKU này vì chưa có listing Lazada được mapping. Sau khi ghép đúng Seller SKU, target Lazada sẽ xuất hiện tại đây. Ghi tồn Lazada vẫn bị chặn cho tới khi quyền ghi và mô hình tồn được xác minh.</p> : null}

            {row ? <dl className="grid grid-cols-2 gap-x-4 gap-y-3 rounded-control border border-outline-variant/50 p-3 font-body text-caption sm:grid-cols-4">
              <div><dt className="text-graphite">Quota hiện tại</dt><dd className="mt-1 font-mono font-bold text-on-surface">{allocationQuantity(current)}</dd></div>
              <div><dt className="text-graphite">Quota theo kế hoạch</dt><dd className="mt-1 font-mono font-bold text-on-surface">{projected === null ? '—' : allocationQuantity(projected)}</dd></div>
              <div><dt className="text-graphite">Tồn kênh đọc gần nhất</dt><dd className="mt-1 font-mono font-bold text-on-surface">{reported === null ? 'Chưa đọc' : allocationQuantity(reported)}</dd></div>
              <div><dt className="text-graphite">Xác minh lúc</dt><dd className="mt-1 font-semibold text-on-surface">{allocationDateTime(verifiedAt)}</dd></div>
              <div><dt className="text-graphite">Chênh lệch dự kiến</dt><dd className="mt-1 font-semibold tabular-nums text-on-surface">{delta === null ? 'Chưa có kế hoạch' : `${signedDelta(delta)} · ${item?.delta_basis === 'reported' ? 'so với kênh báo' : item?.delta_basis === 'target' ? 'so với quota hiện tại' : 'chưa rõ mốc'}`}</dd></div>
              <div><dt className="text-graphite">Mapping</dt><dd className="mt-1 font-semibold text-on-surface">{row.mapping_status === 'verified' ? 'Đã xác minh' : row.mapping_status === 'needs_attention' ? 'Cần xử lý' : row.mapping_status === 'stale' ? 'Đã cũ' : 'Chưa xác minh'}</dd></div>
              <div><dt className="text-graphite">Theo dõi tồn</dt><dd className="mt-1 font-semibold text-on-surface">{row.inventory_tracking_enabled ? 'Đã bật' : 'Chưa bật'}</dd></div>
              <div><dt className="text-graphite">Quyền ghi tồn</dt><dd className="mt-1 font-semibold text-on-surface">{row.write_enabled ? 'Sẵn sàng' : 'Chưa sẵn sàng'}</dd></div>
            </dl> : null}

            {row ? <div className="grid gap-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="font-body text-caption text-graphite">Đồng bộ tồn gần nhất: {syncLabels[row.latest_job_status ?? ''] ?? syncLabels[row.latest_sync_status ?? ''] ?? 'Chưa có lần xử lý'}</span>
                <StatusBadge tone={syncTone(row.latest_job_status || row.latest_sync_status)}>{syncLabels[row.latest_job_status ?? ''] ?? syncLabels[row.latest_sync_status ?? ''] ?? 'Chưa có lần xử lý'}</StatusBadge>
              </div>
              {row.latest_sync_error_code ? <div className="rounded-control border border-amber-200 bg-amber-50 px-3 py-2 font-body text-caption text-amber-950"><p>{syncErrorMessage(row.latest_sync_error_code)}</p><code className="mt-1 block break-all font-mono text-[11px]">Mã lỗi: {row.latest_sync_error_code}</code></div> : null}
              {row.blocking_order_reference ? <p className="font-body text-caption text-amber-900">Đơn đang chặn: <code className="break-all font-mono">{row.blocking_order_reference}</code></p> : null}
              {mappingIssue ? <p className="rounded-control bg-amber-50 px-3 py-2 font-body text-caption text-amber-950">{mappingIssue}</p> : null}
              {item && item.issues.length > 0 ? <ul className="grid gap-1">{item.issues.map((code) => <li key={code} className="rounded-control bg-error-container/40 px-3 py-2 font-body text-caption text-error">{allocationIssueMessage(code)} <code className="ml-1 break-all font-mono text-[11px]">{code}</code></li>)}</ul> : null}
            </div> : null}

            <details className="font-body text-caption text-graphite">
              <summary className="w-fit cursor-pointer underline decoration-outline-variant underline-offset-2">Chi tiết listing</summary>
              <dl className="mt-2 grid gap-x-4 gap-y-1 sm:grid-cols-2">
                <div><dt className="inline">SKU Core: </dt><dd className="inline font-mono text-on-surface">{row?.sku || variant?.sku || '—'}</dd></div>
                <div><dt className="inline">SKU trên kênh: </dt><dd className="inline break-all font-mono text-on-surface">{row?.external_sku || '—'}</dd></div>
                <div><dt className="inline">Listing ID: </dt><dd className="inline break-all font-mono text-on-surface">{row?.listing_id || 'Chưa có'}</dd></div>
                <div><dt className="inline">Variant ID trên kênh: </dt><dd className="inline break-all font-mono text-on-surface">{row?.external_variant_id || '—'}</dd></div>
                <div><dt className="inline">Lần đăng bán gần nhất: </dt><dd className="inline font-mono text-on-surface">{row?.latest_sync_attempt_at ? allocationDateTime(row.latest_sync_attempt_at) : '—'}</dd></div>
                <div><dt className="inline">Phiên bản Core của listing: </dt><dd className="inline font-mono text-on-surface">{row ? `${row.target_version}/${row.core_version}` : '—'}</dd></div>
              </dl>
            </details>
          </article>;
        })}
      </div>}
    </section>

    {preview && summary ? <Card className="grid gap-4 p-5" aria-label="Kết quả xem trước phân bổ">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-octo-ember">KẾ HOẠCH DỰ KIẾN</p>
          <h3 className="mt-1 font-display text-lg font-bold text-on-surface">Xem trước phân bổ {preview.sku}</h3>
          <p className="mt-1 font-body text-caption text-graphite">Core ATS {allocationQuantity(preview.available_to_sell)} · Online budget {allocationQuantity(preview.online_budget ?? preview.available_to_sell)} · POS remaining sau xác minh {allocationQuantity(preview.planned_pos_remaining ?? preview.desired_pos_quota ?? 0)} · {policyLabel(preview)} · Tạo lúc {allocationDateTime(preview.created_at)}</p>
        </div>
        <StatusBadge tone={preview.can_execute ? 'success' : 'danger'}>{preview.can_execute ? 'Đủ điều kiện' : 'Có điểm chặn'}</StatusBadge>
      </header>
      <PreviewSummaryDetails preview={preview} summary={summary} />
      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 pt-3">
        <p className="max-w-xl font-body text-caption leading-5 text-graphite">{canExecute ? 'Chỉ sau khi bạn xác nhận trong hộp thoại, máy chủ mới bắt đầu gửi thay đổi lên kênh.' : 'Chỉ ADMIN được xác nhận áp dụng kế hoạch. Bạn vẫn có thể xem trước và kiểm tra điểm chặn.'}</p>
        <Button onClick={() => setConfirmationOpen(true)} disabled={busy !== null || Boolean(execution && execution.plan_id === preview.id)}>{execution?.plan_id === preview.id ? 'Kế hoạch đã được gửi' : 'Xác nhận áp dụng'}</Button>
      </footer>
    </Card> : null}

    {execution ? <Card className="grid gap-4 p-5" aria-label="Tiến trình phân bổ">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-body text-caption font-semibold uppercase tracking-[0.12em] text-octo-ember">TIẾN TRÌNH MÁY CHỦ</p>
          <h3 className="mt-1 font-display text-lg font-bold text-on-surface">{allocationPhaseLabel(execution.phase)}</h3>
          <p className="mt-1 font-body text-caption text-graphite">Kế hoạch {execution.plan_id.slice(0, 8)} · Bắt đầu {allocationDateTime(execution.started_at ?? execution.created_at)} {execution.finished_at ? `· Kết thúc ${allocationDateTime(execution.finished_at)}` : ''}</p>
        </div>
        <StatusBadge tone={allocationPlanStatusTone(execution.status)}>{allocationPlanStatusLabel(execution.status)}</StatusBadge>
      </header>

      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Stat label="POS quota mong muốn" value={`${(preview?.desired_pos_mode ?? posState?.desired_pos_mode ?? 'shared') === 'dedicated' ? 'Dedicated' : 'Shared'} · ${allocationQuantity(preview?.desired_pos_quota ?? posState?.desired_pos_quota ?? 0)}`} detail="Mục tiêu, chưa đồng nghĩa đã có hiệu lực" />
        <Stat label="POS quota đang hiệu lực" value={allocationQuantity(posState?.active_pos_quota)} detail="Chỉ đổi sau xác minh cuối" />
        <Stat label="POS remaining hiện tại" value={allocationQuantity(posState?.pos_remaining)} detail={posState?.pos_transition_state === 'pending' ? 'POS đang bị khóa trong chuyển đổi' : 'Quyền bán backend đã cấp'} />
        <Stat label="Kênh chưa xác minh" value={execution.steps.filter((step) => step.status !== 'verified').length.toLocaleString('vi-VN')} detail={execution.steps.filter((step) => step.status !== 'verified').map((step) => channelCodeLabel(step.channel_code)).join(', ') || 'Tất cả bước đã xác minh'} tone={execution.steps.some((step) => step.status !== 'verified') ? 'danger' : 'success'} />
      </dl>

      {execution.status === 'applying' ? <p role="status" className="rounded-control border border-badge-info-text/20 bg-badge-info-bg px-3 py-2 font-body text-body-sm text-badge-info-text">Máy chủ vẫn đang áp dụng và xác minh từng kênh. POS quota mới chưa được phép bán; chỉ khi trạng thái chuyển thành “Hoàn tất” mới coi là đã xác minh.</p> : null}
      {execution.status === 'completed' ? <p role="status" className="rounded-control border border-emerald-300 bg-emerald-50 px-3 py-2 font-body text-body-sm text-emerald-950">Máy chủ đã xác minh tất cả bước và đánh dấu kế hoạch hoàn tất. POS remaining mới sẽ được đọc lại từ Backend.</p> : null}
      {execution.status === 'paused' || execution.status === 'blocked' || execution.status === 'superseded' ? <div role="alert" className="grid gap-1 rounded-control border border-amber-300 bg-amber-50 px-3 py-2 font-body text-body-sm text-amber-950"><strong>Kế hoạch đã dừng trước khi hoàn tất; quota mong muốn chưa được coi là quota có hiệu lực.</strong><span>Làm mới trạng thái quota và các kênh chưa xác minh, xử lý lý do lỗi bên dưới rồi tạo kế hoạch mới nếu cần.</span></div> : null}

      {execution.last_error ? (() => {
        const runtime = allocationRuntimeError(execution.last_error);
        return runtime ? <div role="alert" className="rounded-control border border-error/20 bg-error-container/40 px-3 py-2 font-body text-body-sm text-error"><strong>{runtime.message}</strong>{runtime.detail ? <p className="mt-1">{runtime.detail}</p> : null}<code className="mt-1 block break-all font-mono text-[11px]">{runtime.code}</code></div> : null;
      })() : null}
      {progressError ? <p role="status" className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 font-body text-caption text-amber-950">{progressError} Trạng thái bên dưới là lần đọc thành công gần nhất.</p> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-body text-caption text-graphite">{execution.steps.length > 0 ? `Đã xác minh ${execution.steps.filter((step) => step.status === 'verified').length.toLocaleString('vi-VN')}/${execution.steps.length.toLocaleString('vi-VN')} bước.` : 'Máy chủ chưa tạo bước thực thi; đang kiểm tra điều kiện và đọc lại tồn.'}</p>
        <Button size="sm" variant="secondary" onClick={() => void refreshProgress()} loading={busy === 'progress'} disabled={busy === 'execute'}>Làm mới tiến trình</Button>
      </div>

      {execution.steps.length > 0 ? <div className="grid gap-2">{execution.steps.map((step) => <AllocationStep key={step.id} step={step} />)}</div> : null}
    </Card> : null}

    <Modal
      open={confirmationOpen}
      onClose={() => { if (busy !== 'execute') setConfirmationOpen(false); }}
      title="Áp dụng kế hoạch phân bổ?"
      footer={<>
        <Button variant="ghost" disabled={busy === 'execute'} onClick={() => setConfirmationOpen(false)}>Quay lại</Button>
        <Button loading={busy === 'execute'} disabled={!canConfirmPlan} onClick={() => void confirmExecute()}>Xác nhận áp dụng</Button>
      </>}
    >
      {preview && summary ? <div className="grid gap-4">
        <PreviewSummaryDetails preview={preview} summary={summary} />
        {preview.items.some((item) => item.channel_code === 'lazada' && item.will_participate && item.change === 'increase') ? <p role="status" className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 font-body text-body-sm text-amber-950">Khi xác nhận, máy chủ sẽ đọc tồn Lazada, gửi phần chênh lệch qua API và đọc lại để xác minh. Nếu Lazada chưa cho đọc đơn, hãy bảo đảm các đơn chưa nhập Core đã được trừ khỏi tồn Core trước khi tăng quota.</p> : null}
        {!canConfirmPlan ? <p role="status" className="rounded-control border border-amber-300 bg-amber-50 px-3 py-2 font-body text-body-sm text-amber-950">{!canExecute ? 'Chỉ ADMIN được xác nhận áp dụng kế hoạch.' : locked ? 'Có thay đổi chưa hoàn tất nên chưa thể áp dụng kế hoạch.' : summary.blockedItems.length > 0 || preview.issues.length > 0 || !preview.can_execute ? 'Kế hoạch còn điểm chặn; xử lý các mục ở trên rồi xem trước lại.' : summary.exceedsAts ? 'Tổng quota dự kiến vượt ngân sách online.' : 'Kế hoạch chưa sẵn sàng để xác nhận.'}</p> : null}
      </div> : null}
    </Modal>
  </section>;
}
