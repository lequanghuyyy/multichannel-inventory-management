import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import type { ApiOrderStatus } from '../order.api';

/**
 * Order ingestion and fulfillment push are outside Phase 06.
 *
 * The previous panel read order lifecycle and retried order mutations through endpoints that
 * this backend does not expose. Showing it in live mode turned a missing capability into a
 * stream of 404s. This panel states the boundary without calling the network.
 */
export function WooCommerceOrderLifecyclePanel({ orderId, coreStatus }: { orderId: string; coreStatus: ApiOrderStatus }) {
  return <Card className="grid gap-3 p-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">WooCommerce</p>
        <h3 className="mt-1 font-display text-base font-bold text-on-surface">Đồng bộ vòng đời đơn chưa được hỗ trợ</h3>
      </div>
      <StatusBadge tone="neutral">Ngoài phạm vi Phase 06</StatusBadge>
    </header>
    <p className="text-sm leading-6 text-graphite">Đơn Core <code className="font-mono text-xs">{orderId}</code> đang ở trạng thái {coreStatus}. Phase 06 chỉ đồng bộ tồn kho; chưa nhập đơn hàng WooCommerce, chưa xử lý webhook và chưa đẩy trạng thái xử lý/hoàn tất sang WooCommerce. Không có yêu cầu nào được gửi từ màn hình này.</p>
  </Card>;
}
