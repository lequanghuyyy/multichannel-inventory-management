import { useEffect, useState } from 'react';
import { navigate } from '../../../app/routes';
import { getWooCommerceOrders, getWooCommerceReconciliationEvidence, getWooCommerceRetryAudit, getWooCommerceWebhookHealth, getWooCommerceWebhookReceipts, type WooCommerceOrderReceipt, type WooCommerceReconciliationEvidence, type WooCommerceRetryAudit, type WooCommerceWebhookHealth, type WooCommerceWebhookReceipt } from '../../../api/woocommerce';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';

export function WooCommerceHistoryPanel({ channelId, canManage }: { channelId: string; canManage: boolean }) {
  const [webhooks, setWebhooks] = useState<WooCommerceWebhookReceipt[]>([]);
  const [orders, setOrders] = useState<WooCommerceOrderReceipt[]>([]);
  const [reconciliation, setReconciliation] = useState<WooCommerceReconciliationEvidence[]>([]);
  const [retryAudit, setRetryAudit] = useState<WooCommerceRetryAudit[]>([]);
  const [health, setHealth] = useState<WooCommerceWebhookHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(null);
    void Promise.all([
      getWooCommerceWebhookReceipts(channelId, controller.signal),
      getWooCommerceOrders(channelId, controller.signal),
      getWooCommerceReconciliationEvidence(channelId, controller.signal),
      getWooCommerceWebhookHealth(channelId, controller.signal),
      getWooCommerceRetryAudit(channelId, controller.signal),
    ]).then(([webhookItems, orderItems, evidence, webhookHealth, retryItems]) => {
      if (controller.signal.aborted) return;
      setWebhooks(webhookItems); setOrders(orderItems); setReconciliation(evidence); setHealth(webhookHealth); setRetryAudit(retryItems);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không đọc được WooCommerce history.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, channelId]);

  const polled = orders.filter((item) => item.source === 'polling');

  return <div className="grid min-w-0 gap-4">
    <Card className="grid min-w-0 gap-3 p-5"><header className="flex flex-wrap items-start justify-between gap-3"><div><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">WooCommerce recovery</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Webhook, poll và reconciliation history</h2><p className="mt-1 text-caption text-graphite">Receipt lưu ID và error code đã lọc; raw payload, buyer address và secrets không được trả về.</p></div><StatusBadge tone={health?.active ? 'success' : health?.polling_enabled ? 'warning' : 'neutral'}>{health?.status ?? 'Chưa kiểm tra'}</StatusBadge></header>
      {loading ? <LoadingState label="Đang tải WooCommerce history…" /> : null}
      {!loading && error ? <ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /> : null}
      {health ? <dl className="grid gap-3 border-t border-outline-variant/50 pt-4 sm:grid-cols-2 xl:grid-cols-4"><Fact label="Webhook status" value={`${health.status} · ${health.active_topics.join(', ') || 'không có topic active'}`} /><Fact label="Processed receipt gần nhất" value={formatTime(health.last_successful_at)} /><Fact label="Order polling gần nhất" value={formatTime(health.last_poll_at)} /><Fact label="Polling fallback / poll error" value={`${health.polling_enabled ? 'bật' : 'tắt'} · ${health.poll_error_code || 'không lỗi'}`} /></dl> : null}
    </Card>

    <Card className="grid min-w-0 gap-3 p-5"><header><h3 className="font-display text-base font-bold text-on-surface">Webhook receipts</h3><p className="mt-1 text-caption text-graphite">Tối đa 100 delivery gần nhất · delivery id, topic, attempts và mã lỗi đã lọc.</p></header>
      {!loading && !error && webhooks.length === 0 ? <EmptyState title="Chưa có webhook receipt" detail="Nếu webhook bị tắt, polling fallback vẫn tìm order mới theo chu kỳ." /> : null}
      {webhooks.length ? <ul className="grid gap-2">{webhooks.map((item) => <li key={item.id} className="grid min-w-0 gap-2 rounded-control border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"><div className="min-w-0"><strong className="break-all font-mono text-sm text-on-surface">Order #{item.external_order_id} · {item.topic}</strong><p className="mt-1 break-all text-caption text-graphite">Delivery {item.delivery_id || 'không được Woo cung cấp'} · {formatTime(item.received_at)}</p></div><StatusBadge tone={stateTone(item.state)}>{item.state}</StatusBadge><span className="text-caption text-graphite">{item.attempt_count} attempts</span>{item.safe_error_code ? <p className="break-all text-xs text-error sm:col-span-3">{item.safe_error_code}</p> : null}</li>)}</ul> : null}
      {health && !health.remote_failure_history_available ? <p className="rounded-control bg-surface-container-low p-3 text-xs leading-5 text-graphite">WooCommerce REST API không cung cấp delivery failure history từ xa. Bảng này chỉ thể hiện các webhook mà OctoFlow đã nhận.</p> : null}
    </Card>

    <Card className="grid min-w-0 gap-3 p-5"><header className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-display text-base font-bold text-on-surface">Polling order recovery</h3><p className="mt-1 text-caption text-graphite">{polled.length} order có receipt nguồn polling · cursor và overlap được lưu bền trong backend.</p></div><StatusBadge tone={health?.poll_error_code ? 'danger' : health?.polling_enabled ? 'success' : 'neutral'}>{health?.poll_error_code ? health.poll_error_code : health?.polling_enabled ? 'fallback enabled' : 'disabled'}</StatusBadge></header>
      {polled.length === 0 ? <EmptyState title="Chưa có poll receipt" detail="Cursor chạy poll và lỗi gần nhất được trình bày phía trên." /> : <ul className="grid gap-2 sm:grid-cols-2">{polled.slice(0, 12).map((item) => <li key={item.external_order_id} className="min-w-0 rounded-control bg-surface-container-low p-3"><div className="flex flex-wrap items-center justify-between gap-2"><strong className="break-all font-mono text-xs text-on-surface">Order #{item.external_order_id}</strong><StatusBadge tone={stateTone(item.import_result)}>{item.import_result}</StatusBadge></div><p className="mt-2 text-caption text-graphite">{item.woocommerce_status} · {formatTime(item.last_modified_at || item.last_seen_at)}</p><p className="mt-1 text-caption text-graphite">{item.retry_count} attempts · {item.manual_retry_count} manual retries</p>{item.quarantine_reason ? <p className="mt-1 break-all text-xs text-error">{item.quarantine_reason}</p> : null}</li>)}</ul>}
      {canManage ? <Button variant="secondary" size="sm" onClick={() => navigate(`/channels/${encodeURIComponent(channelId)}?tab=orders`)} className="justify-self-start">Quản lý receipts và retry</Button> : <p className="text-xs text-graphite">Retry failed receipt cần ADMIN và xác nhận tại tab Đơn hàng.</p>}
    </Card>

    <Card className="grid min-w-0 gap-3 p-5"><header><h3 className="font-display text-base font-bold text-on-surface">Manual retry history</h3><p className="mt-1 text-caption text-graphite">Yêu cầu retry có ADMIN xác nhận và được lưu bền vững; actor nội bộ không hiển thị trong bảng.</p></header>
      {!retryAudit.length ? <EmptyState title="Chưa có manual retry" detail="Automatic retry và dead-letter counters vẫn hiển thị cùng từng order receipt." /> : <ul className="grid gap-2 sm:grid-cols-2">{retryAudit.map((item) => <li key={item.id} className="grid min-w-0 gap-2 rounded-control border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div><strong className="break-all font-mono text-sm text-on-surface">Order #{item.external_order_id}</strong><p className="mt-1 text-caption text-graphite">{formatTime(item.requested_at)}</p></div><StatusBadge tone="warning">{[item.retried_webhook ? 'webhook' : '', item.retried_poll ? 'polling' : ''].filter(Boolean).join(' + ')}</StatusBadge></li>)}</ul>}
    </Card>

    <Card className="grid min-w-0 gap-3 p-5"><header><h3 className="font-display text-base font-bold text-on-surface">Inventory reconciliation evidence</h3><p className="mt-1 text-caption text-graphite">Core target, remote before/after, version và remote observation revision. WooCommerce không hỗ trợ atomic compare-and-swap.</p></header>
      {!reconciliation.length ? <EmptyState title="Chưa có reconciliation evidence" detail="Khi reconciler quan sát listing WooCommerce, before/after evidence sẽ xuất hiện tại đây." /> : <ul className="grid gap-2">{reconciliation.map((item) => <li key={item.id} className="grid min-w-0 gap-3 rounded-control border border-outline-variant/50 p-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-start"><div className="min-w-0"><strong className="break-all font-mono text-sm text-on-surface">{item.canonical_sku} · {item.external_sku}</strong><p className="mt-1 text-caption text-graphite">{item.reason} · {item.action} · Core v{item.core_version} · target {item.target}</p><p className="mt-1 break-all text-caption text-graphite">Remote before/after {item.observed_before ?? '—'} / {item.observed_after ?? '—'} · revision {item.remote_revision_before ?? '—'} / {item.remote_revision_after ?? '—'}</p><p className="mt-1 text-caption text-graphite">Started {formatTime(item.started_at)} · attempts {item.attempt_count}</p></div><StatusBadge tone={stateTone(item.status)}>{item.status}</StatusBadge></li>)}</ul>}
    </Card>
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-caption text-graphite">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-on-surface">{value}</dd></div>; }
function stateTone(state: string): 'neutral' | 'success' | 'warning' | 'danger' { if (['processed','imported','in_sync','recovered'].includes(state)) return 'success'; if (['dead','failed','unauthorized','remote_missing','mapping_conflict','retry_exhausted','connection_unavailable'].includes(state)) return 'danger'; if (['deferred','quarantined','pending_order_ingestion','remote_decrease_unaccounted','repairing','channel_drift','behind_core','stale_version','webhook_disabled'].includes(state)) return 'warning'; return 'neutral'; }
function formatTime(value?: string | null): string { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
