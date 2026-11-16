import { expect, request, test, type APIRequestContext } from '@playwright/test';

type Snapshot = {
  sku: string;
  on_hand: number;
  reserved: number;
  safety_buffer: number;
  available_to_sell: number;
  version: number;
};

test('admin retry shows the backend terminal result without changing the committed stock snapshot', async ({ page }, testInfo) => {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5174';
  const api: APIRequestContext = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: new URL(baseURL).origin },
  });
  let csrfToken = '';
  const sku = 'SHOE-001-BLK-42';
  try {
    const login = await api.post('/api/v1/auth/login', {
      data: { email: process.env.E2E_AUTH_EMAIL, password: process.env.E2E_AUTH_PASSWORD },
    });
    expect(login.status(), await login.text()).toBe(200);
    const session = await login.json() as { csrf_token: string };
    csrfToken = session.csrf_token;

    const fault = await api.post('/api/v1/channels/simulator/fault', {
      headers: { 'X-CSRF-Token': csrfToken },
      data: { mode: 'refuse', refuse_next: 1, message: 'E2E injected channel refusal', variant_sku: sku },
    });
    expect(fault.status(), await fault.text()).toBe(200);

    const adjustment = await api.post('/api/v1/inventory/adjust', {
      headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': `e2e-retry-${Date.now()}-${testInfo.project.name.replace(/[^A-Za-z0-9._:-]/g, '-')}` },
      data: { sku, delta: 1, reason: 'Playwright retry acceptance business operation' },
    });
    expect(adjustment.status(), await adjustment.text()).toBe(200);
    const committed = await adjustment.json() as Snapshot;

    let failedEvent: { event_id: string; last_error?: string } | undefined;
    let failedJob: { event_id: string; channel_code: string; sku: string; status: string; last_error?: string } | undefined;
    await expect.poll(async () => {
      const jobsResponse = await api.get('/api/v1/sync-jobs?limit=100&status=dead');
      if (!jobsResponse.ok()) return false;
      const jobs = await jobsResponse.json() as { jobs: Array<{ event_id: string; channel_code: string; sku: string; status: string; last_error?: string }> };
      failedJob = jobs.jobs.find((job) => job.sku === sku && job.status === 'dead');
      if (!failedJob?.event_id) return false;
      const eventsResponse = await api.get('/api/v1/sync-events?limit=100&errors_only=true');
      if (!eventsResponse.ok()) return false;
      const events = await eventsResponse.json() as { events: Array<{ event_id: string; sku: string; last_error?: string }> };
      failedEvent = events.events.find((event) => event.event_id === failedJob!.event_id && event.sku === sku);
      return Boolean(failedEvent);
    }, { timeout: 30_000 }).toBe(true);

    expect(failedEvent!.last_error).toContain('E2E injected channel refusal');
    await page.goto('/sync');
    await page.getByRole('tab', { name: /Lỗi/ }).click();
    const errorLedger = page.getByRole('table', { name: 'Lịch sử gửi sự kiện tới kênh bán' });
    const errorRow = errorLedger.getByRole('row').filter({ hasText: failedEvent!.event_id });
    await expect(errorRow).toContainText('E2E injected channel refusal');
    await expect(errorRow).toContainText(sku);
    await errorRow.getByRole('checkbox', { name: `Chọn ${failedJob!.channel_code} ${failedEvent!.event_id}` }).check();
    await page.getByRole('button', { name: /Thử lại mục đã chọn/ }).click();
    await page.getByLabel('Lý do vận hành').fill('Đã khắc phục lỗi channel trong E2E');
    await page.getByRole('button', { name: 'Xác nhận xếp hàng' }).click();

    await expect(page.getByLabel('Kết quả thử lại')).toContainText('Đã xếp hàng; đang chờ channel xác nhận');
    await expect(page.getByLabel('Kết quả thử lại')).toContainText('Backend xác nhận việc gửi đã khôi phục', { timeout: 30_000 });

    const historyResponse = await api.get(`/api/v1/sync-events/${failedEvent!.event_id}/retry-history`);
    expect(historyResponse.ok(), await historyResponse.text()).toBe(true);
    const history = await historyResponse.json() as { attempts: Array<{ kind: string; status: string; reason?: string }> };
    expect(history.attempts.some((entry) => entry.kind === 'manual_request' && entry.status === 'recovered' && entry.reason === 'Đã khắc phục lỗi channel trong E2E')).toBe(true);

    const snapshotResponse = await api.get(`/api/v1/inventory/${sku}`);
    expect(snapshotResponse.ok(), await snapshotResponse.text()).toBe(true);
    const afterRetry = await snapshotResponse.json() as Snapshot;
    expect({
      on_hand: afterRetry.on_hand,
      reserved: afterRetry.reserved,
      safety_buffer: afterRetry.safety_buffer,
      available_to_sell: afterRetry.available_to_sell,
      version: afterRetry.version,
    }).toEqual({
      on_hand: committed.on_hand,
      reserved: committed.reserved,
      safety_buffer: committed.safety_buffer,
      available_to_sell: committed.available_to_sell,
      version: committed.version,
    });
  } finally {
    if (csrfToken) {
      await api.post('/api/v1/channels/simulator/fault', {
        headers: { 'X-CSRF-Token': csrfToken },
        data: { mode: 'refuse', refuse_next: 0 },
      }).catch(() => undefined);
      await api.post('/api/v1/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } }).catch(() => undefined);
    }
    await api.dispose();
  }
});
