import { expect, test } from '@playwright/test';
import { MOCK_API_URL } from './ports';

test('uses the opaque cookie session and keeps CSRF only in memory', async ({ page }) => {
  const csrf = 'csrf-browser-e2e';
  let authenticated = false;
  let loginBody: Record<string, unknown> | null = null;
  let logoutCsrf = '';

  await page.route(`${MOCK_API_URL}/api/v1/operator-auth/session`, async (route) => {
    if (!authenticated) return route.fulfill({ status: 401, json: { code: 'OPERATOR_AUTHENTICATION_REJECTED' } });
    return route.fulfill({ json: sessionBody(csrf) });
  });
  await page.route(`${MOCK_API_URL}/api/v1/operator-auth/sessions`, async (route) => {
    expect(await route.request().headerValue('authorization')).toBeNull();
    loginBody = route.request().postDataJSON() as Record<string, unknown>;
    authenticated = true;
    return route.fulfill({
      headers: { 'set-cookie': 'operator_session=opaque-browser-token; HttpOnly; SameSite=Strict; Path=/' },
      json: sessionBody(csrf),
    });
  });
  await page.route(`${MOCK_API_URL}/api/v1/operator-auth/logout`, async (route) => {
    logoutCsrf = await route.request().headerValue('x-operator-csrf') ?? '';
    expect(await route.request().headerValue('authorization')).toBeNull();
    authenticated = false;
    return route.fulfill({ status: 204 });
  });
  await page.route(`${MOCK_API_URL}/api/v1/operations/me`, async (route) => {
    expect(await route.request().headerValue('authorization')).toBeNull();
    await route.fulfill({ json: { view: {
      operatorId: 'operator-browser-e2e', catalogVersion: 'v1', currentMfa: true,
      mfaAuthenticatedAt: '2026-08-14T00:00:00Z', lastMfaVerifiedAt: '2026-08-14T00:00:00Z',
      roles: [], permissions: [], assignments: [],
    }, correlationId: 'corr-operator-browser-e2e' } });
  });

  await page.goto('/operations/rbac');
  await expect(page.getByRole('heading', { name: '운영자 로그인' })).toBeVisible();
  await page.getByLabel('운영자 아이디').fill('admin');
  await page.getByLabel('비밀번호').fill('correct-horse-battery-staple');
  await page.getByLabel('인증 앱 6자리 코드').fill('123456');
  await page.getByRole('button', { name: '운영자 로그인', exact: true }).click();

  await expect(page).toHaveURL(/\/operations\/rbac$/);
  await expect(page.getByText('operator-browser-e2e')).toBeVisible();
  expect(loginBody).toEqual({ loginName: 'admin', password: 'correct-horse-battery-staple', totpCode: '123456' });
  const persisted = await page.evaluate(() => ({ local: Object.values(localStorage), session: Object.values(sessionStorage) }));
  expect([...persisted.local, ...persisted.session].join(' ')).not.toContain(csrf);
  expect([...persisted.local, ...persisted.session].join(' ')).not.toContain('opaque-browser-token');

  await page.getByRole('button', { name: 'Operator logout' }).click();
  await expect(page).toHaveURL(/\/operations\/login$/);
  expect(logoutCsrf).toBe(csrf);
});

function sessionBody(csrfToken: string) {
  return {
    operatorId: 'operator-browser-e2e', csrfToken,
    mfaVerifiedAt: '2026-08-14T00:00:00Z', absoluteExpiresAt: '2026-08-14T08:00:00Z',
  };
}
