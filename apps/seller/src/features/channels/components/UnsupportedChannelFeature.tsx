import { Card } from '../../../components/ui/Card';
import type { Channel } from '../../../api/channels';

/**
 * Explicit "not supported in this phase" panel.
 *
 * The WooCommerce connector ships connection verification, mapping and inventory sync only.
 * Order ingestion and activity history have no backend API yet, so these tabs must say so
 * instead of calling an endpoint that would 404 and look like a store failure.
 */
export function UnsupportedChannelFeature({ channel, feature }: { channel: Channel; feature: string }) {
  return <Card className="grid gap-3 p-5" variant="muted">
    <header>
      <p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Chưa hỗ trợ</p>
      <h2 className="mt-1 font-display text-lg font-bold text-on-surface">{feature}</h2>
    </header>
    <p className="max-w-3xl font-body text-sm leading-6 text-on-surface-variant">
      Phase 06 chỉ hỗ trợ xác minh kết nối, mapping SKU và đồng bộ tồn kho cho {channel.name}.
      Chức năng này cần API backend chưa được triển khai, nên màn hình không gọi endpoint không tồn tại.
    </p>
  </Card>;
}
