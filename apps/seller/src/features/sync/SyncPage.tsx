import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { getSyncEvent, getSyncMetrics, getSyncRetryHistory, listSyncEvents, listSyncJobs, retrySyncEvent, type SyncEvent, type SyncJob, type SyncMetrics, type SyncRetryHistoryEntry } from '../../api/sync';
import { ApiRequestError } from '../../core/api-error';
import { getSyncFixture, type DemoMode } from '../../mocks/mock-api';
import { useRealtime, useRealtimeRefresh } from '../realtime/RealtimeProvider';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../../components/ui/Modal';
import type { SyncFixture } from './sync.types';
import { useApiPage } from '../shared/useApiPage';
import { SyncApiEventLedger, SyncApiJobLedger, SyncApiMetrics } from './components/SyncApiLedger';
import { SyncEventLedger } from './components/SyncEventLedger';
import { SyncFiltersPanel } from './components/SyncFiltersPanel';
import { SyncHeader } from './components/SyncHeader';
import { ShopifyIntegrationPanel } from '../channels/components/ShopifyIntegrationPanel';
import { SyncMetricGrid } from './components/SyncMetricGrid';
import { SyncNodeStrip } from './components/SyncNodeStrip';
import type { SyncFilters, SyncSection } from './sync.types';
import { filterSyncEvents, initialSyncFilters } from './sync.utils';

