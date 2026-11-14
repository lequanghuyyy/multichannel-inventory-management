import { useEffect, useMemo, useState } from 'react';
import { getProductChannelInventory, listChannelProducts, type ChannelProduct, type ProductInventoryRow } from '../../../api/channel-operations';
import type { LazadaCatalog } from '../../../api/lazada';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';

export function LazadaInventoryPanel({ channelId, catalog, revision }: { channelId: string; catalog: LazadaCatalog | null; revision: number }) {
  const [products, setProducts] = useState<ChannelProduct[]>([]);
  const [nextCursor, setNextCursor] = useState('');
  const [loadingProducts, setLoadingProducts] = useState(false);
  const [selected, setSelected] = useState('');
  const [rows, setRows] = useState<ProductInventoryRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();
    void listChannelProducts(channelId, { state: 'all', limit: 100 }, controller.signal)
      .then((page) => {
        if (controller.signal.aborted) return;
        const mapped = page.products.filter((product) => product.listing_count > 0);
        setProducts(mapped);
        setNextCursor(page.next_cursor ?? '');
        setSelected((current) => mapped.some((product) => product.product_id === current) ? current : mapped[0]?.product_id ?? '');
      })
      .catch(() => { if (!controller.signal.aborted) setError('Không tải được danh sách sản phẩm Core đã ghép.'); });
    return () => controller.abort();
  }, [channelId, revision]);

  const loadMore = async () => {
    if (!nextCursor || loadingProducts) return;
    setLoadingProducts(true);
    setError('');
    try {
      const page = await listChannelProducts(channelId, { state: 'all', limit: 100, cursor: nextCursor });
      const mapped = page.products.filter((product) => product.listing_count > 0);
      setProducts((current) => [...current, ...mapped]);
      setSelected((current) => current || mapped[0]?.product_id || '');
      setNextCursor(page.next_cursor ?? '');
    } catch { setError('Không tải được trang sản phẩm Core tiếp theo.'); }
    finally { setLoadingProducts(false); }
  };

  useEffect(() => {
    if (!selected) { setRows([]); return; }
    const controller = new AbortController();
    setLoading(true);
    setError('');
    void getProductChannelInventory(channelId, selected, controller.signal)
      .then((items) => { if (!controller.signal.aborted) setRows(items.filter((item) => item.listing_id)); })
      .catch(() => { if (!controller.signal.aborted) setError('Không tải được tồn Core và lịch sử target cho sản phẩm này.'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channelId, selected, revision, refresh]);

  const remote = useMemo(() => new Map((catalog?.data.products ?? []).flatMap((product) => (product.skus ?? []).map((sku) => [
    `${product.item_id}:${sku.SkuId}`,
    sku.sellableQuantity ?? sku.Available ?? null,
  ] as const))), [catalog]);

  return <Card className="grid min-w-0 gap-4 p-5">
    <div className="flex flex-wrap items-end justify-between gap-3"><div><h3 className="font-display text-base font-bold text-on-surface">Tồn Core và target Lazada</h3><p className="mt-1 text-xs text-graphite">ATS Core là số trước quota POS. Chỉ plan phân bổ đã xác minh mới quyết định target kênh.</p></div><Button variant="ghost" size="sm" onClick={() => setRefresh((value) => value + 1)} disabled={loading || !selected}>Làm mới bằng chứng Core</Button></div>
    {products.length ? <label className="grid max-w-sm gap-1 text-xs text-graphite">Sản phẩm Core
      <select className="min-h-11 rounded-control border border-sandstone bg-pure-white px-3 text-sm text-on-surface" value={selected} onChange={(event) => setSelected(event.target.value)}>{products.map((product) => <option key={product.product_id} value={product.product_id}>{product.name}</option>)}</select>
    </label> : <p className="text-sm text-graphite">Chưa có sản phẩm Core đã ghép trong các trang đã tải. Hãy xem trước và nhập mapping SKU.</p>}
    {nextCursor ? <Button variant="ghost" size="sm" loading={loadingProducts} onClick={() => void loadMore()}>Tải thêm sản phẩm Core</Button> : null}
    {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
    {loading ? <p className="text-sm text-graphite">Đang đọc target và bằng chứng đồng bộ…</p> : null}
    {rows.length ? <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-surface-container-low text-graphite"><tr><th className="p-3">Core SKU</th><th className="p-3">ATS Core</th><th className="p-3">Target duyệt</th><th className="p-3">Đã báo cáo</th><th className="p-3">Tồn Lazada</th><th className="p-3">Trạng thái</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{rows.map((row) => <tr key={row.listing_id}><td className="p-3 font-mono">{row.sku}</td><td className="p-3 tabular-nums">{row.available_to_sell}</td><td className="p-3 tabular-nums">{row.target_quantity ?? '—'}</td><td className="p-3 tabular-nums">{row.reported_quantity ?? '—'}</td><td className="p-3 tabular-nums">{remote.get(`${row.external_product_id}:${row.external_variant_id}`) ?? 'Chưa đọc trang này'}</td><td className="p-3">{row.latest_sync_status || row.mapping_status}{row.latest_sync_error_code ? ` · ${row.latest_sync_error_code}` : ''}</td></tr>)}</tbody></table></div> : null}
  </Card>;
}
