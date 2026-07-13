import { defineConfig, devices } from '@playwright/test';

const port = process.env.PLAYWRIGHT_V2_PORT || '4175';

export default defineConfig({
  testDir: './test/ui-v2', outputDir: 'test-results-v2', workers: 1, retries: 0, timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${port}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'node --env-file=.env test/helpers/playwright-v2-server.js',
    url: `http://127.0.0.1:${port}/`, reuseExistingServer: false, timeout: 30_000,
  },
});
