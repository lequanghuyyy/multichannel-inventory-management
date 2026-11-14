import { Button } from '../../../../components/ui/Button';
import { Card } from '../../../../components/ui/Card';
import { ErrorState, LoadingState } from '../../../../components/common/ScreenState';
import { navigate } from '../../../../app/routes';
import type { InventoryMovement, InventoryMovementQuery } from '../../../../api/inventory';

function formatTimestamp(value: string): string {
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value));
}

function delta(value?: number): string {
  if (value === undefined) return 'Chưa ghi nhận';
  return `${value > 0 ? '+' : ''}${value}`;
}

function quantity(value?: number): string {
  return value === undefined ? 'Chưa ghi' : value.toLocaleString('vi-VN');
}

function operationLabel(entry: InventoryMovement): string {
  if (entry.source_type === 'return') return 'Trả hàng về kho';
  if (entry.operation === 'restored' && entry.source_type === 'order') return 'Hoàn tồn do hủy đơn';
  const labels: Record<string, string> = {
    reserved: 'Giữ hàng cho đơn',
    sold: 'Bán hàng',
    released: 'Giải phóng hàng giữ',
    cancelled: 'Hủy giữ hàng',
    expired: 'Hết hạn giữ hàng',
    adjusted: 'Điều chỉnh sau kiểm kê',
    restored: 'Hoàn tồn',
    received: 'Nhận hàng được chấp nhận',
  };
  return labels[entry.operation] ?? entry.operation;
}

function sourceLabel(source: string): string {
  const labels: Record<string, string> = {
    pos: 'Bán tại quầy', orders: 'Đơn hàng', adjust: 'Kiểm kê', reservation: 'Giữ hàng',
    channel: 'Kênh bán', sweeper: 'Tác vụ hết hạn', admin: 'Quản trị', receiving: 'Nhập hàng',
  };
  return labels[source] ?? source;
}

export interface InventoryMovementTimelineProps {
  entries: InventoryMovement[];
  error: unknown;
  loading: boolean;
  loadingMore: boolean;
  nextCursor?: string;
  filters: Pick<InventoryMovementQuery, 'operation_group' | 'from' | 'to'>;
  onFilterChange: (filters: Pick<InventoryMovementQuery, 'operation_group' | 'from' | 'to'>) => void;
  onLoadMore: () => void;
  onRetry: () => void;
  sku: string;
}

function toLocalInput(value?: string): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromLocalInput(value: string): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function SourceLink({ entry }: { entry: InventoryMovement }) {
  if (!entry.source_href || !entry.source_reference) return <span>{entry.source_reference ?? 'Chưa lưu chứng từ liên kết'}</span>;
  return <button type="button" className="font-semibold text-primary underline underline-offset-2" onClick={() => navigate(entry.source_href!)}>{entry.source_reference}</button>;
}

function MovementDetails({ entry }: { entry: InventoryMovement }) {
  return (
    <div className="grid gap-1">
      <span className="font-semibold text-on-surface">{operationLabel(entry)}</span>
      <span className="text-caption text-graphite">
        {sourceLabel(entry.source)}
        {entry.source_type ? ` · ${entry.source_type === 'receipt' ? 'Phiếu nhập' : entry.source_type === 'return' ? 'Trả hàng' : 'Đơn hàng'}` : ''}
        {' · '}<SourceLink entry={entry} />
      </span>
      {entry.reason ? <span className="text-caption text-on-surface-variant">{entry.reason}</span> : null}
      <span className="text-caption text-graphite">{entry.actor_email ? `Thực hiện bởi ${entry.actor_email}` : 'Chưa lưu người thực hiện'}</span>
    </div>
  );
}

function snapshotPair(entry: InventoryMovement, field: 'on_hand' | 'reserved'): string {
  const before = entry.before?.[field];
  const after = entry.after?.[field];
  return `${quantity(before)} → ${quantity(after)}`;
}

function deltaTone(value?: number): string {
  if (value === undefined || value === 0) return 'text-graphite';
  return value < 0 ? 'text-error' : 'text-badge-progress-text';
}

