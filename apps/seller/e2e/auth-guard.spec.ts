import { expect, test } from '@playwright/test';

// The other E2E cases use a real authenticated cookie from global setup.
// This case deliberately starts with NO cookie to keep the security guard tested.
test.use({ storageState: { cookies: [], origins: [] } });

test('anonymous visitors are redirected to login, not shown seller screens', async ({ page }) => {
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeVisible();
  await expect(page).toHaveURL(/\/login\?next=%2Finventory$/);
  await expect(page.getByRole('heading', { name: 'Quản lý tồn kho' })).toHaveCount(0);
});
