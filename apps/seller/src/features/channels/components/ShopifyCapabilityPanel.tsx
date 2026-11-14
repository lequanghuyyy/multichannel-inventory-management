import { useEffect, useMemo, useRef, useState } from 'react';
import { getChannelAPICapabilities, type CapabilityStatus, type ShopifyCapabilityEvidence, type ShopifyCapabilityReport } from '../../../api/channels';
import { verifyShopifyCapabilities } from '../../../api/shopify';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';

const labels: Record<string, string> = {
  shop_identity: 'Nhận diện shop và môi trường', product_read: 'Đọc sản phẩm', product_write: 'Ghi sản phẩm',
  publication_read: 'Đọc nơi hiển thị sản phẩm', publication_write: 'Đăng hoặc gỡ sản phẩm khỏi nơi hiển thị',
  location_read: 'Đọc vị trí tồn kho', inventory_read: 'Đọc tồn kho', inventory_activation_write: 'Bật theo dõi tồn kho', inventory_write: 'Ghi tồn kho', orders_read: 'Đọc đơn hàng',
  webhook_subscription_read: 'Đọc đăng ký webhook', webhook_subscription_write: 'Tạo đăng ký webhook', webhook_delivery: 'Shopify gửi webhook đến OctoFlow',
  webhook_product_update: 'Webhook cập nhật sản phẩm', webhook_inventory_update: 'Webhook cập nhật tồn kho',
  webhook_orders_update: 'Webhook cập nhật đơn hàng', webhook_app_uninstalled: 'Webhook gỡ ứng dụng',
  fulfillment_read: 'Đọc trạng thái fulfillment', fulfillment_write: 'Ghi fulfillment có xác minh',
};

const statusText: Record<CapabilityStatus, string> = {
  NOT_CONFIGURED: 'Chưa cấu hình', NOT_REQUESTED: 'Chưa yêu cầu scope', NOT_GRANTED: 'Chưa được cấp',
  GRANTED_UNTESTED: 'Được cấp · chưa kiểm chứng', VERIFIED: 'Đã kiểm chứng', DENIED: 'Bị từ chối',
  FAILED: 'Xác minh lỗi', NOT_SUPPORTED: 'Không hỗ trợ',
};

const groups = [
  { id: 'shop', label: 'Thông tin shop', description: 'Danh tính shop, môi trường và vị trí', icon: 'storefront', keys: ['shop_identity'] },
  { id: 'products', label: 'Sản phẩm', description: 'Đọc listing và ghi sản phẩm', icon: 'sell', keys: ['product_read', 'product_write'] },
  { id: 'publishing', label: 'Đăng bán và nơi hiển thị', description: 'Đọc publication; scope ghi được kiểm tra mà không thay đổi sản phẩm', icon: 'publish', keys: ['publication_read', 'publication_write'] },
  { id: 'inventory', label: 'Tồn kho', description: 'Vị trí, đọc tồn, bật theo dõi và ghi tồn', icon: 'inventory_2', keys: ['location_read', 'inventory_read', 'inventory_activation_write', 'inventory_write'] },
  { id: 'orders', label: 'Đơn hàng và giao hàng', description: 'Đọc đơn hàng và trạng thái fulfillment', icon: 'receipt_long', keys: ['orders_read', 'fulfillment_read', 'fulfillment_write'] },
  { id: 'webhooks', label: 'Webhook', description: 'Subscription, delivery và sự kiện', icon: 'webhook', keys: ['webhook_subscription_read', 'webhook_subscription_write', 'webhook_delivery', 'webhook_product_update', 'webhook_inventory_update', 'webhook_orders_update', 'webhook_app_uninstalled'] },
] as const;

type Filter = 'all' | 'verified' | 'granted' | 'action' | 'not_configured';

function tone(status: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (status === 'VERIFIED') return 'success';
  if (['DENIED', 'FAILED', 'NOT_GRANTED'].includes(status)) return 'danger';
  if (status === 'GRANTED_UNTESTED' || status === 'NOT_REQUESTED') return 'warning';
  return 'neutral';
}

