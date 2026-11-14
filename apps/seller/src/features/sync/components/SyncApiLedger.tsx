import { Card } from '../../../components/ui/Card';
import { StatusBadge } from '../../../components/common/StatusBadge';
import { MetricCard } from '../../../components/common/MetricCard';
import { Button } from '../../../components/ui/Button';
import type { Metric } from '../../../types/metric';
import type { SyncEvent, SyncJob, SyncMetrics } from '../../../api/sync';

const stateLabels: Record<string, string> = {
  pending: 'Chờ giao',
  delivered: 'Đã giao',
  failed: 'Đang thử lại',
  dead: 'Cần xử lý',
};

const stateTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  pending: 'neutral',
  delivered: 'success',
  failed: 'warning',
  dead: 'danger',
};

const operationLabels: Record<string, string> = {
  reserved: 'Giữ hàng',
  sold: 'Bán ra',
  released: 'Trả giữ',
  cancelled: 'Huỷ giữ',
  expired: 'Hết hạn',
  adjusted: 'Điều chỉnh',
  restored: 'Hoàn tồn',
  listed: 'Đăng bán',
  delisted: 'Gỡ bán',
};

const sourceLabels: Record<string, string> = {
  pos: 'Bán tại quầy',
  orders: 'Đơn hàng',
  adjust: 'Điều chỉnh tồn',
  reservation: 'Giữ hàng',
  channel: 'Kênh bán',
  sweeper: 'Tự động giải phóng',
  admin: 'Quản trị',
  receiving: 'Nhập hàng',
};

function timeLabel(value: string | undefined): string {
  if (!value) return '—';
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) return '—';
  return new Intl.DateTimeFormat('vi-VN', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(parsed));
}

