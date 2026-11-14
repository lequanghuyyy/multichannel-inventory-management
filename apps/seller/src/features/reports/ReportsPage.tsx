import { categoryLabel } from '../../lib/category';
import { channelName } from '../orders/order.api';
import { useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { getReportSummary, type ReportPeriod as ApiPeriod, type ReportSummary } from '../../api/reports';
import { getReportFixture, type DemoMode } from '../../mocks/mock-api';
import { useApiResource } from '../shared/useApiResource';
import { ChannelSharePanel } from './components/ChannelSharePanel';
import { GatewayEvidence } from './components/GatewayEvidence';
import { ExternalCurrencyReportPanel } from './components/ExternalCurrencyReportPanel';
import { OperationalObservations } from './components/OperationalObservations';
import { ReportApiChannels, ReportApiKpis, ReportApiLedger, ReportApiSkuLedger, ReportApiVelocity } from './components/ReportApiLedger';
import { ReportControls } from './components/ReportControls';
import { ReportMetricGrid } from './components/ReportMetricGrid';
import { ReportProvenance } from './components/ReportProvenance';
import { ReportsHeader } from './components/ReportsHeader';
import { SalesVelocityPanel } from './components/SalesVelocityPanel';
import { TopSkuLedger } from './components/TopSkuLedger';
import type { ReportFixture, ReportFilters, ReportPeriod, ReportSection } from './report.types';

const sections: readonly TabItem<ReportSection>[] = [
  { value: 'overview', label: 'Tổng quan' }, { value: 'sales', label: 'Bán hàng' }, { value: 'inventory', label: 'Tồn kho' }, { value: 'channels', label: 'Kênh bán' }, { value: 'synchronization', label: 'Đồng bộ' },
];
const periodNames: Record<string, string> = { today: 'Hôm nay', '7d': '7 ngày', '30d': '30 ngày', '90d': '90 ngày' };
const initialFilters: ReportFilters = { channel: 'all', category: 'all' };
/** The prototype's three windows plus the server's longest. 'today' has no server meaning. */
type PeriodChoice = ReportPeriod | '90d';
/** The two sources carry different shapes, so the fallback is wrapped rather than cast. */
type FixtureBundle = { fixture: ReportFixture };
// The API serves three windows. 'today' exists in the prototype and has no server meaning
// here, so picking it in live mode would silently widen to seven days.
const apiPeriods: readonly ApiPeriod[] = ['7d', '30d', '90d'];

const snapshotFor = (fixture: ReportFixture, period: PeriodChoice) =>
  fixture.snapshots[period === '90d' ? '30d' : period];

export function ReportsPage({ mode }: { mode: DemoMode }) {
  const [period, setPeriod] = useState<PeriodChoice>('7d');
  const [section, setSection] = useState<ReportSection>('overview');
  const [filters, setFilters] = useState<ReportFilters>(initialFilters);

  const livePeriod: ApiPeriod = period === 'today' ? '7d' : period;
  const report = useApiResource<ReportSummary, FixtureBundle>(
    (signal) => getReportSummary({
      period: livePeriod,
      ...(filters.channel === 'all' ? {} : { channel: filters.channel }),
      ...(filters.category === 'all' ? {} : { category: filters.category }),
    }, signal),
    async (currentMode) => {
      const fallback = await getReportFixture(currentMode);
      // Wrapped in an object so the fallback occupies the same slot as the live summary; the
      // page then discriminates on a property rather than on a cast that could be wrong.
      return fallback ? { fixture: fallback } : undefined;
    },
    mode,
    [livePeriod, filters.channel, filters.category],
  );

  const isApi = report.source === 'api';
  const value = report.value;
  const summary = isApi ? value as ReportSummary | null : null;
  const fixture = !isApi && value && 'fixture' in value ? value.fixture : null;

  const filtersActive = filters.channel !== 'all' || filters.category !== 'all';
  const fixturePeriods: readonly PeriodChoice[] = ['today', '7d', '30d', '90d'];
  const liveOptions = useMemo(() => ({
    channels: summary?.channel_options ?? [],
    categories: summary?.category_options ?? [],
  }), [summary]);

  let content = null;
  if (isApi && summary) {
    if (section === 'overview') {
      content = <div className="grid gap-5 lg:grid-cols-2"><ReportApiVelocity buckets={summary.sales_by_day} currency={summary.currency} /><ReportApiChannels channels={summary.channels} currency={summary.currency} /><div className="lg:col-span-2"><ExternalCurrencyReportPanel values={summary.external_currency_values ?? []} /></div></div>;
    } else if (section === 'sales') {
      content = <ReportApiVelocity buckets={summary.sales_by_day} currency={summary.currency} />;
    } else if (section === 'inventory') {
      content = <ReportApiSkuLedger skus={summary.top_skus} currency={summary.currency} />;
    } else if (section === 'channels') {
      content = <ReportApiChannels channels={summary.channels} currency={summary.currency} />;
    } else {
      content = <ReportApiLedger inventory={summary.inventory} sync={summary.sync} drift={summary.drift} />;
    }
  } else if (fixture) {
    const snapshot = fixture.snapshots[period === '90d' ? '30d' : period];
    const filteredChannels = snapshot?.channelShares.filter((channel) => filters.channel === 'all' || channel.id === filters.channel) ?? [];
    const filteredSkus = fixture.skus.filter((sku) => (filters.channel === 'all' || sku.channel === filters.channel) && (filters.category === 'all' || sku.category === filters.category)) ?? [];
    if (snapshot) {
      if (section === 'overview') content = <><OperationalObservations observations={snapshot.observations} /><div className="grid gap-5 lg:grid-cols-12"><div className="lg:col-span-7"><SalesVelocityPanel snapshot={snapshot} /></div><div className="lg:col-span-5"><ChannelSharePanel channels={filteredChannels} /></div></div></>;
      else if (section === 'sales') content = <SalesVelocityPanel snapshot={snapshot} wide />;
      else if (section === 'inventory') content = <TopSkuLedger skus={filteredSkus} />;
      else if (section === 'channels') content = <ChannelSharePanel channels={filteredChannels} />;
      else content = <GatewayEvidence gateways={fixture.gateways} />;
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 py-8">
      <ReportsHeader />
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Khoảng thời gian báo cáo">
          {(isApi ? apiPeriods : fixturePeriods).map((option) => (
            <Button key={option} size="sm" variant={isApi ? (livePeriod === option ? 'primary' : 'secondary') : (period === option ? 'primary' : 'secondary')} onClick={() => setPeriod(option)}>
              {periodNames[option] ?? option}
            </Button>
          ))}
        </div>
        {filtersActive ? (
          <Button size="sm" variant="ghost" onClick={() => setFilters(initialFilters)}>Bỏ lọc</Button>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <label className="font-body text-body-sm text-graphite" htmlFor="report-channel">Kênh</label>
        <select
          id="report-channel"
          className="rounded-control border border-line px-3 py-2 font-body text-body-sm"
          value={filters.channel}
          onChange={(event) => setFilters((current) => ({ ...current, channel: event.target.value as ReportFilters['channel'] }))}
        >
          <option value="all">Tất cả kênh</option>
          {/* Options come from the database, not from a checked-in list: a channel with no
              orders in range must still be selectable, or it disappears from its own report. */}
          {(isApi ? liveOptions.channels : ['shopee', 'tiktok', 'pos', 'lazada']).map((code) => (
            <option key={code} value={code}>{channelName(code)}</option>
          ))}
        </select>
        <label className="font-body text-body-sm text-graphite" htmlFor="report-category">Nhóm</label>
        <select
          id="report-category"
          className="rounded-control border border-line px-3 py-2 font-body text-body-sm"
          value={filters.category}
          onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value as ReportFilters['category'] }))}
        >
          <option value="all">Tất cả nhóm</option>
          {(isApi ? liveOptions.categories : ['footwear', 'leather', 'apparel', 'accessories']).map((category) => (
            <option key={category} value={category}>{categoryLabel(category)}</option>
          ))}
        </select>
      </div>
      {report.loading ? <LoadingState label={'Đang tổng hợp báo cáo…'} /> : null}
      {!report.loading && report.fixtureError ? <ErrorState error={report.fixtureError} retry={report.refresh} /> : null}
      {!report.loading && !report.fixtureError && !isApi && !fixture ? <EmptyState title="Chưa có báo cáo" detail="Hiện chưa có dữ liệu báo cáo." /> : null}
      {!report.loading && !report.fixtureError && isApi && !summary ? <EmptyState title="Chưa có dữ liệu báo cáo" detail="Không có dữ liệu trong khoảng thời gian này." /> : null}
      {isApi && summary ? (
        <div className="flex flex-col gap-6">
          <ReportApiKpis summary={summary} />
          <p className="font-body text-body-sm text-graphite">
            Từ {summary.from.slice(0, 10)} đến {summary.to.slice(0, 10)} (không gồm ngày cuối) · cập nhật lúc {summary.generated_at.slice(0, 16).replace('T', ' ')}
          </p>
          <p className="font-body text-body-sm text-graphite">
            Bộ lọc kênh và nhóm áp dụng cho chỉ số, biểu đồ theo ngày, bảng SKU và tỷ trọng kênh. Số liệu đồng bộ và độ lệch đăng bán luôn tính trên toàn bộ. Số tiền ở đây là <strong className="text-on-surface">giá trị đơn hàng</strong>, không phải tiền đã thu, nên đơn đang chờ thanh toán vẫn được tính.
          </p>
          <Tabs ariaLabel="Các phần của báo cáo" className="w-fit max-w-full" idPrefix="reports" items={sections} value={section} onValueChange={setSection} />
          <div aria-labelledby={`reports-tab-${section}`} id={`reports-panel-${section}`} role="tabpanel" tabIndex={0} className="grid gap-6">{content}</div>
        </div>
      ) : null}
      {!isApi && fixture && snapshotFor(fixture, period) ? (
        <div className="flex flex-col gap-6">
          <ReportProvenance snapshot={snapshotFor(fixture, period)!} />
          <ReportControls period={period === '90d' ? '30d' : period} filters={filters} onPeriodChange={(next) => setPeriod(next)} onFiltersChange={setFilters} onReset={() => setFilters(initialFilters)} filtersActive={filtersActive} />
          <ReportMetricGrid metrics={snapshotFor(fixture, period)!.metrics} />
          <Tabs ariaLabel="Các phần của báo cáo" className="w-fit max-w-full" idPrefix="reports" items={sections} value={section} onValueChange={setSection} />
          <div aria-labelledby={`reports-tab-${section}`} id={`reports-panel-${section}`} role="tabpanel" tabIndex={0} className="grid gap-6">{content}</div>
          {/* Kept in the fixture view only. An audit package is not something this API can
              produce, and in live mode the boundary is stated by the provenance line above
              rather than by a button that would have nothing behind it. */}
          <footer className="flex flex-col gap-4 rounded-card bg-carbon p-5 text-pure-white sm:p-6 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="font-body text-caption font-bold uppercase tracking-[0.12em] text-pure-white/45">Lưu ý</p>
              <h2 className="mt-1 font-display text-xl font-bold">Đây là số liệu mẫu.</h2>
              <p className="mt-2 max-w-2xl font-body text-body-sm leading-6 text-pure-white/60">Các báo cáo ở đây chỉ để minh hoạ. Chưa có chốt sổ cuối kỳ, đối soát thanh toán hay xuất báo cáo chính thức.</p>
            </div>
            <button className="min-h-11 rounded-control bg-pure-white/10 px-4 font-body text-body-sm font-semibold text-pure-white opacity-60" disabled type="button">Tải báo cáo kiểm toán</button>
          </footer>
        </div>
      ) : null}
    </section>
  );
}
