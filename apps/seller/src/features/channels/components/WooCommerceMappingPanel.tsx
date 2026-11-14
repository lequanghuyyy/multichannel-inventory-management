import { useCallback, useEffect, useState } from 'react';
import { getWooCommerceMappingIssues, importWooCommerceMappings, previewWooCommerceMappings, refreshWooCommerceMappings, type WooCommerceMappingReport } from '../../../api/woocommerce';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';

export function WooCommerceMappingPanel({ canManage, onUpdated }: { canManage: boolean; onUpdated: () => void }) {
  const [issues, setIssues] = useState<Awaited<ReturnType<typeof getWooCommerceMappingIssues>>['issues']>([]);
  const [report, setReport] = useState<WooCommerceMappingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [action, setAction] = useState<string>('');
  const [lastAction, setLastAction] = useState<string>('');

  const refreshIssues = useCallback(async (signal?: AbortSignal) => {
    try { const value = await getWooCommerceMappingIssues(signal); if (!signal?.aborted) setIssues(value.issues); }
    catch (cause) { if (!signal?.aborted) setError(messageOf(cause)); }
    finally { if (!signal?.aborted) setLoading(false); }
  }, []);

  useEffect(() => { const controller = new AbortController(); void refreshIssues(controller.signal); return () => controller.abort(); }, [refreshIssues]);

  const run = async (label: string, operation: () => Promise<WooCommerceMappingReport>) => {
    if (!canManage || busy) return;
    setBusy(true); setAction(label); setError(null);
    try { setReport(await operation()); setLastAction(label); await refreshIssues(); if (label !== 'Preview') onUpdated(); }
    catch (cause) { setError(messageOf(cause)); }
    finally { setBusy(false); setAction(''); }
  };

  return <div className="grid min-w-0 gap-4">
    <Card className="grid min-w-0 gap-3 p-5">
      <header><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">WooCommerce catalog</p><h2 className="mt-1 font-display text-lg font-bold text-on-surface">Preview và mapping theo SKU</h2><p className="mt-1 max-w-3xl text-sm leading-6 text-graphite">Ghép exact SKU với product hoặc variation ID. Không ghép theo tên sản phẩm; conflict không tự ghi đè mapping đang lưu.</p></header>
      {canManage ? <div className="flex flex-wrap gap-2"><Button size="sm" variant="secondary" loading={busy && action === 'Preview'} disabled={busy} onClick={() => void run('Preview', previewWooCommerceMappings)}>Preview</Button><Button size="sm" loading={busy && action === 'Import'} disabled={busy} onClick={() => void run('Import', importWooCommerceMappings)}>Import mappings</Button><Button size="sm" variant="ghost" loading={busy && action === 'Refresh'} disabled={busy} onClick={() => void run('Refresh', refreshWooCommerceMappings)}>Refresh mappings</Button></div> : <p className="text-xs leading-5 text-graphite">STAFF chỉ xem. ADMIN mới có thể preview, import hoặc refresh mapping.</p>}
      {loading ? <LoadingState label="Đang tải mapping issues…" /> : null}
      {error ? <ErrorState error={error} retry={() => void refreshIssues()} /> : null}
      {report ? <section className="grid gap-3 rounded-control border border-outline-variant/50 p-3" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-body text-sm font-semibold text-on-surface">Kết quả {lastAction || 'mapping'}</h3><StatusBadge tone={report.conflicts || report.unmapped || report.stale ? 'warning' : 'success'}>{report.mapped} đã map</StatusBadge></div><dl className="grid grid-cols-2 gap-3 sm:grid-cols-4"><Metric label="Products" value={report.remote_products} /><Metric label="SKU rows" value={report.remote_listings} /><Metric label="Có thể map" value={report.would_map} /><Metric label="Xung đột / chưa ghép / stale" value={`${report.conflicts} / ${report.unmapped} / ${report.stale}`} /></dl>{report.issues.length ? <ul className="grid gap-2">{report.issues.slice(0, 8).map((issue, index) => <li key={`${issue.external_variant_id}-${index}`} className="rounded-control bg-surface-container-low p-3"><code className="break-all font-mono text-xs text-on-surface">{issue.sku || 'SKU trống'}</code><p className="mt-1 text-xs text-error">{issue.reason}</p><p className="mt-1 break-all text-caption text-graphite">Product {issue.external_product_id} · variant {issue.external_variant_id}</p></li>)}</ul> : null}</section> : null}
    </Card>

    <Card className="grid min-w-0 gap-3 p-5"><header className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-display text-base font-bold text-on-surface">Mapping issues gần nhất</h3><p className="mt-1 text-caption text-graphite">Phát hiện SKU thiếu/trùng, listing không hoạt động, stock tracking hoặc mapping stale.</p></div><StatusBadge tone={issues.length ? 'warning' : 'success'}>{issues.length} issue</StatusBadge></header>
      {!loading && !issues.length ? <EmptyState title="Không có mapping issue đã ghi nhận" detail="Refresh mapping để kiểm tra lại danh mục WooCommerce hiện tại." /> : null}
      {issues.length ? <ul className="grid gap-2 sm:grid-cols-2">{issues.map((issue) => <li key={issue.external_variant_id} className="min-w-0 rounded-control bg-surface-container-low p-3"><div className="flex items-start justify-between gap-2"><code className="break-all font-mono text-xs font-semibold text-on-surface">{issue.sku || 'SKU trống'}</code><StatusBadge tone={issue.reason.includes('conflict') || issue.reason.includes('duplicate') ? 'danger' : 'warning'}>{issue.reason}</StatusBadge></div><p className="mt-2 break-words text-xs text-graphite">{issue.product_title || 'WooCommerce product'} · product {issue.external_product_id}</p><p className="mt-1 break-all text-caption text-graphite">Variation identity: {issue.external_variant_id}</p><time className="mt-2 block text-caption text-graphite">Ghi nhận {formatTime(issue.last_seen_at)}</time></li>)}</ul> : null}
    </Card>
  </div>;
}

function Metric({ label, value }: { label: string; value: number | string }) { return <div className="rounded-control bg-surface-container-low p-3"><span className="text-caption text-graphite">{label}</span><strong className="mt-1 block break-words font-display text-base tabular-nums text-on-surface">{value}</strong></div>; }
function formatTime(value?: string): string { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
function messageOf(error: unknown): string { return error instanceof Error ? error.message : 'Không thể cập nhật mapping WooCommerce.'; }
