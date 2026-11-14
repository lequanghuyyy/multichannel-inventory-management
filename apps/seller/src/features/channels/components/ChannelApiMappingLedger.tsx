import { Fragment, useState } from 'react';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import type { Channel, ChannelMapping, ChannelMappingIssue } from '../../../api/channels';
import { channelErrorMessage } from '../channel-messages';

const pushLabels: Record<string, string> = {
  never: 'Chưa gửi lần nào',
  unknown: 'Đã gửi, chưa có phản hồi',
  superseded: 'Tồn kho đã đổi, chưa gửi lại',
  current: 'Đã gửi phiên bản hiện tại',
};

const pushTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  never: 'neutral',
  unknown: 'warning',
  superseded: 'warning',
  current: 'success',
};

const mappingStatus: Record<ChannelMapping['mapping_status'], { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' }> = {
  verified: { label: 'Đã xác minh', tone: 'success' },
  unverified: { label: 'Chưa xác minh', tone: 'neutral' },
  needs_attention: { label: 'Cần xử lý', tone: 'danger' },
  stale: { label: 'Cần xác minh lại', tone: 'warning' },
};

const issueLabels: Record<string, string> = {
  missing_sku: 'Shopify variant thiếu SKU',
  invalid_external_id: 'ID Shopify không hợp lệ',
  duplicate_shopify_sku: 'SKU xuất hiện ở nhiều Shopify variants',
  duplicate_shopify_variant_id: 'Shopify trả trùng variant ID',
  core_sku_missing: 'Không tìm thấy SKU chính xác trong Core',
  core_sku_duplicate: 'SKU Core không duy nhất',
  inventory_item_missing: 'Thiếu inventory item',
  inventory_not_tracked: 'Inventory tracking đang tắt',
  location_missing: 'Không có tồn tại location đã cấu hình',
  mapping_conflict: 'Mapping hiện có không khớp listing Shopify',
  product_not_active: 'Sản phẩm Shopify chưa Active',
  core_product_not_active: 'Sản phẩm Core chưa hoạt động',
  stale_shopify_listing: 'Listing cũ không còn trong snapshot Shopify',
  invalid_sku: 'SKU eBay không hợp lệ',
  duplicate_ebay_sku: 'SKU bị trùng trên eBay',
  remote_item_missing: 'Inventory Item eBay không còn tồn tại',
  offer_missing: 'Không có Offer cho Marketplace đã cấu hình',
  marketplace_mismatch: 'Offer thuộc Marketplace khác',
};

const syncErrorLabels: Record<string, string> = {
  CHANNEL_UNAVAILABLE: 'Kênh Shopify chưa được xác minh hoặc kết nối',
  WRITE_DISABLED: 'Cờ ghi tồn Shopify đang tắt',
  MAPPING_UNAVAILABLE: 'Không đọc được mapping',
  MAPPING_INVALID: 'SKU, tracking hoặc location chưa hợp lệ',
  TARGET_INVALID: 'Số lượng hoặc phiên bản yêu cầu không hợp lệ',
  CORE_SNAPSHOT_UNAVAILABLE: 'Không đọc được snapshot tồn Core',
  VERSION_SUPERSEDED: 'Có phiên bản Core mới hơn',
  ALLOCATION_INVALID: 'Quota listing không còn khớp phân bổ Core',
  ORDER_STATE_UNAVAILABLE: 'Không xác định được trạng thái đơn Shopify',
  ORDER_EVENT_PENDING: 'Đang chờ xử lý order event',
  REMOTE_READ_FAILED: 'Không đọc được tồn tại Shopify',
  REMOTE_QUANTITY_INVALID: 'Shopify trả về available không hợp lệ',
  BASELINE_REQUIRED: 'Cần số tồn Shopify đã xác minh trước khi tăng',
  ORDER_WEBHOOKS_REQUIRED: 'Cần cấu hình webhook orders/create và orders/cancelled',
  ORDER_WEBHOOKS_PCD_REQUIRED: 'Shopify chưa duyệt Protected Customer Data nên chưa tạo được webhook đơn hàng',
  READ_ORDERS_SCOPE_REQUIRED: 'Thiếu quyền read_orders',
  ORDER_ACCOUNTING_UNAVAILABLE: 'Không kiểm tra được Core order accounting',
  UNPROCESSED_ORDER: 'Có mức giảm tồn Shopify chưa được ghi nhận trong Core',
  WRITE_INVENTORY_SCOPE_REQUIRED: 'Thiếu quyền write_inventory',
  READBACK_MISMATCH: 'Shopify read-back khác số lượng yêu cầu',
  READBACK_RATE_LIMITED: 'Shopify đã nhận thay đổi; read-back đang chờ API capacity',
  READBACK_UNVERIFIED: 'Chưa hoàn tất xác minh độc lập',
  RETRY_DEFERRED: 'Yêu cầu đã được dời sang lần thử tiếp theo',
};