export function InventoryMovementTimeline({ entries, error, filters, loading, loadingMore, nextCursor, onFilterChange, onLoadMore, onRetry, sku }: InventoryMovementTimelineProps) {
  return (
    <Card className="overflow-hidden p-0">
      <header className="grid gap-4 border-b border-outline-variant/50 p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-on-surface">Lịch sử biến động tồn kho</h2>
            <p className="mt-1 max-w-3xl font-body text-body-sm text-graphite">Tồn vật lý và hàng đang giữ được theo dõi riêng. Reservation không được tính là xuất kho.</p>
          </div>
          <Button variant="secondary" size="sm" onClick={onRetry} loading={loading} className="shrink-0">Làm mới</Button>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="grid gap-1 font-body text-caption font-semibold text-on-surface-variant">Nghiệp vụ<select className="min-h-10 rounded-control border border-outline-variant bg-pure-white px-3 text-body-sm text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" value={filters.operation_group ?? ''} onChange={(event) => onFilterChange({ ...filters, operation_group: (event.target.value || undefined) as InventoryMovementQuery['operation_group'] })}><option value="">Tất cả nghiệp vụ</option><option value="receipt">Nhập hàng</option><option value="sale">Bán hàng</option><option value="cancel_restore">Hủy / hoàn tồn</option><option value="return">Trả hàng</option><option value="adjustment">Điều chỉnh kiểm kê</option><option value="reservation">Biến động hàng giữ</option></select></label>
          <label className="grid gap-1 font-body text-caption font-semibold text-on-surface-variant">Từ ngày và giờ<input type="datetime-local" className="min-h-10 min-w-0 rounded-control border border-outline-variant bg-pure-white px-3 text-body-sm text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" value={toLocalInput(filters.from)} onChange={(event) => onFilterChange({ ...filters, from: fromLocalInput(event.target.value) })} /></label>
          <label className="grid gap-1 font-body text-caption font-semibold text-on-surface-variant">Đến ngày và giờ<input type="datetime-local" className="min-h-10 min-w-0 rounded-control border border-outline-variant bg-pure-white px-3 text-body-sm text-on-surface focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary" value={toLocalInput(filters.to)} onChange={(event) => onFilterChange({ ...filters, to: fromLocalInput(event.target.value) })} /></label>
        </div>
      </header>
      {loading && entries.length === 0 ? <div className="p-5"><LoadingState label="Đang tải lịch sử biến động…" /></div> : null}
      {!loading && error && entries.length === 0 ? <div className="p-5"><ErrorState error={error} retry={onRetry} /></div> : null}
      {!loading && !error && entries.length === 0 ? <p className="p-6 font-body text-body-sm text-graphite">Không có biến động phù hợp với SKU và bộ lọc này.</p> : null}
      {entries.length > 0 ? <>
        {error ? <p role="status" className="border-b border-amber-200 bg-amber-50 px-5 py-3 font-body text-caption text-amber-900">Không tải được dữ liệu mới hơn. Các bản ghi đã tải vẫn được giữ lại.</p> : null}
        <div className="hidden overflow-x-auto md:block">
          <table className="w-full min-w-[1050px] border-collapse text-left">
            <caption className="sr-only">Lịch sử biến động tồn kho của {sku}</caption>
            <thead><tr className="h-10 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite"><th className="px-5">Thời gian</th><th className="px-4">Nghiệp vụ</th><th className="px-4 text-right">Tồn vật lý</th><th className="px-4 text-right">Hàng giữ</th><th className="px-4">Chứng từ / lý do</th></tr></thead>
            <tbody className="divide-y divide-surface-container">{entries.map((entry) => <tr className="font-body text-body-sm hover:bg-surface-container-low/50" key={entry.id}>
              <td className="whitespace-nowrap px-5 py-4 text-caption text-graphite">{formatTimestamp(entry.occurred_at)}</td>
              <td className="px-4 py-4"><strong className="block font-semibold text-on-surface">{operationLabel(entry)}</strong><span className="text-caption text-graphite">{sourceLabel(entry.source)}</span>{entry.snapshot_state !== 'complete' ? <span className="mt-1 block text-caption text-amber-800">{entry.snapshot_state === 'partial' ? 'Thiếu một phần số liệu lịch sử' : 'Không lưu số liệu trước/sau'}</span> : null}</td>
              <td className="px-4 py-4 text-right"><strong className={`block font-mono ${deltaTone(entry.on_hand_delta)}`}>{delta(entry.on_hand_delta)}</strong><span className="font-mono text-caption text-graphite">{snapshotPair(entry, 'on_hand')}</span></td>
              <td className="px-4 py-4 text-right"><strong className="block font-mono text-on-surface-variant">{delta(entry.reserved_delta)}</strong><span className="font-mono text-caption text-graphite">{snapshotPair(entry, 'reserved')}</span></td>
              <td className="max-w-sm px-4 py-4"><MovementDetails entry={entry} /></td>
            </tr>)}</tbody>
          </table>
        </div>
        <div className="grid gap-3 p-4 md:hidden">{entries.map((entry) => <article className="grid gap-3 rounded-card bg-surface-container-low p-4" key={entry.id}>
          <div className="flex items-start justify-between gap-3"><div><strong className="font-body text-body-sm text-on-surface">{operationLabel(entry)}</strong><p className="mt-0.5 font-body text-caption text-graphite">{formatTimestamp(entry.occurred_at)}</p></div><span className="font-body text-caption text-graphite">{entry.kind === 'physical' ? 'Tồn vật lý' : 'Hàng giữ'}</span></div>
          <dl className="grid grid-cols-2 gap-3 font-body text-caption"><div><dt className="text-graphite">Tồn vật lý</dt><dd className="mt-1 font-mono font-semibold text-on-surface">{snapshotPair(entry, 'on_hand')} ({delta(entry.on_hand_delta)})</dd></div><div><dt className="text-graphite">Đang giữ</dt><dd className="mt-1 font-mono font-semibold text-on-surface">{snapshotPair(entry, 'reserved')} ({delta(entry.reserved_delta)})</dd></div></dl>
          {entry.snapshot_state !== 'complete' ? <p className="text-caption text-graphite">{entry.snapshot_state === 'partial' ? 'Chứng từ lịch sử chỉ lưu một phần số liệu trước/sau.' : 'Chứng từ lịch sử không lưu số liệu trước/sau.'}</p> : null}
          <MovementDetails entry={entry} />
        </article>)}</div>
        <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4 font-body text-caption text-graphite">
          <span>Đã tải {entries.length} biến động. {entries.some((entry) => entry.snapshot_state !== 'complete') ? 'Một số chứng từ cũ không lưu đầy đủ số trước/sau.' : 'Số trước/sau lấy từ event đã ghi.'}</span>
          {nextCursor ? <Button variant="secondary" size="sm" onClick={onLoadMore} loading={loadingMore}>Tải thêm</Button> : null}
        </footer>
      </> : null}
    </Card>
  );
}
