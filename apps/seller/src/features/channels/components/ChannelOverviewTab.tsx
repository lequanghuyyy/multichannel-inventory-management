import { useEffect, useState } from 'react';
import { getChannelAPICapabilities, type Channel, type ChannelMapping, type ChannelMappingIssue, type ShopifyCapabilityEvidence, type ShopifyCapabilityReport } from '../../../api/channels';
import type { ShopifyStatus } from '../../../api/shopify';
import { getWooCommerceStatus, getWooCommerceWebhookHealth, type WooCommerceStatus, type WooCommerceWebhookHealth } from '../../../api/woocommerce';
import { getEbayCapabilities, getEbayOperationalStatus, getEbayStatus, type EbayCapability, type EbayOperationalStatus, type EbayStatus } from '../../../api/ebay';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { LoadingState } from '../../../components/common/ScreenState';
import type { ChannelWorkspaceTab } from './ChannelWorkspaceTabs';

const capabilityGroups = [
  { id: 'shop', label: 'Thông tin shop', icon: 'storefront', keys: ['shop_identity'] },
  { id: 'products', label: 'Sản phẩm', icon: 'sell', keys: ['product_read', 'product_write'] },
  { id: 'inventory', label: 'Tồn kho', icon: 'inventory_2', keys: ['location_read', 'inventory_read', 'inventory_write'] },
  { id: 'orders', label: 'Đơn hàng', icon: 'receipt_long', keys: ['orders_read'] },
  { id: 'webhooks', label: 'Webhook', icon: 'webhook', keys: ['webhook_subscription_read', 'webhook_subscription_write', 'webhook_delivery', 'webhook_product_update', 'webhook_inventory_update', 'webhook_orders_update', 'webhook_app_uninstalled'] },
] as const;

