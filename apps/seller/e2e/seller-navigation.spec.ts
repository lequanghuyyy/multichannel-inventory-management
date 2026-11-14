import { expect, test } from '@playwright/test';

const seededSku = 'SHOE-001-BLK-42';
// Each entry names the area's own heading rather than a row from a checked-in fixture.
// These areas are API-first, so a fixture reference (an ORD-DEMO id, a TikTok channel, a
// seeded EV- number) is either absent or different on every run, and asserting one would make
// this a test of the seed rather than of the navigation. What each area RENDERS is asserted
// against real backend content in its own spec — orders-responsive, channels-responsive,
// sync-responsive, reports-responsive, ai-responsive, products-responsive — and the data
// source of every area is asserted here through the 'Trạng thái dữ liệu' landmark below.
const sections = [
  ['Sản phẩm', '/products', 'Danh mục sản phẩm'],
  ['Kho', '/inventory', null],
  ['Đơn hàng', '/orders', 'Omnichannel order ledger'],
  ['POS', '/pos', 'Point of Sale'],
  ['Kênh bán', '/channels', 'Kênh bán của shop'],
  ['Đồng bộ', '/sync', 'Sync Center'],
  ['Báo cáo', '/reports', 'Reports & Intelligence'],
  ['AI', '/ai', 'AI & Automation'],
  ['Cài đặt', '/settings', 'Cài đặt'],
] as const;

async function expectNoHorizontalOverflow(page: import('@playwright/test').Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
}

async function submitInventoryLookup(page: import('@playwright/test').Page, sku: string, status: number) {
  const response = page.waitForResponse(candidate => new URL(candidate.url()).pathname === `/api/v1/inventory/${sku}` && candidate.status() === status);
  await page.getByRole('textbox', { name: 'Canonical SKU', exact: true }).fill(sku);
  await page.getByRole('button', { name: 'Tra cứu tồn' }).click();
  await response;
}

async function expectSeededInventory(page: import('@playwright/test').Page) {
  await expect(page.getByRole('heading', { name: 'Nhập SKU để tra cứu' })).toBeVisible();
  await submitInventoryLookup(page, seededSku, 200);
  await expect(page.getByTestId(`inventory-${seededSku}`)).toContainText('available_to_sell');
}

test('navigates among the Seller App areas on desktop', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-1440x900', 'desktop navigation coverage');
  // Every area now answers from the running API rather than from a checked-in fixture, so
  // this walks ten real round-trips plus a full load after each one. The default 30s budget
  // was sized for the fixture path and would abort mid-walk on a healthy server.
  test.slow();
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Không gian bán hàng' })).toBeVisible();
  const sidebar = page.getByRole('complementary', { name: 'Điều hướng Seller App' });
  for (const [label, path, content] of sections) {
    await sidebar.getByRole('button', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (path === '/inventory') await expectSeededInventory(page);
    else {
      await expect(page.locator('main')).toContainText(content);
      await expect(page.getByLabel('Trạng thái dữ liệu', { exact: true })).toBeVisible();
    }
    await page.goto('/');
  }
  await expectNoHorizontalOverflow(page);
});

test('mobile bottom navigation and More menu reach every area', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-390x844', 'mobile navigation coverage');
  // Same reason as the desktop walk: these pages load from the running API.
  test.slow();
  await page.goto('/');
  const quickNavigation = page.getByRole('navigation', { name: 'Điều hướng nhanh' });
  // The quick bar renders navigationItems.slice(0, 4): Tổng quan, Sản phẩm, Kho, Nhập hàng.
  // `sections` omits the dashboard and receipts, so its first two entries are the only ones
  // reachable from the bar itself; every other entry now lives behind the More menu.
  for (const [label, path, content] of sections.slice(0, 2)) {
    // force:true for the same reason as the reports tabs on this project: under isMobile
    // emulation Chromium's hit test refuses a click whose point resolves to an ancestor,
    // even though the button is topmost at its own centre. The destination URL and the
    // destination content are both asserted after the click, so the navigation itself is
    // still proved.
    await quickNavigation.getByRole('button', { name: label, exact: true }).click({ force: true });
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (path === '/inventory') await expectSeededInventory(page);
    else await expect(page.locator('main')).toContainText(content);
  }

  for (const [label, path, content] of sections.slice(2)) {
    await quickNavigation.getByRole('button', { name: 'Thêm', exact: true }).click();
    await quickNavigation.getByRole('menuitem', { name: label, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
    if (path === '/inventory') await expectSeededInventory(page);
    else {
      await expect(page.locator('main')).toContainText(content);
      await expect(page.getByLabel('Trạng thái dữ liệu', { exact: true })).toBeVisible();
    }
    await page.goto('/');
  }
  await expectNoHorizontalOverflow(page);
});

test('shows explicit API not-found and mock error states', async ({ page }) => {
  await page.goto('/inventory');
  await submitInventoryLookup(page, 'UNKNOWN', 404);
  await expect(page.getByText('Không tìm thấy SKU', { exact: true })).toBeVisible();
  await page.goto('/orders?demo=error');
  await expect(page.getByText('Không thể tải dữ liệu', { exact: true })).toBeVisible();
});

test('keeps inventory cards within the viewport', async ({ page }) => {
  await page.goto('/inventory');
  await expectSeededInventory(page);
  await expectNoHorizontalOverflow(page);
});
