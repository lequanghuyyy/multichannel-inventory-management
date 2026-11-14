import { useEffect, useMemo, useState } from 'react';
import { listChannels, type Channel } from '../../api/channels';
import { getOrderLoadCatalog, getOrderLoadRun, listOrderLoadEvents, listOrderLoadRuns, orderLoadDownloadURL, startOrderLoadRun, stopOrderLoadRun, type LoadConfig, type LoadEvent, type LoadRun } from '../../api/orderLoad';
import { ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';

interface SimulatorDraft {
  mode: 'normal' | 'burst';
  seed: number;
  rate: number;
  burstRate: number;
  burstAfterMS: number;
  burstDurationMS: number;
  durationMS: number;
  maxEvents: number;
  concurrency: number;
}

const DEFAULT_CONFIG: SimulatorDraft = {
  mode: 'normal',
  seed: 12345,
  rate: 10,
  burstRate: 100,
  burstAfterMS: 20000,
  burstDurationMS: 10000,
  durationMS: 60000,
  maxEvents: 1000,
  concurrency: 8,
};

function formatDuration(milliseconds: number): string {
  const seconds = Math.round(milliseconds / 1000);
  if (seconds < 60) return `${seconds}s`;
  return `${Math.floor(seconds / 60)}m ${seconds % 60}s`;
}

function statusLabel(status: LoadRun['status']): string {
  return ({ pending: 'Đang xếp lịch', running: 'Đang bơm', stopping: 'Đang dừng', completed: 'Hoàn tất', failed: 'Lỗi', cancelled: 'Đã dừng' })[status];
}

function targetRateAt(config: LoadConfig, offsetMS: number): number {
  if (config.mode === 'burst' && offsetMS >= (config.burst_after_ms ?? 0) && offsetMS < (config.burst_after_ms ?? 0) + (config.burst_duration_ms ?? 0)) return config.burst_rate ?? config.rate;
  return config.rate;
}

function actualPoints(run: LoadRun, events: LoadEvent[]): string {
  const width = 720;
  const height = 220;
  const duration = Math.max(run.config.duration_ms, 1000);
  const maxRate = Math.max(run.config.rate, run.config.burst_rate ?? 0, 1) * 1.15;
  const bins = Array.from({ length: 24 }, () => 0);
  const start = run.started_at ? Date.parse(run.started_at) : Date.parse(run.created_at);
  for (const event of events) {
    if (!event.sent_at) continue;
    const position = Math.max(0, Math.min(0.999, (Date.parse(event.sent_at) - start) / duration));
    const index = Math.min(bins.length - 1, Math.floor(position * bins.length));
    bins[index] = (bins[index] ?? 0) + 1;
  }
  return bins.map((count, index) => `${(index / (bins.length - 1)) * width},${height - Math.min(1, count / Math.max(1, maxRate * duration / 1000 / bins.length)) * 170 - 20}`).join(' ');
}

function targetPoints(config: LoadConfig): string {
  const width = 720;
  const height = 220;
  const maxRate = Math.max(config.rate, config.burst_rate ?? 0, 1) * 1.15;
  return Array.from({ length: 25 }, (_, index) => {
    const offset = config.duration_ms * index / 24;
    const x = width * index / 24;
    const y = height - (targetRateAt(config, offset) / maxRate) * 170 - 20;
    return `${x},${y}`;
  }).join(' ');
}

export function LivestreamSimulatorPage() {
  const [channels, setChannels] = useState<Channel[]>([]);
  const [channelID, setChannelID] = useState('');
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof getOrderLoadCatalog>> | null>(null);
  const [config, setConfig] = useState(DEFAULT_CONFIG);
  const [run, setRun] = useState<LoadRun | null>(null);
  const [events, setEvents] = useState<LoadEvent[]>([]);
  const [history, setHistory] = useState<LoadRun[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([listChannels({ limit: 100 }, controller.signal), listOrderLoadRuns(controller.signal)])
      .then(([channelPage, runs]) => {
        const safeChannels = channelPage.items.filter((channel) => channel.environment === 'simulated' && ['connected', 'syncing'].includes(channel.status));
        setChannels(safeChannels);
        setHistory(runs);
        if (safeChannels[0]) setChannelID(safeChannels[0].id);
        setError(null);
      })
      .catch((cause: unknown) => setError(cause))
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!channelID) return;
    const controller = new AbortController();
    setCatalog(null);
    void getOrderLoadCatalog(channelID, undefined, controller.signal).then(setCatalog).catch((cause: unknown) => setActionError(cause instanceof Error ? cause.message : 'Không đọc được danh mục sản phẩm giả lập.'));
    return () => controller.abort();
  }, [channelID]);

  useEffect(() => {
    if (!run || !['pending', 'running', 'stopping'].includes(run.status)) return;
    let alive = true;
    const refresh = async () => {
      try {
        const [nextRun, nextEvents] = await Promise.all([getOrderLoadRun(run.id), listOrderLoadEvents(run.id)]);
        if (alive) { setRun(nextRun); setEvents(nextEvents); setHistory((current) => current.map((item) => item.id === nextRun.id ? nextRun : item)); }
      } catch (cause: unknown) {
        if (alive) setActionError(cause instanceof Error ? cause.message : 'Không cập nhật được phiên giả lập.');
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1000);
    return () => { alive = false; window.clearInterval(timer); };
  }, [run?.id, run?.status]);

  const plannedRate = run ? targetRateAt(run.config, Math.min(run.config.duration_ms, Math.max(0, Date.now() - Date.parse(run.started_at ?? run.created_at)))) : config.rate;
  const liveRate = run && run.started_at ? run.sent_events / Math.max(1, (Date.now() - Date.parse(run.started_at)) / 1000) : 0;
  const selectedChannel = channels.find((channel) => channel.id === channelID);
  const canStart = Boolean(catalog?.shop_id && catalog.items.length && !run || run && ['completed', 'failed', 'cancelled'].includes(run.status));
  const completion = run && run.planned_events ? Math.round((run.sent_events / run.planned_events) * 100) : 0;
  const eventRows = useMemo(() => [...events].sort((a, b) => b.sequence - a.sequence).slice(0, 24), [events]);

  const previewCount = useMemo(() => {
    const step = (rate: number) => Math.max(1, 1000 / Math.max(1, rate));
    let count = 0;
    for (let offset = 0; offset < config.durationMS && count < config.maxEvents;) {
      const burst = config.mode === 'burst' && offset >= config.burstAfterMS && offset < config.burstAfterMS + config.burstDurationMS;
      offset += step(burst ? config.burstRate : config.rate);
      count += 1;
    }
    return count;
  }, [config]);

  if (loading) return <section className="page"><LoadingState label="Đang kiểm tra kênh giả lập…" /></section>;
  if (error) return <section className="page"><ErrorState error={error} retry={() => window.location.reload()} /></section>;

  const start = async () => {
    if (!catalog?.shop_id || !catalog.items.length) return;
    setActionError(null);
    try {
      const request: LoadConfig = {
        mode: config.mode, seed: config.seed, rate: config.rate, burst_rate: config.mode === 'burst' ? config.burstRate : undefined,
        burst_after_ms: config.mode === 'burst' ? config.burstAfterMS : undefined, burst_duration_ms: config.mode === 'burst' ? config.burstDurationMS : undefined,
        duration_ms: config.durationMS, max_events: config.maxEvents, concurrency: config.concurrency, start_at: new Date().toISOString(),
        shop_id: catalog.shop_id, channel_id: catalog.channel_id, catalog: catalog.items.map((item) => ({ external_listing_id: item.external_listing_id, external_variant_id: item.external_variant_id })),
      };
      const nextRun = await startOrderLoadRun(request);
      setRun(nextRun); setEvents([]); setHistory((current) => [nextRun, ...current.filter((item) => item.id !== nextRun.id)]);
    } catch (cause: unknown) { setActionError(cause instanceof Error ? cause.message : 'Không thể bắt đầu giả lập.'); }
  };

  const stop = async () => {
    if (!run) return;
    setActionError(null);
    try { setRun(await stopOrderLoadRun(run.id)); } catch (cause: unknown) { setActionError(cause instanceof Error ? cause.message : 'Không thể dừng giả lập.'); }
  };

  return (
    <section className="page order-load-page" aria-labelledby="order-load-title">
      <div className="order-load-hero">
        <div><p className="eyebrow">KIỂM THỬ TẢI NỘI BỘ</p><h1 id="order-load-title">Giả lập <em>đơn hàng</em> livestream</h1><p className="page-description">Tạo một loạt đơn hàng giả lập như khi livestream bán hàng, đi qua đúng quy trình nhận đơn và trừ tồn kho. Không kết nối sàn thật.</p></div>
        <div className="order-load-pulse" aria-label="Môi trường chỉ để giả lập"><span className="order-load-pulse-dot" />CHỈ GIẢ LẬP<span className="order-load-pulse-line" /></div>
      </div>

      <div className="order-load-safety"><span className="material-symbols-outlined" aria-hidden="true">shield_lock</span><div><strong>Vùng an toàn đã khoá</strong><p>Chỉ dùng được với kênh giả lập, chỉ dành cho quản trị viên và không chạy trên hệ thống chính thức. Mỗi đơn giả lập đều được lưu lại để kiểm tra và chạy lại.</p></div><span className="order-load-safe-tag">KHÔNG KẾT NỐI SÀN</span></div>

      <div className="order-load-layout">
        <div className="order-load-main">
          <section className="order-load-card order-load-config" aria-labelledby="config-title">
            <div className="order-load-card-head"><div><p className="eyebrow">BẢNG ĐIỀU KHIỂN</p><h2 id="config-title">Cấu hình tải</h2></div><span className="order-load-chip">{previewCount.toLocaleString('vi-VN')} đơn dự kiến</span></div>
            <div className="order-load-mode" role="group" aria-label="Chế độ tải">
              <button type="button" className={config.mode === 'normal' ? 'active' : ''} onClick={() => setConfig((current) => ({ ...current, mode: 'normal' }))}><span>●</span><strong>Bình thường</strong><small>Nhịp đều trong livestream</small></button>
              <button type="button" className={config.mode === 'burst' ? 'active' : ''} onClick={() => setConfig((current) => ({ ...current, mode: 'burst' }))}><span>↯</span><strong>Đột biến</strong><small>Flash sale trong một khoảng ngắn</small></button>
            </div>
            <div className="order-load-fields">
              <label>Kênh giả lập<select value={channelID} onChange={(event) => setChannelID(event.target.value)}><option value="">Chọn kênh</option>{channels.map((channel) => <option value={channel.id} key={channel.id}>{channel.code} · {channel.name}</option>)}</select></label>
              <label>Mã ngẫu nhiên cố định<input type="number" value={config.seed} onChange={(event) => setConfig((current) => ({ ...current, seed: Number(event.target.value) }))} /></label>
              <label>Tốc độ nền (đơn/giây)<input type="number" min="1" max="1000" value={config.rate} onChange={(event) => setConfig((current) => ({ ...current, rate: Number(event.target.value) }))} /></label>
              <label>Thời lượng<select value={config.durationMS} onChange={(event) => setConfig((current) => ({ ...current, durationMS: Number(event.target.value) }))}><option value="30000">30 giây</option><option value="60000">60 giây</option><option value="300000">5 phút</option></select></label>
              <label>Giới hạn số đơn<input type="number" min="1" max="100000" value={config.maxEvents} onChange={(event) => setConfig((current) => ({ ...current, maxEvents: Number(event.target.value) }))} /></label>
              <label>Số luồng song song<input type="number" min="1" max="100" value={config.concurrency} onChange={(event) => setConfig((current) => ({ ...current, concurrency: Number(event.target.value) }))} /></label>
              {config.mode === 'burst' ? <><label>Tốc độ đột biến (đơn/giây)<input type="number" min="1" max="5000" value={config.burstRate} onChange={(event) => setConfig((current) => ({ ...current, burstRate: Number(event.target.value) }))} /></label><label>Đột biến bắt đầu (giây)<input type="number" min="0" value={config.burstAfterMS / 1000} onChange={(event) => setConfig((current) => ({ ...current, burstAfterMS: Number(event.target.value) * 1000 }))} /></label><label>Thời lượng đột biến (giây)<input type="number" min="1" value={config.burstDurationMS / 1000} onChange={(event) => setConfig((current) => ({ ...current, burstDurationMS: Number(event.target.value) * 1000 }))} /></label></> : null}
            </div>
            <div className="order-load-catalog"><div><span className="eyebrow">SẢN PHẨM ĐƯỢC PHÉP</span><strong>{catalog?.items.length ?? 0} sản phẩm được phép</strong></div><div className="order-load-catalog-list">{catalog?.items.slice(0, 5).map((item) => <span key={item.external_listing_id}>{item.external_listing_id}<small>{item.available_to_sell} có thể bán</small></span>)}{(catalog?.items.length ?? 0) > 5 ? <span>+{(catalog?.items.length ?? 0) - 5} sản phẩm</span> : null}</div></div>
            <div className="order-load-actions"><Button variant="primary" onClick={() => void start()} disabled={!canStart || Boolean(run && ['pending', 'running', 'stopping'].includes(run.status))}>{run && ['pending', 'running', 'stopping'].includes(run.status) ? 'Đang chạy…' : 'Bắt đầu giả lập'}</Button><Button variant="ghost" onClick={() => void stop()} disabled={!run || !['pending', 'running'].includes(run.status)}>Dừng</Button><span className="order-load-source">{selectedChannel ? `${selectedChannel.code} · kênh giả lập` : 'Chưa chọn kênh giả lập'}</span></div>
            {actionError ? <p className="order-load-error" role="alert">{actionError}</p> : null}
          </section>

          <section className="order-load-card" aria-labelledby="traffic-title"><div className="order-load-card-head"><div><p className="eyebrow">THEO DÕI TRỰC TIẾP</p><h2 id="traffic-title">Lưu lượng đơn hàng</h2></div><div className="order-load-legend"><span className="target" />Mục tiêu <span className="actual" />Thực tế</div></div>{run ? <><div className="order-load-chart"><svg viewBox="0 0 720 220" role="img" aria-label="Tốc độ mục tiêu và thực tế theo thời gian"><rect className="order-load-burst-band" x={(720 * (run.config.burst_after_ms ?? 0)) / run.config.duration_ms} width={(720 * (run.config.burst_duration_ms ?? 0)) / run.config.duration_ms} y="0" height="220" /><polyline className="order-load-target-line" points={targetPoints(run.config)} /><polyline className="order-load-actual-line" points={actualPoints(run, events)} /></svg></div><div className="order-load-chart-axis"><span>0s</span><span>{formatDuration(run.config.duration_ms / 2)}</span><span>{formatDuration(run.config.duration_ms)}</span></div></> : <div className="order-load-empty-chart"><span className="material-symbols-outlined">monitoring</span><p>Biểu đồ sẽ hiện khi bạn bắt đầu giả lập.</p></div>}</section>

          {run ? <section className="order-load-card" aria-labelledby="events-title"><div className="order-load-card-head"><div><p className="eyebrow">THEO DÕI ĐƠN / {events.length}</p><h2 id="events-title">Dòng sự kiện</h2></div><span className={`order-load-status status-${run.status}`}>{statusLabel(run.status)}</span></div><div className="order-load-table-wrap"><table className="order-load-table"><thead><tr><th>STT</th><th>Mã sự kiện / đơn</th><th>Sản phẩm</th><th>Phản hồi</th><th>Xử lý</th><th>Độ trễ</th></tr></thead><tbody>{eventRows.map((event) => <tr key={event.sequence}><td className="mono">{String(event.sequence + 1).padStart(4, '0')}</td><td><strong>{event.event_id}</strong><small>{event.external_order_id}</small></td><td className="mono">{event.payload.lines?.[0]?.external_listing_id ?? '—'} × {event.payload.lines?.[0]?.quantity ?? 0}</td><td><span className={`order-load-http http-${event.http_status}`}>{event.http_status ?? '…'}</span></td><td><span className={`order-load-event-status event-${event.processing_status}`}>{event.processing_status}</span></td><td className="mono">{event.latency_ms != null ? `${event.latency_ms}ms` : '…'}</td></tr>)}</tbody></table>{eventRows.length === 0 ? <div className="order-load-table-empty">Đang chờ đơn đầu tiên…</div> : null}</div></section> : null}
        </div>

        <aside className="order-load-side">
          <section className="order-load-card order-load-kpis" aria-label="Chỉ số trực tiếp"><div className="order-load-card-head"><div><p className="eyebrow">TIẾN TRÌNH</p><h2>{run ? statusLabel(run.status) : 'Sẵn sàng chạy'}</h2></div>{run ? <span className="order-load-run-id mono">{run.id.slice(0, 8)}</span> : null}</div><div className="order-load-kpi-grid"><div><span>Dự kiến</span><strong>{run?.planned_events.toLocaleString('vi-VN') ?? previewCount.toLocaleString('vi-VN')}</strong></div><div><span>Đã gửi</span><strong>{run?.sent_events.toLocaleString('vi-VN') ?? '0'}</strong></div><div><span>Đã xử lý</span><strong className="text-green">{run?.processed_events.toLocaleString('vi-VN') ?? '0'}</strong></div><div><span>Bị giữ lại</span><strong className="text-amber">{run?.quarantined_events.toLocaleString('vi-VN') ?? '0'}</strong></div><div><span>Lỗi</span><strong className="text-red">{run?.failed_events.toLocaleString('vi-VN') ?? '0'}</strong></div><div><span>Tốc độ thực tế</span><strong>{liveRate.toFixed(1)}<small>/s</small></strong></div></div>{run ? <><div className="order-load-progress"><div><span>Tiến độ</span><strong>{completion}%</strong></div><progress className="order-load-progress-track" max="100" value={completion} aria-label={`Tiến độ ${completion}%`} /></div><div className="order-load-hash"><span>PHIÊN BẢN</span><code>{run.generator_version}</code><span>MÃ KIỂM TRA</span><code title={run.input_hash}>{run.input_hash.slice(0, 20)}…</code></div></> : null}<div className="order-load-rate-note"><span className="material-symbols-outlined">speed</span><p>Mục tiêu hiện tại <strong>{plannedRate.toFixed(1)} đơn/giây</strong>. Tốc độ thực tế tính từ phản hồi thật, không suy ra từ cấu hình.</p></div></section>
          <section className="order-load-card order-load-history" aria-labelledby="history-title"><div className="order-load-card-head"><div><p className="eyebrow">LỊCH SỬ</p><h2 id="history-title">Các lần chạy</h2></div><button type="button" className="order-load-refresh" onClick={() => void listOrderLoadRuns().then(setHistory)}>↻</button></div><div className="order-load-history-list">{history.map((item) => <button type="button" key={item.id} className={item.id === run?.id ? 'selected' : ''} onClick={() => { setRun(item); void listOrderLoadEvents(item.id).then(setEvents); }}><span className={`history-dot status-${item.status}`} /><span><strong>{item.config.mode === 'burst' ? 'Đột biến' : 'Bình thường'} / mã {item.config.seed}</strong><small>{new Date(item.created_at).toLocaleString('vi-VN')} · đã gửi {item.sent_events}/{item.planned_events}</small></span><span className="mono">{item.id.slice(0, 6)}</span></button>)}{history.length === 0 ? <p className="order-load-muted">Chưa có lần chạy nào.</p> : null}</div>{run ? <div className="order-load-downloads"><a href={orderLoadDownloadURL(run.id, 'input')}>↓ Tải dữ liệu đầu vào</a><a href={orderLoadDownloadURL(run.id, 'results')}>↓ Tải kết quả</a></div> : null}</section>
        </aside>
      </div>
    </section>
  );
}
