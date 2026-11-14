import { expect, test } from '@playwright/test';

// Integration test: NO route.fulfill for the success path. The same Go/Postgres
// services used by the real page must answer, both directly and through Nginx.
test('foundation shows actual API and database state, not fake inventory', async ({ page, request }, info) => {
  const ready = await request.get('/health/ready');
  expect(ready.status()).toBe(200);
  expect(ready.headers()['x-request-id']).toBeTruthy();
  expect(await ready.json()).toMatchObject({ status: 'ready', database: 'up' });
  const system = await request.get('/api/v1/system');
  expect(system.status()).toBe(200);
  const metadata: unknown = await system.json();
  expect(metadata).toMatchObject({ inventory_ready: false, inventory_read_available: true, inventory_write_available: true });
  expect(metadata).toMatchObject({ version: expect.any(String) });
  const version = (metadata as { version: string }).version;

  const actualReady = page.waitForResponse(response => new URL(response.url()).pathname === '/health/ready' && response.status() === 200);
  await page.goto('/');
  expect((await actualReady).headers()['x-request-id']).toBeTruthy();
  await expect(page.getByRole('heading', { name: 'Không gian bán hàng', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backend và database đã kết nối' })).toBeVisible();
  await expect(page.getByText(version, { exact: true })).toBeVisible();
  await expect(page.getByText(/^Kiểm tra lúc /)).toBeVisible();
  await expect(page.getByText('Không hiển thị dữ liệu kết nối giả', { exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  const recheck = page.waitForResponse(response => new URL(response.url()).pathname === '/health/ready' && response.status() === 200);
  await page.getByRole('button', { name: 'Kiểm tra lại', exact: false }).click();
  await recheck;
  await expect(page.getByRole('heading', { name: 'Backend và database đã kết nối' })).toBeVisible();
  await page.screenshot({ path: info.outputPath('foundation-real-api.png'), fullPage: true });
});

test('connection errors replace an earlier real successful status', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Backend và database đã kết nối' })).toBeVisible();
  // Fault injection is explicit in this negative test only.
  await page.route('**/health/ready', route => route.abort());
  await page.getByRole('button', { name: 'Kiểm tra lại', exact: false }).click();
  await expect(page.getByText('Chưa kết nối được backend.', { exact: false })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backend và database đã kết nối' })).toHaveCount(0);
});
