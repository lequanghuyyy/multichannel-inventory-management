import { useEffect, useRef, useState } from 'react';
import { importShopifyMappings, type ShopifyMappingImport } from '../../../api/shopify';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';

const issueGroups: Record<string, string> = {
  missing_sku: 'Thiếu SKU', duplicate_shopify_sku: 'SKU trùng trên Shopify', duplicate_shopify_variant_id: 'Variant ID trùng',
  core_sku_missing: 'Không tìm thấy SKU Core', core_sku_duplicate: 'SKU Core không duy nhất', core_product_not_active: 'Sản phẩm Core chưa hoạt động',
  product_not_active: 'Sản phẩm Shopify chưa Active', inventory_item_missing: 'Thiếu Inventory Item', inventory_not_tracked: 'Inventory tracking tắt',
  location_missing: 'Thiếu location', mapping_conflict: 'Xung đột mapping', stale_shopify_listing: 'Listing cũ', invalid_external_id: 'ID Shopify không hợp lệ',
};

export function ShopifyMappingImportAction({ channelId, canManage, onImported }: { channelId: string; canManage: boolean; onImported: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ShopifyMappingImport | null>(null);
  const activeChannel = useRef(channelId);
  const epoch = useRef(0);
  activeChannel.current = channelId;

  useEffect(() => {
    setBusy(false); setError(null); setResult(null);
    return () => { epoch.current += 1; };
  }, [channelId]);

  const runImport = async () => {
    if (!canManage || busy) return;
    const requestedChannel = channelId;
    const requestEpoch = ++epoch.current;
    setBusy(true);
    setError(null);
    try {
      const imported = await importShopifyMappings();
      if (activeChannel.current !== requestedChannel || epoch.current !== requestEpoch) return;
      setResult(imported);
      onImported();
    } catch (cause) {
      if (activeChannel.current === requestedChannel && epoch.current === requestEpoch) setError(cause instanceof Error ? cause.message : 'Không đọc được listing Shopify.');
    } finally {
      if (activeChannel.current === requestedChannel && epoch.current === requestEpoch) setBusy(false);
    }
  };

  const groupedIssues = Object.entries((result?.issues ?? []).reduce<Record<string, number>>((groups, issue) => {
    groups[issue.reason] = (groups[issue.reason] ?? 0) + 1;
    return groups;
  }, {}));

  return <Card className="grid min-w-0 gap-3 border-l-4 border-l-apricot p-5" aria-label="Đọc và ghép SKU Shopify">
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-start"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2"><h2 className="font-display text-lg font-bold text-on-surface">Đọc và ghép SKU</h2><StatusBadge tone="neutral">Đối chiếu chính xác</StatusBadge></div><p className="mt-1 max-w-3xl text-sm leading-6 text-graphite">Đọc Shopify variants và đối chiếu theo SKU chính xác với Core. Thao tác ghi kết quả mapping và các mục cần xử lý qua API hiện có; không có bước preview và không thay đổi tồn kho.</p></div><Button disabled={!canManage} loading={busy} loadingLabel="Đang đọc listing…" onClick={() => void runImport()} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">sync</span>}>Đọc và ghép SKU</Button></div>
    {!canManage ? <p className="text-caption text-graphite">Thao tác dành cho quản trị viên.</p> : null}
    {error ? <p role="alert" className="rounded-control bg-error-container p-3 text-sm text-on-error-container">{error}</p> : null}
    {result ? <section className="grid min-w-0 gap-3 rounded-control bg-surface-container-low p-4" aria-live="polite"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-body text-sm font-semibold text-on-surface">Kết quả lần đọc gần nhất</h3><p className="text-caption text-graphite">Đọc {result.remote_variants} variant Shopify · ghép {result.mapped} · chưa ghép {result.unmapped} · xung đột {result.conflicts} · cần xác minh lại {result.stale}</p></div>{groupedIssues.length ? <ul className="grid gap-1 sm:grid-cols-2">{groupedIssues.map(([reason, count]) => <li key={reason} className="flex justify-between gap-2 text-xs"><span className="break-words text-on-surface">{issueGroups[reason] ?? reason}</span><strong className="shrink-0 tabular-nums text-graphite">{count}</strong></li>)}</ul> : <p className="text-xs text-graphite">Không có lỗi mapping trong kết quả này.</p>}</section> : null}
  </Card>;
}
