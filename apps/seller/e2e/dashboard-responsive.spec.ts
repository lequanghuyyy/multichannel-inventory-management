import { expect, test } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.route('**/health/live', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ok', service: 'datt-api', version: '0.1.0' }),
  }));
  await page.route('**/health/ready', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ status: 'ready', service: 'datt-api', version: '0.1.0', database: 'up' }),
  }));
  await page.route('**/api/v1/system', route => route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({
      service: 'datt-api',
      version: '0.1.0',
      stage: 'foundation',
      inventory_ready: true,
      marketplace_connected: false,
      ai_ready: false,
    }),
  }));
});

test('dashboard remains usable without document overflow', async ({ page }) => {
  await page.goto('/');

  await expect(page.getByRole('heading', { name: 'Không gian bán hàng' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Backend và database đã kết nối' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tổng quan bán hàng theo kênh' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Cần chú ý' })).toBeVisible();
  await expect(page.getByLabel('Phạm vi dữ liệu Dashboard')).toContainText('dữ liệu trình diễn');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
