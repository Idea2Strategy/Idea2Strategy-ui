import { defineConfig, devices } from '@playwright/test';
import { APP_PORT, APP_URL, MOCK_API_URL, MOCK_IDP_URL } from './e2e/ports';

export default defineConfig({
  testDir: './e2e',
  testMatch: /operator-oidc\.e2e\.ts/,
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: 1,
  reporter: [['list']],
  globalSetup: './e2e/globalSetup.ts',
  timeout: 30_000,
  expect: { timeout: 10_000 },
  use: { baseURL: APP_URL, trace: 'retain-on-failure' },
  projects: [{ name: 'chromium-operator-oidc', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: `pnpm exec vite --mode production --port ${APP_PORT} --strictPort --host 127.0.0.1`,
    url: APP_URL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      VITE_API_BASE_URL: MOCK_API_URL,
      VITE_OPERATOR_OIDC_ENABLED: 'true',
      VITE_OPERATOR_OIDC_ISSUER: MOCK_IDP_URL,
      VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT: `${MOCK_IDP_URL}/authorize`,
      VITE_OPERATOR_OIDC_TOKEN_ENDPOINT: `${MOCK_IDP_URL}/token`,
      VITE_OPERATOR_OIDC_END_SESSION_ENDPOINT: `${MOCK_IDP_URL}/logout`,
      VITE_OPERATOR_OIDC_CLIENT_ID: 'operator-ui',
      VITE_OPERATOR_OIDC_AUDIENCE: 'idea2strategy-operator',
      VITE_OPERATOR_OIDC_REDIRECT_URI: `${APP_URL}/operations/callback`,
      VITE_OPERATOR_OIDC_POST_LOGOUT_REDIRECT_URI: `${APP_URL}/operations/login`,
      VITE_OPERATOR_OIDC_SCOPES: 'openid profile email',
      VITE_OPERATOR_OIDC_SIGNING_ALGORITHM: 'RS256',
    },
  },
});
