import { execFileSync } from 'node:child_process';
import { createHmac } from 'node:crypto';
import { expect, test } from '@playwright/test';

test('browser completes the production account principal and user-case journey', async ({ page }) => {
  const postgres = process.env.A23_POSTGRES_CONTAINER;
  const verificationKey = process.env.A23_VERIFICATION_HMAC_KEY;
  if (!postgres || !verificationKey) throw new Error('real API runtime state is unavailable');
  const email = `a23-browser-${Date.now()}@example.com`;
  const password = 'CorrectHorse!2026';
  const verificationToken = `a23-verification-${Date.now()}`;

  // Logged out, the account route goes straight to the sign-in screen.
  await page.goto('/account');
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();

  // The journey enters through the dedicated /signup screen — the only signup
  // surface. A wrong password on /login later proves the error path.
  await page.goto('/signup');
  await page.getByLabel('가입 이메일').fill(email);
  await page.getByLabel('가입 비밀번호', { exact: true }).fill(password);
  await page.getByLabel('가입 비밀번호 확인', { exact: true }).fill(password);
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

  await expect(page.getByRole('status')).toContainText('인증 링크를 이메일로 보냈습니다.');
  await expect(page.getByLabel('가입 인증 코드')).toHaveCount(0);
  await page.goto(`/api/v1/auth/verify-email?token=${encodeURIComponent(verificationToken)}`);
  await expect(page).toHaveURL(/\/login\?emailVerified=true$/);
  await expect(page.getByRole('status')).toContainText('이메일 인증이 완료되었습니다. 로그인해 주세요.');

  // Wrong password first: the screen reports the API's code and stays put.
  await page.getByLabel('로그인 이메일').fill(email);
  await page.getByLabel('로그인 비밀번호', { exact: true }).fill('wrong password on purpose');
  const [rejectedLogin] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login')),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);
  expect(rejectedLogin.status()).toBe(401);
  await expect(page.getByRole('alert')).toBeVisible();
  await expect(page).toHaveURL(/\/login\?emailVerified=true$/);

  await page.getByLabel('로그인 비밀번호', { exact: true }).fill(password);
  const preferencesLoaded = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/account/preferences') && response.request().method() === 'GET');
  const notificationPreferencesLoaded = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/account/notifications/preferences')
      && response.request().method() === 'GET');
  const [login] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login') && response.status() === 200),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);
  expect(login.status()).toBe(200);
  // The default returnTo lands on the account page with the JWT login live.
  await expect(page).toHaveURL(/\/account$/);
  const loadedPreferences = await preferencesLoaded;
  expect(loadedPreferences.status()).toBe(200);
  const loadedNotificationPreferences = await notificationPreferencesLoaded;
  expect(loadedNotificationPreferences.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '로그인 및 보안' })).toBeVisible();

  // Display preferences intentionally live outside the account screen. The
  // account route exposes only customer-facing security and notification
  // controls, and handles a server with no configurable policies gracefully.
  await expect(page.getByLabel('서버 시간대')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '알림 설정' })).toBeVisible();
  await expect(page.getByText('지금 설정할 수 있는 알림이 없습니다.')).toBeVisible();

  await page.getByRole('button', { name: '내 문의 보기', exact: true }).click();
  const supportDialog = page.getByRole('dialog', { name: '문의하기' });
  await expect(supportDialog).toBeVisible();
  await supportDialog.getByLabel('문의 제목').fill('실제 브라우저 API 문의');
  await supportDialog.getByLabel('문의 내용').fill('로그인한 사용자의 문의가 안전하게 접수되는지 확인합니다.');
  const [submittedCase] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/cases') && response.request().method() === 'POST'),
    supportDialog.getByRole('button', { name: '접수하기' }).click(),
  ]);
  expect(submittedCase.status()).toBe(201);
  const created = await submittedCase.json() as { id: string };
  await expect(supportDialog.getByText('문의가 접수되었습니다.')).toBeVisible();
  await expect(supportDialog.getByText(created.id, { exact: true })).toHaveCount(0);

  // Exercise the signed-in product shell against the same real backend. These
  // reads catch missing controllers, stale root pointers, auth propagation,
  // and response-shape drift that an account-only journey cannot see.
  const dashboardResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/dashboard') && response.request().method() === 'GET');
  await page.goto('/');
  const dashboard = await dashboardResponse;
  expect(dashboard.status()).toBe(200);
  expect((await dashboard.json()).bots).toEqual([]);
  await expect(page.getByText('현재 운용 중인 봇이 없습니다.')).toBeVisible();

  const strategyListResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/strategies?') && response.request().method() === 'GET');
  await page.goto('/strategies');
  const strategyList = await strategyListResponse;
  expect(strategyList.status()).toBe(200);
  expect((await strategyList.json()).items).toEqual([]);
  await expect(page.getByText('아직 만든 전략이 없습니다.')).toBeVisible();

  const strategyName = `Browser Basic ${Date.now()}`;
  await page.getByRole('button', { name: '새 전략' }).click();
  await page.getByRole('textbox', { name: '전략 이름' }).fill(strategyName);
  const initialLease = page.waitForResponse((response) =>
    response.url().endsWith('/edit-lease')
      && response.request().method() === 'POST'
      && response.status() === 201);
  const [createdStrategy] = await Promise.all([
    page.waitForResponse((response) =>
      response.url().endsWith('/api/v1/strategies') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Basic으로 시작' }).click(),
  ]);
  expect(createdStrategy.status()).toBe(201);
  const strategyId = String((await createdStrategy.json()).id);
  // The created strategy owns its URL, so a refresh reopens it rather than a blank canvas.
  await expect(page).toHaveURL(`/strategies/${strategyId}/basic`);
  await expect(page.getByTestId('basic-editor-workspace')).toBeVisible();
  expect((await initialLease).status()).toBe(201);
  const reacquiredLease = page.waitForResponse((response) =>
    response.url().endsWith('/edit-lease')
      && response.request().method() === 'POST'
      && response.status() === 201);
  await page.reload();
  expect((await reacquiredLease).status()).toBe(201);
  await expect(page.getByTestId('basic-editor-workspace')).toBeVisible();

  const botListResponse = page.waitForResponse((response) =>
    response.url().endsWith('/api/v1/bots/operations') && response.request().method() === 'GET');
  await page.goto('/bots');
  const botList = await botListResponse;
  expect(botList.status()).toBe(200);
  expect(await botList.json()).toEqual([]);
  await expect(page.getByText('운용 중인 봇이 없습니다.')).toBeVisible();

  const publicRoomsResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/competition/rooms/public?') && response.request().method() === 'GET');
  await page.goto('/competition');
  const publicRooms = await publicRoomsResponse;
  expect(publicRooms.status()).toBe(200);
  expect(Array.isArray((await publicRooms.json()).items)).toBe(true);
  await expect(page.getByRole('alert')).toHaveCount(0);

  // The created draft must remain owned by this principal and visible after a
  // full route transition, proving that creation was not merely optimistic UI.
  const persistedListResponse = page.waitForResponse((response) =>
    response.url().includes('/api/v1/strategies?') && response.request().method() === 'GET');
  await page.goto('/strategies');
  expect((await persistedListResponse).status()).toBe(200);
  await expect(page.getByTestId(`strategy-row-${strategyName}`)).toBeVisible();
  expect(strategyId).toMatch(/^[0-9a-f-]{36}$/);
});