function number(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('vi-VN');
}

function syncEvidence(mapping: ChannelMapping, provider = 'Shopify'): { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' } {
  if (mapping.sync_pending) return { label: 'PENDING · Đang chờ đồng bộ tồn kho', tone: 'warning' };
  if (mapping.latest_sync_status === 'BLOCKED') return { label: 'BLOCKED · Bị chặn', tone: 'danger' };
  if (!mapping.latest_sync_status) {
    return { label: 'UNVERIFIED · Chưa có bằng chứng xác minh', tone: 'warning' };
  }
  if (mapping.mapping_status !== 'verified' || mapping.quantity_basis !== 'ats') {
    return { label: 'UNVERIFIED · Mapping tồn kho chưa được xác minh', tone: 'warning' };
  }
  if (mapping.core_version == null || mapping.target_version !== mapping.core_version || mapping.target_quantity == null) {
    return { label: 'PENDING · Phân bổ tồn kho đã cũ', tone: 'warning' };
  }
  if (mapping.latest_sync_target_version !== mapping.target_version || mapping.latest_sync_core_version !== mapping.core_version ||
      mapping.latest_sync_requested_available !== mapping.target_quantity) {
    return { label: 'SUPERSEDED · Lần thử thuộc phiên bản cũ', tone: 'warning' };
  }
  switch (mapping.latest_sync_status) {
    case 'VERIFIED':
      if (!mapping.latest_sync_verified_at || mapping.latest_sync_remote_after == null) return { label: 'UNVERIFIED · Thiếu read-back', tone: 'warning' };
      if (mapping.latest_sync_remote_after !== mapping.latest_sync_requested_available) return { label: `MISMATCH · ${provider} khác mục tiêu`, tone: 'danger' };
      return { label: `VERIFIED · Đã xác minh từ ${provider}`, tone: 'success' };
    case 'MISMATCH': return { label: `${provider} báo sai số`, tone: 'danger' };
    case 'UNVERIFIED': return { label: 'Chưa xác minh', tone: 'warning' };
    case 'DEFERRED': return {
      label: mapping.latest_sync_mutation_acknowledged ? `${provider} đã nhận, chờ xác minh` : 'Đang chờ thử lại',
      tone: 'warning',
    };
    case 'SUPERSEDED': return { label: 'Phiên bản đã cũ', tone: 'warning' };
    default: return { label: 'Chưa xác định', tone: 'neutral' };
  }
}

function ebayEvidence(mapping: ChannelMapping): { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' } {
  if (mapping.quantity_basis !== 'ats') return { label: 'UNVERIFIED · Listing chưa có cơ sở ATS', tone: 'warning' };
  if (mapping.core_version == null) return { label: 'UNVERIFIED · Chưa có snapshot ATS Core', tone: 'warning' };
  if (mapping.target_version !== mapping.core_version) return { label: 'Phân bổ đã cũ, đang chờ đối soát lại', tone: 'warning' };
  if (mapping.reported_quantity == null || !mapping.reported_at) return { label: 'Chưa đọc được số lượng từ eBay Offer', tone: 'neutral' };

  const observedAt = new Date(mapping.reported_at).getTime();
  if (!Number.isFinite(observedAt) || Date.now() - observedAt > 15 * 60 * 1000) {
    return { label: 'UNVERIFIED · Lần đọc Offer đã cũ', tone: 'warning' };
  }
  if (mapping.target_quantity == null) return { label: 'Đã đọc Offer, chưa có mục tiêu phân bổ', tone: 'warning' };
  if (mapping.reported_quantity !== mapping.target_quantity) return { label: 'MISMATCH · Offer khác mục tiêu phân bổ', tone: 'danger' };
  return { label: 'VERIFIED · Offer khớp mục tiêu (chỉ đọc)', tone: 'success' };
}