type SummaryState = { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger'; detail?: string };

function summarize(items: ShopifyCapabilityEvidence[]): SummaryState {
  if (items.length === 0) return { label: 'Chưa kiểm tra', tone: 'neutral' };
  const statuses = items.map((item) => item.verification_status);
  if (statuses.every((status) => status === 'VERIFIED')) return { label: 'Đã kiểm chứng', tone: 'success', detail: `${items.length} capability đã có bằng chứng đọc lại thành công.` };
  const problem = items.find((item) => ['DENIED', 'FAILED', 'NOT_GRANTED'].includes(item.verification_status));
  if (problem) return { label: 'Cần xử lý', tone: 'danger', detail: problem.reason || `${items.filter((item) => ['DENIED', 'FAILED', 'NOT_GRANTED'].includes(item.verification_status)).length} capability thiếu quyền hoặc gặp lỗi.` };
  if (statuses.includes('GRANTED_UNTESTED')) return { label: 'Được cấp · chưa kiểm tra', tone: 'warning' };
  if (statuses.every((status) => status === 'NOT_SUPPORTED')) return { label: 'Không hỗ trợ', tone: 'neutral', detail: 'Nền tảng không hỗ trợ nhóm operation này.' };
  return { label: 'Chưa cấu hình', tone: 'neutral' };
}

function issueLabel(issue: ChannelMappingIssue): string {
  const labels: Record<string, string> = {
    missing_sku: 'Variant trên Shopify chưa có SKU', duplicate_shopify_sku: 'SKU xuất hiện trên nhiều variant',
    core_sku_missing: 'Không tìm thấy SKU chính xác trong Core', core_sku_duplicate: 'SKU trong Core không duy nhất',
    inventory_not_tracked: 'Shopify chưa bật theo dõi tồn kho', location_missing: 'Chưa có tồn tại location đã cấu hình',
    mapping_conflict: 'Mapping khác với listing Shopify', stale_shopify_listing: 'Listing cũ cần xác minh lại',
  };
  return labels[issue.reason] ?? issue.reason;
}

type ChannelOverviewTabProps = {
  channel: Channel;
  shopifyStatus: ShopifyStatus | null;
  mappings: ChannelMapping[];
  issues: ChannelMappingIssue[];
  issueCount: number;
  onNavigate: (tab: ChannelWorkspaceTab) => void;
};

export function ChannelOverviewTab(props: ChannelOverviewTabProps) {
  return props.channel.code === 'ebay'
    ? <EbayChannelOverview channel={props.channel} issues={props.issues} issueCount={props.issueCount} onNavigate={props.onNavigate} />
    : props.channel.code === 'woocommerce'
      ? <WooCommerceChannelOverview channel={props.channel} onNavigate={props.onNavigate} />
    : <ShopifyChannelOverview {...props} />;
}

function ShopifyChannelOverview({ channel, shopifyStatus, mappings, issues, onNavigate }: ChannelOverviewTabProps) {
  const isShopify = channel.code === 'shopify';
  const [capabilities, setCapabilities] = useState<ShopifyCapabilityReport | null>(null);
  const [capabilityError, setCapabilityError] = useState(false);
  const [capabilityLoading, setCapabilityLoading] = useState(false);

  useEffect(() => {
    if (!isShopify) return;
    const controller = new AbortController();
    setCapabilities(null);
    setCapabilityLoading(true);
    setCapabilityError(false);
    void getChannelAPICapabilities(channel.id, controller.signal).then((report) => {
      if (!controller.signal.aborted) setCapabilities(report);
    }).catch(() => {
      if (!controller.signal.aborted) setCapabilityError(true);
    }).finally(() => { if (!controller.signal.aborted) setCapabilityLoading(false); });
    return () => controller.abort();
  }, [channel.id, isShopify]);

  const actionableIssues = [
    ...(isShopify && shopifyStatus && !shopifyStatus.currency_compatible ? [{ label: `Tiền tệ Core (${shopifyStatus.core_currency ?? '—'}) khác Shopify (${shopifyStatus.shop_currency ?? '—'}).`, tab: 'settings' as const }] : []),
    ...(isShopify && shopifyStatus && shopifyStatus.conflict_count > 0 ? [{ label: `${shopifyStatus.conflict_count} SKU bị xung đột mapping.`, tab: 'products' as const }] : []),
    ...(isShopify && shopifyStatus && shopifyStatus.unmapped_count > 0 ? [{ label: `${shopifyStatus.unmapped_count} SKU chưa được ghép.`, tab: 'products' as const }] : []),
    ...(isShopify && shopifyStatus && shopifyStatus.stale_mapping_count > 0 ? [{ label: `${shopifyStatus.stale_mapping_count} mapping cần xác minh lại.`, tab: 'products' as const }] : []),
    ...(isShopify && shopifyStatus && shopifyStatus.drift_count > 0 ? [{ label: `${shopifyStatus.drift_count} listing đang lệch số lượng đã xác minh.`, tab: 'inventory' as const }] : []),
    ...(isShopify && shopifyStatus?.webhook_status === 'unconfigured' ? [{ label: 'Webhook Shopify chưa được cấu hình ở backend.', tab: 'settings' as const }] : []),
    ...(isShopify && shopifyStatus?.webhook_status === 'pcd_required' ? [{ label: 'Shopify chưa duyệt Protected Customer Data nên webhook đơn hàng chưa tạo được. Bật quyền trong Shopify Partner/Dev Dashboard rồi kiểm tra kết nối lại.', tab: 'settings' as const }] : []),
    ...(isShopify && shopifyStatus?.webhook_status === 'scope_missing' ? [{ label: 'Ứng dụng Shopify thiếu quyền tạo webhook. Cấp scope rồi kiểm tra kết nối lại.', tab: 'settings' as const }] : []),
    ...issues.slice(0, 3).map((issue) => ({ label: issueLabel(issue), tab: 'products' as const })),
    ...mappings.filter((mapping) => !mapping.inventory_tracking_enabled).slice(0, 2).map((mapping) => ({ label: `Shopify chưa bật inventory tracking cho ${mapping.canonical_sku}.`, tab: 'products' as const })),
  ].filter((issue, index, list) => list.findIndex((candidate) => candidate.label === issue.label) === index).slice(0, 6);

  return <div className="grid min-w-0 gap-4">
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
      <Card className="grid min-w-0 gap-4 p-5">
        <header className="flex items-start justify-between gap-3"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Kết nối</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">{isShopify ? shopifyStatus?.shop_name ?? channel.name : channel.name}</h2></div><StatusBadge tone={channel.status === 'connected' ? 'success' : channel.status === 'error' ? 'danger' : channel.status === 'syncing' ? 'warning' : 'neutral'}>{channel.status === 'connected' ? 'Kênh đã kết nối' : channel.status === 'syncing' ? 'Đang đồng bộ' : channel.status === 'error' ? 'Cần xử lý' : 'Chưa kết nối'}</StatusBadge></header>
        <dl className="grid gap-3 border-t border-outline-variant/50 pt-4 sm:grid-cols-2"><Fact label="Nền tảng" value={channel.type === 'simulator' ? 'Simulator' : channel.type} /><Fact label="Môi trường" value={channel.environment === 'simulated' ? 'Simulator · dữ liệu giả lập' : channel.environment} /><Fact label="Shop domain" value={isShopify ? shopifyStatus?.shop_domain ?? 'Chưa xác minh' : 'Không áp dụng'} /><Fact label="API version" value={isShopify ? shopifyStatus?.api_version ?? 'Chưa xác minh' : 'Không áp dụng'} /><Fact label="Xác thực" value={isShopify ? shopifyStatus?.connected ? 'Đã xác thực kết nối' : shopifyStatus?.enabled ? 'Chưa xác thực' : 'Chưa cấu hình' : channel.status === 'connected' ? 'Đã kết nối' : 'Chưa xác minh'} /><Fact label="Xác minh gần nhất" value={isShopify ? formatTime(shopifyStatus?.last_verified_at) : '—'} /></dl>
      </Card>

      <Card className="grid content-start gap-4 p-5">
        <header><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Hoạt động kênh</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Mapping và xác nhận tồn</h2></header>
        <div className="grid grid-cols-2 gap-3"><div className="rounded-control bg-surface-container-low p-3"><span className="text-caption text-graphite">SKU đã mapping</span><strong className="mt-1 block font-display text-xl tabular-nums text-on-surface">{(shopifyStatus?.mapping_count ?? channel.mapping_count ?? 0).toLocaleString('vi-VN')}</strong></div><div className="rounded-control bg-surface-container-low p-3"><span className="text-caption text-graphite">Chưa ghép / xung đột</span><strong className="mt-1 block font-display text-xl tabular-nums text-on-surface">{isShopify && shopifyStatus ? (shopifyStatus.unmapped_count + shopifyStatus.conflict_count).toLocaleString('vi-VN') : '—'}</strong></div><div className="rounded-control bg-surface-container-low p-3"><span className="text-caption text-graphite">Listing lệch</span><strong className="mt-1 block font-display text-xl tabular-nums text-on-surface">{isShopify && shopifyStatus ? shopifyStatus.drift_count.toLocaleString('vi-VN') : '—'}</strong></div><div className="rounded-control bg-surface-container-low p-3"><span className="text-caption text-graphite">Đồng bộ xác minh gần nhất</span><strong className="mt-1 block break-words text-xs text-on-surface">{isShopify ? formatTime(shopifyStatus?.last_successful_sync) : formatTime(channel.last_sync)}</strong></div></div>
      </Card>
    </div>

    {isShopify ? <Card className="grid min-w-0 gap-4 p-5">
      <header className="flex flex-wrap items-end justify-between gap-2"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Tình trạng đồng bộ</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Quyền theo chức năng</h2></div></header>
      {capabilityLoading ? <LoadingState label="Đang tải trạng thái quyền…" /> : null}
      {capabilityError ? <p role="status" className="rounded-control bg-surface-container-low p-3 text-sm text-graphite">Không thể tải trạng thái quyền. Hãy thử tải lại trang.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">{capabilityGroups.map((group) => {
        const items = capabilities?.capabilities.filter((item) => (group.keys as readonly string[]).includes(item.capability_key)) ?? [];
        const state = summarize(items);
        return <article key={group.id} className="grid min-w-0 content-start gap-2 rounded-control border border-outline-variant/50 p-3"><div className="flex items-center gap-2"><span className="material-symbols-outlined text-lg text-secondary" aria-hidden="true">{group.icon}</span><h3 className="font-body text-sm font-semibold text-on-surface">{group.label}</h3></div><StatusBadge tone={state.tone}>{state.label}</StatusBadge>{state.detail ? <p className="break-words text-xs leading-5 text-graphite">{state.detail}</p> : null}</article>;
      })}</div>
    </Card> : null}

    <Card className="grid min-w-0 gap-3 p-5">
      <header className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Tiếp theo</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Vấn đề cần xử lý</h2></div><StatusBadge tone={actionableIssues.length ? 'warning' : 'success'}>{actionableIssues.length ? `${actionableIssues.length} mục` : 'Không có cảnh báo đã ghi nhận'}</StatusBadge></header>
      {actionableIssues.length ? <ul className="grid gap-2">{actionableIssues.map((issue, index) => <li key={`${issue.tab}-${issue.label}-${index}`} className="flex min-w-0 flex-col justify-between gap-2 rounded-control bg-surface-container-low p-3 sm:flex-row sm:items-center"><p className="break-words text-sm text-on-surface">{issue.label}</p><Button variant="ghost" size="sm" onClick={() => onNavigate(issue.tab)} className="self-start sm:self-auto">Mở mục xử lý</Button></li>)}</ul> : <p className="text-sm text-graphite">Chưa có vấn đề nào trong dữ liệu backend hiện tại.</p>}
    </Card>
  </div>;
}

