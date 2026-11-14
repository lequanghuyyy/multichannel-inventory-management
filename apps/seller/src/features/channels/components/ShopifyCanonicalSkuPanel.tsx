import { useEffect, useState } from 'react';
import { getChannelAPICapabilities, type ShopifySandboxSKU } from '../../../api/channels';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';

const stateLabels: Record<string, string> = { VERIFIED: 'Đã kiểm chứng', GRANTED_UNTESTED: 'Được cấp · chưa kiểm chứng', NOT_GRANTED: 'Chưa được cấp', NOT_REQUESTED: 'Chưa yêu cầu scope', NOT_CONFIGURED: 'Chưa cấu hình', DENIED: 'Bị từ chối', FAILED: 'Xác minh lỗi', NOT_SUPPORTED: 'Không hỗ trợ', MISSING: 'Chưa có SKU', DUPLICATE: 'SKU bị trùng', CONFLICT: 'Cần đối chiếu' };

export function ShopifyCanonicalSkuPanel({ channelId }: { channelId: string }) {
  const [rows, setRows] = useState<ShopifySandboxSKU[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setRows([]);
    void getChannelAPICapabilities(channelId, controller.signal).then((report) => {
      if (!controller.signal.aborted) setRows(report.sandbox_skus ?? []);
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [attempt, channelId]);

  const copy = async (value?: string) => {
    if (!value) return;
    try { await navigator.clipboard.writeText(value); setCopied(value); window.setTimeout(() => setCopied(null), 1600); } catch { setCopied(null); }
  };
  const tone = (status: string): 'neutral' | 'success' | 'warning' | 'danger' => status === 'VERIFIED' ? 'success' : ['FAILED', 'DENIED', 'CONFLICT', 'DUPLICATE'].includes(status) ? 'danger' : status === 'GRANTED_UNTESTED' ? 'warning' : 'neutral';

  return <Card className="grid min-w-0 gap-3 p-5">
    <header><h2 className="font-display text-lg font-bold text-on-surface">SKU canonical Shopify</h2><p className="mt-1 text-xs leading-5 text-graphite">Định danh đầy đủ được giữ lại; ID dài được rút gọn khi hiển thị và có nút sao chép.</p></header>
    {loading ? <LoadingState label="Đang tải bằng chứng SKU Shopify…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /> : null}
    {!loading && !error && rows.length === 0 ? <p className="text-sm text-graphite">Chưa có kết quả đọc SKU từ Shopify.</p> : null}
    {!loading && !error && rows.length ? <>
      <div className="hidden min-w-0 overflow-x-auto md:block"><table className="w-full min-w-[850px] border-collapse text-left text-xs"><caption className="sr-only">Bốn SKU canonical được đọc từ Shopify</caption><thead><tr className="border-b border-outline-variant text-graphite"><th className="py-2 pr-3">Canonical SKU</th><th className="py-2 pr-3">Product ID</th><th className="py-2 pr-3">Variant ID</th><th className="py-2 pr-3">Inventory Item ID</th><th className="py-2 pr-3">Trạng thái</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{rows.map((row) => <tr key={row.canonical_sku}><td className="py-3 pr-3 font-mono font-semibold text-on-surface">{row.canonical_sku}</td>{[row.external_product_id, row.external_variant_id, row.external_inventory_item_id].map((value, index) => <td key={index} className="py-3 pr-3"><IdValue value={value} copied={copied === value} onCopy={() => void copy(value)} /></td>)}<td className="py-3 pr-3"><StatusBadge tone={tone(row.verification_status)}>{stateLabels[row.verification_status] ?? row.verification_status}</StatusBadge>{row.reason ? <p className="mt-1 max-w-48 break-words text-graphite">{row.reason}</p> : null}</td></tr>)}</tbody></table></div>
      <div className="grid gap-3 md:hidden">{rows.map((row) => <article key={row.canonical_sku} className="grid min-w-0 gap-3 rounded-control bg-surface-container-low p-3"><div className="flex flex-wrap items-center justify-between gap-2"><code className="font-mono text-sm font-semibold text-on-surface">{row.canonical_sku}</code><StatusBadge tone={tone(row.verification_status)}>{stateLabels[row.verification_status] ?? row.verification_status}</StatusBadge></div><div className="grid gap-2">{[['Product ID', row.external_product_id], ['Variant ID', row.external_variant_id], ['Inventory Item ID', row.external_inventory_item_id]].map(([label, value]) => <div key={label}><span className="block text-[10px] text-graphite">{label}</span><IdValue value={value as string | undefined} copied={copied === value} onCopy={() => void copy(value as string | undefined)} /></div>)}</div>{row.reason ? <p className="text-xs text-graphite">{row.reason}</p> : null}</article>)}</div>
    </> : null}
  </Card>;
}

function IdValue({ value, copied, onCopy }: { value?: string; copied: boolean; onCopy: () => void }) {
  return <span className="flex min-w-0 items-center gap-2"><code className="min-w-0 break-all font-mono text-on-surface" title={value}>{shorten(value)}</code>{value ? <Button variant="ghost" size="sm" aria-label={`Sao chép ${value}`} onClick={onCopy} className="min-h-8 shrink-0 px-2">{copied ? 'Đã chép' : 'Chép'}</Button> : null}</span>;
}

function shorten(value?: string): string {
  if (!value) return '—';
  return value.length > 42 ? `${value.slice(0, 24)}…${value.slice(-12)}` : value;
}
