import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../../components/common/ScreenState';
import { Button } from '../../../components/ui/Button';
import { getAiSyncHealth, type AiChannelHealth, type AiSyncHealth } from '../../../api/ai';
import type { DemoMode } from '../../../mocks/mock-api';
import { useApiResource } from '../../shared/useApiResource';

const windows = [30, 60, 120] as const;

const statusPresentation: Record<AiChannelHealth['status'], { label: string; className: string }> = {
  alarm: { label: 'Báo động', className: 'bg-badge-blocked-bg text-badge-blocked-text' },
  watch: { label: 'Theo dõi', className: 'bg-badge-progress-bg text-badge-progress-text' },
  ok: { label: 'Bình thường', className: 'bg-badge-progress-bg text-badge-progress-text' },
  idle: { label: 'Không hoạt động', className: 'bg-surface-container text-graphite' },
};

const featureLabels: Record<string, string> = {
  fail_rate: 'tỉ lệ lỗi', skip_rate: 'tỉ lệ bỏ qua', retry_share: 'tỉ lệ thử lại', lat_mean_ms: 'độ trễ trung bình', lat_p95_ms: 'độ trễ p95',
  mismatch_rate: 'tỉ lệ lệch tồn', staleness_s: 'thời gian từ lần đẩy thành công cuối', queue_age_s: 'tuổi hàng đợi', fail_streak: 'chuỗi lỗi liên tiếp', pending_depth: 'số việc đang chờ',
};

const score = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);

function Reasons({ channel }: { channel: AiChannelHealth }) {
  const latest = channel.latest;
  if (!latest || !latest.over_threshold || latest.explanation.length === 0) return <span className="text-graphite">—</span>;
  return <span>{latest.explanation.map((item) => featureLabels[item.feature] ?? item.feature).join(', ')}</span>;
}

/**
 * The Sync Health Monitor's reading of each channel. A score here is a ranking score, not a probability, and
 * the monitor was trained on simulated logs; both are said on the screen rather than left to a footnote.
 */
export function SyncHealthPanel({ mode }: { mode: DemoMode }) {
  const [minutes, setMinutes] = useState<number>(30);
  const health = useApiResource<AiSyncHealth, undefined>(
    (signal) => getAiSyncHealth(minutes, signal),
    () => Promise.resolve(undefined),
    mode,
    [minutes],
  );
  const live = health.source === 'api' ? (health.value as AiSyncHealth | null) : null;

  return (
    <section aria-label="Giám sát đồng bộ" className="flex flex-col gap-5">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold text-on-surface">Giám sát đồng bộ</h2>
        <p className="font-body text-body-sm text-graphite">
          Mô hình chấm điểm nhật ký đẩy tồn của từng kênh theo cửa sổ 60 giây. Đây chỉ là cảnh báo cho người vận hành: hệ thống không tự thử lại, tạm dừng hay sửa tồn.
        </p>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Khoảng thời gian giám sát">
          {windows.map((option) => (
            <Button key={option} size="sm" variant={minutes === option ? 'primary' : 'secondary'} onClick={() => setMinutes(option)}>{option} phút</Button>
          ))}
        </div>
      </header>

      {health.loading ? <LoadingState label="Đang đọc nhật ký đồng bộ…" /> : null}
      {/* A monitor that was called and failed is an error to show, never an all-clear. */}
      {!health.loading && !live && (health.error || health.fixtureError) ? <ErrorState error={health.fixtureError ?? health.error} retry={health.refresh} /> : null}
      {!health.loading && !live && !health.error && !health.fixtureError ? (
        <EmptyState title="Chưa có dữ liệu giám sát" detail="Cần kết nối API để đọc nhật ký đồng bộ thật." />
      ) : null}

      {live && !live.ready ? (
        <p aria-label="Trạng thái giám sát" className="rounded-card bg-badge-blocked-bg px-5 py-4 font-body text-body-sm text-badge-blocked-text">
          <strong>Chưa có giám sát.</strong> Chưa kết nối dịch vụ chấm điểm đồng bộ, nên không có kết luận nào về sức khoẻ các kênh.
        </p>
      ) : null}

      {live && live.ready ? (
        <>
          <p aria-label="Trạng thái giám sát" className="rounded-card bg-badge-progress-bg px-5 py-4 font-body text-body-sm text-badge-progress-text">
            <strong>{live.model}{live.version ? ` · ${live.version}` : ''}</strong>
            <span> — {live.minutes} phút gần nhất, ngưỡng {live.threshold !== undefined ? score(live.threshold) : '—'}. Điểm là điểm xếp hạng, không phải xác suất.</span>
            {live.simulated_training_data ? <span> Mô hình được huấn luyện trên nhật ký mô phỏng, nên cần kiểm chứng với kênh thật.</span> : null}
          </p>
          {live.channels.length === 0 ? <EmptyState title="Chưa có kênh nào" detail="Hệ thống chưa có kênh bán hàng để giám sát." /> : (
            <div className="overflow-x-auto">
              <table className="w-full text-left font-body text-body-sm">
                <caption className="sr-only">Sức khoẻ đồng bộ theo kênh</caption>
                <thead>
                  <tr className="text-caption uppercase tracking-[0.1em] text-graphite">
                    <th className="py-2">Kênh</th><th className="py-2">Trạng thái</th><th className="py-2">Cửa sổ có hoạt động</th>
                    <th className="py-2">Điểm cao nhất</th><th className="py-2">Điểm mới nhất</th><th className="py-2">Nguyên nhân chính</th>
                  </tr>
                </thead>
                <tbody>
                  {live.channels.map((channel) => (
                    <tr key={channel.code} className="border-t border-line">
                      <td className="py-2"><span className="font-mono text-caption">{channel.code}</span> <span className="text-graphite">· {channel.environment}</span></td>
                      <td className="py-2"><span className={`rounded-full px-3 py-1 text-caption ${statusPresentation[channel.status].className}`}>{statusPresentation[channel.status].label}</span></td>
                      <td className="py-2 tabular-nums">{channel.active_windows}/{channel.active_windows + channel.idle_windows}</td>
                      <td className="py-2 tabular-nums">{channel.active_windows > 0 ? score(channel.peak_score) : '—'}</td>
                      <td className="py-2 tabular-nums">{channel.latest ? score(channel.latest.score) : '—'}</td>
                      <td className="py-2"><Reasons channel={channel} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="font-body text-caption text-graphite">Cửa sổ không có lần đẩy nào và không có việc chờ được tính là không hoạt động và không chấm điểm, vì mô hình học từ lưu lượng liên tục. Báo động cần 2 cửa sổ có hoạt động liên tiếp vượt ngưỡng.</p>
        </>
      ) : null}
    </section>
  );
}
