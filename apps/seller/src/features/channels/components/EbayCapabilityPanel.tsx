import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { getEbayCapabilities, verifyEbayChannel, type EbayCapability, type EbayCapabilityStatus } from '../../../api/ebay';

const groups = [
  { id: 'account', title: 'Tài khoản', description: 'Danh tính seller và trạng thái đăng ký bán.', keys: ['account_identity', 'seller_account'], icon: 'person' },
  { id: 'readiness', title: 'Điều kiện đăng bán', description: 'Location, ba business policies và seller opt-in theo marketplace.', keys: ['inventory_locations_read', 'payment_policies', 'fulfillment_policies', 'return_policies', 'selling_policy_opt_in'], icon: 'checklist' },
  { id: 'products', title: 'Sản phẩm', description: 'Đọc catalogue; tạo Offer chỉ chạy khi feature flag Sandbox bật.', keys: ['inventory_items_read', 'offers_read', 'product_publish'], icon: 'sell' },
  { id: 'inventory', title: 'Tồn kho', description: 'Quyền đọc và ghi số lượng trong Sandbox.', keys: ['inventory_write'], icon: 'inventory_2' },
  { id: 'orders', title: 'Đơn hàng', description: 'Đọc đơn và quyền tạo shipping fulfillment.', keys: ['orders_read', 'fulfillment_write'], icon: 'receipt_long' },
  { id: 'notifications', title: 'Thông báo', description: 'Subscription và khả năng nhận thông báo.', keys: ['notifications'], icon: 'notifications' },
] as const;

const statusLabels: Record<EbayCapabilityStatus, string> = {
  VERIFIED: 'Đã kiểm chứng', GRANTED_UNTESTED: 'Được cấp, chưa kiểm chứng', NOT_GRANTED: 'Thiếu quyền',
  NOT_REQUESTED: 'Chưa yêu cầu', NOT_CONFIGURED: 'Chưa cấu hình', NOT_SUPPORTED: 'Chưa hỗ trợ',
  FAILED: 'Lỗi kiểm tra', DENIED: 'Bị từ chối',
};
const statusTone: Record<EbayCapabilityStatus, 'neutral' | 'success' | 'warning' | 'danger'> = {
  VERIFIED: 'success', GRANTED_UNTESTED: 'warning', NOT_GRANTED: 'danger', NOT_REQUESTED: 'neutral',
  NOT_CONFIGURED: 'neutral', NOT_SUPPORTED: 'neutral', FAILED: 'danger', DENIED: 'danger',
};
const filterOptions: Array<{ id: string; label: string; matches: (status: EbayCapabilityStatus) => boolean }> = [
  { id: 'all', label: 'Tất cả', matches: () => true },
  { id: 'verified', label: 'Đã kiểm chứng', matches: (status) => status === 'VERIFIED' },
  { id: 'untested', label: 'Được cấp, chưa kiểm chứng', matches: (status) => status === 'GRANTED_UNTESTED' },
  { id: 'action', label: 'Cần xử lý', matches: (status) => ['NOT_GRANTED', 'FAILED', 'DENIED'].includes(status) },
  { id: 'not-configured', label: 'Chưa cấu hình', matches: (status) => ['NOT_CONFIGURED', 'NOT_REQUESTED', 'NOT_SUPPORTED'].includes(status) },
];

