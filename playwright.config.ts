import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, APP_URL, MOCK_API_URL } from './e2e/ports';

/*
  End-to-end configuration for the backtest screens.

  Two servers are involved and the difference matters when reading a result:

  * the **app** is real — the Vite dev server serving `src/`, the real router, the real
    `defaultBacktestClient`, the real session store, in a real Chromium;
  * the **backtest engine is mocked** by `e2e/mockApi.ts`, which serves the fixtures in
    `src/test/backtestFixtures.ts` over HTTP with the engine's status codes. It runs no
    backtest. These specs prove the screen against the contract, not the engine
    against itself.

  The API is a separate origin, as it is behind any real gateway, so the run also
  exercises CORS, the bearer header and `credentials: 'include'` for real.
*/
export default defineConfig({
  testDir: './e2e',
  testMatch: /.*\.e2e\.ts/,
  // Real-backend and production-mode operator-session journeys have their own
  // isolated configurations. Running them against this mock/dev-harness server
  // produces false failures and can mutate a developer's shared local data.
  testIgnore: [
    /real-account-api\.e2e\.ts/,
    /basic-strategy-real\.e2e\.ts/,
    /competition-room-create-real\.e2e\.ts/,
    /operator-oidc\.e2e\.ts/,
    /operator-session\.e2e\.ts/,
  ],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  // Keep local runs parallel but bounded. Eleven simultaneous Vite/Chromium
  // journeys starve event-loop navigation and produced non-deterministic auth
  // failures on ordinary developer machines; CI remains strictly serial.
  workers: process.env.CI ? 1 : 4,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : [['list']],
  globalSetup: './e2e/globalSetup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: `pnpm exec vite --port ${APP_PORT} --strictPort --host 127.0.0.1`,
    url: APP_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    // Vite exposes `VITE_`-prefixed process env to `import.meta.env`, which is how the
    // shipped `defaultBacktestClient` is pointed at the mock engine without editing a
    // single line of application code for the test.
    env: {
      VITE_API_BASE_URL: MOCK_API_URL,
      // Enables only the explicit development bridge. The token itself is injected
      // at browser runtime and is never compiled into the Vite bundle.
      VITE_ENABLE_LOCAL_OPERATOR_HARNESS: 'true',
    },
  },
});