export function SyncPage({ mode }: { mode: DemoMode }) {
  const [section, setSection] = useState<SyncSection>('overview');
  const [filters, setFilters] = useState<SyncFilters>(initialSyncFilters);
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [inspectedId, setInspectedId] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<SyncMetrics | null>(null);
  const [metricsError, setMetricsError] = useState<unknown>(null);
  const [jobs, setJobs] = useState<SyncJob[]>([]);
  const [retryDialogOpen, setRetryDialogOpen] = useState(false);
  const [retryReason, setRetryReason] = useState('');
  const [retrying, setRetrying] = useState(false);
  const [retryResults, setRetryResults] = useState<Record<string, { status: 'queued' | 'running' | 'recovered' | 'dead' | 'conflict' | 'failed'; message: string }>>({});
  const [retryHistory, setRetryHistory] = useState<Record<string, SyncRetryHistoryEntry[]>>({});
  const [retryHistoryError, setRetryHistoryError] = useState<string | null>(null);
  const retryKeys = useRef(new Map<string, string>());

  const auth = useAuth();
  const canRetry = auth.user?.role === 'ADMIN';
  const realtime = useRealtime();
  const loadFixture = useMemo(() => getSyncFixture, []);
  // The fixture loader answers with one SyncFixture object; `useApiPage` is generic over the
  // RENDERED rows, so it is wrapped in a one-element array. The two sources therefore never
  // share an array type, which is what stops a fixture event being rendered by the live
  // ledger and printing a fabricated `before → after`.
  const page = useApiPage<SyncEvent, SyncFixture>(
    async (cursor, signal) => {
      const response = await listSyncEvents({
        limit: 50,
        ...(section === 'errors' ? { errors_only: true } : {}),
        ...(cursor === null ? {} : { cursor }),
      }, signal);
      return { items: response.items, nextCursor: response.nextCursor };
    },
    (currentMode) => loadFixture(currentMode).then((fixtureValue) => (fixtureValue ? [fixtureValue] : [])),
    mode,
    50,
    { requestKey: mode === 'default' ? (section === 'errors' ? 'errors' : 'all') : 'fixture', fallbackOnError: false, pendingUntilResolved: true },
  );
  const errorJobStatus = filters.status === 'failed' || filters.status === 'dead' ? filters.status : 'failed,dead';
  const errorJobsPage = useApiPage<SyncJob>(
    async (cursor, signal) => {
      const response = await listSyncJobs({ limit: 50, status: errorJobStatus, ...(cursor ? { cursor } : {}) }, signal);
      return { items: response.items, nextCursor: response.nextCursor };
    },
    async () => [], mode, 50,
    { requestKey: `${section}:${errorJobStatus}`, fallbackOnError: false, pendingUntilResolved: true, getRowKey: (job) => job.id },
  );

  const isApi = page.source === 'api' || (mode === 'default' && page.source === 'pending');
  const apiEvents = isApi ? (page.rows as SyncEvent[]) : [];
  const fixtureState = isApi ? undefined : (page.rows[0] as SyncFixture | undefined);

  // Metrics and jobs are read separately from the event page. They are separate endpoints for
  // a reason: the latency percentile covers EVERY delivered event, not the fifty on screen, and
  // computing it from the page would report the latency of whatever the reader is looking at.
  const sidecarRequest = useRef<AbortController | null>(null);
  const sidecarGeneration = useRef(0);
  const refreshSidecars = useCallback(() => {
    sidecarRequest.current?.abort();
    const controller = new AbortController();
    sidecarRequest.current = controller;
    const generation = ++sidecarGeneration.current;
    const jobsPromise = section === 'errors'
      ? Promise.all([
          listSyncJobs({ limit: 100, status: 'failed' }, controller.signal),
          listSyncJobs({ limit: 100, status: 'dead' }, controller.signal),
        ]).then(([failed, dead]) => ({ items: [...new Map([...failed.items, ...dead.items].map((job) => [job.id, job])).values()] }))
      : listSyncJobs({ limit: 50 }, controller.signal);
    void Promise.allSettled([
      getSyncMetrics(undefined, controller.signal),
      jobsPromise,
    ]).then(([metricsResult, jobsResult]) => {
      if (controller.signal.aborted || generation !== sidecarGeneration.current) return;
      if (metricsResult.status === 'fulfilled') {
        setMetrics(metricsResult.value);
        setMetricsError(null);
      } else {
        // Keep the last successful metrics visible, but leave an explicit degraded signal.
        setMetricsError(metricsResult.reason);
      }
      if (jobsResult.status === 'fulfilled') setJobs(jobsResult.value.items);
      else setMetricsError(jobsResult.reason);
    });
  }, [section]);

  useEffect(() => {
    if (isApi) refreshSidecars();
    else sidecarRequest.current?.abort();
  }, [isApi, refreshSidecars]);
  useEffect(() => () => sidecarRequest.current?.abort(), []);
  useEffect(() => setSelected(new Set()), [section]);

  // Live updates arrive through the shared manager, and re-read the same rows already shown —
  // the ledger is never patched from a pushed payload,
  // because a delivery event says "something changed" and not what the row now says.
  const [liveAt, setLiveAt] = useState<string | null>(null);
  const awaitingRealtimeSnapshot = useRef<number | null>(null);
  useRealtimeRefresh(['sync'], () => {
    // Ready/resync and change notifications are hints to re-read. This also runs
    // while the first API request is degraded and fixture rows are being shown,
    // so a recovered backend can replace them without a manual refresh.
    if (mode === 'default') {
      awaitingRealtimeSnapshot.current = page.apiSnapshotVersion;
      page.revalidate();
      if (isApi) {
        errorJobsPage.revalidate();
        refreshSidecars();
      }
    }
  });

  useEffect(() => {
    const requestedAfter = awaitingRealtimeSnapshot.current;
    if (requestedAfter !== null && page.apiSnapshotVersion > requestedAfter && page.source === 'api' && page.apiUpdatedAt) {
      awaitingRealtimeSnapshot.current = null;
      setLiveAt(page.apiUpdatedAt);
    }
  }, [page.apiSnapshotVersion, page.apiUpdatedAt, page.source]);

  // While the stream is degraded, keep the same read-only snapshot contract on a slow timer.
  // It never writes anything and it stops the moment the live stream recovers, so a reconnect
  // does not leave two refresh loops running.
  useEffect(() => {
    if (mode !== 'default' || !realtime.available || realtime.status === 'live' || realtime.status === 'disabled') return;
    const timer = setInterval(() => {
      awaitingRealtimeSnapshot.current = page.apiSnapshotVersion;
      page.revalidate();
      if (isApi) {
        errorJobsPage.revalidate();
        refreshSidecars();
      }
    }, 15_000);
    return () => clearInterval(timer);
  }, [errorJobsPage.revalidate, isApi, mode, page.apiSnapshotVersion, page.revalidate, realtime.available, realtime.status, refreshSidecars]);

  // One event, read by id. A 404 is reported as itself rather than swapped for a row from the
  // list: putting a DIFFERENT event on screen under the id the reader clicked is the failure
  // this codebase refuses everywhere else, and the audit ledger is where it would do the most
  // damage.
  const [inspected, setInspected] = useState<SyncEvent | null>(null);
  const [inspectError, setInspectError] = useState<string | null>(null);
  const inspectRequest = useRef<AbortController | null>(null);
  const inspectGeneration = useRef(0);
  const inspect = useCallback(async (eventId: string) => {
    inspectRequest.current?.abort();
    const controller = new AbortController();
    inspectRequest.current = controller;
    const generation = ++inspectGeneration.current;
    setInspectError(null);
    try {
      const event = await getSyncEvent(eventId, controller.signal);
      if (controller.signal.aborted || generation !== inspectGeneration.current) return;
      setInspected(event);
    } catch (cause) {
      if (controller.signal.aborted || generation !== inspectGeneration.current) return;
      setInspected(null);
      setInspectError(cause instanceof Error ? cause.message : 'Không đọc được sự kiện này.');
    }
  }, []);
  useEffect(() => () => inspectRequest.current?.abort(), []);

  const fixture = fixtureState;
  const filteredFixture = fixture ? filterSyncEvents(fixture.events, filters, section) : [];
  const eventCounts = metrics?.events_by_state ?? {};
  const jobCounts = metrics?.jobs_by_status ?? {};
  const errorCount = isApi
    ? (jobCounts.failed ?? 0) + (jobCounts.dead ?? 0)
    : fixture?.events.filter((event) => ['failed', 'conflict', 'retrying'].includes(event.status)).length;
  const activityCount = isApi
    ? Object.values(eventCounts).reduce((total, count) => total + count, 0)
    : fixture?.events.length;
  const sections: readonly TabItem<SyncSection>[] = [
    { value: 'overview', label: 'Tổng quan' },
    { value: 'activity', label: activityCount === undefined ? 'Hoạt động' : `Hoạt động · ${activityCount}` },
    { value: 'errors', label: errorCount === undefined ? 'Lỗi' : `Lỗi · ${errorCount}` },
    { value: 'reconciliation', label: 'Đối soát' },
  ];
  const filteredApi = useMemo(() => {
    const query = filters.query.trim().toLocaleLowerCase('vi');
    return apiEvents.filter((event) => {
      const matchesQuery = !query || [event.sku, event.event_id, event.source, event.operation,
        ...(event.channel_code ? [event.channel_code] : []), ...event.delivered_channels]
        .some((value) => value.toLocaleLowerCase('vi').includes(query));
      // The prototype's section tabs describe fixture categories. Two of them map onto a real
      // server concept and one does not, and the one that does not is NOT faked: "errors"
      // means rows in failed or dead, because that is the state the API has, and
      // "reconciliation" is handled below rather than given a fake predicate.
      const matchesSection =
        section === 'overview'
          ? true
          : section === 'activity'
            ? event.state === 'pending' || event.state === 'delivered'
          : section === 'errors'
            ? true // The server-side errors_only query pages over every failed and dead event.
            : false;
      const matchesStatus = filters.status === 'all' || event.state === filters.status;
      const matchesChannel = filters.channel === 'all' || event.delivered_channels.includes(filters.channel);
      return matchesQuery && matchesSection && matchesStatus && matchesChannel;
    });
  }, [apiEvents, filters, section]);

  // Reconciliation is not derivable from an event row: drift is a property of a CHANNEL
  // LISTING, and the API exposes it on GET /api/v1/channels/{id}/mappings. Inventing a
  // predicate over event fields to fill that tab would produce a plausible-looking answer to a
  // question the event log cannot answer.
  const reconciliationLivesElsewhere = isApi && section === 'reconciliation';
  const filtered = reconciliationLivesElsewhere || (isApi && section === 'errors') ? [] : (isApi ? filteredApi : filteredFixture);
  const filtersActive = filters.query.trim() !== '' || (isApi ? filters.status !== 'all' : filters.channel !== 'all' || filters.status !== 'all' || filters.kind !== 'all' || filters.health !== 'all');
  const toggle = (id: string) => setSelected((current) => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const toggleAll = () => setSelected((current) => {
    // Fixture selection is only local preview state; live retries are selected from actual
    // failed event/job rows and submitted to the backend.
    if (isApi) return current;
    const rows = filteredFixture;
    return rows.length > 0 && rows.every((event) => current.has(event.id))
      ? new Set<string>()
      : new Set<string>(rows.map((event) => event.id));
  });
  const inspectFixtureRow = (id: string) => setInspectedId((current) => current === id ? null : id);
  const errorJobs = (errorJobsPage.rows as SyncJob[]).filter((job) => {
    const query = filters.query.trim().toLocaleLowerCase('vi');
    return !query || [job.event_id ?? '', job.sku ?? '', job.channel_code, job.operation ?? '', job.last_error ?? ''].some((value) => value.toLocaleLowerCase('vi').includes(query));
  });

  const retrySelected = async () => {
    if (!canRetry || retrying || selected.size === 0 || selected.size > 10 || retryReason.trim().length === 0) return;
    setRetrying(true);
    const ids = [...selected];
    const results: Record<string, { status: 'queued' | 'running' | 'recovered' | 'dead' | 'conflict' | 'failed'; message: string }> = {};
    await Promise.all(ids.map(async (eventId) => {
      const key = retryKeys.current.get(eventId) ?? crypto.randomUUID();
      retryKeys.current.set(eventId, key);
      try {
        const receipt = await retrySyncEvent(eventId, retryReason.trim(), key);
        const receiptMessages = {
          queued: 'Đã xếp hàng; đang chờ channel xác nhận.',
          running: 'Backend đang xử lý yêu cầu retry.',
          recovered: 'Backend xác nhận việc gửi đã khôi phục.',
          failed: 'Backend ghi nhận retry thất bại; lỗi vẫn cần theo dõi.',
          dead: 'Backend xác nhận tác vụ vẫn ở trạng thái lỗi hẳn.',
        } as const;
        results[eventId] = { status: receipt.status, message: receipt.repeated ? `Yêu cầu trước đã được ghi nhận. ${receiptMessages[receipt.status]}` : receiptMessages[receipt.status] };
        retryKeys.current.delete(eventId);
      } catch (cause) {
        const conflict = cause instanceof ApiRequestError && cause.status === 409;
        results[eventId] = { status: conflict ? 'conflict' : 'failed', message: cause instanceof Error ? cause.message : 'Không xác định được kết quả thử lại.' };
        // The server may have committed before a transport error. Reuse this key on the next
        // click so the user retrieves the same receipt instead of queueing twice.
        if (conflict || (cause instanceof ApiRequestError && cause.isClientError)) retryKeys.current.delete(eventId);
      }
    }));
    setRetryResults((current) => ({ ...current, ...results }));
    const accepted = new Set(Object.entries(results).filter(([, result]) => ['queued', 'running', 'recovered', 'dead'].includes(result.status)).map(([id]) => id));
    if (accepted.size) setSelected((current) => new Set([...current].filter((id) => !accepted.has(id))));
    setRetrying(false);
    setRetryDialogOpen(false);
    setRetryReason('');
    page.revalidate();
    errorJobsPage.revalidate();
    refreshSidecars();
  };
  const inspectRetryHistory = async (eventId: string) => {
    setRetryHistoryError(null);
    try {
      const history = await getSyncRetryHistory(eventId);
      setRetryHistory((current) => ({ ...current, [eventId]: history }));
    } catch (cause) {
      setRetryHistoryError(cause instanceof Error ? cause.message : 'Không đọc được lịch sử thử lại.');
    }
  };

  // A 202 receipt is only an acknowledgement that the retry was queued. Follow the persisted
  // manual-request history while it is queued/running, and replace that receipt with the
  // backend's terminal result. Polling is bounded so an offline history endpoint cannot leave
  // a timer running forever; the queued receipt remains truthful if the deadline expires.
  useEffect(() => {
    const pendingIds = Object.entries(retryResults)
      .filter(([, result]) => result.status === 'queued' || result.status === 'running')
      .map(([eventId]) => eventId);
    if (mode !== 'default' || pendingIds.length === 0) return;

    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempts = 0;
    const poll = async () => {
      attempts += 1;
      const stillPending = new Set<string>();
      await Promise.all(pendingIds.map(async (eventId) => {
        try {
          const history = await getSyncRetryHistory(eventId);
          const request = [...history].reverse().find((item) => item.kind === 'manual_request');
          if (!request || ['queued', 'running'].includes(request.status)) {
            stillPending.add(eventId);
            return;
          }
          const terminal = request.status === 'recovered' || request.status === 'dead' || request.status === 'failed'
            ? request.status
            : null;
          if (!terminal) {
            stillPending.add(eventId);
            return;
          }
          const messages = {
            recovered: 'Backend xác nhận việc gửi đã khôi phục.',
            dead: 'Backend xác nhận tác vụ vẫn ở trạng thái lỗi hẳn.',
            failed: 'Backend ghi nhận retry thất bại; lỗi vẫn cần theo dõi.',
          } as const;
          if (!cancelled) setRetryResults((current) => ({
            ...current,
            [eventId]: { status: terminal, message: messages[terminal] },
          }));
        } catch {
          stillPending.add(eventId);
        }
      }));
      if (!cancelled && attempts < 40 && stillPending.size > 0) {
        timer = setTimeout(() => { void poll(); }, 1_500);
      }
    };
    timer = setTimeout(() => { void poll(); }, 1_000);
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [mode, retryResults]);
  const selectedEvents = [...new Map([
    ...apiEvents.filter((event) => selected.has(event.event_id)).map((event) => [event.event_id, event] as const),
    ...(errorJobsPage.rows as SyncJob[]).filter((job) => job.event_id && selected.has(job.event_id)).map((job) => [job.event_id!, { event_id: job.event_id!, sku: job.sku ?? job.event_id, state: job.status } as SyncEvent] as const),
  ]).values()];

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 py-8">
      <SyncHeader />
      {isApi ? <ShopifyIntegrationPanel canManage={canRetry} /> : null}
      {isApi
        ? (metrics ? <><SyncApiMetrics metrics={metrics} />{metricsError ? <p role="status" className="font-body text-caption text-amber-800">Một số dữ liệu đang dùng snapshot gần nhất; lần xác minh mới nhất thất bại.</p> : null}</> : metricsError ? <ErrorState error={metricsError} retry={() => refreshSidecars()} /> : <LoadingState label="Đang đo độ trễ đồng bộ…" />)
        : (fixture ? <SyncMetricGrid events={fixture.events} /> : null)}
      <Tabs ariaLabel="Các phần của trang Đồng bộ" className="w-fit max-w-full" idPrefix="sync" items={sections} value={section} onValueChange={setSection} />
      <div aria-labelledby={`sync-tab-${section}`} id={`sync-panel-${section}`} role="tabpanel" tabIndex={0} className="grid gap-5">
        {fixture && !isApi && section === 'overview' ? <SyncNodeStrip nodes={fixture.nodes} /> : null}
        <SyncFiltersPanel filters={filters} onChange={setFilters} live={mode === 'default'} errorsOnly={section === 'errors'} />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-label="Kết quả đồng bộ" className="font-body text-body-sm text-graphite">
            <strong className="text-on-surface">{isApi && section === 'errors' ? errorJobs.length : filtered.length}</strong> {isApi && section === 'errors' ? 'tác vụ lỗi đang hiển thị' : 'sự kiện phù hợp'}
          </p>
          <div className="flex flex-wrap gap-2">
            {filtersActive ? <Button size="sm" variant="ghost" onClick={() => setFilters(initialSyncFilters)}>Đặt lại bộ lọc</Button> : null}
            {isApi && canRetry && section === 'errors' ? <Button size="sm" variant="secondary" disabled={selected.size === 0 || selected.size > 10} onClick={() => setRetryDialogOpen(true)}>Thử lại mục đã chọn{selected.size ? ` · ${selected.size}` : ''}</Button> : null}
            <Button size="sm" disabled title="Hệ thống tự gửi số lượng mới lên các kênh">Gửi lại tồn kho</Button>
          </div>
        </div>
        {page.loading ? <LoadingState label={'Đang tải nhật ký đồng bộ…'} /> : null}
        {!page.loading && page.fixtureError ? <ErrorState error={page.fixtureError} retry={page.refresh} /> : null}
        {!page.loading && !page.fixtureError && !isApi && !fixture ? <EmptyState title="Chưa có dữ liệu đồng bộ" detail="Hiện chưa có sự kiện hay kênh nào." /> : null}
        {reconciliationLivesElsewhere ? (
          <EmptyState
            title="Đối soát nằm ở màn Kênh bán"
            detail="Sai lệch được xem theo từng SKU trên kênh bán, không phải theo từng sự kiện. Mở màn Kênh bán để xem bảng đối soát."
          />
        ) : null}
        {isApi && section === 'errors' && errorJobsPage.error ? <ErrorState error={errorJobsPage.error} retry={errorJobsPage.refresh} /> : null}
        {isApi && section === 'errors' && errorJobsPage.loading ? <LoadingState label="Đang tải tác vụ lỗi từ máy chủ…" /> : null}
        {isApi && section === 'errors' && !errorJobsPage.loading && !errorJobsPage.error && errorJobs.length === 0 ? <EmptyState title="Không có tác vụ lỗi" detail="Không có job ở trạng thái failed/dead khớp bộ lọc hiện tại." /> : null}
        {!reconciliationLivesElsewhere && section !== 'errors' && !page.loading && !page.fixtureError && filtered.length === 0 ? <EmptyState title="Không có sự kiện phù hợp" detail="Thử đổi tab, từ khoá hoặc bộ lọc." /> : null}
        {!page.loading && !page.fixtureError && filtered.length > 0 && isApi ? (
          <div className="grid gap-5">
            <SyncApiEventLedger
              events={filteredApi}
              totalRows={apiEvents.length}
              hasMore={page.hasMore}
              loadingMore={page.loadingMore}
              onLoadMore={page.loadMore}
              selected={selected}
              onToggle={(eventId) => toggle(eventId)}
              canSelectRetry={false}
              onInspect={(eventId) => void inspect(eventId)}
            />
            {inspected ? (
              <div role="status" className="rounded-card border border-line bg-white p-4 font-body text-body-sm">
                <strong className="text-on-surface">{inspected.sku}</strong> · {inspected.event_id}
                <span className="mt-1 block text-caption text-graphite">
                  Có thể bán {inspected.before.available_to_sell} → {inspected.after.available_to_sell} · phiên bản {inspected.version}
                  {inspected.correlation_id ? ` · liên kết ${inspected.correlation_id}` : ''}
                </span>
              </div>
            ) : null}
            {inspectError ? (
              <p role="alert" className="rounded-card bg-badge-blocked-bg px-4 py-3 font-body text-body-sm text-badge-blocked-text">{inspectError}</p>
            ) : null}
            <SyncApiJobLedger jobs={jobs} />
            <p className="font-body text-caption text-graphite">
              {liveAt ? <>Cập nhật trực tiếp lúc {liveAt.slice(11, 19)}.</> : 'Đang chờ sự kiện mới…'}
            </p>
          </div>
        ) : null}
        {isApi && section === 'errors' && !errorJobsPage.loading && !errorJobsPage.error && errorJobs.length > 0 ? <SyncApiJobLedger
          jobs={errorJobs} selected={selected} onToggle={canRetry ? toggle : undefined} canRetry={canRetry}
          onHistory={(eventId) => void inspectRetryHistory(eventId)}
          hasMore={errorJobsPage.hasMore} loadingMore={errorJobsPage.loadingMore} onLoadMore={errorJobsPage.loadMore}
        /> : null}
        {isApi && section === 'errors' && retryHistoryError ? <p role="alert" className="font-body text-body-sm text-badge-blocked-text">{retryHistoryError}</p> : null}
        {isApi && section === 'errors' ? Object.entries(retryHistory).map(([eventId, items]) => <section key={eventId} className="grid gap-2 rounded-card border border-line bg-white p-4" aria-label={`Lịch sử retry ${eventId}`}>
          <h2 className="font-display text-base font-bold text-on-surface">Lịch sử thử lại · <code>{eventId}</code></h2>
          {items.length === 0 ? <p className="text-caption text-graphite">Chưa có lần gửi hoặc yêu cầu retry được ghi.</p> : items.map((item) => <article key={`${item.kind}-${item.id}`} className="border-t border-line pt-2 font-body text-caption text-graphite">
            <strong>{item.kind === 'manual_request' ? 'Yêu cầu thủ công' : `${item.channel_code || 'Channel'} · lần thử ${item.attempt}`}</strong> · {item.status} · {new Date(item.started_at).toLocaleString('vi-VN')}
            {item.requested_by ? <span className="block">Người yêu cầu: {item.requested_by}</span> : null}
            {item.reason ? <span className="block">Ghi chú: {item.reason}</span> : null}
            {item.error ? <span className="block">Nguyên nhân/kết quả: {item.error}</span> : null}
          </article>)}
        </section>) : null}
        {mode === 'default' && Object.entries(retryResults).length ? <section aria-label="Kết quả thử lại" className="grid gap-2 rounded-card border border-line bg-white p-4">
          <h2 className="font-display text-base font-bold text-on-surface">Kết quả thử lại</h2>
          {Object.entries(retryResults).map(([eventId, result]) => <p key={eventId} role="status" className="font-body text-body-sm text-graphite"><code>{eventId}</code> · {result.message}</p>)}
        </section> : null}
        {!page.loading && !page.fixtureError && filtered.length > 0 && !isApi && fixture ? <SyncEventLedger events={filteredFixture} selected={selected} inspectedId={inspectedId} onToggle={toggle} onToggleAll={toggleAll} onInspect={inspectFixtureRow} /> : null}
      </div>
      <Modal
        open={retryDialogOpen}
        onClose={() => { if (!retrying) setRetryDialogOpen(false); }}
        title={`Xác nhận thử lại ${selectedEvents.length} sự kiện`}
        description="Thao tác chỉ gửi lại snapshot tồn kho đã ghi nhận lên các channel chưa xác nhận. Không chạy lại lệnh bán, giữ hàng hay điều chỉnh tồn."
        footer={<><Button variant="ghost" disabled={retrying} onClick={() => setRetryDialogOpen(false)}>Huỷ</Button><Button variant="primary" loading={retrying} disabled={!retryReason.trim()} onClick={() => void retrySelected()}>Xác nhận xếp hàng</Button></>}
      >
        <label htmlFor="sync-retry-reason" className="mb-2 block font-body text-body-sm font-semibold text-on-surface">Lý do vận hành</label>
        <textarea id="sync-retry-reason" value={retryReason} onChange={(event) => setRetryReason(event.target.value)} maxLength={500} rows={3} required className="w-full rounded-control border border-outline-variant bg-white p-3 font-body text-body-sm text-on-surface" placeholder="Ví dụ: đã khắc phục lỗi xác thực channel" />
        <p className="mt-2 font-body text-caption text-graphite">{selectedEvents.map((event) => `${event.sku} (${event.state})`).join(' · ')}</p>
      </Modal>
    </section>
  );
}