function EbayChannelOverview({ channel, issues, issueCount, onNavigate }: {
  channel: Channel; issues: ChannelMappingIssue[]; issueCount: number; onNavigate: (tab: ChannelWorkspaceTab) => void;
}) {
  const [status, setStatus] = useState<EbayStatus | null>(null);
  const [operations, setOperations] = useState<EbayOperationalStatus | null>(null);
  const [capabilities, setCapabilities] = useState<EbayCapability[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void Promise.all([getEbayStatus(controller.signal), getEbayCapabilities(channel.id, controller.signal), getEbayOperationalStatus(channel.id, controller.signal)]).then(([nextStatus, nextCapabilities, nextOperations]) => {
      if (controller.signal.aborted) return;
      setStatus(nextStatus); setCapabilities(nextCapabilities); setOperations(nextOperations);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái eBay.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channel.id]);
  const connection = status?.connections.find((item) => item.channel_id === channel.id);
  const verified = (key: string) => capabilities.find((item) => item.capability_key === key)?.verification_status;
  const sellerReady = verified('seller_account') === 'VERIFIED';
  const actionItems = [
    ...(issues.length ? [{ label: `${issues.length} mapping issue đang có trong dữ liệu đã tải.`, tab: 'products' as const }] : []),
    ...(verified('inventory_write') === 'NOT_REQUESTED' ? [{ label: 'eBay inventory write đang tắt; chưa có tồn được gửi từ Core.', tab: 'settings' as const }] : []),
    ...(operations?.last_order_poll_error ? [{ label: `Polling đơn hàng lỗi: ${operations.last_order_poll_error}.`, tab: 'orders' as const }] : []),
    ...(operations && operations.malformed_failures_open > 0 ? [{ label: `${operations.malformed_failures_open} malformed order chưa phục hồi; tăng tồn eBay đang bị chặn.`, tab: 'orders' as const }] : []),
    ...(operations && operations.blocked_sync_jobs > 0 ? [{ label: `${operations.blocked_sync_jobs} job tồn kho eBay đang bị chặn.`, tab: 'history' as const }] : []),
    ...(verified('product_publish') === 'NOT_REQUESTED' ? [{ label: 'eBay product write đang tắt; mở trang sản phẩm để xem trạng thái hoặc cấu hình Sandbox trước khi ghi.', tab: 'products' as const }] : []),
  ];

  return <div className="grid min-w-0 gap-4">
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
      <Card className="grid min-w-0 gap-4 p-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Kết nối eBay</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">{connection?.seller_username || channel.name}</h2></div><StatusBadge tone={connection?.connection_status === 'connected' ? 'success' : 'danger'}>{connection?.connection_status === 'connected' ? sellerReady ? 'Seller đã xác minh' : 'OAuth đã kết nối' : 'Cần kết nối lại'}</StatusBadge></header>
        {loading ? <LoadingState label="Đang đọc trạng thái eBay…" /> : null}{error ? <p role="status" className="text-sm text-graphite">{error}</p> : null}
        <dl className="grid gap-3 border-t border-outline-variant/50 pt-4 sm:grid-cols-2"><Fact label="Platform" value="eBay" /><Fact label="Seller" value={connection?.seller_user_id ?? 'Chưa xác minh'} /><Fact label="Marketplace quản lý" value={connection?.marketplace_id ?? status?.marketplace_id ?? '—'} /><Fact label="Marketplace đăng ký seller" value={connection?.registration_marketplace_id ?? 'eBay không trả về'} /><Fact label="Environment" value="Sandbox · không phải Production" /><Fact label="Xác thực OAuth" value={connection?.connection_status === 'connected' ? 'Đã kết nối' : 'Cần kết nối lại'} /><Fact label="Lần kiểm tra gần nhất" value={formatTime(connection?.last_verified_at)} /></dl>
      </Card>
      <Card className="grid content-start gap-4 p-5"><header><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Hoạt động kênh</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Sản phẩm và đồng bộ</h2></header>
        <div className="grid grid-cols-2 gap-3"><Metric label="SKU đã mapping" value={(connection?.mapping_count ?? channel.mapping_count ?? 0).toLocaleString('vi-VN')} /><Metric label="Mapping issue" value={issueCount.toLocaleString('vi-VN')} /><Metric label="eBay Inventory Item" value={verified('inventory_items_read') === 'VERIFIED' ? 'Đọc được' : verified('inventory_items_read') === 'FAILED' ? 'Có lỗi' : 'Chưa kiểm chứng'} /><Metric label="Đồng bộ tồn đã xác nhận" value={inventoryWriteLabel(verified('inventory_write'))} /><Metric label="Order polling gần nhất" value={formatTime(operations?.last_successful_order_poll)} /><Metric label="Đơn đã nhập / quarantine / lỗi" value={`${operations?.orders_imported ?? '—'} / ${operations?.orders_quarantined ?? '—'} / ${operations?.orders_failed ?? '—'}`} /><Metric label="Malformed chưa phục hồi" value={(operations?.malformed_failures_open ?? 0).toLocaleString('vi-VN')} /><Metric label="Job đang chờ / bị chặn" value={`${operations?.pending_sync_jobs ?? '—'} / ${operations?.blocked_sync_jobs ?? '—'}`} /><Metric label="Read-back xác minh gần nhất" value={formatTime(operations?.last_verified_readback)} /></div>
        <Button variant="secondary" size="sm" onClick={() => onNavigate('products')} className="justify-self-start">Mở sản phẩm</Button>
      </Card>
    </div>
    <Card className="grid gap-3 p-5"><header><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Capability eBay</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Trạng thái theo nghiệp vụ</h2><p className="mt-1 text-xs leading-5 text-graphite">Từng operation được xem là đã hoạt động khi có evidence riêng.</p></header>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">{[
        ['Tài khoản', 'account_identity', 'seller_account'], ['Sản phẩm', 'inventory_items_read', 'offers_read'], ['Tồn kho', 'inventory_locations_read', 'inventory_write'], ['Đơn hàng', 'orders_read'], ['Thông báo', 'notifications'],
      ].map(([label, ...keys]) => { const states=keys.map((key)=>verified(key!)).filter(Boolean);const allVerified=states.length>0&&states.every((item)=>item==='VERIFIED');const problem=states.some((item)=>['FAILED','DENIED','NOT_GRANTED'].includes(item!));const groupStatus=problem?'Cần xử lý':allVerified?'Đã kiểm chứng':states.length?'Chưa kiểm chứng':'Chưa cấu hình';return <article key={label} className="grid gap-2 rounded-control border border-outline-variant/50 p-3"><h3 className="text-sm font-semibold text-on-surface">{label}</h3><StatusBadge tone={problem?'danger':allVerified?'success':'neutral'}>{groupStatus}</StatusBadge><p className="text-xs text-graphite">{states.length} capability có bằng chứng</p></article>;})}</div>
    </Card>
    <Card className="grid min-w-0 gap-3 p-5"><header className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Tiếp theo</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Vấn đề và hành động an toàn</h2></div><StatusBadge tone={actionItems.length?'warning':'neutral'}>{actionItems.length?`${actionItems.length} mục`:'Chưa có cảnh báo đã ghi nhận'}</StatusBadge></header>
      {!actionItems.length ? <p className="text-sm text-graphite">Backend chưa ghi nhận vấn đề hành động nào cho channel này.</p> : <ul className="grid gap-2">{actionItems.map((item,index)=><li key={`${item.tab}-${index}`} className="flex min-w-0 flex-col justify-between gap-2 rounded-control bg-surface-container-low p-3 sm:flex-row sm:items-center"><p className="break-words text-sm text-on-surface">{item.label}</p><Button variant="ghost" size="sm" onClick={()=>onNavigate(item.tab)} className="self-start sm:self-auto">Mở mục</Button></li>)}</ul>}
    </Card>
  </div>;
}

