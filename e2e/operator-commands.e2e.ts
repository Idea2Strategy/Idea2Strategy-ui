import { expect, test } from '@playwright/test';
import type { Request } from '@playwright/test';
import { MOCK_API_URL } from './ports';

const OPERATOR_CSRF = 'csrf-operator-commands-e2e';
const CASE_ID = 'a1420000-0000-4000-8000-000000000001';
const SANCTION_ID = 'a1420000-0000-4000-8000-000000000002';

test('runs a high-risk sanction journey with an opaque session, CSRF, and correlation receipt', async ({ page }) => {
  let version = 4;
  let commandRequest: Request | null = null;
  await page.route(`${MOCK_API_URL}/api/v1/operator-auth/session`, async (route) => {
    await route.fulfill({
      headers: { 'set-cookie': 'operator_session=opaque-browser-token; HttpOnly; SameSite=Strict; Path=/' },
      json: {
        operatorId: 'operator-browser-e2e', csrfToken: OPERATOR_CSRF,
        mfaVerifiedAt: '2099-08-14T00:00:00Z', absoluteExpiresAt: '2099-08-14T08:00:00Z',
      },
    });
  });
  await page.route(`${MOCK_API_URL}/api/v1/operations/**`, async (route) => {
    const request = route.request();
    expect(await request.headerValue('authorization')).toBeNull();
    expect(await request.headerValue('x-operator-csrf')).toBe(OPERATOR_CSRF);
    const url = new URL(request.url());
    if (request.method() === 'GET' && url.pathname === '/api/v1/operations/cases') {
      await route.fulfill({ json: { items: [{ caseId: CASE_ID, type: 'REPORT', status: 'UNDER_REVIEW', version, assigneeOperatorId: null, updatedAt: '2026-08-04T00:00:00Z' }], nextCursor: null } });
      return;
    }
    if (request.method() === 'GET' && url.pathname === `/api/v1/operations/cases/${CASE_ID}`) {
      await route.fulfill({ json: { caseId: CASE_ID, type: 'REPORT', status: 'UNDER_REVIEW', version, assigneeOperatorId: null, updatedAt: '2026-08-04T00:00:00Z', evidence: [] } });
      return;
    }
    if (request.method() === 'POST' && url.pathname.endsWith('/commands/APPLY_SANCTION')) {
      commandRequest = request;
      version = 5;
      await route.fulfill({ json: { status: 'APPLIED', code: 'CASE_SANCTION_APPLIED', correlationId: 'corr-browser-sanction', caseVersion: version } });
      return;
    }
    await route.fulfill({ status: 404, json: { code: 'NOT_FOUND' } });
  });

  await page.goto('/operations/cases');
  await page.getByRole('button', { name: /REPORT/ }).click();
  await expect(page.getByText('REPORT · UNDER_REVIEW')).toBeVisible();
  await page.getByLabel('Operation reason code').fill('POLICY_VIOLATION');
  await page.getByLabel('Sanction ID', { exact: true }).fill(SANCTION_ID);
  await page.getByRole('button', { name: 'Apply sanction' }).click();
  await expect(page.getByRole('button', { name: 'Execute high-risk operation' })).toBeDisabled();
  await page.getByLabel('Type APPLY_SANCTION to confirm').fill('APPLY_SANCTION');
  await page.getByRole('button', { name: 'Execute high-risk operation' }).click();

  await expect(page.getByText('Correlation corr-browser-sanction')).toBeVisible();
  expect(commandRequest).not.toBeNull();
  expect(commandRequest!.postDataJSON()).toMatchObject({
    expectedVersion: 4,
    reasonCode: 'POLICY_VIOLATION',
    sanctionId: SANCTION_ID,
    sanctionType: 'SUSPENSION',
    expectedSanctionVersion: 0,
  });
  expect(await commandRequest!.headerValue('idempotency-key')).toBeTruthy();
  expect(await commandRequest!.headerValue('x-correlation-id')).toBeTruthy();
});
