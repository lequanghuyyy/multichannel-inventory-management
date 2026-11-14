import { expect, test } from '@playwright/test';

test('orders ledger uses lazy inline previews and fits 320px through desktop widths', async ({ page }) => {
  await page.goto('/orders');
  await expect(page.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Omnichannel order ledger' })).toHaveCount(0);
  const batchShipButtons = page.getByRole('button', { name: 'Giao hàng loạt' });
  await expect(batchShipButtons).toHaveCount(2);
  await expect(batchShipButtons.nth(0)).toBeDisabled();
  await expect(batchShipButtons.nth(1)).toBeDisabled();

  for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Quản lý đơn hàng' })).toBeVisible();
    const fits = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
    expect(fits, `Orders page overflows horizontally at ${width}px`).toBe(true);
  }

  await page.setViewportSize({ width: 390, height: 844 });
  const mobilePreview = page.getByRole('button', { name: /^Xem nhanh / }).first();
  await expect(mobilePreview).toBeVisible();
  await mobilePreview.click();
  const mobileExpanded = page.getByRole('button', { name: /^Thu gọn xem nhanh / }).first();
  await expect(mobileExpanded).toHaveAttribute('aria-expanded', 'true');
  await expect(mobileExpanded).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The same one-open preview state is shared when the responsive card/table layout changes.
  await page.setViewportSize({ width: 1440, height: 900 });
  const desktopExpanded = page.getByRole('button', { name: /^Thu gọn xem nhanh / }).first();
  await expect(desktopExpanded).toHaveAttribute('aria-expanded', 'true');
  await desktopExpanded.click();
  await expect(page.getByRole('button', { name: /^Xem nhanh / }).first()).toHaveAttribute('aria-expanded', 'false');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
