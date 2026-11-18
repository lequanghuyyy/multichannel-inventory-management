import { useCallback, useEffect, useState } from 'react';
import {
  listChannelMappings,
  registerChannelMapping,
  verifyChannelMapping,
  type Channel,
  type ChannelMapping,
} from '../../../api/channels';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { StatusBadge } from '../../../components/common/StatusBadge';

type Feedback = { tone: 'success' | 'danger' | 'warning'; text: string };

const mappingTone: Record<ChannelMapping['mapping_status'], 'success' | 'neutral' | 'warning' | 'danger'> = {
  verified: 'success',
  unverified: 'neutral',
  needs_attention: 'danger',
  stale: 'warning',
};

const mappingLabel: Record<ChannelMapping['mapping_status'], string> = {
  verified: 'Đã xác minh',
  unverified: 'Chưa xác minh',
  needs_attention: 'Cần xử lý',
  stale: 'Cần xác minh lại',
};

export function WooCommerceMappingPanel({ channel, canManage, onUpdated }: { channel: Channel; canManage: boolean; onUpdated: () => void }) {
  const [mappings, setMappings] = useState<ChannelMapping[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const [form, setForm] = useState({ sku: '', external_listing_id: '', external_variant_id: '', external_sku: '' });

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true); setError(null);
    try {
      const page = await listChannelMappings(channel.id, { limit: 100 }, signal);
      if (!signal?.aborted) setMappings(page.items);
    } catch (cause) {
      if (!signal?.aborted) setError(messageOf(cause));
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [channel.id]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const register = async () => {
    if (!canManage || busy) return;
    const input = {
      sku: form.sku.trim(),
      external_listing_id: form.external_listing_id.trim(),
      external_variant_id: form.external_variant_id.trim() || undefined,
      external_sku: form.external_sku.trim(),
    };
    if (!input.sku || !input.external_listing_id || !input.external_sku) {
      setFeedback({ tone: 'danger', text: 'Cần nhập đủ SKU Core, product ID và SKU WooCommerce. Variation ID chỉ cần cho sản phẩm biến thể.' });
      return;
    }
    if (!/^\d+$/.test(input.external_listing_id) || (input.external_variant_id && !/^\d+$/.test(input.external_variant_id))) {
      setFeedback({ tone: 'danger', text: 'Product ID và variation ID phải là số nguyên dương.' });
      return;
    }
    setBusy('register'); setFeedback(null);
    try {
      await registerChannelMapping(channel.id, input);
      setFeedback({ tone: 'success', text: 'Đã đăng ký mapping. Mapping chưa được dùng để ghi tồn cho tới khi xác minh thành công.' });
      setForm({ sku: '', external_listing_id: '', external_variant_id: '', external_sku: '' });
      await load();
      onUpdated();
    } catch (cause) {
      setFeedback({ tone: 'danger', text: messageOf(cause) });
    } finally {
      setBusy(null);
    }
  };

  const verify = async (mapping: ChannelMapping) => {
    if (!canManage || busy) return;
    setBusy(mapping.id); setFeedback(null);
    try {
      const verified = await verifyChannelMapping(channel.id, mapping.id);
      setFeedback(verified.mapping_status === 'verified'
        ? { tone: 'success', text: `Đã xác minh ${mapping.external_sku}: sản phẩm tồn tại, ID/SKU khớp và WooCommerce đang quản lý tồn kho.` }
        : { tone: 'warning', text: `Backend trả trạng thái ${verified.mapping_status}. Mapping chưa đủ điều kiện ghi tồn kho.` });
      await load();
      onUpdated();
    } catch (cause) {
      setFeedback({ tone: 'danger', text: messageOf(cause) });
    } finally {
      setBusy(null);
    }
  };

  return <div className="grid min-w-0 gap-4">
    <Card className="grid min-w-0 gap-4 p-5">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-body text-caption font-semibold uppercase tracking-[0.13em] text-graphite">Mapping WooCommerce</p>
          <h2 className="mt-1 font-display text-lg font-bold text-on-surface">Đăng ký và xác minh SKU</h2>
          <p className="mt-1 max-w-3xl text-sm leading-6 text-graphite">Product ID là sản phẩm cha; variation ID là biến thể. Với sản phẩm đơn giản, để trống variation ID. Mapping chỉ được dùng để ghi tồn sau khi backend đọc lại đúng ID, đúng SKU và thấy WooCommerce đang quản lý tồn kho.</p>
        </div>
        <StatusBadge tone={mappings.every((item) => item.mapping_status === 'verified') && mappings.length > 0 ? 'success' : 'warning'}>
          {mappings.filter((item) => item.mapping_status === 'verified').length} / {mappings.length} đã xác minh
        </StatusBadge>
      </header>

      {canManage ? <form className="grid gap-3 rounded-control border border-outline-variant/50 p-4 md:grid-cols-2 xl:grid-cols-4" onSubmit={(event) => { event.preventDefault(); void register(); }}>
        <Input label="SKU Core" value={form.sku} onChange={(event) => setForm({ ...form, sku: event.target.value })} placeholder="SHOE-001-BLK-42" autoComplete="off" />
        <Input label="Product ID" value={form.external_listing_id} onChange={(event) => setForm({ ...form, external_listing_id: event.target.value })} placeholder="123" inputMode="numeric" autoComplete="off" />
        <Input label="Variation ID" value={form.external_variant_id} onChange={(event) => setForm({ ...form, external_variant_id: event.target.value })} placeholder="456" inputMode="numeric" autoComplete="off" hint="Sản phẩm đơn giản: để trống." />
        <Input label="SKU trên WooCommerce" value={form.external_sku} onChange={(event) => setForm({ ...form, external_sku: event.target.value })} placeholder="SHOE-001-BLK-42" autoComplete="off" />
        <div className="flex items-end md:col-span-2 xl:col-span-4">
          <Button type="submit" size="sm" loading={busy === 'register'} disabled={Boolean(busy)}>Đăng ký mapping</Button>
        </div>
      </form> : <p className="text-xs leading-5 text-graphite">STAFF chỉ xem. ADMIN mới có thể đăng ký hoặc xác minh mapping.</p>}

      {feedback ? <p role="status" className={`rounded-control p-3 text-sm ${feedback.tone === 'success' ? 'bg-badge-progress-bg text-badge-progress-text' : feedback.tone === 'warning' ? 'bg-surface-container-low text-on-surface' : 'bg-error-container/40 text-error'}`}>{feedback.text}</p> : null}
      {loading ? <LoadingState label="Đang tải mapping WooCommerce…" /> : null}
      {!loading && error ? <ErrorState error={error} retry={() => void load()} /> : null}
      {!loading && !error && mappings.length === 0 ? <EmptyState title="Chưa có mapping WooCommerce" detail="Đăng ký product/variation ID và SKU WooCommerce, sau đó xác minh qua connector." /> : null}
    </Card>

    {mappings.length > 0 ? <Card className="min-w-0 overflow-hidden p-0">
      <header className="border-b border-outline-variant/50 px-5 py-4"><h3 className="font-display text-base font-bold text-on-surface">Mapping và số lượng</h3><p className="mt-1 text-caption text-graphite">Mục tiêu là quota tuyệt đối gửi sang WooCommerce. Đã xác nhận là phản hồi HTTP; chỉ số đọc lại mới quyết định trạng thái VERIFIED.</p></header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-left">
          <caption className="sr-only">Mapping SKU WooCommerce và số lượng tồn kho</caption>
          <thead><tr className="h-11 border-b border-outline-variant/50 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
            <th className="px-5">SKU WooCommerce</th><th className="px-3">SKU Core</th><th className="px-3">Product / Variation</th><th className="px-3">Mapping</th>
            <th className="px-3 text-right">Mục tiêu</th><th className="px-3 text-right">Đã gửi</th><th className="px-3 text-right">Đã xác nhận</th><th className="px-3 text-right">Đọc lại</th><th className="px-5 text-right">Thao tác</th>
          </tr></thead>
          <tbody className="divide-y divide-surface-container">
            {mappings.map((mapping) => <tr key={mapping.id} className="font-body text-body-sm">
              <td className="px-5 py-3"><code className="font-mono text-on-surface">{mapping.external_sku}</code>{mapping.issue_reason ? <code className="mt-1 block break-all font-mono text-[10px] text-error">{mapping.issue_reason}</code> : null}</td>
              <td className="px-3 py-3"><code className="font-mono text-on-surface-variant">{mapping.canonical_sku}</code>{!mapping.variant_is_active ? <span className="mt-1 block text-[10px] uppercase text-graphite">ngừng bán</span> : null}</td>
              <td className="px-3 py-3"><code className="block font-mono text-caption text-on-surface">{mapping.external_product_id || '—'}</code><code className="mt-1 block font-mono text-caption text-graphite">{mapping.external_variant_id || '—'}</code></td>
              <td className="px-3 py-3"><StatusBadge tone={mappingTone[mapping.mapping_status]}>{mappingLabel[mapping.mapping_status]}</StatusBadge>{mapping.last_verified_at ? <span className="mt-1 block text-[10px] text-graphite">{formatTime(mapping.last_verified_at)}</span> : null}</td>
              <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{number(mapping.target_quantity)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{number(mapping.pushed_quantity)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{number(mapping.acknowledged_quantity)}</td>
              <td className="px-3 py-3 text-right"><span className={mapping.latest_sync_status === 'MISMATCH' ? 'font-semibold text-error' : 'tabular-nums text-on-surface-variant'}>{number(mapping.verified_quantity ?? mapping.latest_sync_remote_after)}</span></td>
              <td className="px-5 py-3 text-right">{canManage ? <Button variant="secondary" size="sm" loading={busy === mapping.id} disabled={Boolean(busy)} onClick={() => void verify(mapping)}>{mapping.mapping_status === 'verified' ? 'Xác minh lại' : 'Xác minh'}</Button> : <span className="text-caption text-graphite">Chỉ ADMIN</span>}</td>
            </tr>)}
          </tbody>
        </table>
      </div>
    </Card> : null}
  </div>;
}

function number(value?: number | null): string {
  return value === null || value === undefined ? '—' : value.toLocaleString('vi-VN');
}

function formatTime(value?: string | null): string {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', dateStyle: 'medium', timeStyle: 'short' });
}

function messageOf(error: unknown): string {
  if (error instanceof Error) {
    const code = (error as { code?: string }).code;
    return code ? `${error.message} (${code})` : error.message;
  }
  return 'Không thể cập nhật mapping WooCommerce.';
}
