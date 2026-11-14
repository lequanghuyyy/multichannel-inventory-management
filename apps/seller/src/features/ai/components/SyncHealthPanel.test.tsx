import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiRequestError } from '../../../core/api-error';
import { SyncHealthPanel } from './SyncHealthPanel';

const { getAiSyncHealth } = vi.hoisted(() => ({ getAiSyncHealth: vi.fn() }));
vi.mock('../../../api/ai', () => ({ getAiSyncHealth }));

const score = (overrides: Record<string, unknown> = {}) => ({
  end: '2026-10-26T12:00:00Z', score: 0.4, over_threshold: false, alarm: false, explanation: [], ...overrides,
});

const channel = (overrides: Record<string, unknown> = {}) => ({
  code: 'shop-a', name: 'Shop A', type: 'simulator', environment: 'simulated', status: 'ok',
  active_windows: 12, idle_windows: 18, peak_score: 0.52, latest: score(), series: [score()], ...overrides,
});

const report = (overrides: Record<string, unknown> = {}) => ({
  ready: true, generated_at: '2026-10-26T12:00:00Z', minutes: 30, window_seconds: 60, model: 'octoflow-sync-health', version: 'sync-health/1.0.0',
  threshold: 0.68, simulated_training_data: true, channels: [channel()], ...overrides,
});

// Braces matter: mockReset() returns the mock, and vitest would run a function returned from beforeEach as teardown.
beforeEach(() => {
  getAiSyncHealth.mockReset();
});
afterEach(cleanup);

async function open() {
  render(<SyncHealthPanel mode="default" />);
  await waitFor(() => expect(getAiSyncHealth).toHaveBeenCalled());
}

describe('SyncHealthPanel', () => {
  it('says the model is not a probability and was trained on simulated logs', async () => {
    getAiSyncHealth.mockResolvedValue(report());
    await open();
    const notice = await screen.findByLabelText('Trạng thái giám sát');
    expect(notice).toHaveTextContent('octoflow-sync-health');
    expect(notice).toHaveTextContent('không phải xác suất');
    expect(notice).toHaveTextContent('nhật ký mô phỏng');
  });

  it('shows an alarmed channel with its main reasons in words, not feature codes', async () => {
    getAiSyncHealth.mockResolvedValue(report({
      channels: [channel({
        status: 'alarm', peak_score: 0.93,
        latest: score({ score: 0.93, over_threshold: true, alarm: true, explanation: [{ feature: 'fail_rate', value: 1 }, { feature: 'staleness_s', value: 900 }] }),
      })],
    }));
    await open();
    const table = await screen.findByRole('table', { name: 'Sức khoẻ đồng bộ theo kênh' });
    expect(within(table).getByText('Báo động')).toBeInTheDocument();
    expect(table).toHaveTextContent('tỉ lệ lỗi, thời gian từ lần đẩy thành công cuối');
    expect(table).toHaveTextContent('12/30');
    expect(table).not.toHaveTextContent('fail_rate');
  });

  it('does not score or call an idle channel healthy', async () => {
    getAiSyncHealth.mockResolvedValue(report({ channels: [channel({ status: 'idle', active_windows: 0, idle_windows: 30, peak_score: 0, latest: undefined, series: [] })] }));
    await open();
    const table = await screen.findByRole('table', { name: 'Sức khoẻ đồng bộ theo kênh' });
    expect(within(table).getByText('Không hoạt động')).toBeInTheDocument();
    expect(within(table).queryByText('Bình thường')).toBeNull();
    expect(table).toHaveTextContent('0/30');
  });

  it('says plainly when no monitor is configured instead of showing an all-clear', async () => {
    getAiSyncHealth.mockResolvedValue(report({ ready: false, reason: 'no_sync_monitor_configured', channels: [], model: undefined, threshold: undefined }));
    await open();
    const notice = await screen.findByLabelText('Trạng thái giám sát');
    expect(notice).toHaveTextContent('Chưa có giám sát');
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('shows an error, not an empty all-clear, when the monitor fails', async () => {
    getAiSyncHealth.mockRejectedValue(new ApiRequestError({ code: 'AI_PROVIDER_FAILED', message: 'The sync health monitor could not be reached', request_id: 'r1' }, 502));
    await open();
    expect(await screen.findByRole('button', { name: 'Thử lại' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Trạng thái giám sát')).toBeNull();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('asks for the window the user picked', async () => {
    getAiSyncHealth.mockResolvedValue(report());
    await open();
    fireEvent.click(await screen.findByRole('button', { name: '120 phút' }));
    await waitFor(() => expect(getAiSyncHealth).toHaveBeenLastCalledWith(120, expect.anything()));
  });
});
