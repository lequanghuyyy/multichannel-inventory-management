import { expect, test } from '@playwright/test';

test('product detail keeps variants and mappings responsive', async ({ page }, testInfo) => {
  // A real product id from the seeded catalogue. The prototype's own product id does not
  // exist in this database, and asserting against it would have kept a dead screen green.
  await page.goto('/products/10000000-0000-4000-8000-000000000001');

  await expect(page.getByLabel('Trạng thái dữ liệu')).toContainText('Dữ liệu thật');
  await expect(page.getByRole('heading', { name: 'Running Shoe 001' })).toBeVisible();
  await expect(page.locator('code:visible', { hasText: 'SHOE-001' }).first()).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The lifecycle control is the only writer of is_active, so its presence is the evidence
  // that the write route is actually reachable from this screen.
  const lifecycle = page.getByLabel('Vòng đời sản phẩm');
  await expect(lifecycle).toBeVisible();
  await expect(lifecycle).toContainText('Trạng thái hiện tại');

  if (testInfo.project.name === 'mobile-390x844') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});

test('product detail copies the canonical SKU and keeps inventory navigation real', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/products/10000000-0000-4000-8000-000000000001');
  await expect(page.getByText('Dữ liệu thật')).toBeVisible();
  const copy = page.getByRole('button', { name: 'Sao chép SHOE-001-BLK-42' });
  await copy.click();
  await expect(page.getByText('Đã sao chép SHOE-001-BLK-42')).toBeVisible();
  await page.getByRole('button', { name: 'Tra cứu tồn' }).first().click();
  await expect(page).toHaveURL(/\/inventory\?sku=SHOE-001-BLK-42$/);
});