/**
 * The three reconciliation numbers, on the basis the row was written with.
 *
 * An ATS row is compared on what a buyer can actually buy (core on_hand minus reserved minus
 * safety buffer) against the pushed and reported quantity. A legacy row is compared on gross
 * on_hand, exactly as it was before the ATS change — reading its old numbers as sellable would
 * flag every historical row as drift. "Core" stays NULL when the balance is missing, so a
 * broken row renders as "—" rather than a sold-out zero.
 */
function reconciliation(mapping: ChannelMapping, ebay: boolean): { globalATS: number | null; target: number | null; sent: number | null; reported: number | null } {
  if (ebay && mapping.quantity_basis !== 'ats') return { globalATS: null, target: null, sent: null, reported: null };
  if (mapping.quantity_basis === 'ats') {
    const globalATS = mapping.core_on_hand == null || mapping.core_reserved == null || mapping.core_safety_buffer == null
      ? null
      : Math.max(0, mapping.core_on_hand - mapping.core_reserved - mapping.core_safety_buffer);
    return {
      globalATS,
      target: mapping.target_quantity ?? (ebay ? null : globalATS),
      sent: mapping.pushed_quantity ?? null,
      reported: mapping.reported_quantity ?? null,
    };
  }
  return { globalATS: mapping.core_on_hand ?? null, target: null, sent: mapping.pushed_on_hand ?? null, reported: mapping.reported_on_hand ?? null };
}

/**
 * The reconciliation ledger.
 *
 * Three numbers per row: what the core holds, what we last pushed, and what the channel says
 * it holds. The whole screen exists to make those three comparable, and `drifted` is computed
 * SERVER-side so every client classifies the same row the same way — re-deriving the rule in
 * the browser is how two screens end up disagreeing about whether a shop is in sync.
 *
 * The basis is shown per row because the numbers mean different things on different bases: a
 * row still on 'legacy' is holding gross on_hand numbers from before the ATS change, and a
 * reader who compared it against an ATS row's figure would be comparing a gross number with a
 * sellable one.
 *
 * A NULL core quantity renders as "—" and not as zero. A variant whose balance row is missing
 * is a broken row, and rendering it as sold out would hide the exact thing this screen is
 * built to surface.
 */
