import { useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '../../components/common/ScreenState';
import { Button } from '../../components/ui/Button';
import { getAiFeatures, getAiRecommendations, type AiBufferSuggestion, type AiFeatureRegistry, type AiForecast, type AiObservation, type AiRecommendation } from '../../api/ai';
import { getRecommendations, type DemoMode } from '../../mocks/mock-api';
import { href, navigate } from '../../app/routes';
import { categoryLabel } from '../../lib/category';
import { useApiResource } from '../shared/useApiResource';
import { AIFailureStates } from './components/AIFailureStates';
import { AIGuardrail } from './components/AIGuardrail';
import { AIHeader } from './components/AIHeader';
import { AISectionTabs, type AISectionTab } from './components/AISectionTabs';
import { ModelRegistry } from './components/ModelRegistry';
import { SyncHealthPanel } from './components/SyncHealthPanel';
import { RecommendationFiltersPanel } from './components/RecommendationFiltersPanel';
import { RecommendationGrid } from './components/RecommendationGrid';
import { AIMetricGrid } from './components/AIMetricGrid';
import type { RecommendationFilters } from './ai.types';
import { filterRecommendations, initialRecommendationFilters } from './ai.utils';

const horizons = [7, 14, 30] as const;

const count = (value: number) => new Intl.NumberFormat('vi-VN').format(value);
const units = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 1 }).format(value);

/**
 * The observed demand table.
 *
 * This is the half of the screen that CAN be shown without a provider, because every column
 * is a stored fact. It is deliberately labelled as observation and never as a prediction: a
 * reader who scrolls past the missing-forecast notice must still not be able to mistake
 * "sold 12 units in 28 days" for "will sell 12 units next week".
 */