function groupSummary(items: ShopifyCapabilityEvidence[]): { label: string; tone: 'neutral' | 'success' | 'warning' | 'danger' } {
  if (items.length === 0) return { label: 'Chưa có báo cáo', tone: 'neutral' };
  const statuses = items.map((item) => item.verification_status);
  if (statuses.every((status) => status === 'VERIFIED')) return { label: 'Tất cả đã kiểm chứng', tone: 'success' };
  if (statuses.some((status) => ['DENIED', 'FAILED', 'NOT_GRANTED'].includes(status))) return { label: 'Cần xử lý', tone: 'danger' };
  if (statuses.includes('GRANTED_UNTESTED')) return { label: 'Còn chưa kiểm chứng', tone: 'warning' };
  if (statuses.every((status) => status === 'NOT_SUPPORTED')) return { label: 'Không hỗ trợ', tone: 'neutral' };
  if (statuses.includes('NOT_REQUESTED')) return { label: 'Chưa yêu cầu scope', tone: 'neutral' };
  return { label: 'Chưa cấu hình', tone: 'neutral' };
}

function matchesFilter(item: ShopifyCapabilityEvidence, filter: Filter): boolean {
  if (filter === 'all') return true;
  if (filter === 'verified') return item.verification_status === 'VERIFIED';
  if (filter === 'granted') return item.verification_status === 'GRANTED_UNTESTED';
  if (filter === 'action') return ['NOT_GRANTED', 'DENIED', 'FAILED'].includes(item.verification_status);
  return ['NOT_CONFIGURED', 'NOT_REQUESTED'].includes(item.verification_status);
}

function CapabilityDetail({ item }: { item: ShopifyCapabilityEvidence }) {
  const rate = item.rate_limit;
  const requiredScopes = item.required_scopes ?? [];
  const requestedScopes = item.requested_scopes ?? [];
  const grantedScopes = item.granted_scopes ?? [];
  const graphqlErrors = item.graphql_errors ?? [];
  return <details className="group grid gap-2 rounded-control border border-outline-variant/50 p-3">
    <summary className="flex cursor-pointer list-none flex-wrap items-start justify-between gap-2"><div className="min-w-0"><strong className="block break-words text-sm text-on-surface">{labels[item.capability_key] ?? item.capability_key}</strong><span className="mt-1 block break-words text-xs text-graphite">Scope cần: <code className="break-all font-mono">{requiredScopes.join(', ') || 'Không yêu cầu'}</code></span>{item.reason ? <span className="mt-1 block break-words text-xs text-error">{item.reason}</span> : null}</div><StatusBadge tone={tone(item.verification_status)}>{statusText[item.verification_status] ?? item.verification_status}</StatusBadge></summary>
    <dl className="grid min-w-0 gap-x-4 gap-y-3 border-t border-outline-variant/50 pt-3 text-xs sm:grid-cols-2 xl:grid-cols-3">
      <Detail label="GraphQL operation" value={item.operation} />
      <Detail label="Endpoint" value={item.endpoint} />
      <Detail label="Shop · môi trường · API" value={`${item.shop_domain} · ${item.environment} · ${item.api_version}`} />
      <Detail label="Required scopes" value={requiredScopes.join(', ') || 'Không yêu cầu'} />
      <Detail label="Requested scopes" value={requestedScopes.join(', ') || 'Chưa khai báo'} />
      <Detail label="Granted scopes" value={grantedScopes.join(', ') || 'Không có'} />
      <Detail label="HTTP status" value={item.http_status == null ? '—' : String(item.http_status)} />
      <Detail label="Request ID" value={item.request_id ?? '—'} />
      <Detail label="Rate limit metadata" value={rate?.source === 'runtime' ? `Chi phí ${rate.requested_query_cost ?? '—'} / ${rate.actual_query_cost ?? '—'} · còn ${rate.currently_available ?? '—'} / ${rate.maximum_available ?? '—'} · hồi ${rate.restore_rate ?? '—'} điểm/giây` : 'Không có runtime metadata'} />
      <Detail label="GraphQL errors" value={graphqlErrors.map((error) => error.code).join(', ') || 'Không có'} />
      <Detail label="Evidence reference" value={item.evidence_reference} />
      <Detail label="Verification time" value={formatTime(item.verified_at)} />
      {item.retry_after ? <Detail label="Retry after" value={item.retry_after} /> : null}
    </dl>
  </details>;
}

