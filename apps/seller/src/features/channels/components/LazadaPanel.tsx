import { useEffect, useState } from 'react';
import { disconnectLazada, getLazadaCatalog, getLazadaStatus, importLazadaMappings, previewLazadaMappings, startLazadaOAuth, verifyLazada, type LazadaCatalog, type LazadaMappingReport, type LazadaStatus } from '../../../api/lazada';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { LazadaInventoryPanel } from './LazadaInventoryPanel';
import { LazadaCategoryPanel } from './LazadaCategoryPanel';
import { ChannelProductsWorkspace } from './ChannelProductsWorkspace';
import type { Channel } from '../../../api/channels';

export function LazadaPanel({ channel, tab, canManage, onUpdated, onSettings }: { channel: Channel; tab: 'products' | 'settings'; canManage: boolean; onUpdated: () => void; onSettings?: () => void }) {
  const channelId = channel.id;
  const [status, setStatus] = useState<LazadaStatus | null>(null);
  const [catalog, setCatalog] = useState<LazadaCatalog | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [mapping, setMapping] = useState<LazadaMappingReport | null>(null);
  const hasStoredAuthorization = Boolean(status?.connection?.access_token_expires_at || status?.connection?.refresh_token_expires_at);
  const refreshTokenExpiresAt = Date.parse(status?.connection?.refresh_token_expires_at ?? '');
  const canVerify = status?.connection?.status === 'connected'
    || (status?.connection?.status !== 'reauthorization_required' && refreshTokenExpiresAt > Date.now());
  useEffect(() => {
    const controller = new AbortController();
    void getLazadaStatus(controller.signal).then((value) => { if (!controller.signal.aborted) setStatus(value); })
      .catch(() => { if (!controller.signal.aborted) setError('Không đọc được trạng thái Lazada.'); });
    return () => controller.abort();
  }, [channelId]);

  const readProducts = async (offset = 0) => {
    setLoading(true); setError('');
    try { setCatalog(await getLazadaCatalog(channelId, offset)); }
    catch { setError('Không thể đọc sản phẩm. Kiểm tra kết nối và quyền Products API.'); }
    finally { setLoading(false); }
  };
  const act = async (action: 'verify' | 'connect' | 'disconnect') => {
    if (!canManage || busy) return;
    setBusy(true); setError(''); setMessage('');
    try {
      if (action === 'connect') { window.location.assign(await startLazadaOAuth()); return; }
      if (action === 'verify') {
        const result = await verifyLazada(channelId);
        setMessage(result.warning_code
          ? 'Quyền đọc sản phẩm đã xác minh; quyền đọc đơn hàng chưa được xác nhận.'
          : 'Quyền đọc sản phẩm và đơn hàng đã được API Lazada xác minh.');
      }
      else { await disconnectLazada(channelId); setMessage('Đã ngắt kết nối và xóa token đã lưu.'); }
      setStatus(await getLazadaStatus()); onUpdated();
    } catch { setError(action === 'verify' ? 'Chưa xác minh được quyền đọc sản phẩm.' : 'Thao tác kết nối Lazada chưa hoàn tất.'); }
    finally { setBusy(false); }
  };
  const map = async (importing: boolean) => {
    if (!canManage || busy || importing && !mapping) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const result = importing ? await importLazadaMappings(channelId, mapping!.fingerprint) : await previewLazadaMappings(channelId);
      setMapping(result);
      if (importing) { setMessage(`Đã ghép ${result.imported} SKU hợp lệ. ${result.issues.length} SKU cần xử lý.`); onUpdated(); }
    } catch { setMapping(null); setError(importing ? 'Catalog hoặc Core đã thay đổi. Hãy xem trước lại trước khi ghép SKU.' : 'Không thể đọc trọn catalog để xem trước mapping.'); }
    finally { setBusy(false); }
  };

  if (tab === 'settings') return <div className="grid min-w-0 gap-5">
    <header><h2 className="font-display text-xl font-bold text-on-surface">Gian hàng Lazada VN</h2><p className="mt-1 text-sm text-graphite">Danh tính gian hàng và bằng chứng kết nối từ Lazada Open Platform.</p></header>
    <Card className="grid gap-5 p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-outline-variant/50 pb-4"><strong className="text-on-surface">Seller In-house APP</strong><StatusBadge tone={connectionLabel(status) === 'Đã kết nối' ? 'success' : 'warning'}>{connectionLabel(status)}</StatusBadge></div>
      <dl className="grid gap-4 sm:grid-cols-2">
        <Field label="Seller ID" value={status?.connection?.seller_id ?? '—'} />
        <Field label="Quốc gia" value={status?.country?.toUpperCase() ?? 'VN'} />
        <Field label="Đọc sản phẩm" value={status?.connection?.capabilities?.products_read ? 'Đã xác minh từ Lazada' : 'Chưa xác minh'} />
        <Field label="Đọc đơn hàng" value={status?.connection?.capabilities?.orders_read ? 'Đã xác minh từ Lazada' : 'Chưa xác minh'} />
        <Field label="Ghi sản phẩm" value={status?.product_write_enabled ? 'Đã bật tại server' : 'Tắt tại server'} />
        <Field label="Bằng chứng ghi sản phẩm" value={status?.connection?.capabilities?.products_write ? 'Đã xác minh từ Lazada' : 'Chưa có bằng chứng từ Lazada'} />
        <Field label="Xác minh gần nhất" value={formatTime(status?.connection?.last_verified_at)} />
        <Field label="Token" value={status?.connection?.status === 'connected' ? `Đã mã hóa · access hết hạn ${formatTime(status.connection.access_token_expires_at)}` : 'Không khả dụng'} />
        <Field label="Lỗi kết nối" value={status?.connection?.last_error_code ? 'Cần kết nối lại hoặc xác minh quyền Lazada' : 'Không có'} />
        <Field label="Poll đơn gần nhất" value={formatTime(status?.connection?.last_order_poll_at)} />
        <Field label="Lỗi poll" value={status?.connection?.order_poll_error ? 'Lần đọc đơn gần nhất chưa hoàn tất; hệ thống sẽ thử lại' : 'Không có'} />
        <Field label="Ghi tồn kho Lazada" value={status?.inventory_write_enabled ? 'Đã bật tại server' : 'Tắt tại server'} />
        <Field label="Bằng chứng ghi tồn" value={status?.connection?.capabilities?.inventory_write ? 'Đã xác minh từ Lazada' : 'Chưa có lần ghi tồn xác minh'} />
      </dl>
      {canManage ? <div className="flex flex-wrap gap-2 border-t border-outline-variant/50 pt-4"><Button size="sm" disabled={!status?.enabled} loading={busy} onClick={() => void act('connect')}>Kết nối lại</Button><Button variant="secondary" size="sm" disabled={!canVerify} loading={busy} onClick={() => void act('verify')}>Kiểm tra kết nối</Button><Button variant="ghost" size="sm" disabled={!hasStoredAuthorization} loading={busy} onClick={() => void act('disconnect')}>Ngắt kết nối</Button></div> : null}
    </Card>
    {message ? <p role="status" className="text-sm text-on-surface">{message}</p> : null}
    {error ? <p role="alert" className="text-sm text-error">{error}</p> : null}
  </div>;

  const products = catalog?.data?.products ?? [];
  const rows = products.flatMap((product) => (product.skus ?? []).map((sku) => ({ product, sku })));
  const mayPublish = canManage && Boolean(status?.product_write_enabled);
  const publishBlockedReason = !status
    ? 'Đang đọc trạng thái Lazada. Chức năng đăng sản phẩm sẽ mở khi quyền ghi được xác minh.'
    : !status.product_write_enabled
      ? 'Đăng sản phẩm Lazada đang tắt trên server. Bật quyền ghi sản phẩm và xác minh lại kết nối trước khi gửi sản phẩm mới.'
      : 'Tài khoản của bạn cần quyền Admin để đăng sản phẩm Lazada.';

  return <div className="grid min-w-0 gap-5">
    <ChannelProductsWorkspace channel={channel} canManage={canManage} canPublish={mayPublish} publishBlockedReason={publishBlockedReason} onSettings={onSettings} />

    {error ? <p role="alert" className="rounded-control border border-error/40 bg-error/5 p-3 text-sm text-error">{error}</p> : null}
    {message ? <p role="status" className="text-sm text-on-surface">{message}</p> : null}

    <details className="rounded-lg border border-outline-variant bg-pure-white p-4 sm:p-5">
      <summary className="cursor-pointer text-sm font-semibold text-on-surface">Công cụ Lazada nâng cao · catalog, mapping, ngành hàng và tồn</summary>
      <div className="mt-4 grid gap-5">
        <Card className="grid gap-3 p-4 sm:p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div><h3 className="font-display text-base font-bold text-on-surface">Sản phẩm đang có trên Lazada</h3><p className="mt-1 text-sm leading-5 text-graphite">Đọc trực tiếp catalog Lazada để đối soát. Số tồn dưới đây là dữ liệu Lazada, chưa ghi về Core.</p></div>
            <Button size="sm" loading={loading} onClick={() => void readProducts()}>Đọc sản phẩm từ Lazada</Button>
          </div>
          {!catalog && !loading ? <p className="text-sm text-graphite">Bấm “Đọc sản phẩm từ Lazada” để tải dữ liệu thật từ gian hàng.</p> : null}
          {catalog ? <div className="overflow-x-auto rounded-lg border border-outline-variant/60"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-surface-container-low text-xs text-graphite"><tr><th className="p-3">Sản phẩm</th><th className="p-3">Seller SKU</th><th className="p-3">SKU ID</th><th className="p-3">Giá</th><th className="p-3">Tồn Lazada</th><th className="p-3">Trạng thái</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{rows.map(({ product, sku }, index) => <tr key={`${product.item_id}:${sku.SkuId ?? index}`}><td className="p-3"><strong className="block text-on-surface">{product.attributes?.name || `Item ${product.item_id}`}</strong><span className="text-xs text-graphite">{product.item_id}</span></td><td className="p-3 font-mono text-xs">{sku.SellerSku || '—'}</td><td className="p-3 font-mono text-xs">{sku.SkuId ?? '—'}</td><td className="p-3 tabular-nums">{sku.price ?? '—'}</td><td className="p-3 tabular-nums">{sku.sellableQuantity ?? sku.Available ?? sku.quantity ?? '—'}</td><td className="p-3">{sku.Status || product.status || '—'}</td></tr>)}</tbody></table>{rows.length === 0 ? <p className="p-4 text-sm text-graphite">Trang này không có SKU.</p> : null}<div className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 p-3 text-xs text-graphite"><span>{catalog.data.total_products ?? '—'} sản phẩm từ API · offset {catalog.offset}</span><div className="flex gap-2"><Button variant="ghost" size="sm" disabled={loading || catalog.offset === 0} onClick={() => void readProducts(Math.max(0, catalog.offset - 50))}>Trước</Button><Button variant="ghost" size="sm" disabled={loading || products.length < catalog.limit} onClick={() => void readProducts(catalog.offset + 50)}>Sau</Button></div></div></div> : null}
        </Card>

        {canManage ? <Card className="grid gap-3 p-4 sm:p-5"><div><h3 className="font-display text-base font-bold text-on-surface">Ghép SKU với kho OctoFlow</h3><p className="mt-1 text-sm text-graphite">Đọc toàn bộ catalog và đối chiếu đúng mã SKU. Mapping mới chưa tham gia phân bổ tồn.</p></div><div className="flex flex-wrap gap-2"><Button variant="secondary" size="sm" loading={busy} onClick={() => void map(false)}>Xem trước mapping</Button>{mapping && mapping.eligible > 0 && mapping.imported === 0 ? <Button size="sm" loading={busy} onClick={() => void map(true)}>Xác nhận ghép {mapping.eligible} SKU</Button> : null}</div>{mapping ? <div role="status" className="text-sm text-on-surface"><p>{mapping.products} sản phẩm · {mapping.skus} SKU · {mapping.eligible} hợp lệ · {mapping.issues.length} cần xử lý</p>{mapping.candidates.length ? <div className="mt-3 max-h-64 overflow-auto rounded-control border border-outline-variant/60"><table className="w-full min-w-[570px] text-left text-xs"><thead className="sticky top-0 bg-surface-container-low"><tr><th className="p-2">Seller SKU</th><th className="p-2">Lazada item / SKU</th><th className="p-2">Core variant</th><th className="p-2">Remote</th></tr></thead><tbody className="divide-y divide-outline-variant/50">{mapping.candidates.slice(0, 100).map((item) => <tr key={`${item.product_id}:${item.sku_id}`}><td className="p-2 font-medium">{item.seller_sku}</td><td className="p-2 font-mono">{item.product_id} / {item.sku_id}</td><td className="p-2 font-mono">{item.core_variant_id ?? '—'}</td><td className="p-2">{item.remote_status}</td></tr>)}</tbody></table></div> : null}{mapping.candidates.length > 100 ? <p className="mt-2 text-xs text-graphite">Đang hiện 100/{mapping.candidates.length} SKU hợp lệ.</p> : null}{mapping.issues.length ? <ul className="mt-2 list-inside list-disc text-graphite">{mapping.issues.slice(0, 20).map((item) => <li key={`${item.product_id}:${item.sku_id}`}>{item.seller_sku || item.sku_id}: {item.reason}</li>)}</ul> : null}</div> : null}</Card> : null}

        <LazadaInventoryPanel channelId={channelId} catalog={catalog} revision={mapping?.imported ?? 0} />

        {canManage ? <LazadaCategoryPanel channelId={channelId} /> : null}
      </div>
    </details>
  </div>;
}

function formatTime(value?: string) { return value ? new Date(value).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }) : 'Chưa có dữ liệu'; }
function connectionLabel(status: LazadaStatus | null) {
  const connection = status?.connection;
  if (!connection || connection.status === 'disconnected') return 'Chưa kết nối';
  if (connection.status === 'reauthorization_required' || connection.refresh_token_expires_at && new Date(connection.refresh_token_expires_at).getTime() < Date.now()) return 'Cần ủy quyền lại';
  if (connection.status === 'error') return 'Lỗi kết nối';
  return connection.status === 'connected' ? 'Đã kết nối' : 'Cần xác minh';
}
function Field({ label, value }: { label: string; value: string }) { return <div><dt className="text-xs text-graphite">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</dd></div>; }
