import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../core/api-error';
import { AIPage } from './AIPage';

const { getAiRecommendations, getAiFeatures } = vi.hoisted(() => ({
  getAiRecommendations: vi.fn(),
  getAiFeatures: vi.fn(),
}));
vi.mock('../../api/ai', () => ({ getAiRecommendations, getAiFeatures }));

// Default is the unreachable API. A bare vi.fn() RESOLVES undefined, which would look to
// the hook like a successful live response and blank the screen instead of falling back.
beforeEach(() => {
  getAiRecommendations.mockRejectedValue(new Error('Không kết nối được dịch vụ dự báo (HTTP 0).'));
  // The registry reads configuration, so it answers even when the database and the forecast
  // provider are both absent. Defaulting it to a rejection would test nothing.
  getAiFeatures.mockResolvedValue({
    source: 'process-environment',
    features: [
      { key: 'demand_forecast', label: 'Dự báo nhu cầu', provider: '', model: '', ready: false, reason: 'no_ai_provider_configured', candidates: [] },
      { key: 'replenishment', label: 'Gợi ý bổ sung tồn', provider: '', model: '', ready: false, reason: 'no_ai_provider_configured', candidates: [] },
      { key: 'price_review', label: 'Rà soát giá', provider: '', model: '', ready: false, reason: 'no_ai_provider_configured', candidates: [] },
    ],
  });
});

afterEach(() => {
  cleanup();
  window.history.replaceState({}, '', '/ai');
});

async function renderAI() {
  render(<AIPage mode="default" />);
  await waitFor(() => expect(screen.getByLabelText('Danh sách đề xuất AI')).toBeInTheDocument(), { timeout: 3000 });
}

describe('AIPage', () => {
  it('renders guarded recommendation fixtures without executable actions', async () => {
    await renderAI();
    expect(screen.getByLabelText('Chỉ số AI')).toHaveTextContent('Chưa triển khai');
    expect(screen.getByText('Rà soát tồn đệm an toàn')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Chính sách AI' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Công thức tính số lượng có thể bán' })).toBeInTheDocument();
  });

  it('filters recommendations by scope and status', async () => {
    await renderAI();
    fireEvent.change(screen.getByLabelText('Tìm đề xuất'), { target: { value: 'SHOPEE-01' } });
    await waitFor(() => expect(screen.getByLabelText('Danh sách đề xuất AI')).toHaveTextContent('Giám sát đồng bộ'));
    expect(screen.getByLabelText('Danh sách đề xuất AI')).not.toHaveTextContent('Rà soát tồn đệm an toàn');
    fireEvent.change(screen.getByLabelText('Trạng thái xem xét'), { target: { value: 'stable' } });
    expect(screen.getByRole('heading', { name: 'Không có đề xuất phù hợp' })).toBeInTheDocument();
  });

  it('switches to the model registry, which reads the API', async () => {
    await renderAI();
    fireEvent.click(screen.getByRole('tab', { name: 'Mô hình (4)' }));
    // The registry is no longer a fixture table of invented model names: it is
    // GET /api/v1/ai/features, and with nothing configured it says so instead of offering a
    // dropdown of models the backend would never call.
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mô hình theo từng tính năng' })).toBeInTheDocument());
    // No "cấu hình mô hình" control: choosing a model is a server-side environment change, and
    // a button that could only ever be disabled teaches the reader the feature is half-built.
    expect(screen.queryByRole('button', { name: 'Cấu hình mô hình' })).toBeNull();
    // Three features, so three badges — one per capability, not one summary line that could
    // hide a single misconfigured slot.
    expect(screen.getAllByText('Chưa kết nối')).toHaveLength(3);
    fireEvent.click(screen.getByRole('tab', { name: 'Dự phòng & giới hạn' }));
    expect(screen.getByRole('heading', { name: 'AI không tự thay đổi tồn kho' })).toBeInTheDocument();
  });

  it('opens the existing recommendation detail route', async () => {
    await renderAI();
    fireEvent.click(screen.getAllByRole('button', { name: 'Xem chi tiết' })[0]!);
    expect(window.location.pathname).toBe('/ai/40000000-0000-4000-8000-000000000001');
  });

  it('keeps explicit empty and error states', async () => {
    const { unmount } = render(<AIPage mode="empty" />);
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Chưa có khuyến nghị' })).toBeInTheDocument());
    unmount();
    render(<AIPage mode="error" />);
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Không thể tải dữ liệu'));
  });
});

// ---------------------------------------------------------------------------
// Live API mode.
//
// The single most important assertion in this file is that a missing provider produces an
// ABSENCE, not a number. A forecast that invents itself is worse than no forecast: it looks
// like evidence and gets stock reordered against it.
// ---------------------------------------------------------------------------

