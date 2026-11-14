import { expect, test } from '@playwright/test';

test('WooCommerce remains a distinct website channel and exposes only a safe ADMIN action', async ({ page }) => {
  await page.goto('/channels');
  await expect(page.getByRole('heading', { name: 'Kênh bán', exact: true })).toBeVisible();
  await expect(page.getByLabel('Chỉ số kênh bán từ Go API')).toBeVisible();

  const wooAction = page.getByRole('button', { name: /WooCommerce/ }).first();
  await expect(wooAction).toBeVisible();
  await expect(page.getByText(/Consumer Secret|Webhook Secret|consumer_secret|webhook_secret/i)).toHaveCount(0);
  await expect(page.getByText(/marketplace sandbox/i)).toHaveCount(0);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