export function ShopifyCapabilityPanel({ channelId, canManage }: { channelId: string; canManage: boolean }) {
  const [report, setReport] = useState<ShopifyCapabilityReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [verifyError, setVerifyError] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const generation = useRef(0);
  const verifyController = useRef<AbortController | null>(null);

  const refresh = (signal?: AbortSignal) => getChannelAPICapabilities(channelId, signal).then((value) => {
    if (!signal?.aborted && generation.current > 0) setReport(value);
  });

  const retryReport = () => {
    const current = generation.current;
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    void getChannelAPICapabilities(channelId, controller.signal).then((value) => {
      if (!controller.signal.aborted && generation.current === current) setReport(value);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && generation.current === current) setError(cause);
    }).finally(() => {
      if (!controller.signal.aborted && generation.current === current) setLoading(false);
    });
  };

  useEffect(() => {
    const current = ++generation.current;
    const controller = new AbortController();
    verifyController.current?.abort();
    setLoading(true); setVerifying(false); setReport(null); setError(null); setVerifyError(null);
    void getChannelAPICapabilities(channelId, controller.signal).then((value) => {
      if (!controller.signal.aborted && generation.current === current) setReport(value);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted && generation.current === current) setError(cause);
    }).finally(() => { if (!controller.signal.aborted && generation.current === current) setLoading(false); });
    return () => { controller.abort(); verifyController.current?.abort(); generation.current += 1; };
  }, [channelId]);

  const verify = async () => {
    if (!canManage || verifying) return;
    const current = generation.current;
    verifyController.current?.abort();
    const controller = new AbortController();
    verifyController.current = controller;
    setVerifying(true); setVerifyError(null);
    try {
      const result = await verifyShopifyCapabilities(controller.signal);
      if (controller.signal.aborted || current !== generation.current) return;
      setReport(result);
      await refresh(controller.signal);
    } catch (cause) {
      if (!controller.signal.aborted && current === generation.current) setVerifyError(cause instanceof Error ? cause.message : 'Không xác minh được quyền Shopify.');
    } finally { if (!controller.signal.aborted && current === generation.current) setVerifying(false); }
  };

  const evidence = report?.capabilities ?? [];
  const counts = {
    verified: evidence.filter((item) => item.verification_status === 'VERIFIED').length,
    granted: evidence.filter((item) => item.verification_status === 'GRANTED_UNTESTED').length,
    action: evidence.filter((item) => ['NOT_GRANTED', 'DENIED', 'FAILED'].includes(item.verification_status)).length,
    notConfigured: evidence.filter((item) => ['NOT_CONFIGURED', 'NOT_REQUESTED'].includes(item.verification_status)).length,
  };
  const filteredByStatus = useMemo(() => evidence.filter((item) => {
    if (!matchesFilter(item, filter)) return false;
    const needle = query.trim().toLocaleLowerCase('vi');
    return !needle || [item.capability_key, labels[item.capability_key] ?? '', item.operation, ...(item.required_scopes ?? []), ...(item.requested_scopes ?? []), ...(item.granted_scopes ?? [])]
      .some((value) => value.toLocaleLowerCase('vi').includes(needle));
  }), [evidence, filter, query]);
  const tabs: { id: Filter; label: string; count?: number }[] = [
    { id: 'all', label: 'Tất cả' }, { id: 'verified', label: 'Đã kiểm chứng', count: counts.verified },
    { id: 'granted', label: 'Được cấp · chưa kiểm chứng', count: counts.granted },
    { id: 'action', label: 'Cần xử lý', count: counts.action }, { id: 'not_configured', label: 'Chưa cấu hình', count: counts.notConfigured },
  ];

  return <section className="grid min-w-0 gap-4" aria-label="Quyền API Shopify">
    <Card className="grid min-w-0 gap-4 p-5">
      <header className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Quyền truy cập và operation</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Shopify API capabilities</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-graphite">“Đã kiểm chứng” yêu cầu operation có phản hồi đọc lại thành công. Scope được cấp không tự chứng minh thao tác đã chạy.</p></div>{canManage ? <Button variant="secondary" size="sm" loading={verifying} loadingLabel="Đang xác minh…" onClick={() => void verify()}>Xác minh quyền (chỉ đọc)</Button> : null}</header>
      {verifyError ? <p role="alert" className="rounded-control bg-error-container p-3 text-sm text-on-error-container">{verifyError}</p> : null}
      {report?.run ? <dl className="grid gap-3 rounded-control bg-surface-container-low p-3 text-xs sm:grid-cols-2 xl:grid-cols-4"><Detail label="Shop" value={report.run.shop_domain} /><Detail label="Môi trường · loại shop" value={`${report.run.environment} · ${report.run.partner_development === true ? 'Development Store' : report.run.partner_development === false ? 'Không phải Development Store' : 'Chưa xác minh'}`} /><Detail label="API version · trạng thái run" value={`${report.run.api_version} · ${report.run.status}`} /><Detail label="Lần kiểm chứng gần nhất" value={formatTime(report.run.verified_at)} /></dl> : <p role="status" className="rounded-control bg-surface-container-low p-3 text-sm text-graphite">Chưa có báo cáo capability run cho channel này. Trạng thái được giữ là chưa kiểm chứng.</p>}
      {loading ? <LoadingState label="Đang tải capability report…" /> : null}
      {!loading && error ? <ErrorState error={error} retry={retryReport} /> : null}
      {!loading && !error ? <>
        <section className="grid grid-cols-2 gap-2 xl:grid-cols-4" aria-label="Tổng quan quyền API">{[
          { label: 'Đã kiểm chứng', value: counts.verified, tone: 'success' as const },
          { label: 'Được cấp · chưa kiểm chứng', value: counts.granted, tone: 'warning' as const },
          { label: 'Thiếu quyền hoặc lỗi', value: counts.action, tone: 'danger' as const },
          { label: 'Chưa cấu hình / yêu cầu', value: counts.notConfigured, tone: 'neutral' as const },
        ].map((metric) => <div key={metric.label} className="flex min-w-0 items-center justify-between gap-2 rounded-control border border-outline-variant/50 p-3"><span className="text-xs text-graphite">{metric.label}</span><StatusBadge tone={metric.tone}>{metric.value.toLocaleString('vi-VN')}</StatusBadge></div>)}</section>
        <div className="grid min-w-0 gap-3"><Input label="Tìm capability hoặc scope" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Ví dụ: inventory, read_orders…" /><div className="flex max-w-full flex-wrap gap-2" role="group" aria-label="Lọc trạng thái capability">{tabs.map((tab) => <button key={tab.id} type="button" aria-pressed={filter === tab.id} onClick={() => setFilter(tab.id)} className={`min-h-9 rounded-control border px-3 text-xs font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-carbon ${filter === tab.id ? 'border-carbon bg-carbon text-pure-white' : 'border-outline-variant bg-pure-white text-on-surface hover:bg-surface-container-low'}`}>{tab.label}{tab.count !== undefined ? <span className="ml-1 tabular-nums">{tab.count}</span> : null}</button>)}</div></div>
        {evidence.length === 0 ? <p className="text-sm text-graphite">Báo cáo chưa có capability nào.</p> : <div className="grid min-w-0 gap-3">{groups.map((group) => {
          const groupItems = filteredByStatus.filter((item) => (group.keys as readonly string[]).includes(item.capability_key));
          const allGroupItems = evidence.filter((item) => (group.keys as readonly string[]).includes(item.capability_key));
          if (groupItems.length === 0) return null;
          const summary = groupSummary(allGroupItems);
          return <details key={group.id} className="min-w-0 rounded-card border border-outline-variant/60 bg-pure-white p-3" open={summary.tone === 'danger' || summary.tone === 'warning'}>
            <summary className="flex min-w-0 cursor-pointer list-none flex-wrap items-center justify-between gap-3"><div className="flex min-w-0 items-center gap-3"><span className="grid size-10 shrink-0 place-items-center rounded-control bg-surface-container-low text-secondary"><span className="material-symbols-outlined" aria-hidden="true">{group.icon}</span></span><div className="min-w-0"><strong className="block break-words text-sm text-on-surface">{group.label}</strong><span className="mt-0.5 block text-xs text-graphite">{group.description} · {groupItems.length} capability khớp bộ lọc</span></div></div><StatusBadge tone={summary.tone}>{summary.label} · {allGroupItems.length}</StatusBadge></summary>
            <ul className="mt-3 grid min-w-0 gap-2">{groupItems.map((item) => <li key={item.capability_key}><CapabilityDetail item={item} /></li>)}</ul>
          </details>;
        })}{filteredByStatus.length === 0 ? <p className="rounded-control bg-surface-container-low p-4 text-sm text-graphite">Không có capability khớp bộ lọc hiện tại.</p> : null}</div>}
      </> : null}
      <p className="border-t border-outline-variant/50 pt-3 text-xs leading-5 text-graphite">Capability report và evidence giữ nguyên từ backend. Việc cấp scope không đồng nghĩa product write, inventory write hoặc webhook delivery đã được kiểm chứng.</p>
    </Card>
  </section>;
}

function Detail({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-graphite">{label}</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{value}</dd></div>; }
function formatTime(value?: string): string { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
