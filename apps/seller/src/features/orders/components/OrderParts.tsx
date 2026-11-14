import { StatusBadge } from '../../../components/common/StatusBadge';
import { cn } from '../../../lib/cn';
import type { Order } from '../order.types';
import { fulfillmentLabels, statusPresentation } from '../order.utils';

const modeNames = { active: 'Đang hoạt động', simulation: 'Giả lập', planned: 'Dự kiến' } as const;

export function OrderStatusBadge({ order }: { order: Order }) {
  const status = statusPresentation[order.status];
  return <StatusBadge tone={status.tone}>{status.label}</StatusBadge>;
}

export function OrderChannelBadge({ order }: { order: Order }) {
  return <span className="inline-flex items-center gap-2"><span className={cn('grid min-h-7 min-w-7 place-items-center rounded px-1.5 font-body text-[9px] font-bold text-pure-white', order.channel.colorClass)}>{order.channel.code}</span><span><strong className="block font-body text-caption text-on-surface">{order.channel.name}</strong><small className="font-body text-[10px] text-graphite">{modeNames[order.channel.mode]}</small></span></span>;
}

export function OrderFulfillmentBadge({ order }: { order: Order }) {
  const tone = order.fulfillmentStatus === 'delivered' ? 'success' : order.fulfillmentStatus === 'cancelled' ? 'danger' : order.fulfillmentStatus === 'pending_clearance' ? 'warning' : 'neutral';
  return <StatusBadge tone={tone}>{fulfillmentLabels[order.fulfillmentStatus]}</StatusBadge>;
}
