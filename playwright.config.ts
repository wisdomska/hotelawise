import { defineConfig, devices } from '@playwright/test';

// E2E runs against BASE_URL when set (CI: the built Worker via `opennextjs-cloudflare preview`),
// otherwise against a local production build of the app.
const baseURL = process.env.BASE_URL ?? 'http://localhost:3100';

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: { baseURL, trace: 'retain-on-failure' },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'pixel', use: { ...devices['Pixel 7'] } },
    { name: 'iphone', use: { ...devices['iPhone 14'] } },
  ],
  webServer: process.env.BASE_URL
    ? undefined
    : { command: 'pnpm exec next start -p 3100', url: `${baseURL}/api/health`, reuseExistingServer: true, timeout: 120_000 },
});
