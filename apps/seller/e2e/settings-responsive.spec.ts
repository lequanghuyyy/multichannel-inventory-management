import { expect, test } from '@playwright/test';

test('settings ledger preserves source boundaries at desktop and mobile widths', async ({ page }) => {
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Cài đặt' })).toBeVisible();
  await expect(page.getByLabel('Configuration source manifest')).toContainText('Runtime API');
  await expect(page.getByRole('heading', { name: 'Store profile' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save changes' })).toBeDisabled();

  await page.getByRole('tab', { name: /Access/ }).click();
  await expect(page.getByRole('tabpanel')).toContainText('Apex Admin');
  await expect(page.getByRole('button', { name: 'Invite user' })).toBeDisabled();

  await page.getByRole('tab', { name: /Preferences/ }).click();
  await page.getByLabel('Timestamp preview').selectOption('12-hour');
  await expect(page.getByText('Preview: Oct 03, 2026 · 02:42:08 PM')).toBeVisible();

  await page.getByRole('tab', { name: /System/ }).click();
  await expect(page.getByRole('heading', { name: 'System information' })).toBeVisible();
  await expect(page.getByText('Capability is not readiness:', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
