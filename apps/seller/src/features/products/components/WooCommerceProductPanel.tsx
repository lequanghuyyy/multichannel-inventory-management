import { useEffect } from 'react';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import type { ProductApiDetail } from '../product.detail.api';

/**
 * WooCommerce product publishing is outside Phase 06.
 *
 * The previous panel called endpoints that this backend does not expose (product create,
 * publish, unpublish, and sync jobs). Rendering that panel in live mode showed a 404 as if it
 * were a store failure. Phase 06 only writes inventory, so this panel says what is supported
 * and never issues a product mutation.
 */
export function WooCommerceProductPanel({
  product,
  wizardMode = false,
  onDraftReadinessChange,
  onDraftSubmitReady,
}: {
  product: ProductApiDetail;
  canWrite?: boolean;
  wizardMode?: boolean;
  priceRefreshKey?: number;
  onDraftReadinessChange?: (ready: boolean, reason?: string) => void;
  onDraftSubmitReady?: (submit: (() => Promise<void>) | null) => void;
  onDraftQueued?: (job: { id: string; state: string }) => void;
}) {
  const reason = 'Phase 06 chỉ đồng bộ tồn kho WooCommerce. Tạo, cập nhật hoặc đăng bán sản phẩm chưa được hỗ trợ.';
  useEffect(() => {
    onDraftReadinessChange?.(false, reason);
    onDraftSubmitReady?.(null);
  }, [onDraftReadinessChange, onDraftSubmitReady]);

  return <Card className="grid min-w-0 gap-3 p-4">
    <header className="flex flex-wrap items-center justify-between gap-2">
      <div>
        <p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">WooCommerce</p>
        <h3 className="mt-1 font-display text-base font-bold text-on-surface">Đăng bán sản phẩm chưa được hỗ trợ</h3>
      </div>
      <StatusBadge tone="neutral">Ngoài phạm vi Phase 06</StatusBadge>
    </header>
    <p className="text-sm leading-6 text-graphite">{reason} Sản phẩm <strong className="text-on-surface">{product.name || product.id}</strong> không được gửi sang WooCommerce từ màn hình này. Dùng tab Tồn kho của kênh WooCommerce để xem mapping và số lượng đã gửi/đọc lại.</p>
    {wizardMode ? <p className="text-xs leading-5 text-graphite">Quy trình đăng bán sẽ giữ bước xác nhận ở trạng thái chưa sẵn sàng cho tới khi backend có connector sản phẩm.</p> : null}
  </Card>;
}
