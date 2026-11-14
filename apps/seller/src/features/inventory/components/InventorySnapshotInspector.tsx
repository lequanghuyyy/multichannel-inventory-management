import type { FormEvent } from 'react';
import type { InventorySnapshot } from '../../../api/inventory';
import { ApiRequestError } from '../../../core/api-error';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Button } from '../../../components/ui/Button';
import { Card } from '../../../components/ui/Card';
import { Input } from '../../../components/ui/Input';
import type { InventoryLookupState } from '../hooks/useInventoryLookup';

export interface InventorySnapshotInspectorProps {
  sku: string;
  submittedSku: string;
  state: InventoryLookupState;
  snapshot: InventorySnapshot | null;
  error: unknown;
  onSkuChange: (sku: string) => void;
  onLookup: (sku?: string) => void;
}

export function InventorySnapshotInspector({ error, onLookup, onSkuChange, sku, snapshot, state, submittedSku }: InventorySnapshotInspectorProps) {
  const submit = (event: FormEvent<HTMLFormElement>) => { event.preventDefault(); onLookup(); };
  const notFound = error instanceof ApiRequestError && error.code === 'SKU_NOT_FOUND';
  return (
    <section id="api-snapshot-inspector" className="scroll-mt-24" aria-labelledby="snapshot-inspector-title">
      <Card className="grid gap-5 p-5 sm:p-6" variant="muted">
        <div className="flex flex-col justify-between gap-3 lg:flex-row lg:items-end"><div className="min-w-0"><span className="font-body text-caption font-semibold uppercase tracking-[0.14em] text-graphite">Tra cứu nhanh</span><h2 id="snapshot-inspector-title" className="mt-1 whitespace-nowrap font-display text-xl font-bold text-on-surface">Tra cứu tồn kho theo SKU</h2><p className="mt-1 font-body text-body-sm text-graphite">Nhập mã SKU để xem ngay số lượng tồn kho hiện tại.</p></div></div>
        <form className="flex flex-col gap-3 sm:flex-row sm:items-end" onSubmit={submit}>
          <Input label="Mã SKU" value={sku} onChange={(event) => onSkuChange(event.target.value)} placeholder="SHOE-001-BLK-42" disabled={state === 'loading'} className="sm:min-w-80" />
          <Button type="submit" loading={state === 'loading'} loadingLabel="Đang đọc…" leadingIcon={<span className="material-symbols-outlined text-lg" aria-hidden="true">database</span>}>Tra cứu</Button>
        </form>
        {state === 'idle' ? <EmptyState title="Nhập SKU để tra cứu" detail="Nhập mã SKU, ví dụ SHOE-001-BLK-42." /> : null}
        {state === 'loading' ? <LoadingState label="Đang tra cứu tồn kho…" /> : null}
        {state === 'error' ? (notFound ? <EmptyState title="Không tìm thấy SKU" detail={`SKU ${submittedSku} không tồn tại. Kiểm tra lại mã rồi thử lại.`} /> : <ErrorState error={error} retry={() => onLookup(submittedSku)} />) : null}
        {state === 'success' && snapshot ? (
          <article className="grid gap-5 rounded-card bg-pure-white p-5 shadow-card ring-1 ring-black/5" data-testid={`inventory-${snapshot.sku}`}>
            <div className="flex flex-wrap items-start justify-between gap-3"><div><span className="font-body text-caption font-semibold text-badge-progress-text">Tồn kho hiện tại · phiên bản {snapshot.version}</span><h3 className="mt-1 break-all font-mono text-lg font-bold text-on-surface">{snapshot.sku}</h3><p className="mt-1 font-body text-body-sm text-graphite">{snapshot.color} · Cỡ {snapshot.size}</p></div><Button variant="secondary" size="sm" onClick={() => onLookup(snapshot.sku)}>Làm mới</Button></div>
            <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <div className="rounded-control bg-surface-container-low p-3"><dt className="font-body text-caption text-graphite">Tồn kho</dt><dd className="mt-2 font-display text-xl font-bold tabular-nums text-on-surface">{snapshot.on_hand}</dd></div>
              <div className="rounded-control bg-surface-container-low p-3"><dt className="font-body text-caption text-graphite">Đang giữ</dt><dd className="mt-2 font-display text-xl font-bold tabular-nums text-on-surface">{snapshot.reserved}</dd></div>
              <div className="rounded-control bg-surface-container-low p-3"><dt className="font-body text-caption text-graphite">Tồn đệm an toàn</dt><dd className="mt-2 font-display text-xl font-bold tabular-nums text-on-surface">{snapshot.safety_buffer}</dd></div>
              <div className="rounded-control bg-badge-progress-bg p-3"><dt className="font-body text-caption text-badge-progress-text">Có thể bán</dt><dd className="mt-2 font-display text-xl font-bold tabular-nums text-badge-progress-text">{snapshot.available_to_sell}</dd></div>
            </dl>
            <p className="border-t border-outline-variant/50 pt-4 font-body text-caption text-graphite">Số có thể bán = tồn kho − đang giữ − tồn đệm an toàn.</p>
          </article>
        ) : null}
      </Card>
    </section>
  );
}
