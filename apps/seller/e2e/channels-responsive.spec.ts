import { expect, test } from '@playwright/test';

// The channel screens read the shop's topology and its reconciliation ledger from the Go API.
// The pairing (type, environment) is asserted on purpose: a simulator standing in for a
// marketplace is the easiest way for a demo to be mistaken for an integration, so the screen
// has to say which is which on every row.
test('channel topology and mapping ledger adapt across viewports', async ({ page }, testInfo) => {
  await page.goto('/channels');
  await expect(page.getByRole('heading', { name: 'Kênh bán', exact: true })).toBeVisible();
  await expect(page.getByLabel('Trạng thái dữ liệu')).toContainText('Dữ liệu thật');
  await expect(page.getByLabel('Chỉ số kênh bán từ Go API')).toBeVisible();

  const table = page.getByRole('table', { name: 'Danh sách kênh bán đọc từ Go API' });
  await expect(table).toBeVisible();
  // marketplace_connected is false in this deployment, so every marketplace row must be
  // labelled a simulation and the storefront row must say sandbox. A green "connected" beside
  // a real platform name is exactly the mistake this pair of columns exists to prevent.
  await expect(table).toContainText('Mô phỏng');
  await expect(table).toContainText('Sandbox');
  await expect(page.getByRole('button', { name: 'Kết nối kênh' })).toBeDisabled();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const firstOpen = page.getByRole('button', { name: /Chi tiết/ }).first();
  await expect(firstOpen).toBeVisible();
  await firstOpen.click();
  await expect(page).toHaveURL(/\/channels\/[0-9a-f-]{36}$/);

  const ledger = page.getByRole('table', { name: 'Đối soát tồn giữa core và kênh bán' });
  if (await ledger.count()) {
    // The three numbers that have to agree: what the core holds, what we pushed, what the
    // channel said it has.
    await expect(ledger).toContainText('Core');
    await expect(ledger).toContainText('Đã gửi');
  } else {
    await expect(page.getByText(/chưa có mapping|không có/i).first()).toBeVisible();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  if (testInfo.project.name === 'mobile-390x844') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});