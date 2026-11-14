import { expect, request, test, type APIRequestContext } from '@playwright/test';

type Snapshot = {
  sku: string;
  on_hand: number;
  reserved: number;
  safety_buffer: number;
  available_to_sell: number;
  version: number;
};

async function createInventoryEvent(api: APIRequestContext, sku: string, key: string, csrfToken: string) {
  const response = await api.post('/api/v1/inventory/adjust', {
    headers: { 'X-CSRF-Token': csrfToken, 'Idempotency-Key': key },
    data: { sku, delta: 1, reason: 'Playwright sync snapshot acceptance' },
  });
  expect(response.status(), await response.text()).toBe(200);
  return response.json() as Promise<Snapshot>;
}

test('sync reconnect and inventory render the committed API snapshot at desktop and mobile widths', async ({ page }, testInfo) => {
  const baseURL = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
  const api = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: new URL(baseURL).origin },
  });
  let csrfToken = '';
  try {
    const login = await api.post('/api/v1/auth/login', {
      data: { email: process.env.E2E_AUTH_EMAIL, password: process.env.E2E_AUTH_PASSWORD },
    });
    expect(login.status(), await login.text()).toBe(200);
    const session = await login.json() as { csrf_token: string };
    expect(session.csrf_token).toBeTruthy();
    csrfToken = session.csrf_token;

    const sku = 'SHOE-001-BLK-42';
    const key = `e2e-sync-${Date.now()}-${testInfo.project.name.replace(/[^A-Za-z0-9._:-]/g, '-')}`;

    // Disconnect the browser's notification stream while a real PostgreSQL transaction commits.
    // The app must recover by reading the committed snapshot after the stream reconnects.
    let streamAborted = false;
    await page.route('**/api/v1/sync/stream*', async (route) => {
      streamAborted = true;
      await route.abort('connectionreset');
    });
    await page.goto('/sync');
    await expect(page.getByRole('heading', { name: 'Đồng bộ' })).toBeVisible();
    await expect.poll(() => streamAborted, { timeout: 10_000 }).toBe(true);

    const committed = await createInventoryEvent(api, sku, key, csrfToken);
    const snapshotResponse = await api.get(`/api/v1/inventory/${sku}`);
    expect(snapshotResponse.status(), await snapshotResponse.text()).toBe(200);
    const snapshot = await snapshotResponse.json() as Snapshot;
    expect(snapshot.version).toBe(committed.version);
    expect(snapshot.on_hand).toBe(committed.on_hand);

    const eventsResponse = await api.get('/api/v1/sync-events?limit=100');
    expect(eventsResponse.ok(), await eventsResponse.text()).toBe(true);
    const eventList = await eventsResponse.json() as { events: Array<{ sku: string; version: number; event_id: string }> };
    const event = eventList.events.find((item) => item.sku === sku && item.version === snapshot.version);
    expect(event, 'the committed outbox event is visible through the API').toBeTruthy();

    await page.unroute('**/api/v1/sync/stream*');
    const ledger = page.getByRole('table', { name: 'Nhật ký thay đổi tồn kho' });
    await expect(ledger).toContainText(sku, { timeout: 30_000 });
    await expect(ledger).toContainText(`phiên bản ${snapshot.version}`, { timeout: 30_000 });
    await expect(page.getByRole('button', { name: `Tra sự kiện ${sku} ${event!.event_id}` })).toBeVisible();

    await page.goto('/inventory');
    const inventoryRow = testInfo.project.name.startsWith('mobile')
      ? page.locator('article').filter({ hasText: sku })
      : page.getByRole('table', { name: 'Danh sách tồn kho theo SKU' }).getByRole('row').filter({ hasText: sku });
    await expect(inventoryRow).toContainText(String(snapshot.on_hand));
    await expect(inventoryRow).toContainText(String(snapshot.available_to_sell));

    const channelsResponse = await api.get('/api/v1/channels?limit=100');
    expect(channelsResponse.ok(), await channelsResponse.text()).toBe(true);
    const channelList = await channelsResponse.json() as { channels: Array<{ id: string; code: string }> };
    let channel: { id: string; code: string } | undefined;
    for (const candidate of channelList.channels) {
      const mappingsResponse = await api.get(`/api/v1/channels/${candidate.id}/mappings?limit=100`);
      expect(mappingsResponse.ok(), await mappingsResponse.text()).toBe(true);
      const mappingList = await mappingsResponse.json() as { mappings: Array<{ canonical_sku: string }> };
      if (mappingList.mappings.some((mapping) => mapping.canonical_sku === sku)) {
        channel = candidate;
        break;
      }
    }
    expect(channel, `seeded channel mapping exists for ${sku}`).toBeTruthy();

    await expect.poll(async () => {
      const response = await api.get(`/api/v1/channels/${channel!.id}/mappings?limit=100`);
      if (!response.ok()) return false;
      const result = await response.json() as { mappings: Array<{ canonical_sku: string; pushed_version: number }> };
      return result.mappings.some((mapping) => mapping.canonical_sku === sku && mapping.pushed_version === snapshot.version);
    }, { timeout: 30_000 }).toBe(true);

    await page.goto('/channels');
    await expect(page.getByRole('heading', { name: 'Kênh bán', exact: true })).toBeVisible();
    const channelRow = page.getByRole('table', { name: 'Danh sách kênh bán' }).getByRole('row').filter({ hasText: channel!.code });
    await expect(channelRow).toContainText(channel!.code);
    await page.goto(`/channels/${channel!.id}`);
    const mappingRow = page.getByRole('table', { name: 'Đối soát tồn kho giữa hệ thống và kênh bán' }).getByRole('row').filter({ hasText: sku });
    await expect(mappingRow).toContainText(`${snapshot.version} / ${snapshot.version}`);

    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  } finally {
    if (csrfToken) await api.post('/api/v1/auth/logout', { headers: { 'X-CSRF-Token': csrfToken } }).catch(() => undefined);
    await api.dispose();
  }
});