export function ChannelApiMappingLedger({
  mappings,
  totalCount = mappings.length,
  issues = [],
  issueCount = issues.length,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  shopify = false,
  ebay = false,
  woocommerce = false,
}: {
  mappings: ChannelMapping[];
  totalCount?: number;
  issues?: ChannelMappingIssue[];
  issueCount?: number;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  shopify?: boolean;
  ebay?: boolean;
  woocommerce?: boolean;
}) {
  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});
  const drifted = mappings.filter((mapping) => mapping.drifted).length;
  const ats = mappings.filter((mapping) => mapping.quantity_basis === 'ats').length;
  return (
    <div className="grid gap-4">
      <Card className="overflow-hidden p-0">
        <header className="flex flex-col justify-between gap-2 border-b border-outline-variant/50 px-5 py-4 sm:flex-row sm:items-center">
          <div>
            <h2 className="font-display text-lg font-bold text-on-surface">Sổ đối soát SKU</h2>
            <p className="mt-1 font-body text-caption text-graphite">
              {mappings.length} / {totalCount} dòng đã tải · lệch: {drifted} · tính theo số có thể bán: {ats}
            </p>
          </div>
        </header>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1080px] border-collapse text-left">
            <caption className="sr-only">Đối soát tồn kho giữa hệ thống và kênh bán</caption>
            <thead>
              <tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
                <th className="px-5">SKU trên kênh</th>
                <th className="px-3">SKU nội bộ</th>
                <th className="px-3">Cơ sở</th>
                <th className="px-3 text-right">Hệ thống</th>
                <th className="px-3 text-right">Giới hạn listing</th>
                <th className="px-3 text-right">{ebay ? 'Đã ghi kênh' : 'Đã gửi'}</th>
                <th className="px-3 text-right">{ebay ? 'Offer báo' : 'Kênh báo'}</th>
                <th className="px-3">{ebay ? 'Đối chiếu' : 'Gửi'}</th>
                <th className="px-5 text-right">{ebay ? 'Core / ghi kênh' : 'Phiên bản'}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container">
              {mappings.map((mapping) => {
                const { globalATS, target, sent, reported } = reconciliation(mapping, ebay);
                const provider = woocommerce ? 'WooCommerce' : 'Shopify';
                const evidence = ebay ? ebayEvidence(mapping) : syncEvidence(mapping, provider);
                const isATS = mapping.quantity_basis === 'ats';
                const expanded = Boolean(expandedRows[mapping.id]);
                const detailId = `channel-mapping-detail-${mapping.id}`;
                return (
                  <Fragment key={mapping.id}>
                  <tr className="font-body text-body-sm">
                    <td className="px-5 py-3">
                      <code className="font-mono text-on-surface">{mapping.external_sku}</code>
                      {!mapping.listed ? <span className="mt-1 block font-body text-[10px] uppercase text-graphite">chưa đăng bán</span> : null}
                      {shopify || woocommerce ? <button type="button" aria-expanded={expanded} aria-controls={expanded ? detailId : undefined} onClick={() => setExpandedRows((current) => ({ ...current, [mapping.id]: !current[mapping.id] }))} className="mt-1 block rounded-sm text-left text-[10px] font-semibold text-on-surface underline decoration-outline-variant underline-offset-2 hover:text-secondary">{expanded ? 'Ẩn chi tiết' : 'Chi tiết mapping'}</button> : null}
                    </td>
                    <td className="px-3 py-3">
                      <code className="font-mono text-on-surface-variant">{mapping.canonical_sku}</code>
                      {!mapping.variant_is_active ? <span className="mt-1 block font-body text-[10px] uppercase text-graphite">ngừng bán</span> : null}
                      {shopify || woocommerce ? <span className="mt-1 block"><StatusBadge tone={mappingStatus[mapping.mapping_status]?.tone ?? 'neutral'}>{mappingStatus[mapping.mapping_status]?.label ?? mapping.mapping_status ?? 'Chưa xác minh'}</StatusBadge></span> : null}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge tone={isATS ? 'success' : 'neutral'}>
                        {isATS ? 'Số có thể bán' : 'Tồn kho gộp (cũ)'}
                      </StatusBadge>
                    </td>
                    <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{number(globalATS)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{number(target)}</td>
                    <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{number(sent)}</td>
                    <td className="px-3 py-3 text-right tabular-nums">
                      <span className={mapping.drifted ? 'font-semibold text-apricot' : 'text-on-surface-variant'}>{number(reported)}</span>
                    </td>
                    <td className="px-3 py-3">
                        <StatusBadge tone={ebay ? evidence.tone : mapping.latest_sync_status || shopify || woocommerce ? syncEvidence(mapping, provider).tone : pushTone[mapping.push_state] ?? 'neutral'}>{ebay ? evidence.label : mapping.latest_sync_status || shopify || woocommerce ? syncEvidence(mapping, provider).label : pushLabels[mapping.push_state] ?? mapping.push_state}</StatusBadge>
                        {mapping.latest_sync_status ? <code className="mt-1 block font-mono text-[10px] text-graphite">{mapping.latest_sync_status}</code> : null}
                        {ebay && mapping.reported_at ? <span className="mt-1 block text-[10px] text-graphite">Đọc lúc {formatDate(mapping.reported_at)}</span> : null}
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-caption text-graphite">
                      {mapping.core_version ?? '—'} / {mapping.pushed_version}
                    </td>
                  </tr>
                  {(shopify || woocommerce) && expanded ? <tr id={detailId} className="border-b border-outline-variant/40 bg-surface-container-low/40">
                    <td colSpan={9} className="px-5 py-3">
                      <dl className="grid min-w-0 gap-x-6 gap-y-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                        <Identifier label="Core Variant UUID" value={mapping.variant_id} />
                        <Identifier label={woocommerce ? 'WooCommerce Product ID' : 'Shopify Product GID'} value={mapping.external_product_id} />
                        <Identifier label={woocommerce ? 'WooCommerce Product / Variation identity' : 'Shopify Variant GID'} value={mapping.external_variant_id} />
                        <Identifier label="Inventory Item GID" value={mapping.external_inventory_item_id} />
                        <Identifier label="Location GID" value={mapping.external_location_id} />
                        <div><dt className="text-graphite">Bằng chứng đồng bộ tồn kho</dt><dd className="mt-0.5"><StatusBadge tone={syncEvidence(mapping, provider).tone}>{syncEvidence(mapping, provider).label}</StatusBadge></dd></div>
                        <div><dt className="text-graphite">Lần thử gần nhất</dt><dd className="mt-0.5 font-mono text-on-surface">{formatDate(mapping.latest_sync_attempt_at)}</dd></div>
                        <div><dt className="text-graphite">Yêu cầu / Shopify đọc lại</dt><dd className="mt-0.5 font-mono tabular-nums text-on-surface">{number(mapping.latest_sync_requested_available)} / {number(mapping.latest_sync_remote_after)}</dd></div>
                        <div><dt className="text-graphite">Phiên bản Core / listing</dt><dd className="mt-0.5 font-mono tabular-nums text-on-surface">{mapping.latest_sync_core_version ?? '—'} / {mapping.latest_sync_target_version ?? '—'}</dd></div>
                        <div><dt className="text-graphite">Xác minh thành công gần nhất</dt><dd className="mt-0.5 font-mono text-on-surface">{formatDate(mapping.latest_sync_verified_at)}</dd></div>
                        <div><dt className="text-graphite">Shopify nhận mutation</dt><dd className="mt-0.5 text-on-surface">{mapping.latest_sync_mutation_acknowledged == null ? '—' : mapping.latest_sync_mutation_acknowledged ? 'Có' : 'Không'}</dd></div>
                        {mapping.latest_sync_error_code ? <div><dt className="text-graphite">Lý do lần thử gần nhất</dt><dd className="mt-0.5 break-words text-on-surface">{syncErrorLabels[mapping.latest_sync_error_code] ?? 'Shopify chưa xác nhận lần thử này'} <code className="font-mono text-caption text-graphite">({mapping.latest_sync_error_code})</code></dd></div> : null}
                        <div><dt className="text-graphite">SKU · tracking · xác minh</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{mapping.external_sku} · {mapping.inventory_tracking_enabled ? 'tracking bật' : 'tracking chưa xác minh'} · {formatDate(mapping.last_verified_at)}</dd></div>
                        {woocommerce ? <><div><dt className="text-graphite">WooCommerce last remote revision</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{mapping.woocommerce_remote_revision ?? 'Chưa quan sát'} · {formatDate(mapping.woocommerce_remote_observed_at)}</dd></div><div><dt className="text-graphite">Stock management</dt><dd className="mt-0.5 text-on-surface">{mapping.inventory_tracking_enabled ? 'Đang quản lý tồn' : 'Chưa xác minh hoặc tắt'}</dd></div></> : null}
                        {mapping.issue_reason ? <div><dt className="text-graphite">Lý do</dt><dd className="mt-0.5 break-words text-on-surface">{issueLabels[mapping.issue_reason] ?? mapping.issue_reason}</dd></div> : null}
                      </dl>
                    </td>
                  </tr> : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>
      {issues.length > 0 ? <Card className="grid gap-3 p-5" aria-label="Mapping chưa ghép hoặc cần xử lý">
        <header className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="font-display text-base font-bold text-on-surface">Chưa ghép / cần xử lý</h3>
            <p className="mt-1 text-xs text-graphite">{issues.length} / {issueCount} vấn đề · {ebay ? 'SKU, Inventory Item và Offer được đối chiếu từ dữ liệu eBay đã đọc.' : 'snapshot Shopify đã đọc đầy đủ trước khi lưu.'}</p>
          </div>
        </header>
        <ul className="grid gap-2">
          {issues.map((issue) => <li key={issue.external_variant_id} className="grid min-w-0 gap-2 rounded-control border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] sm:items-start">
            <div className="min-w-0">
              <code className="break-all font-mono text-sm text-on-surface">{issue.sku || 'SKU trống'}</code>
              {issue.product_title ? <p className="mt-1 break-words text-xs text-graphite">{issue.product_title}</p> : null}
              <StatusBadge tone={issue.reason === 'stale_shopify_listing' ? 'warning' : 'danger'}>{issueLabels[issue.reason] ?? issue.reason}</StatusBadge>
            </div>
            <dl className="grid min-w-0 gap-2 text-xs">
              {ebay
                ? <Identifier label="SKU / Inventory Item eBay" value={issue.external_variant_id || issue.sku} />
                : <><Identifier label="Shopify Product GID" value={issue.external_product_id} /><Identifier label="Shopify Variant GID" value={issue.external_variant_id} /></>}
              <div><dt className="text-graphite">{issue.reason === 'stale_shopify_listing' ? 'Lần phát hiện listing cũ' : 'Lần thấy gần nhất'}</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{formatDate(issue.last_seen_at)}</dd></div>
            </dl>
          </li>)}
        </ul>
      </Card> : null}
      {hasMore && onLoadMore ? <div className="flex justify-center">
        <Button variant="secondary" loading={loadingMore} disabled={loadingMore} onClick={onLoadMore}>Tải thêm mapping và lỗi</Button>
      </div> : null}
      <Card className="grid gap-2 p-5" variant="muted">
        <h3 className="font-display text-base font-bold text-on-surface">Cách đọc bảng đối soát</h3>
        <p className="font-body text-caption leading-5 text-graphite">
          <strong className="text-on-surface">Cơ sở</strong> quyết định đọc cặp số nào.
          <strong className="text-on-surface"> Số có thể bán</strong> là số khách mua được: tồn kho trừ hàng đang giữ
          và tồn đệm an toàn. <strong className="text-on-surface">Giới hạn listing</strong> là quota riêng của sản phẩm
          trên kênh, không phải tồn vật lý. <strong className="text-on-surface">Tồn kho gộp (cũ)</strong> là các dòng
          cũ ghi theo tổng tồn kho. <strong className="text-on-surface">Lệch</strong> nghĩa là kênh đang giữ số khác
          với hệ thống hoặc khác với số đã gửi. <strong className="text-on-surface">Trễ</strong> nghĩa là tồn kho đã
          đổi nhưng chưa gửi lại. Đối soát không bao giờ tự sửa tồn kho.
        </p>
      </Card>
    </div>
  );
}

function Identifier({ label, value }: { label: string; value?: string }) {
  return <div className="min-w-0"><dt className="text-graphite">{label}</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{value || '—'}</dd></div>;
}

function formatDate(value?: string | null): string {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}

export function ChannelApiHeader({ channel, onBack }: { channel: Channel; onBack: () => void }) {
  return (
    <Card className="grid gap-3 p-5" variant="muted">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-xl font-bold text-on-surface">{channel.name}</h1>
          <code className="font-mono text-caption text-graphite">{channel.code}</code>
        </div>
        <StatusBadge tone={channel.status === 'connected' ? 'success' : channel.status === 'error' ? 'danger' : 'neutral'}>
          {{ connected: 'Đang kết nối', disconnected: 'Chưa kết nối', syncing: 'Đang đồng bộ', error: 'Lỗi' }[channel.status] ?? channel.status}
        </StatusBadge>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}>← Kênh bán</Button>
      </div>
      {channel.last_error ? (
        <p className="font-body text-caption text-graphite">Lý do: <strong className="text-on-surface">{channelErrorMessage(channel.last_error)}</strong></p>
      ) : null}
    </Card>
  );
}
