import { defineConfig, devices } from '@playwright/test';

// E2E runs against BASE_URL when set (CI: the built Worker via `opennextjs-cloudflare preview`),
// otherwise against a local production build of the app.
const ADMIN_SETUP = /admin-auth\.spec\.ts/;

const baseURL = process.env.BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  // Two files at a time in CI. Left unset, Playwright uses half the cores: one worker on the
  // 2-core runners private repos get, which took E2E from about 7 to 10 minutes (D-60).
  workers: process.env.CI ? 2 : undefined,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    // Admin account-setup tests create real accounts, so they run once (desktop Chromium);
    // the mobile admin menu arrives in milestone 5.
    { name: 'webkit', use: { ...devices['Desktop Safari'] }, testIgnore: ADMIN_SETUP },
    { name: 'pixel', use: { ...devices['Pixel 7'] }, testIgnore: ADMIN_SETUP },
    { name: 'iphone', use: { ...devices['iPhone 14'] }, testIgnore: ADMIN_SETUP },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'pnpm exec next start -p 3100', url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
