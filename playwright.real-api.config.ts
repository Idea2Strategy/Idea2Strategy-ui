import { defineConfig, devices } from '@playwright/test';

const externalBaseUrl = process.env.A23_EXTERNAL_BASE_URL?.replace(/\/$/, '');
const fullStack = process.env.A23_FULL_STACK_E2E === '1';
const appPort = Number(process.env.A23_APP_PORT);
const backendPort = Number(process.env.A23_BACKEND_PORT);
if (!externalBaseUrl && ![appPort, backendPort].every((port) => Number.isInteger(port) && port >= 1024 && port <= 65_535)) {
  throw new Error('Use pnpm e2e:real-api so the isolated ports are allocated once for every Playwright process');
}

export default defineConfig({
  testDir: './e2e',
  testMatch: fullStack ? /basic-strategy-real\.e2e\.ts/ : /real-account-api\.e2e\.ts/,
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  globalSetup: externalBaseUrl ? undefined : './e2e/realApiGlobalSetup.ts',
  // This is a production-shaped account journey followed by a full composite
  // strategy authoring pass, not a single-page smoke test.
  timeout: 300_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${appPort}`,
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium-real-api', use: { ...devices['Desktop Chrome'] } }],
  webServer: externalBaseUrl ? undefined : {
    command: `pnpm exec vite --port ${appPort} --strictPort --host 127.0.0.1`,
    url: `http://127.0.0.1:${appPort}`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: { VITE_REAL_API_TARGET: `http://127.0.0.1:${backendPort}` },
  },
});
