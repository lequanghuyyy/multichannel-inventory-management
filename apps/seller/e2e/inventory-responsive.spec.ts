import { expect, test } from '@playwright/test';

test('inventory management keeps its ledger usable across viewports', async ({ page }, testInfo) => {
  await page.goto('/inventory');

  await expect(page.getByRole('heading', { name: 'Quản lý tồn kho' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Inventory Allocation Engine' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Canonical inventory ledger' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Canonical SKU snapshot inspector' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByLabel('Tìm kiếm ledger').fill('WLT-ZIP-TAN-01');
  // Compose has a real inventory list: filtering must keep the matching canonical SKU,
  // not claim that the API result is a prototype fixture.
  await expect(page.getByText('1 variant phù hợp')).toBeVisible();
  await expect(page.getByText(/variant từ Go API/)).toBeVisible();
  await expect(page.locator('code:visible', { hasText: 'WLT-ZIP-TAN-01' }).first()).toBeVisible();

  if (testInfo.project.name === 'mobile-390x844') {
    await expect(page.getByRole('table')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Snapshot API' }).first()).toBeVisible();
  } else {
    await expect(page.getByRole('table')).toBeVisible();
  }
});
