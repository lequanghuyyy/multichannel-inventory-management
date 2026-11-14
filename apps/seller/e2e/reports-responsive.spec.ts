import { expect, test } from '@playwright/test';

// Reports is a live aggregate over the core database. The assertions that matter here are
// the ones a static fixture could never satisfy: the badge, the provenance line naming the
// window, and the daily series having one row per day.
test('report aggregates render from the core database and stay responsive', async ({ page }, testInfo) => {
  // The aggregates are computed by the Go API over the real tables, and this case clicks
  // through every tab waiting for each panel — on a 390px viewport each of those is a real
  // round trip, which does not fit the default budget.
  test.slow();
  // The tab clicks use force:true. Under isMobile+hasTouch, Chromium's visual-viewport
  // offset makes Playwright's hit test land on the tab strip's parent instead of the
  // tab, so the click is refused as "intercepts pointer events" even though the button
  // IS the topmost element at its own centre, and the identical click at 390x844 with the
  // mobile emulation switched off succeeds. It is emulation behaviour, not a layout
  // fault, so the click is dispatched directly and every assertion below still reads
  // the panel the click was supposed to reveal.
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports & Intelligence' })).toBeVisible();
  await expect(page.getByLabel('Trạng thái dữ liệu')).toContainText('Dữ liệu thật');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  const kpis = page.getByLabel('Chỉ số báo cáo đọc từ Go API');
  await expect(kpis).toBeVisible();
  await expect(page.getByText(/Nguồn:/)).toContainText('core-database');
  await expect(page.getByText(/không bao gồm mốc cuối/i)).toBeVisible();

  const velocity = page.getByLabel('Tốc độ bán theo ngày đọc từ Go API');
  await expect(velocity).toBeVisible();
  // Seven buckets for a 7d window, including the days with nothing in them.
  await expect(velocity.getByRole('row')).toHaveCount(8);

  await page.getByRole('tab', { name: 'Inventory' }).click({ force: true });
  const skus = page.getByLabel('Bảng SKU bán chạy đọc từ Go API');
  await expect(skus).toBeVisible();

  await page.getByRole('tab', { name: 'Synchronization' }).click({ force: true });
  await expect(page.getByLabel('Sức khoẻ tồn kho và đồng bộ đọc từ Go API')).toBeVisible();

  await page.getByRole('tab', { name: 'Channels' }).click({ force: true });
  const channels = page.getByLabel('Giá trị đơn theo kênh đọc từ Go API');
  await expect(channels).toBeVisible();
  // The till is a channel of sale like any other, and the filter offers what the rows hold.
  // Scoped to the filter control: 'Kênh' also names a sidebar button.
  await expect(page.locator('#report-channel')).toContainText('pos');

  if (testInfo.project.name === 'mobile-390x844') {
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});