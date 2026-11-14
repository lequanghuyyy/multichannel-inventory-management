import { expect, test } from '@playwright/test';

test('inventory detail preserves source boundaries and responsive layout', async ({ page }, testInfo) => {
  await page.goto('/inventory/SHOE-001-BLK-42');

  await expect(page.getByRole('heading', { name: 'Pro Lightweight Runner 001' })).toBeVisible();
  await expect(page.getByLabel('Stock snapshot')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Nhật ký thay đổi tồn kho' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Channel inventory' })).toBeVisible();
  await expect(page.getByText('PostgreSQL row locking', { exact: false })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Điều chỉnh tồn' })).toBeEnabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The timeline was rewired to the real adjustment endpoint. Neither a desktop table
  // nor a mobile card may silently present a fictional order as an audited movement.
  await expect(page.getByText('Adjustment history đọc từ backend, newest first.')).toBeVisible();
  await expect(page.getByText('Order #ORD-8921')).toHaveCount(0);
  if (testInfo.project.name === 'mobile-390x844') {
    await expect(page.getByText('SKU này chưa có biến động tồn kho.').or(page.getByText(/Hiển thị \d+ adjustment từ server/))).toBeVisible();
  }
});