export function EbayCapabilityPanel({ channelId, canManage }: { channelId: string; canManage: boolean }) {
  const [items, setItems] = useState<EbayCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);

  const refresh = useCallback(async (signal?: AbortSignal) => {
    setLoading(!signal);
    setError(null);
    try { setItems(await getEbayCapabilities(channelId, signal)); }
    catch (cause) { if (!signal?.aborted) setError(cause); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, [channelId]);

  useEffect(() => {
    const controller = new AbortController();
    void refresh(controller.signal);
    return () => controller.abort();
  }, [refresh]);

  const verify = async () => {
    if (!canManage || refreshing) return;
    setRefreshing(true); setActionError(null);
    try { await verifyEbayChannel(channelId); await refresh(); }
    catch (cause) { setActionError(cause instanceof Error ? cause.message : 'Không thể kiểm tra quyền eBay.'); }
    finally { setRefreshing(false); }
  };

  const verified = items.filter((item) => item.verification_status === 'VERIFIED').length;
  const untested = items.filter((item) => item.verification_status === 'GRANTED_UNTESTED').length;
  const needsAction = items.filter((item) => ['NOT_GRANTED', 'FAILED', 'DENIED'].includes(item.verification_status)).length;
  const lastVerified = items.reduce<string | undefined>((latest, item) => !latest || item.verified_at > latest ? item.verified_at : latest, undefined);
  const selectedFilter = filterOptions.find((option) => option.id === filter) ?? filterOptions[0]!;
  const needle = query.trim().toLocaleLowerCase('vi');

  return <Card className="grid min-w-0 gap-4 p-4 sm:p-5">
    <header className="flex flex-wrap items-start justify-between gap-3">
      <div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Quyền API eBay Sandbox</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Bằng chứng capability</h2><p className="mt-1 max-w-2xl text-sm leading-6 text-graphite">Xác minh seller dùng các phép đọc an toàn; đồng bộ tồn chỉ thành công sau khi đọc lại khớp cả Inventory Item và Offer.</p></div>
      {canManage ? <Button variant="secondary" size="sm" loading={refreshing} loadingLabel="Đang xác minh…" onClick={() => void verify()} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">verified_user</span>}>Xác minh quyền</Button> : null}
    </header>
    <div className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label="Tổng quan quyền API eBay">
      <Metric label="Đã kiểm chứng" value={verified} />
      <Metric label="Được cấp, chưa kiểm chứng" value={untested} />
      <Metric label="Cần xử lý" value={needsAction} />
      <Metric label="Kiểm tra gần nhất" value={formatTime(lastVerified)} />
    </div>
    {actionError ? <p role="alert" className="rounded-control border border-error/40 bg-error/5 p-3 text-sm leading-5 text-error">{actionError}</p> : null}
    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(13rem,0.5fr)] sm:items-end">
      <label className="grid gap-1.5 text-caption font-semibold text-on-surface">Tìm capability hoặc scope<input value={query} onChange={(event) => setQuery(event.target.value)} className="min-h-10 rounded-control border border-outline-variant bg-pure-white px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-focus" placeholder="Ví dụ: inventory, sell.fulfillment…" /></label>
      <label className="grid gap-1.5 text-caption font-semibold text-on-surface">Trạng thái<select value={filter} onChange={(event) => setFilter(event.target.value)} className="min-h-10 rounded-control border border-outline-variant bg-pure-white px-3 text-sm font-normal outline-none focus-visible:ring-2 focus-visible:ring-focus">{filterOptions.map((option) => <option key={option.id} value={option.id}>{option.label}</option>)}</select></label>
    </div>
    {loading ? <LoadingState label="Đang tải bằng chứng eBay…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => void refresh()} /> : null}
    {!loading && !error && items.length === 0 ? <EmptyState title="Chưa có lần xác minh quyền" detail="Kết nối seller rồi chạy xác minh chỉ đọc để lưu bằng chứng API." /> : null}
    {!loading && !error && items.length > 0 ? <div className="grid min-w-0 gap-2">{groups.map((group) => {
      const groupItems = items.filter((item) => (group.keys as readonly string[]).includes(item.capability_key));
      const entries = groupItems.filter((item) => selectedFilter.matches(item.verification_status) && (!needle || [item.capability_key, item.operation, ...(item.required_scopes ?? []), ...(item.granted_scopes ?? [])].join(' ').toLocaleLowerCase('vi').includes(needle)));
      if (entries.length === 0) return null;
      const unverifiedCount = groupItems.filter((item) => item.verification_status !== 'VERIFIED').length;
      const groupLabel = unverifiedCount === 0 ? 'Tất cả đã kiểm chứng' : `${unverifiedCount} cần xem`;
      return <details key={group.id} className={`min-w-0 rounded-card border ${unverifiedCount ? 'border-apricot/70' : 'border-outline-variant/60'}`}>
        <summary className="flex min-h-14 cursor-pointer list-none flex-wrap items-center justify-between gap-3 px-4 py-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"><span className="flex min-w-0 items-center gap-3"><span className="material-symbols-outlined text-xl text-on-surface-variant" aria-hidden="true">{group.icon}</span><span className="min-w-0"><strong className="block text-sm text-on-surface">{group.title}</strong><span className="mt-0.5 block text-xs text-graphite">{group.description}</span></span></span><span className="flex flex-wrap items-center gap-2"><StatusBadge tone={unverifiedCount ? 'warning' : 'success'}>{groupLabel}</StatusBadge><span className="text-caption text-graphite">{entries.length} / {groupItems.length} capability đang hiển thị</span></span></summary>
        <div className="grid gap-2 border-t border-outline-variant/50 p-3">{entries.map((item) => <details key={item.capability_key} className="min-w-0 rounded-control bg-surface-container-low p-3">
          <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center justify-between gap-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"><span className="min-w-0"><strong className="block break-words text-sm text-on-surface">{friendlyName(item.capability_key)}</strong><span className="mt-1 block break-all font-mono text-xs text-graphite">{(item.required_scopes ?? []).join(', ') || 'Không yêu cầu scope'}</span>{item.safe_error_code ? <span className="mt-1 block text-xs text-error">{friendlyError(item.safe_error_code)}</span> : null}</span><StatusBadge tone={statusTone[item.verification_status]}>{statusLabels[item.verification_status]}</StatusBadge></summary>
          <dl className="mt-3 grid min-w-0 gap-2 border-t border-outline-variant/50 pt-3 text-xs sm:grid-cols-2"><Fact label="Operation" value={item.operation} /><Fact label="Scope đã cấp" value={(item.granted_scopes ?? []).join(', ') || 'Không có'} /><Fact label="HTTP status" value={item.http_status ? String(item.http_status) : 'Chưa gọi'} /><Fact label="Request ID" value={item.request_id || '—'} /><Fact label="Mã bằng chứng" value={item.evidence_reference} /><Fact label="Kiểm tra lúc" value={formatTime(item.verified_at)} /></dl>
        </details>)}</div>
      </details>;
    })}</div> : null}
  </Card>;
}

function Metric({ label, value }: { label: string; value: number | string }) { return <div className="grid min-w-0 gap-2 rounded-control border border-outline-variant/50 bg-surface-container-low p-3"><span className="text-xs leading-4 text-graphite">{label}</span><strong className="truncate font-display text-xl tabular-nums text-on-surface" title={typeof value === 'string' ? value : undefined}>{value}</strong></div>; }
function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-graphite">{label}</dt><dd className="mt-1 break-all font-mono text-on-surface">{value}</dd></div>; }
function friendlyName(value: string): string { const names: Record<string,string>={account_identity:'Danh tính tài khoản',seller_account:'Trạng thái đăng ký seller',inventory_items_read:'Đọc Inventory Item',offers_read:'Đọc Offer',inventory_locations_read:'Đọc inventory location',payment_policies:'Payment policy',fulfillment_policies:'Fulfillment policy',return_policies:'Return policy',selling_policy_opt_in:'Seller opt-in Business Policies',inventory_write:'Ghi tồn kho',product_publish:'Đăng bán Offer',orders_read:'Đọc đơn hàng',fulfillment_write:'Gửi tracking shipment',notifications:'Webhook / Notification'};return names[value]??value; }
function friendlyError(value: string): string { const labels:Record<string,string>={SELLER_NOT_READY:'Tài khoản Seller chưa hoàn tất đăng ký bán.',MISSING_SCOPE:'Ứng dụng chưa được cấp scope cần thiết.',WRITE_DISABLED:'Thao tác ghi đang bị khóa an toàn.',NOT_IMPLEMENTED:'Capability này chưa được triển khai.',CAPABILITY_UNAVAILABLE:'Notification subscription chưa có entitlement hoặc chưa được triển khai; OctoFlow tiếp tục polling đơn hàng.',INVENTORY_LOCATION_MISSING:'Seller chưa tạo inventory location cho listing.',BUSINESS_POLICY_MISSING:'Seller cần tạo policy này trên eBay trước khi đăng bán.',SELLING_POLICY_OPT_IN_REQUIRED:'Seller cần bật Business Policies trong cài đặt eBay.'};return labels[value]??`Mã xử lý: ${value}`; }
function formatTime(value?: string): string { if(!value)return 'Chưa có';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'medium',timeStyle:'short'}); }
