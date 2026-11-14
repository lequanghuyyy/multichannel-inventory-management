import { navigate } from '../../../app/routes';
import { EmptyState } from '../../../components/common/ScreenState';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import type { ProductCatalogItem } from '../product.types';

export function ChannelMappingPreview({ product }: { product: ProductCatalogItem }) {
  const mappings = product.channelMappings ?? [];
  if (mappings.length === 0) return <EmptyState title="Chưa có liên kết kênh bán" detail="Sản phẩm này chưa được đăng bán trên kênh nào." />;

  return (
    <section className="grid gap-4" aria-labelledby="channel-mapping-title">
      <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
        <div><h2 id="channel-mapping-title" className="font-display text-xl font-bold text-on-surface">Liên kết kênh bán</h2><p className="mt-1 font-body text-body-sm text-graphite">SKU trọng tâm <code className="font-mono text-on-surface">{product.focusSku}</code> · số lượng đang đăng bán (mẫu).</p></div>
        <span className="rounded-full bg-badge-blocked-bg px-3 py-1 font-body text-caption font-semibold text-badge-blocked-text">Tồn đệm thấp</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {mappings.map((mapping) => (
          <Card key={mapping.channel.id} className="grid gap-4 p-4">
            <div className="flex items-start justify-between gap-3"><div className="flex items-center gap-2"><span className={`grid size-8 place-items-center rounded text-[10px] font-bold text-pure-white ${mapping.channel.colorClass}`} aria-hidden="true">{mapping.channel.shortLabel}</span><div><strong className="block font-body text-body-sm text-on-surface">{mapping.channel.label}</strong><span className="font-body text-[10px] text-graphite">{mapping.context}</span></div></div><span className="size-2 rounded-full bg-traffic-maximize" title={mapping.connection} /></div>
            <dl className="grid gap-2 font-body text-caption"><div><dt className="text-graphite">{mapping.remoteIdLabel}</dt><dd className="mt-0.5 font-mono text-on-surface">{mapping.remoteId}</dd></div><div><dt className="text-graphite">SKU trên kênh</dt><dd className="mt-0.5 break-all font-mono text-on-surface">{mapping.channelSku}</dd></div></dl>
            <div className="flex items-end justify-between border-t border-outline-variant/50 pt-3"><span className="font-body text-caption text-graphite">Đang đăng bán</span><strong className="font-display text-2xl text-on-surface">{mapping.published} <span className="text-caption font-medium text-graphite">sản phẩm</span></strong></div>
          </Card>
        ))}
      </div>
      <aside className="flex flex-col justify-between gap-4 rounded-card bg-badge-neutral-bg/55 px-5 py-4 sm:flex-row sm:items-center" aria-label="Quy tắc đồng bộ tồn kho">
        <div className="flex items-start gap-3"><span className="material-symbols-outlined mt-0.5 text-xl text-badge-neutral-text" aria-hidden="true">shield</span><p className="font-body text-body-sm leading-5 text-badge-neutral-text"><strong>Đồng bộ liên tục:</strong> hệ thống tự cập nhật số lượng có thể bán lên các kênh; màn hình này chỉ hiển thị số lượng đã gửi.</p></div>
        <Button variant="secondary" size="sm" onClick={() => navigate('/channels')} className="shrink-0">Cấu hình kênh</Button>
      </aside>
    </section>
  );
}
