import { expect, test, type Page } from '@playwright/test';

test.use({ storageState: { cookies: [], origins: [] }, trace: 'off' });

function identity(role: 'ADMIN' | 'STAFF' = 'ADMIN') {
  const prefix = role === 'ADMIN' ? 'E2E_AUTH' : 'E2E_STAFF';
  const email = process.env[`${prefix}_EMAIL`];
  const password = process.env[`${prefix}_PASSWORD`];
  if (!email || !password) throw new Error(`${prefix}_EMAIL and ${prefix}_PASSWORD must be provisioned in CI/dev; no fixture passwords.`);
  return { email, password };
}

async function signIn(page: Page, role: 'ADMIN' | 'STAFF' = 'ADMIN', path = '/inventory') {
  const account = identity(role);
  await page.goto(path);
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeVisible();
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
  // User labels are hidden by responsive CSS at mobile width, so verify identity
  // with the same real session endpoint that the app uses.
  const sessionResponse = await page.request.get('/api/v1/auth/session');
  expect(sessionResponse.status()).toBe(200);
  const session = await sessionResponse.json() as { user: { email: string; role: string } };
  expect(session.user.email).toBe(account.email);
  expect(session.user.role).toBe(role);
}

test('web login UI: anonymous guard, generic failure, deep link, refresh, new tab, logout and relogin', async ({ page, request }) => {
  const account = identity();
  await page.goto('/orders');
  await expect(page).toHaveURL(/\/login\?next=%2Forders$/);
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeVisible();
  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('wrong-password');
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('alert')).toContainText('Thông tin đăng nhập không hợp lệ');
  await expect(page.getByRole('alert')).not.toContainText(account.email);
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeVisible();

  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page).toHaveURL(/\/orders$/);
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  const sessionResponse = await page.request.get('/api/v1/auth/session');
  expect(sessionResponse.status()).toBe(200);
  expect((await sessionResponse.json() as { user: { role: string } }).user.role).toBe('ADMIN');

  const webCookie = (await page.context().cookies()).find(cookie => cookie.name === 'datt_session');
  expect(webCookie?.httpOnly).toBe(true);
  expect(webCookie?.path).toBe('/');
  expect(webCookie?.sameSite).toBe('Lax');

  const browserStorage = await page.evaluate(() => ({
    localKeys: Object.keys(localStorage),
    sessionKeys: Object.keys(sessionStorage),
  }));
  expect([...browserStorage.localKeys, ...browserStorage.sessionKeys]).not.toContain('datt_session');
  expect([...browserStorage.localKeys, ...browserStorage.sessionKeys].some(key => /token|bearer|secret|auth/i.test(key))).toBe(false);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  const otherTab = await page.context().newPage();
  await otherTab.goto('/inventory');
  await expect(otherTab.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await otherTab.close();

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeVisible();
  await page.goto('/inventory');
  await expect(page).toHaveURL(/\/login\?next=%2Finventory$/);
  const reused = await request.get('/api/v1/auth/session', { headers: { Cookie: `datt_session=${webCookie?.value}` } });
  expect(reused.status()).toBe(401);

  await page.getByLabel('Email').fill(account.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(account.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toBeVisible();
  await expect(page).toHaveURL(/\/inventory$/);
});

test('web session is rechecked on refresh after server revocation, without stale workspace', async ({ page }) => {
  await signIn(page);
  const response = await page.request.get('/api/v1/auth/session');
  expect(response.status()).toBe(200);
  const session = await response.json() as { csrf_token: string };
  expect(session.csrf_token).toBeTruthy();
  const logout = await page.request.post('/api/v1/auth/logout', {
    headers: { Origin: new URL(page.url()).origin, 'X-CSRF-Token': session.csrf_token },
  });
  expect(logout.status()).toBe(200);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Đăng xuất' })).toHaveCount(0);
});

test('ADMIN vs STAFF: UI permissions and direct server-side 403, plus CSRF rejection', async ({ page }) => {
  const sku = 'SHOE-001-BLK-42';
  await signIn(page, 'STAFF', `/inventory/${sku}`);
  await expect(page.getByRole('button', { name: 'Điều chỉnh tồn' })).toHaveCount(0);

  const staffResponse = await page.request.post('/api/v1/inventory/adjust', {
    headers: { Origin: new URL(page.url()).origin, 'Idempotency-Key': 'e2e-staff-forbidden' },
    data: { sku, delta: 1, reason: 'staff must be forbidden' },
  });
  expect(staffResponse.status()).toBe(403);
  expect((await staffResponse.json() as { error: { code: string } }).error.code).toBe('FORBIDDEN');

  await page.getByRole('button', { name: 'Đăng xuất' }).click();
  await expect(page.getByRole('heading', { name: 'Đăng nhập vào hệ thống' })).toBeVisible();
  const admin = identity();
  await page.getByLabel('Email').fill(admin.email);
  await page.getByLabel('Mật khẩu', { exact: true }).fill(admin.password);
  await page.getByRole('button', { name: 'Đăng nhập' }).click();
  await expect(page.getByRole('button', { name: 'Điều chỉnh tồn' })).toBeVisible();

  const origin = new URL(page.url()).origin;
  for (const csrf of ['', 'invalid-csrf']) {
    const headers: Record<string, string> = { Origin: origin, 'Idempotency-Key': 'e2e-csrf-rejected' };
    if (csrf) headers['X-CSRF-Token'] = csrf;
    const response = await page.request.post('/api/v1/inventory/adjust', {
      headers,
      data: { sku, delta: 1, reason: 'CSRF negative control' },
    });
    expect(response.status()).toBe(403);
    expect((await response.json() as { error: { code: string } }).error.code).toBe('CSRF_INVALID');
  }
});

test('mobile auth endpoints accept exactly Android/iOS origins, issue bearer not cookie, and revoke', async ({ request }) => {
  const account = identity();
  for (const origin of ['https://localhost', 'capacitor://localhost']) {
    const headers = { Origin: origin };
    const result = await request.post('/api/v1/auth/mobile/login', {
      headers,
      data: account,
    });
    expect(result.status()).toBe(200);
    expect(result.headers()['set-cookie']).toBeUndefined();
    const session = await result.json() as { session_token: string; user: { role: string } };
    expect(session.user.role).toBe('ADMIN');
    expect(session.session_token).toBeTruthy();
    const authorized = { ...headers, Authorization: `Bearer ${session.session_token}` };
    const restored = await request.get('/api/v1/auth/session', { headers: authorized });
    expect(restored.status()).toBe(200);
    const ended = await request.post('/api/v1/auth/logout', { headers: authorized });
    expect(ended.status()).toBe(200);
    const revoked = await request.get('/api/v1/auth/session', { headers: authorized });
    expect(revoked.status()).toBe(401);
  }
  for (const origin of ['http://127.0.0.1:5173', 'https://evil.example']) {
    const result = await request.post('/api/v1/auth/mobile/login', { headers: { Origin: origin }, data: account });
    expect(result.status()).toBe(403);
  }
});
