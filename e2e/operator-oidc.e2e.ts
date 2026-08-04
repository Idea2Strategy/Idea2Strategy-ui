import { expect, test } from '@playwright/test';
import { OPERATOR_OIDC_TRANSACTION_KEY } from '../src/auth/operatorOidc';
import { MOCK_API_URL } from './ports';

test('uses production authorization-code PKCE and keeps the operator bearer isolated', async ({ page }) => {
  let operatorBearer = '';
  await page.route(`${MOCK_API_URL}/api/v1/operations/me`, async (route) => {
    operatorBearer = await route.request().headerValue('authorization') ?? '';
    expect(operatorBearer).toMatch(/^Bearer [^.]+\.[^.]+\.[^.]+$/);
    expect(await route.request().headerValue('cookie')).toBeNull();
    await route.fulfill({
      json: {
        view: {
          operatorId: 'operator-browser-e2e',
          catalogVersion: 'v1',
          currentMfa: true,
          mfaAuthenticatedAt: '2026-08-05T00:00:00Z',
          lastMfaVerifiedAt: '2026-08-05T00:00:00Z',
          roles: [],
          permissions: [],
          assignments: [],
        },
        correlationId: 'corr-operator-browser-e2e',
      },
    });
  });

  await page.goto('/operations/rbac');
  await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toBeVisible();
  await page.getByRole('button', { name: 'Sign in as operator' }).click();

  await expect(page).toHaveURL(/\/operations\/rbac$/);
  await expect(page.getByText('operator-browser-e2e')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Operator logout' })).toBeVisible();
  expect(operatorBearer).not.toBe('');
  const persisted = await page.evaluate((transactionKey) => ({
    transaction: sessionStorage.getItem(transactionKey),
    values: Object.values(sessionStorage),
  }), OPERATOR_OIDC_TRANSACTION_KEY);
  expect(persisted.transaction).toBeNull();
  expect(persisted.values.join(' ')).not.toContain(operatorBearer.replace(/^Bearer /, ''));

  await page.getByRole('button', { name: 'Operator logout' }).click();
  await expect(page).toHaveURL(/\/operations\/login$/);
  await expect(page.getByRole('heading', { name: 'Operator sign-in' })).toBeVisible();
});