const observation = (overrides: Record<string, unknown> = {}) => ({
  variant_id: '20000000-0000-4000-8000-000000000001',
  sku: 'SHOE-001-BLK-41',
  category: 'footwear',
  on_hand: 12,
  reserved: 2,
  safety_buffer: 2,
  units_sold: 9,
  priced_lines: 7,
  ...overrides,
});

const live = (overrides: Record<string, unknown> = {}) =>
  getAiRecommendations.mockResolvedValue({
    horizon_days: 7,
    window_days: 28,
    provider: '',
    model: '',
    ready: false,
    reason: 'no_ai_provider_configured',
    generated_at: '2026-10-13T02:00:00Z',
    source: 'core-database',
    category_options: ['footwear', 'leather'],
    observations: [observation()],
    forecasts: [],
    ...overrides,
  });

describe('AIPage · live API', () => {
  it('says plainly that there is no forecast and names the reason', async () => {
    live();
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    const notice = screen.getByLabelText('Trạng thái dự báo');
    expect(notice).toHaveTextContent('Không có dự báo');
    // Naming the cause is the difference between a screen that is broken and a screen that
    // is telling the truth about a deployment with no credentials.
    expect(notice).toHaveTextContent('Chưa có mô hình dự báo nào được kết nối');
  });

  it('shows no forecast table at all when ready is false', async () => {
    live();
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    expect(screen.queryByLabelText('Dự báo của mô hình')).toBeNull();
    expect(screen.queryByText(/Dự báo của mô hình/)).toBeNull();
  });

  it('labels the history as observed rather than letting it read as a prediction', async () => {
    live();
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    const table = screen.getByLabelText('Nhu cầu bán hàng gần đây');
    expect(table).toHaveTextContent('SHOE-001-BLK-41');
    expect(table).toHaveTextContent('9');   // units sold
    expect(table).toHaveTextContent('8');   // on_hand - reserved - buffer
    expect(screen.getByRole('heading', { name: /Nhu cầu bán hàng · 28 ngày gần nhất/ })).toBeInTheDocument();
    expect(screen.getByText(/Đây là số liệu đã ghi nhận, không phải dự báo/)).toBeInTheDocument();
  });

  it('never fills a missing category by reading the SKU', async () => {
    live({ observations: [observation({ sku: 'SHOE-999', category: '' })] });
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    const table = screen.getByLabelText('Nhu cầu bán hàng gần đây');
    expect(table).toHaveTextContent('SHOE-999');
    // The cell is an em dash, not "Giày dép" guessed from a code that happens to start with
    // SHOE. That inference is the one the whole core refuses to make.
    expect(within(table).getByText('—')).toBeInTheDocument();
    expect(table).not.toHaveTextContent('Giày dép');
  });

  it('renders the provider forecast with its interval once one exists', async () => {
    live({
      ready: true,
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      reason: undefined,
      forecasts: [{
        variant_id: '20000000-0000-4000-8000-000000000001',
        sku: 'SHOE-001-BLK-41',
        horizon_days: 7,
        expected_units: 11,
        lower_units: 7,
        upper_units: 16,
        confidence: 0.42,
        rationale: '28-day history, no promotion',
      }],
    });
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    expect(screen.getByLabelText('Trạng thái dự báo')).toHaveTextContent('gpt-4o-mini');
    const table = screen.getByLabelText('Dự báo của mô hình');
    expect(table).toHaveTextContent('11');
    expect(table).toHaveTextContent('16');
    expect(table).toHaveTextContent('42%');
    expect(table).toHaveTextContent('28-day history, no promotion');
    expect(screen.queryByText('Không có dự báo.')).toBeNull();
  });

  it('shows the method, the 95% level and a disabled-by-default buffer for a local-service forecast', async () => {
    live({
      ready: true,
      provider: 'octoflow-local',
      model: 'octoflow-shop-forecast',
      model_version: 'shop-3399a44d',
      as_of: '2026-10-25',
      simulated_training_data: false,
      reason: undefined,
      forecasts: [{
        variant_id: '20000000-0000-4000-8000-000000000001',
        sku: 'SHOE-001-BLK-41',
        horizon_days: 7,
        expected_units: 14,
        lower_units: 8,
        upper_units: 20,
        confidence: 0.8,
        rationale: 'Bán 40 sp trong 28 ngày',
        method: 'lstm',
        q95_units: 26,
        buffer_suggestion: { units: 0, cap_units: 8, source: 'disabled', reason: 'EX03', valid_until: '2026-10-26T13:00:00Z' },
      }],
      rejected: [],
      omitted: [],
    });
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    expect(screen.getByLabelText('Trạng thái dự báo')).toHaveTextContent('shop-3399a44d');
    expect(screen.getByLabelText('Trạng thái dự báo')).toHaveTextContent('đến hết ngày 2026-10-25');
    const table = screen.getByLabelText('Dự báo của mô hình');
    expect(table).toHaveTextContent('LSTM nhỏ');
    expect(table).toHaveTextContent('Mức 95%');
    expect(table).toHaveTextContent('26');
    expect(table).toHaveTextContent('Khoảng 80%');
    expect(table).toHaveTextContent('0 (tắt)');
    expect(screen.queryByLabelText('Dự báo bị bỏ qua')).toBeNull();
  });

  it('says when a fallback model answered and when rows were refused or left out', async () => {
    live({
      ready: true,
      provider: 'openai-compatible',
      model: 'gpt-4o-mini',
      fallback_from: 'octoflow-local',
      simulated_training_data: true,
      reason: undefined,
      forecasts: [],
      rejected: [{ sku: 'SHOE-001-BLK-41', reason: 'implausibly_high' }],
      omitted: [{ sku: 'NEW-1', reason: 'insufficient_history' }, { sku: 'NEW-2', reason: 'insufficient_history' }],
    });
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    const notice = screen.getByLabelText('Trạng thái dự báo');
    expect(notice).toHaveTextContent('Mô hình chính (octoflow-local) không phản hồi');
    expect(notice).toHaveTextContent('dữ liệu mô phỏng');
    const gaps = screen.getByLabelText('Dự báo bị bỏ qua');
    expect(gaps).toHaveTextContent('1 dự báo bị bộ kiểm đầu ra từ chối');
    expect(gaps).toHaveTextContent('cao bất thường so với lịch sử bán');
    expect(gaps).toHaveTextContent('2 SKU chưa được dự báo');
  });

  it('falls back to the fixture baseline when the provider fails', async () => {
    getAiRecommendations.mockRejectedValue(new ApiRequestError(
      { code: 'AI_PROVIDER_FAILED', message: 'The forecast provider could not be reached', request_id: 'req-2' }, 502,
    ));
    render(<AIPage mode="default" />);
    // A 5xx is a transport failure, so the fixture baseline answers rather than the forecast.
    // What must not happen is the fixture being presented AS a forecast: the live notice
    // stays absent, because no forecast was read.
    await waitFor(() => expect(screen.getByLabelText('Danh sách đề xuất AI')).toBeInTheDocument());
    expect(screen.queryByLabelText('Trạng thái dự báo')).toBeNull();
  });

  it('asks for the horizon and category the screen is showing', async () => {
    live();
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: '30 ngày' }));
    await waitFor(() => expect(getAiRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ horizon_days: 30 }), expect.anything(),
    ));
    fireEvent.change(screen.getByLabelText('Nhóm'), { target: { value: 'leather' } });
    await waitFor(() => expect(getAiRecommendations).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'leather' }), expect.anything(),
    ));
  });

  it('offers only the categories the catalogue actually holds', async () => {
    live();
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    const select = screen.getByLabelText('Nhóm') as HTMLSelectElement;
    expect([...select.options].map((option) => option.value)).toEqual(['all', 'footwear', 'leather']);
  });
});

