import { useEffect, useState } from 'react';
import { getOrder, type Order as ApiOrder } from '../../../api/orders';
import { Button } from '../../../components/ui/Button';
import { toOrderApiRow, type OrderApiRow } from '../order.api';
import { OrderApiDetailPanel } from './OrderApiDetailPanel';

interface CachedOrderDetail {
  summaryUpdatedAt: string;
  fetchedAt: number;
  order: OrderApiRow;
}

const detailCache = new Map<string, CachedOrderDetail>();
const detailRequests = new Map<string, { summaryUpdatedAt: string; request: Promise<ApiOrder> }>();
const retrySubscribers = new Map<string, Set<() => void>>();
const detailCacheTtlMs = 60_000;

function retryOrderDetail(orderId: string): void {
  detailCache.delete(orderId);
  detailRequests.delete(orderId);
  for (const listener of retrySubscribers.get(orderId) ?? []) listener();
}

/** Clear detail snapshots after order events or successful mutations. */
export function invalidateOrderDetailCache(): void {
  detailCache.clear();
  detailRequests.clear();
}

export function OrderApiInlinePreview({
  order,
  onOpenDetail,
  revision,
}: {
  order: OrderApiRow;
  onOpenDetail: () => void;
  revision: number;
}) {
  const [retry, setRetry] = useState(0);
  const [detail, setDetail] = useState<OrderApiRow | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cached = detailCache.get(order.id);
    if (
      cached
      && cached.summaryUpdatedAt === order.updatedAt
      && Date.now() - cached.fetchedAt < detailCacheTtlMs
    ) {
      setDetail(cached.order);
      setError(null);
      setLoading(false);
      return;
    }

    const controller = new AbortController();
    setDetail(null);
    setError(null);
    setLoading(true);
    const cachedRequest = detailRequests.get(order.id);
    const request = cachedRequest?.summaryUpdatedAt === order.updatedAt
      ? cachedRequest.request
      : getOrder(order.id, controller.signal);
    if (cachedRequest?.request !== request) detailRequests.set(order.id, { summaryUpdatedAt: order.updatedAt, request });

    void request.then((result: ApiOrder) => {
      if (controller.signal.aborted) return;
      const projected = toOrderApiRow(result);
      detailCache.set(order.id, {
        summaryUpdatedAt: order.updatedAt,
        fetchedAt: Date.now(),
        order: projected,
      });
      setDetail(projected);
      setLoading(false);
    }).catch((reason: unknown) => {
      if (controller.signal.aborted) return;
      setError(reason);
      setLoading(false);
    }).finally(() => {
      if (detailRequests.get(order.id)?.request === request) detailRequests.delete(order.id);
    });
    return () => controller.abort();
  }, [order.id, order.updatedAt, revision, retry]);

  useEffect(() => {
    const listeners = retrySubscribers.get(order.id) ?? new Set<() => void>();
    const retryAll = () => setRetry((count) => count + 1);
    listeners.add(retryAll);
    retrySubscribers.set(order.id, listeners);
    return () => {
      listeners.delete(retryAll);
      if (listeners.size === 0) retrySubscribers.delete(order.id);
    };
  }, [order.id]);

  if (loading) {
    return <p className="rounded-control bg-surface-container-low p-4 font-body text-body-sm text-graphite" role="status">Đang tải chi tiết đơn hàng…</p>;
  }
  if (error || !detail) {
    return (
      <div className="grid gap-3 rounded-control bg-error-container p-4 font-body text-body-sm text-on-error-container" role="alert">
        <p>Không tải được chi tiết đơn hàng{error instanceof Error ? `: ${error.message}` : '.'}</p>
        <Button variant="secondary" size="sm" onClick={() => retryOrderDetail(order.id)}>Thử lại</Button>
      </div>
    );
  }
  return <OrderApiDetailPanel order={detail} onOpenDetail={onOpenDetail} />;
}
