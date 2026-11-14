import { expect, test } from '@playwright/test';

// The AI screen reads the core's demand history from the Go API and shows a forecast ONLY
// when a provider answered. These assertions follow that split: the history is always there,
// the forecast table must be absent while no provider is configured, and the screen has to
// say which of the two the reader is looking at.
test('AI workbench separates observed demand from a forecast it does not have', async ({ page }, testInfo) => {
  await page.goto('/ai');
  await expect(page.getByRole('heading', { name: 'AI & Automation' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Mathematical rule guardrail' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await expect(page.getByLabel('Trạng thái dữ liệu')).toContainText('Dữ liệu thật');
  const status = page.getByLabel('Trạng thái dự báo');
  await expect(status).toBeVisible();

  if (await status.getByText('Không có dự báo.').count()) {
    // No provider: the forecast table must not exist at all. An empty forecast table and an
    // absent one are different messages, and an empty one reads as "the model found nothing".
    await expect(page.getByLabel('Dự báo từ nhà cung cấp mô hình')).toHaveCount(0);
    await expect(status).toContainText('Không có nhà cung cấp mô hình nào được cấu hình');
  } else {
    await expect(page.getByLabel('Dự báo từ nhà cung cấp mô hình')).toBeVisible();
  }

  // The observed table is the half that can always be shown, because every column is a fact.
  const observed = page.getByLabel('Nhu cầu quan sát đọc từ Go API');
  await expect(observed).toBeVisible();
  await expect(observed).toContainText('Đã bán');
  await expect(observed).toContainText('Bán được');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  await page.getByRole('button', { name: '30 ngày' }).click();
  await expect(observed).toBeVisible();

  if (testInfo.project.name === 'mobile-390x844') {
    await expect(observed).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});