import { expect, test } from '@playwright/test';

test('product catalog remains usable without document overflow', async ({ page }, testInfo) => {
  await page.goto('/products');

  await expect(page.getByRole('heading', { name: 'Quản lý sản phẩm' })).toBeVisible();
  // The list now reads GET /api/v1/products; the old Apex fixture name belongs only to detail.
  await expect(page.locator('strong:visible', { hasText: 'Running Shoe 001' }).first()).toBeVisible();
  await expect(page.getByText('Product catalog từ Go API')).toBeVisible();
  await expect(page.getByLabel('Tìm kiếm catalog')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  if (testInfo.project.name === 'mobile-390x844') {
    await expect(page.getByRole('table')).toBeHidden();
    await expect(page.getByRole('button', { name: 'Xem dạng lưới' })).toBeHidden();
  } else {
    await expect(page.getByRole('table')).toBeVisible();
  }
});

test('product search is handled by the live catalogue API and reset restores the list', async ({ page }) => {
  await page.goto('/products');
  await expect(page.getByText('Dữ liệu thật')).toBeVisible();
  const search = page.getByLabel('Tìm kiếm catalog');
  await search.fill('Running');
  await expect(page.locator('strong:visible', { hasText: 'Running Shoe 001' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Đặt lại' }).click();
  await expect(search).toHaveValue('');
});