function ms(value: number | null | undefined): string {
  if (value === null || value === undefined) return '—';
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${value} ms`;
}

/**
 * Measured sync latency, over deliveries that actually happened.
 *
 * `delivered` counts only channel jobs that acknowledged a push. Events still queued are EXCLUDED
 * rather than counted as instant, and that is the whole difference: a percentile computed
 * over pending rows would report zero — "the sync is instant" — precisely when the queue is
 * stuck. The detail line says which events the number covers so a reader can tell a fast
 * system from an idle one.
 */
export function SyncApiMetrics({ metrics }: { metrics: SyncMetrics }) {
  const byState = metrics.events_by_state ?? {};
  const pending = byState.pending ?? 0;
  const failed = byState.failed ?? 0;
  const dead = byState.dead ?? 0;
  const delivered = metrics.delivered ?? 0;

  const cards: Metric[] = [
    {
      id: 'delivered',
      label: 'Đã giao tới kênh',
      value: delivered.toLocaleString('vi-VN'),
      detail: 'Chỉ tính sự kiện kênh đã xác nhận',
      icon: 'task_alt',
      tone: 'success',
    },
    {
      id: 'p50',
      label: 'Độ trễ thường gặp',
      value: ms(metrics.sync_latency_p50_ms),
      detail: 'Từ lúc tồn kho đổi tới khi kênh xác nhận',
      icon: 'timer',
      tone: 'neutral',
    },
    {
      id: 'p95',
      label: 'Độ trễ chậm nhất',
      value: ms(metrics.sync_latency_p95_ms),
      detail: delivered === 0 ? 'Chưa có lượt kênh xác nhận để đo' : `Tính trên ${delivered} lượt kênh xác nhận`,
      icon: 'timer',
      tone: 'neutral',
    },
    {
      id: 'attention',
      label: 'Cần xử lý',
      value: (dead + failed).toLocaleString('vi-VN'),
      detail: `${dead} lỗi hẳn · ${failed} đang thử lại · ${pending} chờ`,
      icon: 'report',
      tone: dead > 0 ? 'danger' : failed > 0 ? 'warning' : 'success',
    },
  ];

  return (
    <section className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4" aria-label="Số liệu đồng bộ">
      {cards.map((card) => <MetricCard key={card.id} metric={card} />)}
    </section>
  );
}

/**
 * The committed stock-change log.
 *
 * Each row shows the transition, not just the state: `before → after` on the four canonical
 * numbers is what makes an event auditable, and an event that only said "sold" would leave a
 * reader unable to tell a sale of two from a sale of twenty.
 *
 * `delivered_channels` is on the row rather than behind a click. An event is ONE core change
 * and the channels it reached is a property of the delivery — without both, the screen
 * cannot answer "did the shop hear about this sale?".
 */
export function SyncApiEventLedger({
  events,
  totalRows,
  hasMore,
  loadingMore,
  onLoadMore,
  onInspect,
  selected,
  onToggle,
  canSelectRetry = false,
}: {
  events: SyncEvent[];
  totalRows: number;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  selected: ReadonlySet<string>;
  onToggle: (eventId: string) => void;
  canSelectRetry?: boolean;
  /** Reads one event by id, for a row the reader is looking at but the page does not hold. */
  onInspect: (eventId: string) => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <header className="flex flex-col justify-between gap-2 border-b border-outline-variant/50 px-5 py-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-lg font-bold text-on-surface">Nhật ký thay đổi tồn</h2>
          <p className="mt-1 font-body text-caption text-graphite">
            {events.length} / {totalRows} sự kiện
          </p>
        </div>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1040px] border-collapse text-left">
          <caption className="sr-only">Nhật ký thay đổi tồn kho</caption>
          <thead>
            <tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
              <th className="w-12 px-3"><span className="sr-only">Chọn để thử lại</span></th>
              <th className="px-5">Thời điểm</th>
              <th className="px-3">SKU</th>
              <th className="px-3">Thao tác</th>
              <th className="px-3">Tồn trước → sau</th>
              <th className="px-3">Đã gửi tới</th>
              <th className="px-5">Trạng thái</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {events.map((event) => (
              <tr key={event.id} className="font-body text-body-sm">
                <td className="px-3 py-3">
                  {canSelectRetry && (event.state === 'failed' || event.state === 'dead') ? (
                    <input
                      type="checkbox"
                      aria-label={`Chọn sự kiện ${event.sku} để thử lại`}
                      checked={selected.has(event.event_id)}
                      onChange={() => onToggle(event.event_id)}
                      className="size-4 accent-carbon"
                    />
                  ) : null}
                </td>
                <td className="px-5 py-3 text-caption text-graphite">{timeLabel(event.occurred_at)}</td>
                <td className="px-3 py-3">
                  <code className="font-mono text-on-surface">{event.sku}</code>
                  <span className="mt-1 block text-[10px] uppercase text-graphite">{sourceLabels[event.source] ?? event.source}</span>
                </td>
                <td className="px-3 py-3 text-on-surface-variant">{operationLabels[event.operation] ?? event.operation}</td>
                <td className="px-3 py-3">
                  <span className="tabular-nums text-graphite">{event.before.on_hand}</span>
                  <span className="mx-1" aria-hidden="true">→</span>
                  <span className="font-semibold tabular-nums text-on-surface">{event.after.on_hand}</span>
                  <span className="mt-1 block text-[10px] text-graphite">
                    Có thể bán {event.before.available_to_sell} → {event.after.available_to_sell} · phiên bản {event.version}
                  </span>
                </td>
                <td className="px-3 py-3">
                  {(event.delivered_channels ?? []).length === 0 ? (
                    <span className="text-caption text-graphite">
                      {event.state === 'delivered' ? 'Không có kênh nào xác nhận lần cập nhật này' : 'Chưa kênh nào đăng bán SKU này'}
                    </span>
                  ) : (
                    <span className="text-caption text-on-surface-variant">{(event.delivered_channels ?? []).join(', ')}</span>
                  )}
                </td>
                <td className="px-5 py-3">
                  <StatusBadge tone={event.state === 'delivered' && (event.delivered_channels ?? []).length === 0 ? 'neutral' : stateTone[event.state] ?? 'neutral'}>
                    {event.state === 'delivered' && (event.delivered_channels ?? []).length === 0 ? 'Đã xử lý, chưa có xác nhận' : stateLabels[event.state] ?? event.state}
                  </StatusBadge>
                  <span className="mt-1 block text-[10px] text-graphite">{event.attempts} lần thử giao</span>
                  {event.last_error ? <span className="mt-1 block max-w-56 text-[10px] text-graphite">{event.last_error}</span> : null}
                  {/* The detail read is by id, not by position. The list is a page of fifty, and
                      a ledger that can only explain the rows currently on screen answers
                      "which order was this?" only until the reader scrolls. */}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="mt-1"
                    aria-label={`Tra sự kiện ${event.sku} ${event.event_id}`}
                    onClick={() => onInspect(event.event_id)}
                  >
                    Tra chi tiết
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="flex flex-col justify-between gap-3 border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4 sm:flex-row sm:items-center">
        <p className="font-body text-caption text-graphite">
          Đang hiển thị {events.length} trên {totalRows} sự kiện đã tải. Bấm "Tải thêm" để xem các sự kiện cũ hơn.
        </p>
        <Button variant="secondary" size="sm" disabled={!hasMore} loading={loadingMore} onClick={onLoadMore}>Tải thêm</Button>
      </footer>
    </Card>
  );
}

const jobStatusLabels: Record<string, string> = {
  queued: 'Chờ',
  running: 'Đang chạy',
  succeeded: 'Thành công',
  failed: 'Thử lại',
  dead: 'Thất bại hẳn',
  superseded: 'Đã thay bằng bản mới hơn',
};

const jobStatusTone: Record<string, 'neutral' | 'success' | 'warning' | 'danger'> = {
  queued: 'neutral',
  running: 'warning',
  succeeded: 'success',
  failed: 'warning',
  dead: 'danger',
  superseded: 'neutral',
};

/**
 * One row per delivery attempt.
 *
 * This is the retry history the Sync Center needs, read from the job rows rather than kept in
 * a separate table — so it cannot drift from what actually happened. `latency_ms` is NULL for a
 * job that has not finished and renders as "—", because a real zero in a latency column is a
 * claim that a delivery was instantaneous.
 */
export function SyncApiJobLedger({ jobs, selected = new Set(), onToggle, onHistory, canRetry = false, hasMore = false, loadingMore = false, onLoadMore }: {
  jobs: SyncJob[];
  selected?: Set<string>;
  onToggle?: (jobId: string) => void;
  onHistory?: (eventId: string) => void;
  canRetry?: boolean;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <Card className="overflow-hidden p-0">
      <header className="border-b border-outline-variant/50 px-5 py-4">
        <h2 className="font-display text-lg font-bold text-on-surface">{onToggle ? 'Tác vụ đồng bộ cần xử lý' : 'Lịch sử gửi lên kênh'}</h2>
        <p className="mt-1 font-body text-caption text-graphite">
          {jobs.length} lần gửi · mỗi sự kiện có một dòng cho mỗi kênh
        </p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[860px] border-collapse text-left">
          <caption className="sr-only">Lịch sử gửi sự kiện tới kênh bán</caption>
          <thead>
            <tr className="h-11 bg-surface-container-low font-body text-caption font-semibold uppercase tracking-wider text-graphite">
              <th className="px-5">Kênh</th>
              {onToggle ? <th className="px-2">Chọn</th> : null}
              <th className="px-3">Mã sự kiện</th>
              <th className="px-3">SKU / thao tác</th>
              <th className="px-3 text-right">Lần thử</th>
              <th className="px-3">Lần thử gần nhất</th>
              <th className="px-3 text-right">Độ trễ</th>
              <th className="px-3">Kết quả</th>
              <th className="px-5">Lỗi</th>
              {onHistory ? <th className="px-3">Lịch sử</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y divide-surface-container">
            {jobs.map((job) => (
              <tr key={job.id} className="font-body text-body-sm">
                <td className="px-5 py-3"><code className="font-mono text-on-surface">{job.channel_code}</code></td>
                {onToggle ? <td className="px-2 py-3"><input type="checkbox" aria-label={`Chọn ${job.channel_code} ${job.event_id ?? job.id}`} checked={selected.has(job.event_id ?? '')} disabled={!canRetry || !job.event_id || !['failed', 'dead'].includes(job.status)} onChange={() => job.event_id && onToggle(job.event_id)} /></td> : null}
                <td className="px-3 py-3">
                  <code className="font-mono text-[10px] text-graphite">{job.event_id ?? '—'}</code>
                </td>
                <td className="px-3 py-3">{job.sku ? <><code>{job.sku}</code><span className="mt-1 block text-caption text-graphite">{job.operation ?? '—'}</span></> : '—'}</td>
                <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{job.attempts}</td>
                <td className="px-3 py-3 text-caption text-graphite">{timeLabel(job.last_attempt_at ?? job.finished_at ?? job.started_at)}</td>
                <td className="px-3 py-3 text-right tabular-nums text-on-surface-variant">{ms(job.latency_ms)}</td>
                <td className="px-3 py-3">
                  <StatusBadge tone={jobStatusTone[job.status] ?? 'neutral'}>{jobStatusLabels[job.status] ?? job.status}</StatusBadge>
                </td>
                <td className="max-w-72 px-5 py-3 text-[10px] text-graphite">{job.last_error ?? '—'}{job.retry_requested_by ? <span className="mt-1 block">Thử thủ công bởi {job.retry_requested_by}</span> : null}{job.next_attempt_at && ['failed','queued'].includes(job.status) ? <span className="mt-1 block">Thử tiếp: {timeLabel(job.next_attempt_at)}</span> : null}</td>
                {onHistory ? <td className="px-3 py-3">{job.event_id ? <Button size="sm" variant="ghost" onClick={() => onHistory(job.event_id!)}>Xem</Button> : '—'}</td> : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {onLoadMore ? <footer className="flex justify-between border-t border-outline-variant/50 bg-surface-container-low/50 px-5 py-4"><span className="text-caption text-graphite">Đang hiển thị {jobs.length} tác vụ lỗi. Thử lại được nhóm theo sự kiện.</span><Button size="sm" variant="secondary" disabled={!hasMore} loading={loadingMore} onClick={onLoadMore}>Tải thêm</Button></footer> : null}
    </Card>
  );
}
