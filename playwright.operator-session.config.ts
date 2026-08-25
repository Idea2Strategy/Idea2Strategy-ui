import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, APP_URL, MOCK_API_URL } from './e2e/ports';

export default defineConfig({
  testDir: './e2e',
  testMatch: /operator-session\.e2e\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/globalSetup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: APP_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium-operator-session', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --mode production --port ${APP_PORT} --strictPort --host 127.0.0.1`,
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_API_BASE_URL: MOCK_API_URL },
  },
});
