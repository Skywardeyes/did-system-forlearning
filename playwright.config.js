import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/ui',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 30_000,
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: 'http://127.0.0.1:4174',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node test/helpers/playwright-server.js',
    url: 'http://127.0.0.1:4174/',
    reuseExistingServer: false,
    timeout: 30_000,
  },
});
