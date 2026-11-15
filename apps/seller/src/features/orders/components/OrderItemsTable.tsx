import { ProductThumbnail } from '../../../components/common/ProductThumbnail';
import { Card } from '../../../components/ui/Card';
import { CopyButton } from './CopyButton';
import type { OrderApiItem } from '../order.api';

export interface OrderItemsTableProps {
  items: OrderApiItem[];
}

export function OrderItemsTable({ items }: OrderItemsTableProps) {
  return (
    <section aria-labelledby="order-items-heading" className="grid gap-4">
      <h3 id="order-items-heading" className="font-display text-base font-bold text-on-surface">
        Danh sách sản phẩm ({items.length} dòng hàng)
      </h3>

      {items.length === 0 ? (
        <Card className="p-6 text-center">
          <p className="font-body text-body-sm text-graphite">Không có thông tin dòng sản phẩm.</p>
        </Card>
      ) : (
        <Card className="overflow-hidden border border-outline-variant/60 p-0 shadow-none">
          {/* One table, one DOM copy: a duplicated responsive layout would render every
              SKU, price and total twice, so the numbers on screen could not be asserted
              (or trusted) as the server's single source. */}
          <div className="overflow-x-auto">
            <table className="w-full text-left font-body text-body-sm">
              <thead className="border-b border-outline-variant/60 bg-surface-container-low text-caption font-semibold uppercase tracking-wider text-graphite">
                <tr>
                  <th scope="col" className="px-4 py-3">Sản phẩm</th>
                  <th scope="col" className="px-4 py-3">SKU</th>
                  <th scope="col" className="px-4 py-3 text-right">Đơn giá</th>
                  <th scope="col" className="px-4 py-3 text-center">Số lượng</th>
                  <th scope="col" className="px-4 py-3 text-right">Thành tiền</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant/40">
                {items.map((item, idx) => {
                  const hasAttributes = Boolean(item.color || item.size);
                  const returned = item.returnedQuantity ?? 0;

                  return (
                    <tr key={`${item.sku}-${idx}`} className="hover:bg-surface-container-low/40">
                      {/* Sản phẩm */}
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-3">
                          <ProductThumbnail
                            productId={item.productId ?? undefined}
                            mediaId={item.primaryMediaId ?? undefined}
                            className="size-12 shrink-0 rounded-control border border-outline-variant/40"
                          />
                          <div className="min-w-0">
                            <span className="block font-medium text-on-surface">{item.name}</span>
                            {hasAttributes ? (
                              <div className="mt-1 flex flex-wrap items-center gap-1.5">
                                {item.color ? (
                                  <span className="inline-flex items-center rounded bg-surface-container-high px-1.5 py-0.5 text-[11px] font-medium text-graphite">
                                    Màu: {item.color}
                                  </span>
                                ) : null}
                                {item.size ? (
                                  <span className="inline-flex items-center rounded bg-surface-container-high px-1.5 py-0.5 text-[11px] font-medium text-graphite">
                                    Size: {item.size}
                                  </span>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        </div>
                      </td>

                      {/* SKU */}
                      <td className="whitespace-nowrap px-4 py-3.5">
                        <div className="inline-flex items-center gap-1.5">
                          <code className="rounded bg-surface-container-low px-1.5 py-0.5 font-mono text-caption font-semibold text-on-surface">
                            {item.sku}
                          </code>
                          <CopyButton text={item.sku} label="Sao chép SKU" />
                        </div>
                      </td>

                      {/* Đơn giá (historical line snapshot) */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-medium text-on-surface">
                        {item.unitPriceFormatted}
                      </td>

                      {/* Số lượng */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-center">
                        <span className="font-semibold text-on-surface">{item.quantity}</span>
                        {returned > 0 ? (
                          <span className="mt-0.5 block text-caption font-medium text-amber-700 dark:text-amber-400">
                            Đã trả: {returned}
                          </span>
                        ) : null}
                      </td>

                      {/* Thành tiền */}
                      <td className="whitespace-nowrap px-4 py-3.5 text-right font-semibold text-on-surface">
                        {item.lineTotalFormatted}
                      </td>
                    </tr>
                  );
                })}
            </tbody>
            </table>
          </div>
        </Card>
      )}
    </section>
  );
}