describe('AIPage · per-feature model registry', () => {
  it('offers no choice for a feature with no configured provider', async () => {
    live();
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Mô hình/i }));
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Mô hình theo từng tính năng' })).toBeInTheDocument());
    expect(screen.getAllByText('Chưa kết nối').length).toBeGreaterThan(0);
    // A dropdown of models the backend would never call is the failure this replaces: it looks
    // configured and tells the reader nothing about whether the model answers.
    expect(screen.queryByRole('combobox')).toBeNull();
    expect(screen.queryByText(/Xem \d+ mô hình có thể dùng/)).toBeNull();
  });

  it('lists only the models the deployment can actually call', async () => {
    live();
    getAiFeatures.mockResolvedValue({
      source: 'process-environment',
      features: [{
        key: 'demand_forecast', label: 'Dự báo nhu cầu',
        provider: 'openai-compatible', model: 'forecast-model',
        ready: true, candidates: ['alpha-model', 'zeta-model'],
      }],
    });
    render(<AIPage mode="default" />);
    await waitFor(() => expect(screen.getByLabelText('Trạng thái dự báo')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('tab', { name: /Mô hình/i }));
    await waitFor(() => expect(screen.getByText('forecast-model')).toBeInTheDocument());
    fireEvent.click(screen.getByRole('button', { name: 'Xem 2 mô hình có thể dùng' }));
    expect(screen.getByText('alpha-model')).toBeInTheDocument();
    expect(screen.getByText('zeta-model')).toBeInTheDocument();
    // Stated rather than implied: the choice is server configuration, not a session setting.
    expect(screen.getByText('Việc đổi mô hình do quản trị hệ thống thực hiện, không đổi được tại đây.')).toBeInTheDocument();
  });
});
