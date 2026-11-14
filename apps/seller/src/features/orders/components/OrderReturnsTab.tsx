import { OrderApiReturns } from './OrderApiReturns';
import type { OrderApiRow } from '../order.api';

export function OrderReturnsTab({ order }: { order: OrderApiRow }) {
  return <OrderApiReturns orderId={order.id} orderStatus={order.status} channelCode={order.channelCode} />;
}
