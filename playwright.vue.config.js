import { defineConfig, devices } from '@playwright/test';

const apiPort = process.env.PLAYWRIGHT_VUE_API_PORT || '4177';
const webPort = process.env.PLAYWRIGHT_VUE_WEB_PORT || '5175';
const walletPort = process.env.PLAYWRIGHT_WALLET_PORT || '5176';

export default defineConfig({
  testDir: './test/ui-vue', outputDir: 'test-results-vue', workers: 1, retries: 0, timeout: 30_000,
  reporter: [['list']],
  use: { baseURL: `http://127.0.0.1:${webPort}`, trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'node --env-file=.env test/helpers/playwright-vue-backend.js',
      url: `http://127.0.0.1:${apiPort}/health`, reuseExistingServer: false, timeout: 30_000,
      env: { PLAYWRIGHT_VUE_API_PORT: apiPort, WALLET_ORIGIN: `http://127.0.0.1:${walletPort}` },
    },
    {
      command: 'npm --prefix frontend run dev',
      url: `http://127.0.0.1:${webPort}`, reuseExistingServer: false, timeout: 30_000,
      env: { VITE_PORT: webPort, VITE_API_TARGET: `http://127.0.0.1:${apiPort}` },
    },
    {
      command: 'node wallet/start.js',
      url: `http://127.0.0.1:${walletPort}`, reuseExistingServer: false, timeout: 30_000,
      env: { WALLET_PORT: walletPort },
    },
  ],
});
