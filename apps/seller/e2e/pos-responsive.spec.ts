import { expect, test } from '@playwright/test';

test('POS checkout stays usable from 320px through desktop widths without writing a sale', async ({ page }) => {
  await page.goto('/pos');
  await expect(page.getByRole('heading', { name: 'Bán tại quầy' })).toBeVisible();
  const initialWidth = await page.evaluate(() => window.innerWidth);
  const checkout = page.getByRole('button', { name: 'Xác nhận đã nhận tiền và tạo đơn' });
  if (initialWidth >= 1024) await expect(checkout).toBeDisabled();

  // Keep the checkout write untouched in this browser test. The Go integration suite covers
  // real order/payment writes; this spec checks each supported viewport and the cashier flow.
  const addShoe = page.getByRole('button', { name: 'Thêm SHOE-001-BLK-42 vào giỏ' });
  await expect(addShoe).toBeVisible();
  await addShoe.click();
  await expect(page.getByLabel('Danh sách sản phẩm trong giỏ')).toContainText('SHOE-001-BLK-42');
  if (initialWidth < 1024) await page.getByRole('button', { name: /^Giỏ hàng/ }).click();
  await expect(checkout).toBeDisabled(); // A basket alone is not a payment confirmation.
  await page.getByRole('textbox', { name: 'Tiền khách đưa' }).fill('999999999');
  await expect(checkout).toBeEnabled();

  for (const width of [320, 360, 390, 768, 1024, 1280, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    await expect(page.getByRole('heading', { name: 'Bán tại quầy' })).toBeVisible();
    if (width < 1024) {
      await page.getByRole('button', { name: /^Giỏ hàng/ }).click();
      await expect(page.getByLabel('Giỏ hàng và thanh toán')).toBeVisible();
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  }
});
