import { useCallback, useEffect, useState } from 'react';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { getChannelPrices, setChannelPrice, type ChannelVariantPrice } from '../../../api/products';
import { newIdempotencyKey } from '../product.write';

const stateLabel: Record<string, string> = {
  unconfigured: 'Dùng giá Core', pending: 'Chờ đồng bộ', syncing: 'Đang đồng bộ', verified: 'Đã xác minh',
  drifted: 'Giá remote lệch', failed: 'Đồng bộ lỗi', blocked: 'Bị chặn',
};
const channelLabel: Record<string, string> = { shopify: 'Shopify', ebay: 'eBay', woocommerce: 'WooCommerce', lazada: 'Lazada' };

export function ChannelPriceManager({ productId, canWrite, channelCodes, onSaved }: { productId: string; canWrite: boolean; channelCodes?: readonly string[]; onSaved?: () => void }) {
  const [rows, setRows] = useState<ChannelVariantPrice[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { amount: string; currency: string; reason: string }>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyKey, setBusyKey] = useState('');
  const [message, setMessage] = useState('');
  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const result = await getChannelPrices(productId, signal);
      setRows(result.prices);
      setDrafts((current) => {
        const next = { ...current };
        for (const row of result.prices) {
          const key = priceKey(row);
          if (!next[key]) next[key] = { amount: row.override_amount ?? (row.core_currency === 'VND' && row.currency === 'VND' && row.core_price_minor !== undefined ? String(row.core_price_minor) : ''), currency: row.currency, reason: '' };
        }
        return next;
      });
    } catch (reason) {
      if (!signal?.aborted) setError(reason);
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const save = async (row: ChannelVariantPrice) => {
    const key = priceKey(row);
    const draft = drafts[key];
    if (!draft) return;
    setBusyKey(key); setError(null); setMessage('');
    try {
      await setChannelPrice(productId, row.channel_id, row.variant_id, {
        currency: draft.currency.trim().toUpperCase(), amount: draft.amount.trim(),
        expected_revision: row.revision, reason: draft.reason.trim(),
      }, newIdempotencyKey(`channel-price-${row.variant_id}`));
      setMessage(row.channel_code === 'lazada'
        ? `Đã lưu giá riêng ${draft.amount} ${draft.currency} cho ${row.sku} trong OctoFlow. Giá chưa được gửi lên Lazada.`
        : `Đã lưu giá ${draft.amount} ${draft.currency} cho ${row.sku} · ${channelLabel[row.channel_code] ?? row.channel_code}.`);
      await load();
      onSaved?.();
      setDrafts((current) => ({ ...current, [key]: { ...current[key]!, reason: '' } }));
    } catch (reason) {
      setError(reason);
    } finally {
      setBusyKey('');
    }
  };
  const visibleRows = channelCodes ? rows.filter((row) => channelCodes.includes(row.channel_code)) : rows;

  return <Card className="grid min-w-0 gap-4 p-5">
    <header>
      <h2 className="font-display text-lg font-bold text-on-surface">Giá riêng theo kênh</h2>
    </header>
    {loading ? <LoadingState label="Đang tải giá theo kênh…" /> : null}
    {!loading && error ? <ErrorState error={error} retry={() => void load()} /> : null}
    {!loading && !error && rows.length === 0 ? <EmptyState title="Chưa có kênh đang kết nối" detail="Kết nối một kênh bán để xem hoặc đặt giá riêng theo SKU." /> : null}
    {!loading && !error && rows.length > 0 && visibleRows.length === 0 ? <p className="text-body-sm text-graphite">Giá marketplace eBay được quản lý trong panel eBay.</p> : null}
    {!loading && !error && rows.length > 0 && channelCodes?.includes('lazada') && !visibleRows.some((row) => row.channel_code === 'lazada') ? <p className="rounded-control border border-outline-variant/60 bg-surface-container-low px-3 py-2 text-body-sm text-graphite">Chưa có gian hàng Lazada kết nối để hiển thị giá theo kênh.</p> : null}
    {message ? <p className="rounded-control bg-badge-progress-bg px-3 py-2 text-body-sm text-badge-progress-text" role="status">{message}</p> : null}
    <div className="grid gap-3">
      {visibleRows.map((row) => {
        const key = priceKey(row);
        const draft = drafts[key] ?? { amount: '', currency: row.currency, reason: '' };
        const isBusy = busyKey === key;
        const fallbackCurrencyBlocked = row.channel_code !== 'ebay' && row.core_currency !== row.currency;
        const lazadaLocalOnly = row.channel_code === 'lazada';
        return <article key={key} className="grid min-w-0 gap-3 rounded-control border border-outline-variant/60 bg-surface-container-low p-4 lg:grid-cols-[minmax(10rem,0.8fr)_minmax(7rem,0.5fr)_minmax(7rem,0.5fr)_minmax(9rem,0.55fr)_minmax(12rem,1fr)_auto] lg:items-end">
          <div className="min-w-0"><code className="break-all font-mono text-body-sm font-bold text-on-surface">{row.sku}</code><p className="mt-1 text-caption text-graphite">{channelLabel[row.channel_code] ?? row.channel_code} · Core {row.core_currency}</p></div>
          <div><span className="text-caption text-graphite">Giá Core</span><strong className="mt-1 block font-mono text-body-sm text-on-surface">{row.core_price_minor ?? '—'} {row.core_currency}</strong></div>
          <Input label="Giá kênh" inputMode="decimal" value={draft.amount} disabled={!canWrite || isBusy || fallbackCurrencyBlocked} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, amount: event.target.value } }))} placeholder="Nhập giá" />
          <Input label="Currency" value={draft.currency} disabled={!canWrite || isBusy || fallbackCurrencyBlocked} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, currency: event.target.value.toUpperCase() } }))} maxLength={3} />
          <Input label="Lý do thay đổi" value={draft.reason} disabled={!canWrite || isBusy || fallbackCurrencyBlocked} onChange={(event) => setDrafts((current) => ({ ...current, [key]: { ...draft, reason: event.target.value } }))} placeholder="Ví dụ: giá campaign" maxLength={500} />
          <div className="grid gap-2 lg:justify-items-end">
            <StatusBadge tone={lazadaLocalOnly ? 'warning' : priceTone(row.sync_state)}>{lazadaLocalOnly ? 'Chưa gửi lên Lazada' : row.write_enabled ? priceStateLabel(row) : 'Ghi kênh đang tắt'}</StatusBadge>
            {!lazadaLocalOnly && row.last_error_code ? <code className="text-caption text-error">{row.last_error_code}</code> : null}
            <Button size="sm" disabled={!canWrite || (!lazadaLocalOnly && !row.write_enabled) || isBusy || fallbackCurrencyBlocked || !draft.amount.trim() || !draft.reason.trim()} loading={isBusy} onClick={() => void save(row)}>{lazadaLocalOnly ? 'Lưu giá riêng' : row.channel_code === 'shopify' ? 'Lưu giá kênh' : 'Lưu và đồng bộ'}</Button>
          </div>
          {fallbackCurrencyBlocked ? <p className="text-caption text-error lg:col-span-full">Currency của kênh chưa khớp với Core; không thể đồng bộ giá này an toàn.</p> : null}
          {row.last_verified_amount ? <p className="text-caption text-graphite lg:col-span-full">Đã xác minh remote: <strong className="font-mono text-on-surface">{row.last_verified_amount} {row.currency}</strong>{row.last_verified_at ? ` · ${formatDate(row.last_verified_at)}` : ''}</p> : null}
        </article>;
      })}
    </div>
    {!canWrite ? <p className="text-caption text-graphite">Chỉ ADMIN có quyền thay đổi giá theo kênh.</p> : null}
  </Card>;
}

function priceKey(row: ChannelVariantPrice) { return `${row.channel_id}:${row.variant_id}`; }
function priceStateLabel(row: ChannelVariantPrice) {
  if (row.last_error_code === 'CORE_PRICE_MISSING' && row.override_amount && Number(row.override_amount) > 0) return 'Chờ thử lại';
  if (row.last_error_code === 'CORE_PRICE_MISSING' || row.last_error_code === 'CORE_PRICE_INVALID') return 'Giá chưa hợp lệ';
  if (row.channel_code === 'shopify' && row.sync_state === 'pending' && !row.last_pushed_amount) return 'Chờ tạo bản nháp';
  return stateLabel[row.sync_state] ?? row.sync_state;
}
function priceTone(state: string): 'neutral' | 'success' | 'warning' | 'danger' {
  if (state === 'verified') return 'success';
  if (state === 'failed' || state === 'drifted' || state === 'blocked') return 'danger';
  if (state === 'pending' || state === 'syncing') return 'warning';
  return 'neutral';
}
function formatDate(value: string) { const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : date.toLocaleString('vi-VN'); }