function WooCommerceChannelOverview({ channel, onNavigate }: { channel: Channel; onNavigate: (tab: ChannelWorkspaceTab) => void }) {
  const [status, setStatus] = useState<WooCommerceStatus | null>(null);
  const [health, setHealth] = useState<WooCommerceWebhookHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void getWooCommerceStatus(controller.signal).then(async (value) => {
      if (controller.signal.aborted) return;
      setStatus(value);
      if (value.channel_id === channel.id) {
        try { setHealth(await getWooCommerceWebhookHealth(channel.id, controller.signal)); }
        catch { if (!controller.signal.aborted) setHealth(null); }
      }
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái WooCommerce.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channel.id]);

  const connected = status?.connected && status.channel_id === channel.id;
  const issues = [
    ...(status && !status.currency_compatible ? [{ label: `Tiền tệ Core (${status.core_currency ?? '—'}) khác WooCommerce (${status.currency ?? '—'}).`, tab: 'settings' as const }] : []),
    ...(health && !health.active && !health.polling_enabled ? [{ label: 'Webhook và polling fallback đều chưa hoạt động.', tab: 'settings' as const }] : []),
    ...(health?.poll_error_code ? [{ label: `Order recovery báo ${health.poll_error_code}.`, tab: 'history' as const }] : []),
  ];

  return <div className="grid min-w-0 gap-4">
    {loading ? <LoadingState label="Đang đọc trạng thái WooCommerce…" /> : null}
    {error ? <Card className="p-4"><p role="status" className="text-sm text-error">{error}</p></Card> : null}
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(19rem,0.8fr)]">
      <Card className="grid min-w-0 gap-4 p-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Website bên thứ ba</p><h2 className="mt-1 break-words font-display text-lg font-bold text-on-surface">{status?.store_name || channel.name}</h2><p className="mt-1 break-all text-xs text-graphite">{status?.store_origin || 'Store URL chưa được verify'}</p></div><StatusBadge tone={connected ? 'success' : status?.connection_status === 'error' ? 'danger' : 'neutral'}>{connected ? 'Kết nối đã xác minh' : status?.connection_status === 'error' ? 'Có lỗi' : 'Chưa kết nối'}</StatusBadge></header>
        <dl className="grid gap-3 border-t border-outline-variant/50 pt-4 sm:grid-cols-2"><Fact label="Nền tảng" value="WooCommerce · self-hosted website" /><Fact label="Môi trường" value="Development store · không phải marketplace sandbox" /><Fact label="REST API" value={connected ? `WooCommerce ${status?.wc_version ?? '—'} · ${status?.currency ?? '—'}` : status?.enabled ? 'Connector bật · chưa verified' : 'Connector disabled'} /><Fact label="Xác minh gần nhất" value={formatTime(status?.last_verified_at)} /></dl>
      </Card>
      <Card className="grid content-start gap-4 p-5"><header><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Order ingest</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Webhook và polling recovery</h2></header>
        <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1"><Fact label="Webhook" value={health?.active ? 'Hai topic order đang active' : health?.status ?? 'Chưa xác minh'} /><Fact label="Polling fallback" value={health?.polling_enabled ? `Bật · lần gần nhất ${formatTime(health.last_poll_at)}` : 'Tắt'} /><Fact label="Đơn nhận thành công gần nhất" value={formatTime(health?.last_successful_at)} /><Fact label="Receipts retry / dead" value={health ? `${health.failed_receipts} / ${health.dead_receipts}` : '—'} /></dl>
      </Card>
    </div>
    <Card className="grid min-w-0 gap-3 p-5"><header className="flex flex-wrap items-center justify-between gap-2"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Cần chú ý</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Recovery và mapping</h2></div><StatusBadge tone={issues.length ? 'warning' : 'success'}>{issues.length ? `${issues.length} cảnh báo` : 'Không có cảnh báo kết nối'}</StatusBadge></header>
      {issues.length ? <ul className="grid gap-2">{issues.map((issue,index)=><li key={`${issue.tab}-${index}`} className="flex min-w-0 flex-col justify-between gap-2 rounded-control bg-surface-container-low p-3 sm:flex-row sm:items-center"><p className="break-words text-sm text-on-surface">{issue.label}</p><Button variant="ghost" size="sm" onClick={()=>onNavigate(issue.tab)} className="self-start sm:self-auto">Mở chi tiết</Button></li>)}</ul> : <p className="text-sm text-graphite">Không có cảnh báo kết nối hoặc recovery đã ghi nhận.</p>}
      <p className="text-xs leading-5 text-graphite">Nếu webhook bị tắt, recovery poller vẫn có thể phát hiện đơn nhưng có độ trễ theo chu kỳ cấu hình.</p>
    </Card>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) { return <div className="grid min-w-0 gap-2 rounded-control bg-surface-container-low p-3"><span className="text-caption text-graphite">{label}</span><strong className="break-words font-display text-base text-on-surface">{value}</strong></div>; }

function inventoryWriteLabel(status?: string): string {
  if (status === 'VERIFIED') return 'Đã ghi và đọc lại';
  if (status === 'GRANTED_UNTESTED') return 'Được cấp, chưa kiểm chứng';
  if (status === 'NOT_REQUESTED') return 'Đang tắt';
  if (status === 'NOT_GRANTED') return 'Thiếu quyền';
  return 'Chưa sẵn sàng';
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><dt className="text-caption text-graphite">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-on-surface">{value}</dd></div>;
}

function formatTime(value?: string | null): string {
  if (!value) return 'Chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}