function ObservedDemand({ observations, windowDays }: { observations: AiObservation[]; windowDays: number }) {
  if (observations.length === 0) {
    return <EmptyState title="Không có dữ liệu nhu cầu" detail="Chưa có biến thể đang bán nào trong nhóm đã chọn." />;
  }
  const sold = observations.reduce((total, row) => total + row.units_sold, 0);
  const sellable = observations.reduce((total, row) => total + row.on_hand - row.reserved - row.safety_buffer, 0);
  return (
    <section aria-label="Nhu cầu bán hàng gần đây" className="flex flex-col gap-4">
      <header className="flex flex-col gap-2">
        <h2 className="font-display text-xl font-bold text-on-surface">Nhu cầu bán hàng · {windowDays} ngày gần nhất</h2>
        <p className="font-body text-body-sm text-graphite">
          Đã bán <strong className="text-on-surface">{count(sold)}</strong> sản phẩm trên {count(observations.length)} biến thể · còn bán được {count(sellable)}. Đây là số liệu đã ghi nhận, không phải dự báo.
        </p>
      </header>
      <table className="w-full text-left font-body text-body-sm">
        <caption className="sr-only">Nhu cầu bán hàng gần đây</caption>
        <thead>
          <tr className="text-caption uppercase tracking-[0.1em] text-graphite">
            <th className="py-2">SKU</th><th className="py-2">Nhóm</th><th className="py-2">Đã bán</th>
            <th className="py-2">Tồn</th><th className="py-2">Giữ</th><th className="py-2">Bán được</th>
          </tr>
        </thead>
        <tbody>
          {observations.map((row) => (
            <tr key={row.variant_id} className="border-t border-line">
              <td className="py-2 font-mono text-caption">{row.sku}</td>
              {/* Straight from products.category. A SKU that reads like footwear is still not
                  footwear until someone filed it under a category. */}
              <td className="py-2">{categoryLabel(row.category)}</td>
              <td className="py-2 tabular-nums">{count(row.units_sold)}</td>
              <td className="py-2 tabular-nums">{count(row.on_hand)}</td>
              <td className="py-2 tabular-nums">{count(row.reserved)}</td>
              <td className="py-2 tabular-nums">{count(row.on_hand - row.reserved - row.safety_buffer)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="font-body text-caption text-graphite">Đơn vị: sản phẩm.</p>
    </section>
  );
}

const methodLabels: Record<string, string> = {
  ses: 'SES (làm mịn mũ)', tsb: 'TSB', ma91: 'Trung bình 91 ngày', glm: 'GLM', lgb: 'LightGBM', prior: 'Tiền huấn luyện',
  v2: 'Chronos + SES', lstm: 'LSTM nhỏ', ens: 'Tổ hợp', ensemble: 'Tổ hợp', ses_fallback: 'SES dự phòng (ít lịch sử)',
};

const rejectionLabels: Record<string, string> = {
  unknown_sku: 'SKU không có trong dữ liệu', duplicate_sku: 'trùng SKU', not_finite: 'số không hợp lệ', negative: 'số âm',
  band_inverted: 'khoảng dự báo bị đảo', q95_below_upper: 'mức 95% thấp hơn cận trên', bad_confidence: 'độ tin cậy ngoài 0–1',
  horizon_mismatch: 'sai tầm nhìn', unknown_method: 'phương pháp lạ', implausibly_high: 'cao bất thường so với lịch sử bán',
};

/** The buffer is ADVICE: nothing on this screen writes safety_buffer. A "0" is the policy's default, not a missing value. */
function BufferCell({ suggestion }: { suggestion?: AiBufferSuggestion }) {
  if (!suggestion) return <span>—</span>;
  if (suggestion.source === 'dynamic') return <span title={suggestion.reason}>+{count(suggestion.units)}</span>;
  if (suggestion.source === 'disabled') return <span title={suggestion.reason}>0 (tắt)</span>;
  return <span title={suggestion.reason}>—</span>;
}

/** Local-service forecasts report the nominal coverage of the band; hosted ones report a stated confidence. */
function ConfidenceCell({ row }: { row: AiForecast }) {
  const percent = Math.round(row.confidence * 100);
  if (row.method) return <span title="Xác suất lý thuyết để nhu cầu thật nằm trong khoảng Thấp–Cao">Khoảng {percent}%</span>;
  return <span>{percent}%</span>;
}

function ForecastLedger({ forecasts }: { forecasts: AiForecast[] }) {
  const showQ95 = forecasts.some((row) => row.q95_units !== undefined);
  return (
    <section aria-label="Dự báo của mô hình" className="flex flex-col gap-4">
      <header>
        <h2 className="font-display text-xl font-bold text-on-surface">Dự báo của mô hình</h2>
        <p className="font-body text-body-sm text-graphite">Có dự báo cho {forecasts.length} SKU. Khoảng dự báo chỉ mang tính tham khảo, không phải cam kết. Gợi ý buffer chỉ là lời khuyên, hệ thống không tự đổi tồn.</p>
      </header>
      <div className="overflow-x-auto">
        <table className="w-full text-left font-body text-body-sm">
          <caption className="sr-only">Dự báo của mô hình</caption>
          <thead>
            <tr className="text-caption uppercase tracking-[0.1em] text-graphite">
              <th className="py-2">SKU</th><th className="py-2">Phương pháp</th><th className="py-2">Kỳ vọng</th><th className="py-2">Thấp</th>
              <th className="py-2">Cao</th>{showQ95 ? <th className="py-2">Mức 95%</th> : null}<th className="py-2">Tin cậy</th>
              <th className="py-2">Buffer gợi ý</th><th className="py-2">Cơ sở</th>
            </tr>
          </thead>
          <tbody>
            {forecasts.map((row) => (
              <tr key={row.variant_id} className="border-t border-line">
                <td className="py-2 font-mono text-caption">{row.sku}</td>
                <td className="py-2">{row.method ? (methodLabels[row.method] ?? row.method) : '—'}</td>
                <td className="py-2 tabular-nums">{units(row.expected_units)}</td>
                <td className="py-2 tabular-nums">{units(row.lower_units)}</td>
                <td className="py-2 tabular-nums">{units(row.upper_units)}</td>
                {showQ95 ? <td className="py-2 tabular-nums">{row.q95_units !== undefined ? units(row.q95_units) : '—'}</td> : null}
                <td className="py-2 tabular-nums"><ConfidenceCell row={row} /></td>
                <td className="py-2 tabular-nums"><BufferCell suggestion={row.buffer_suggestion} /></td>
                <td className="py-2 text-graphite">{row.rationale}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** What the model or the guard did NOT let through. A reader must be able to see that rows are missing and why. */
function ForecastGaps({ live }: { live: AiRecommendation }) {
  const rejected = live.rejected ?? [];
  const omitted = live.omitted ?? [];
  if (rejected.length === 0 && omitted.length === 0) return null;
  const reasons = Array.from(new Set(rejected.map((item) => rejectionLabels[item.reason] ?? item.reason)));
  return (
    <p aria-label="Dự báo bị bỏ qua" className="rounded-card bg-badge-blocked-bg px-5 py-4 font-body text-body-sm text-badge-blocked-text">
      {rejected.length > 0 ? <span><strong>{rejected.length} dự báo bị bộ kiểm đầu ra từ chối</strong> ({reasons.join('; ')}). </span> : null}
      {omitted.length > 0 ? <span><strong>{omitted.length} SKU chưa được dự báo</strong> vì thiếu lịch sử bán. </span> : null}
      <span>Các SKU này không có số dự báo, thay vì hiện một con số đoán.</span>
    </p>
  );
}

export function AIPage({ mode }: { mode: DemoMode }) {
  const [tab, setTab] = useState<AISectionTab>('recommendations');
  const [filters, setFilters] = useState<RecommendationFilters>(initialRecommendationFilters);
  const [horizon, setHorizon] = useState<number>(7);
  const [category, setCategory] = useState<string>('all');

  // Wrapped for the same reason as Reports: two shapes, one slot, discriminated by a key
  // rather than by a cast that could be wrong.
  // The registry is a separate request because it has to be answerable when the forecast is
  // not: with no provider configured there is no forecast, and that is exactly the state the
  // Models tab exists to explain.
  const features = useApiResource(
    (signal) => getAiFeatures(signal),
    () => Promise.resolve(undefined),
    mode,
  );

  const forecast = useApiResource<AiRecommendation, { items: ReturnType<typeof getRecommendations> extends Promise<infer T> ? T : never }>(
    (signal) => getAiRecommendations({
      horizon_days: horizon,
      ...(category === 'all' ? {} : { category }),
    }, signal),
    (currentMode) => getRecommendations(currentMode).then((items) => ({ items })),
    mode,
    [horizon, category],
  );

  const isApi = forecast.source === 'api';
  const live = isApi ? (forecast.value as AiRecommendation | null) : null;
  const fallbackValue = !isApi ? forecast.value as { items: Awaited<ReturnType<typeof getRecommendations>> } | null : null;
  const fixtureItems = fallbackValue?.items ?? null;
  const filtered = fixtureItems ? filterRecommendations(fixtureItems, { ...filters, query: filters.query }) : [];

  const categoryOptions = live?.category_options ?? [];
  const ready = live?.ready === true;

  return (
    <section className="mx-auto flex w-full max-w-[1240px] flex-col gap-7 py-8">
      <AIHeader />
      <AIGuardrail />
      <AISectionTabs value={tab} onChange={setTab} />

      {tab === 'recommendations' ? (
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Tầm nhìn dự báo">
              {horizons.map((option) => (
                <Button key={option} size="sm" variant={horizon === option ? 'primary' : 'secondary'} onClick={() => setHorizon(option)} disabled={!isApi}>
                  {option} ngày
                </Button>
              ))}
            </div>
            <label className="font-body text-body-sm text-graphite" htmlFor="ai-category">Nhóm</label>
            <select
              id="ai-category"
              className="rounded-control border border-line px-3 py-2 font-body text-body-sm"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              <option value="all">Tất cả nhóm</option>
              {(isApi ? categoryOptions : ['footwear', 'leather', 'apparel']).map((option) => (
                <option key={option} value={option}>{categoryLabel(option)}</option>
              ))}
            </select>
          </div>

          {/* The notice sits above the history on purpose. A reader who sees only the table
              would have no way to know the forecast half of this screen is missing. */}
          {isApi ? (ready ? (
            <p aria-label="Trạng thái dự báo" className="rounded-card bg-badge-progress-bg px-5 py-4 font-body text-body-sm text-badge-progress-text">
              <strong>Dự báo bởi {live?.provider} · {live?.model}{live?.model_version ? ` (${live.model_version})` : ''}</strong>
              <span> — cập nhật lúc {live?.generated_at.slice(0, 16).replace('T', ' ')}{live?.as_of ? `, dựa trên lịch sử đến hết ngày ${live.as_of}` : ''}.</span>
              {live?.fallback_from ? <span> Mô hình chính ({live.fallback_from}) không phản hồi nên đang dùng mô hình dự phòng.</span> : null}
              {live?.simulated_training_data ? <span> Mô hình này được huấn luyện trên dữ liệu mô phỏng.</span> : null}
            </p>
          ) : (
            <p aria-label="Trạng thái dự báo" className="rounded-card bg-badge-blocked-bg px-5 py-4 font-body text-body-sm text-badge-blocked-text">
              <strong>Không có dự báo.</strong>
              <span> Chưa có mô hình dự báo nào được kết nối, nên các con số bên dưới không phải dự đoán. Bảng bên dưới là nhu cầu đã ghi nhận trong {live?.window_days} ngày qua.</span>
            </p>
          )) : null}

          {forecast.loading ? <LoadingState label={isApi ? 'Đang tải nhu cầu bán hàng…' : 'Đang tải đề xuất…'} /> : null}
          {!forecast.loading && forecast.fixtureError ? <ErrorState error={forecast.fixtureError} retry={forecast.refresh} /> : null}
          {!forecast.loading && !forecast.fixtureError && !isApi ? (
            <>
              <AIMetricGrid />
              <RecommendationFiltersPanel filters={filters} onChange={setFilters} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="font-body text-body-sm text-graphite"><strong className="text-on-surface">{filtered.length}</strong> đề xuất phù hợp</p>
                {filtersActive(filters) ? <Button variant="ghost" size="sm" onClick={() => setFilters(initialRecommendationFilters)}>Đặt lại bộ lọc</Button> : null}
              </div>
              {fixtureItems && fixtureItems.length === 0 ? <EmptyState title="Chưa có khuyến nghị" detail="Hiện chưa có đề xuất nào." /> : null}
              {fixtureItems && fixtureItems.length > 0 && filtered.length === 0 ? <EmptyState title="Không có đề xuất phù hợp" detail="Thử đổi SKU, trạng thái hoặc loại gợi ý." /> : null}
              {filtered.length > 0 ? <RecommendationGrid items={filtered} onOpen={(id) => navigate(href({ name: 'ai-detail', id }))} /> : null}
            </>
          ) : null}
          {isApi && live ? (
            <div className="flex flex-col gap-7">
              <ObservedDemand observations={live.observations} windowDays={live.window_days} />
              {ready ? <ForecastGaps live={live} /> : null}
              {ready && live.forecasts.length > 0 ? <ForecastLedger forecasts={live.forecasts} /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
      {tab === 'models' ? (
        <ModelRegistry
          registry={features.source === 'api' ? features.value as AiFeatureRegistry | null : null}
          loading={features.loading}
          error={features.fixtureError}
          retry={features.refresh}
        />
      ) : null}
      {tab === 'sync-health' ? <SyncHealthPanel mode={mode} /> : null}
      {tab === 'failures' ? <AIFailureStates /> : null}
    </section>
  );
}

function filtersActive(filters: RecommendationFilters): boolean {
  return filters.query.trim() !== '' || filters.status !== 'all' || filters.kind !== 'all';
}