import { request } from '@playwright/test';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { authStatePath } from './auth-state-path';

// All UI E2E cases exercise protected Seller App routes. Use the same real
// ADMIN created by the Compose smoke step, and keep web auth as HttpOnly cookie.
// No localStorage tokens, mocked auth responses, or disabled API guards.
export default async function setupAuthenticatedBrowser() {
  const email = process.env.E2E_AUTH_EMAIL;
  const password = process.env.E2E_AUTH_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_AUTH_EMAIL and E2E_AUTH_PASSWORD are required for authenticated Playwright tests.');
  }

  const baseURL = process.env.E2E_BASE_URL?.trim() || 'http://127.0.0.1:5174';
  const context = await request.newContext({
    baseURL,
    extraHTTPHeaders: { Origin: new URL(baseURL).origin },
  });

  let csrfToken = '';
  try {
    const response = await context.post('/api/v1/auth/login', {
      data: { email, password },
    });
    if (response.status() !== 200) {
      throw new Error(`E2E web login failed (HTTP ${response.status()}). Check the seeded ADMIN and WEB_ORIGINS.`);
    }

    const session: unknown = await response.json();
    if (!session || typeof session !== 'object' || !('csrf_token' in session)
        || typeof session.csrf_token !== 'string' || !session.csrf_token) {
      throw new Error('E2E web login did not provide a CSRF token.');
    }
    csrfToken = session.csrf_token;

    const state = await context.storageState();
    if (!state.cookies.some(cookie => cookie.name === 'datt_session' && cookie.httpOnly)) {
      throw new Error('E2E login did not set the expected HttpOnly web session cookie.');
    }

    await mkdir(dirname(authStatePath), { recursive: true, mode: 0o700 });
    await writeFile(authStatePath, JSON.stringify(state), { mode: 0o600 });
  } finally {
    await context.dispose();
  }

  // Revoke the temporary CI session before artifact upload, and remove the
  // storageState file even if revocation fails. No tokens enter tracked files.
  return async () => {
    try {
      const cleanup = await request.newContext({
        baseURL,
        storageState: authStatePath,
        extraHTTPHeaders: {
          Origin: new URL(baseURL).origin,
          'X-CSRF-Token': csrfToken,
        },
      });
      try {
        const logout = await cleanup.post('/api/v1/auth/logout');
        if (logout.status() !== 200) console.warn(`E2E cleanup logout returned HTTP ${logout.status()}.`);
      } finally {
        await cleanup.dispose();
      }
    } catch {
      console.warn('E2E cleanup could not revoke the temporary session.');
    } finally {
      await rm(authStatePath, { force: true });
    }
  };
}
