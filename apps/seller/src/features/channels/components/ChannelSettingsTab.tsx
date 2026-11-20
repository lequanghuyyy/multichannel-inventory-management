import { useState } from 'react';
import type { Channel } from '../../../api/channels';
import { connectShopifyStore, verifyShopifyStore } from '../../../api/shopify';
import type { ShopifyStatus } from '../../../api/shopify';
import { startEbayOAuth, verifyEbayChannel } from '../../../api/ebay';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { ChannelBrandIcon } from '../../../components/common/ChannelBrandIcon';

export function ChannelSettingsTab({ channel, canManage, status, statusLoading, statusError, onStatusChange, onUpdated }: {
  channel: Channel; canManage: boolean; status: ShopifyStatus | null; statusLoading: boolean; statusError?: string | null;
  onStatusChange: (status: ShopifyStatus) => void; onUpdated: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [connectedOverride, setConnectedOverride] = useState<boolean | null>(null);
  const [actionMessage, setActionMessage] = useState('');
  const connected = channel.code === 'shopify' && status?.channel_id === channel.id ? status.connected : connectedOverride ?? channel.status === 'connected';
  const stateLabel = statusLoading ? 'Đang tải' : connected ? 'Đang hoạt động' : channel.status === 'error' ? 'Cần kiểm tra' : 'Chưa kết nối';
  const tone = connected ? 'success' : channel.status === 'error' ? 'danger' : 'warning';

  const manageConnection = async () => {
    if (!canManage || busy) return;
    setBusy(true); setError(false); setActionMessage('');
    try {
      if (channel.code === 'shopify') {
        const result = connected ? await verifyShopifyStore() : await connectShopifyStore();
        onStatusChange(result); setConnectedOverride(result.connected); setActionMessage(result.connected ? 'Cửa hàng đã sẵn sàng.' : 'Cửa hàng chưa kết nối. Vui lòng kiểm tra lại thông tin.');
      } else if (channel.code === 'ebay') {
        if (connected) {
          const result = await verifyEbayChannel(channel.id);
          setConnectedOverride(result.status === 'VERIFIED'); setActionMessage(result.status === 'VERIFIED' ? 'Cửa hàng đã sẵn sàng.' : 'Cửa hàng chưa kết nối. Vui lòng thử lại.');
        } else {
          const result = await startEbayOAuth();
          window.location.assign(result.authorization_url);
          return;
        }
      }
      onUpdated();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const platform = platformName(channel.code, channel.type);
  const shopName = channel.code === 'shopify' && status?.channel_id === channel.id ? status.shop_name || status.shop_domain || channel.name : channel.name;
  const canConnect = ['shopify', 'ebay'].includes(channel.code);

  return <div className="grid min-w-0 gap-5">
    <header><h2 className="font-display text-xl font-bold text-on-surface">Cấu hình cửa hàng</h2></header>
    <section className="grid gap-4">
      <Card className="grid min-w-0 gap-5 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-outline-variant/50 pb-4"><div className="flex min-w-0 items-center gap-3"><span className="grid size-11 shrink-0 place-items-center"><ChannelBrandIcon code={channel.code} simulated={channel.type === 'simulator' || channel.environment === 'simulated'} /></span><span className="min-w-0"><span className="block text-xs text-graphite">{platform}</span><strong className="mt-1 block truncate text-base font-semibold text-on-surface">{shopName}</strong></span></div><StatusBadge tone={tone}>{stateLabel}</StatusBadge></div>
        <dl className="grid gap-4 sm:grid-cols-2"><Setting label="Kênh bán" value={platform} /><Setting label="Cửa hàng" value={shopName} /><Setting label="Trạng thái" value={stateLabel} /><Setting label="Cập nhật gần nhất" value={formatTime(channel.last_sync)} /></dl>
        {statusError ? <p role="status" className="rounded-control bg-surface-container-low px-4 py-3 text-sm text-graphite">Chưa tải được thông tin kết nối. Hãy làm mới để thử lại.</p> : null}
        {error ? <p role="alert" className="rounded-control bg-error-container px-4 py-3 text-sm text-on-error-container">Không thể cập nhật kết nối. Vui lòng thử lại sau.</p> : null}
        {actionMessage ? <p role="status" className="rounded-control bg-badge-progress-bg px-4 py-3 text-sm text-badge-progress-text">{actionMessage}</p> : null}
        {canConnect ? <div className="flex flex-wrap items-center gap-3 border-t border-outline-variant/50 pt-4">{canManage ? <Button variant={connected ? 'secondary' : 'primary'} size="sm" loading={busy || statusLoading} disabled={statusLoading} onClick={() => void manageConnection()} leadingIcon={<span className="material-symbols-outlined text-base" aria-hidden="true">{connected ? 'refresh' : 'link'}</span>}>{connected ? 'Kiểm tra kết nối' : 'Kết nối cửa hàng'}</Button> : <span className="text-sm text-graphite">Liên hệ quản trị viên để thay đổi kết nối cửa hàng.</span>}</div> : <p className="border-t border-outline-variant/50 pt-4 text-sm text-graphite">Kênh này chưa hỗ trợ kết nối cửa hàng.</p>}
      </Card>
    </section>
  </div>;
}

function Setting({ label, value }: { label: string; value: string }) { return <div className="min-w-0"><dt className="text-xs text-graphite">{label}</dt><dd className="mt-1 break-words text-sm font-semibold text-on-surface">{value}</dd></div>; }
function platformName(code: string, type: string) { const names: Record<string, string> = { shopify: 'Shopify', woocommerce: 'WooCommerce', ebay: 'eBay', shopee: 'Shopee', tiktok: 'TikTok Shop', simulator: 'Simulator nội bộ' }; return names[code] ?? names[type] ?? type; }
function formatTime(value?: string) { if (!value) return 'Chưa có dữ liệu'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' }); }
