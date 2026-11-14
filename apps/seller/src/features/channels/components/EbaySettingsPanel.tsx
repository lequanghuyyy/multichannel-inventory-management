import { useEffect, useState } from 'react';
import { getEbayStatus, type EbayConnection } from '../../../api/ebay';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Card } from '../../../components/ui/Card';
import type { Channel } from '../../../api/channels';
import { EbayCapabilityPanel } from './EbayCapabilityPanel';

export function EbaySettingsPanel({ channel, canManage }: { channel: Channel; canManage: boolean }) {
  const [connection, setConnection] = useState<EbayConnection | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  useEffect(() => {
    const controller = new AbortController();
    void getEbayStatus(controller.signal).then((status) => {
      if (!controller.signal.aborted) setConnection(status.connections.find((item) => item.channel_id === channel.id) ?? null);
    }).catch((cause: unknown) => { if (!controller.signal.aborted) setError(cause); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [channel.id]);

  return <div className="grid min-w-0 gap-4">
    <Card className="grid min-w-0 gap-4 p-4 sm:p-5">
      <header className="flex min-w-0 items-start gap-3"><span className="grid size-11 shrink-0 place-items-center rounded-control bg-surface-container-low font-display text-lg font-black tracking-tight" aria-label="eBay"><span className="text-[#e53238]">e</span><span className="text-[#0064d2]">B</span><span className="text-[#f5af02]">a</span><span className="text-[#86b817]">y</span></span><div className="min-w-0"><p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Thông tin kết nối</p><h2 className="mt-1 break-words font-display text-lg font-bold text-on-surface">eBay Seller Sandbox</h2><p className="mt-1 text-sm leading-5 text-graphite">Kết nối OAuth theo tài khoản Seller và marketplace. Credential và token chỉ ở backend.</p></div></header>
      {loading ? <LoadingState label="Đang đọc trạng thái eBay…" /> : null}
      {!loading && error ? <ErrorState error={error} retry={() => { setLoading(true); setError(null); void getEbayStatus().then((status) => setConnection(status.connections.find((item) => item.channel_id === channel.id) ?? null)).catch(setError).finally(() => setLoading(false)); }} /> : null}
      {!loading && !error && !connection ? <EmptyState title="Không tìm thấy OAuth connection" detail="Channel này chưa có kết nối Seller eBay đã lưu trong backend." /> : null}
      {!loading && !error && connection ? <>
        <dl className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3"><Fact label="Seller" value={connection.seller_username || connection.seller_user_id} /><Fact label="Marketplace đang quản lý" value={connection.marketplace_id} /><Fact label="Marketplace đăng ký tài khoản" value={connection.registration_marketplace_id || 'eBay không trả về thông tin'} /><Fact label="Môi trường" value="Sandbox" /><Fact label="Trạng thái OAuth" value={connection.connection_status === 'connected' ? 'Đã kết nối' : connection.connection_status === 'reauthorization_required' ? 'Cần kết nối lại' : 'Có lỗi'} /><Fact label="Lần xác minh gần nhất" value={formatTime(connection.last_verified_at)} /><Fact label="SKU đã mapping" value={connection.mapping_count.toLocaleString('vi-VN')} /></dl>
        {connection.last_error_code ? <p role="status" className="rounded-control border border-apricot/70 bg-apricot/5 p-3 text-sm leading-5 text-on-surface">Cần xử lý: {connection.last_error_code}. Hãy kiểm tra cấu hình và xác minh lại quyền Seller.</p> : null}
      </> : null}
      <div className="grid gap-2 rounded-control border border-outline-variant/50 bg-surface-container-low p-3 text-sm"><strong className="text-on-surface">Quyền ghi theo cấu hình Sandbox</strong><p className="leading-5 text-graphite">Inventory write: {connection ? (connection.granted_scopes.some((scope) => scope.endsWith('/sell.inventory')) ? 'scope đã được cấp; hệ thống vẫn yêu cầu cờ backend, seller verification và mapping an toàn.' : 'chưa cấp scope.') : 'chưa có seller connection.'} Đăng sản phẩm và gửi shipment chưa được triển khai.</p><p className="text-caption text-graphite">Role hiện tại: {canManage ? 'ADMIN · có thể kết nối lại và chạy xác minh' : 'STAFF · chỉ xem trạng thái'}</p></div>
    </Card>
    <EbayCapabilityPanel channelId={channel.id} canManage={canManage} />
  </div>;
}

function Fact({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-caption text-graphite">{label}</dt><dd className="mt-1 break-all text-sm font-medium text-on-surface">{value}</dd></div>; }
function formatTime(value?: string): string { if(!value)return 'Chưa xác minh';const date=new Date(value);return Number.isNaN(date.getTime())?'—':date.toLocaleString('vi-VN',{timeZone:'Asia/Ho_Chi_Minh',dateStyle:'medium',timeStyle:'short'}); }
