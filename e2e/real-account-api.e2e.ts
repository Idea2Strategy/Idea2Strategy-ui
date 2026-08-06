import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('browser completes the production account principal and user-case journey', async ({ page }) => {
  const postgres = process.env.A23_POSTGRES_CONTAINER;
  const verificationKey = process.env.A23_VERIFICATION_HMAC_KEY;
  if (!postgres || !verificationKey) throw new Error('real API runtime state is unavailable');
  const email = `a23-browser-${Date.now()}@example.com`;
  const password = 'correct horse battery staple 2026!';
  const verificationToken = `a23-verification-${Date.now()}`;

  // Logged out, the account route goes straight to the sign-in screen.
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();

  // The journey enters through the dedicated /signup screen. A wrong password
  // on /login later proves the error path; the /account inline form keeps its
  // own unit coverage in AccountApiPanels.test.tsx.
  await page.goto('/signup');
  await page.getByLabel('가입 이메일').fill(email);
  await page.getByLabel('가입 비밀번호', { exact: true }).fill(password);
  await page.getByLabel('가입 비밀번호 확인').fill(password);
  const [signup] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/signup')),
    page.getByRole('button', { name: '가입', exact: true }).click(),
  ]);
  expect(signup.status()).toBe(202);
  const accountId = String((await signup.json()).accountId);

  const digest = createHmac('sha256', Buffer.from(verificationKey, 'base64'))
    .update(verificationToken).digest('base64url');
  execFileSync('docker', ['exec', postgres, 'psql', '-U', 'postgres', '-d', 'a23',
    '-v', 'ON_ERROR_STOP=1', '-c',
    `update identity.email_verification_requests set token_digest='${digest}' where account_id='${accountId}' and consumed_at is null and revoked_at is null`]);

  await page.getByLabel('가입 인증 토큰').fill(verificationToken);
  const [verification] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/verify-email')),
    page.getByRole('button', { name: '이메일 인증' }).click(),
  ]);
  expect(verification.status()).toBe(204);
  await page.getByRole('button', { name: '로그인하러 가기' }).click();
  await expect(page).toHaveURL(/\/login$/);

  // Wrong password first: the screen reports the API's code and stays put.
  await page.getByLabel('로그인 이메일').fill(email);
  await page.getByLabel('로그인 비밀번호').fill('wrong password on purpose');
  const [rejectedLogin] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login')),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);
  expect(rejectedLogin.status()).toBe(401);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login$/);

  await page.getByLabel('로그인 비밀번호').fill(password);
  const sessionsLoaded = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/auth/sessions') && response.request().method() === 'GET');
  const preferencesLoaded = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/account/preferences') && response.request().method() === 'GET');
  const [login] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login') && response.status() === 200),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);
  expect(login.status()).toBe(200);
  // The default returnTo lands on the account page with the session live.
  await expect(page).toHaveURL(/\/account$/);
  const [sessions, loadedPreferences] = await Promise.all([sessionsLoaded, preferencesLoaded]);
  expect(sessions.status()).toBe(200);
  expect(loadedPreferences.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '현재 세션' })).toBeVisible();
  await expect(page.getByText('Web browser')).toBeVisible();

  await page.getByLabel('서버 시간대').fill('Asia/Seoul');
  const [preferences] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/account/preferences') && response.request().method() === 'PATCH'),
    page.getByRole('button', { name: '서버 설정 저장' }).click(),
  ]);
  expect(preferences.status()).toBe(200);
  await expect(page.getByText('서버 설정을 저장했습니다.')).toBeVisible();

  await page.getByLabel('케이스 제목').fill('Actual browser API incident');
  await page.getByLabel('케이스 설명').fill('Production bearer principal reaches the PostgreSQL user-case store.');
  const [submittedCase] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/cases') && response.request().method() === 'POST'),
    page.getByRole('button', { name: '접수하기' }).click(),
  ]);
  expect(submittedCase.status()).toBe(201);
  const created = await submittedCase.json() as { id: string };
  await expect(page.getByText(new RegExp(`추적 번호 ${created.id}`))).toBeVisible();

  const [loadedCase] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/v1/cases/${created.id}`)),
    page.getByRole('button', { name: '상태 확인' }).click(),
  ]);
  expect(loadedCase.status()).toBe(200);
});
