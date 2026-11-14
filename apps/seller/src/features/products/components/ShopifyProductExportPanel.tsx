import { useEffect, useState } from 'react';
import { getShopifyProductSyncJobs, getShopifyStatus, pushShopifyProduct, retryShopifyProductSync, type ShopifyProductSyncJob, type ShopifyStatus } from '../../../api/shopify';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { ProductApiDetail } from '../product.detail.api';

export function ShopifyProductExportPanel({ product }: { product: ProductApiDetail }) {
  const [status, setStatus] = useState<ShopifyStatus | null>(null);
  const [jobs, setJobs] = useState<ShopifyProductSyncJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      getShopifyStatus(controller.signal),
      getShopifyProductSyncJobs(product.id, controller.signal),
    ]).then(([nextStatus, nextJobs]) => {
      if (!controller.signal.aborted) {
        setStatus(nextStatus);
        setJobs(nextJobs);
      }
    }).catch((cause: unknown) => {
      if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Không đọc được trạng thái đồng bộ Shopify.');
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [product.id, product.productVersion]);

  const localReady = product.currency === 'VND' && product.status !== 'archived' && product.variants.length > 0 &&
    product.variants.every((variant) => variant.priceMinor !== null);
  const blockedReason = !localReady ? 'Sản phẩm cần có biến thể, giá cho từng biến thể và không ở trạng thái lưu trữ.'
    : loading ? 'Đang kiểm tra kết nối Shopify.'
      : error ? 'Không xác minh được kết nối hoặc lịch sử đồng bộ Shopify.'
        : !status?.enabled ? 'Shopify chưa được bật trong cấu hình backend.'
          : !status.connected ? 'Hãy xác minh Dev Store trước khi xuất sản phẩm.'
            : !status.currency_compatible ? 'Đổi tiền tệ Shopify sang VND rồi kiểm tra kết nối lại.'
              : !status.product_write_enabled || !status.product_sync_available ? 'Shopify product sync worker chưa sẵn sàng.'
                : null;
  const latest = jobs[0];

  const push = async () => {
    if (busy || blockedReason) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const result = await pushShopifyProduct(product.id);
      setMessage(`Đã xếp hàng phiên bản sản phẩm ${result.product_version} để đồng bộ Shopify.`);
      setJobs(await getShopifyProductSyncJobs(product.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xếp hàng đồng bộ sản phẩm.');
    } finally {
      setBusy(false);
    }
  };

  const retry = async () => {
    if (!latest || busy || blockedReason) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await retryShopifyProductSync(latest.id);
      setMessage(`Đã xếp lại phiên bản ${latest.product_version} để đồng bộ.`);
      setJobs(await getShopifyProductSyncJobs(product.id));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Không thể xếp lại tác vụ Shopify.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="grid gap-3 p-5" aria-label="Đồng bộ sản phẩm lên Shopify">
      <div>
        <h2 className="font-display text-base font-bold text-on-surface">Đồng bộ lên Shopify</h2>
        <p className="mt-1 font-body text-caption leading-5 text-graphite">
          Product sync xử lý theo phiên bản Core, giữ nguyên trạng thái sản phẩm Shopify hiện tại, không sửa tồn kho và chỉ hoàn tất sau khi đọc lại dữ liệu từ Shopify.
        </p>
      </div>
      {error ? <p role="alert" className="rounded-control bg-red-50 px-3 py-2 font-body text-caption text-red-800">{error}</p> : null}
      {message ? <p role="status" className="rounded-control bg-emerald-50 px-3 py-2 font-body text-caption text-emerald-800">{message}</p> : null}
      {latest ? <section aria-label="Trạng thái đồng bộ sản phẩm Shopify" className="grid gap-2 rounded-control border border-outline-variant/50 p-3">
        <p className="font-body text-sm font-semibold text-on-surface">Phiên bản Core {latest.product_version} · {productSyncLabel(latest.state)}</p>
        <p className="font-body text-caption text-graphite">Cập nhật: {formatDate(latest.updated_at)} · Lần thử: {latest.attempt_count} · Xác minh: {formatDate(latest.verified_at)}</p>
        {latest.remote_product_id ? <p className="break-all font-mono text-[11px] text-graphite">Shopify Product GID: {latest.remote_product_id}</p> : null}
        {latest.safe_error_code ? <p className="font-mono text-xs text-red-800">{latest.safe_error_code}</p> : null}
      </section> : <p className="font-body text-caption text-graphite">Chưa có lịch sử đồng bộ sản phẩm Shopify.</p>}
      {blockedReason ? <p className="font-body text-caption text-graphite">{blockedReason}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy} disabled={loading || blockedReason !== null} onClick={() => void push()}>
          Xếp lịch đồng bộ sản phẩm
        </Button>
        {latest && ['failed', 'conflict', 'blocked'].includes(latest.state) ? <Button size="sm" variant="secondary" loading={busy} disabled={loading || blockedReason !== null} onClick={() => void retry()}>
          Thử lại phiên bản lỗi
        </Button> : null}
      </div>
    </Card>
  );
}

function productSyncLabel(state: ShopifyProductSyncJob['state']): string {
  const labels: Record<ShopifyProductSyncJob['state'], string> = {
    pending: 'đang chờ', processing: 'đang đồng bộ', retrying: 'đang thử lại', succeeded: 'đã xác minh',
    failed: 'thất bại', conflict: 'xung đột cần xử lý', blocked: 'đang bị chặn', superseded: 'đã được phiên bản mới thay thế',
  };
  return labels[state];
}

function formatDate(value?: string): string {
  if (!value) return 'chưa có';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN');
}
