import { useEffect, useState } from 'react';
import { ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Card } from '../../../components/ui/Card';
import { getOrderHistory, type OrderHistory } from '../../../api/orders';
import { apiStatusPresentation } from '../order.api';

export function OrderApiHistory({ orderId }: { orderId: string }) {
  const [history, setHistory] = useState<OrderHistory | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setHistory(null);
    setError(null);
    try {
      void getOrderHistory(orderId, controller.signal).then(setHistory).catch((reason: unknown) => {
        if (!controller.signal.aborted) setError(reason);
      });
    } catch (cause) {
      // A synchronous failure (an unavailable transport, for instance) is an error state, not
      // a crash: the page around this card must keep standing.
      if (!controller.signal.aborted) setError(cause);
    }
    return () => controller.abort();
  }, [orderId, attempt]);

  return <Card className="grid gap-4 p-5" aria-label="Lịch sử trạng thái đơn hàng">
    <div>
      <h2 className="font-display text-lg font-bold text-on-surface">Lịch sử trạng thái</h2>
      <p className="mt-1 font-body text-body-sm text-on-surface-variant">Các thay đổi được ghi nhận trong hệ thống.</p>
    </div>
    {history === null && !error ? <LoadingState label="Đang tải lịch sử…" /> : null}
    {error ? <ErrorState error={error} retry={() => setAttempt((value) => value + 1)} /> : null}
    {history?.history.length === 0 ? (
      <div className="grid gap-1">
        <p className="font-body text-body-sm text-graphite">Chưa có lịch sử thay đổi trạng thái của đơn này.</p>
        <p className="font-body text-body-sm text-graphite">Chưa có thay đổi trạng thái được ghi nhận.</p>
      </div>
    ) : null}
    {history && history.history.length > 0 ? <ol className="grid gap-0">
      {history.history.map((event) => {
        const presentation = apiStatusPresentation[event.to_status as keyof typeof apiStatusPresentation];
        const from = apiStatusPresentation[event.from_status as keyof typeof apiStatusPresentation]?.label ?? event.from_status;
        const to = presentation?.label ?? event.to_status;
        return <li key={event.id} className="relative grid grid-cols-[1.25rem_1fr] gap-3 pb-5 last:pb-0">
          <span className="relative mt-1 flex size-3 justify-center rounded-full bg-primary before:absolute before:top-3 before:h-full before:w-px before:bg-outline-variant last:before:hidden" aria-hidden="true" />
          <div className="min-w-0">
            <p className="font-body text-body-sm font-semibold text-on-surface">{from} → {to}</p>
            <time className="mt-1 block font-body text-caption text-graphite" dateTime={event.changed_at}>
              {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(event.changed_at))}
            </time>
            {event.reason ? <p className="mt-2 break-words font-body text-body-sm text-on-surface-variant">Lý do: {event.reason}</p> : null}
            <p className="mt-1 break-words font-body text-[11px] text-graphite">Người thực hiện: {event.actor_email?.trim() || 'Không có thông tin'}</p>
          </div>
        </li>;
      })}
    </ol> : null}
  </Card>;
}
