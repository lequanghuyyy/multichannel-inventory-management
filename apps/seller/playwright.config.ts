import { defineConfig } from '@playwright/test';
import { authStatePath } from './e2e/auth-state-path';

// An explicit URL means the caller owns the server (CI uses the built Compose web).
// Do not launch Vite on top of the production server or silently test stale assets.
const externalURL = process.env.E2E_BASE_URL?.trim();

export default defineConfig({
  testDir: './e2e',
  globalSetup: './e2e/auth-global-setup.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: { baseURL: externalURL || 'http://127.0.0.1:5174', storageState: authStatePath, trace: 'retain-on-failure' },
  webServer: externalURL ? undefined : {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5174',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
  projects: [
    { name: 'desktop-1440x900', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
    { name: 'mobile-390x844', use: { browserName: 'chromium', viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true } },
  ],
});
