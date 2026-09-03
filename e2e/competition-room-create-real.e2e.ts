import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'desktop', width: 1920, height: 1080 },
] as const;

test('creates and cancels a real competition room through the three-milestone calendar', async ({ page }) => {
  const email = `competition-${Date.now()}@example.com`;
  const password = 'CompetitionUser!2026';

  await page.goto('/signup');
  await page.getByLabel('가입 이메일').fill(email);
  await page.getByLabel('가입 비밀번호', { exact: true }).fill(password);
  await page.getByLabel('가입 비밀번호 확인', { exact: true }).fill(password);
  const [signup] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/signup')),
    page.getByRole('button', { name: '가입', exact: true }).click(),
  ]);
  expect(signup.status()).toBe(202);

  await page.getByLabel('로그인 이메일').fill(email);
  await page.getByLabel('로그인 비밀번호', { exact: true }).fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login') && response.status() === 200),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);
  await expect(page).toHaveURL(/\/account$/);
  await page.goto('/competition');
  await expect(page).toHaveURL(/\/competition$/);

  await page.getByRole('button', { name: '대회 만들기' }).click();
  const dialog = page.getByRole('dialog', { name: '대회 만들기' });
  await expect(dialog.getByText('검증된 표준 채점·수수료·구매력 정책을 자동 적용합니다.')).toBeVisible();
  await expect(dialog.getByRole('grid', { name: '대회 일정 달력' })).toBeVisible();
  await expect(dialog.locator('input[type="datetime-local"]')).toHaveCount(0);
  await expect(dialog.locator('input[type="time"]')).toHaveCount(3);

  await dialog.getByRole('button', { name: '다음 달' }).click();
  const monthLabel = await dialog.locator('.competition-schedule-calendar > header strong').innerText();
  const [, year, month] = monthLabel.match(/(\d{4})년 (\d+)월/) ?? [];
  expect(year && month).toBeTruthy();
  for (const [label, suffix, day] of [['모집 시작', '으로', 2], ['평가 시작', '으로', 6], ['평가 종료', '로', 12]] as const) {
    await dialog.getByRole('gridcell', { name: `${year}년 ${Number(month)}월 ${day}일을 ${label}${suffix} 선택` }).click();
  }
  await dialog.getByLabel('모집 시작 시간').fill('09:00');
  await dialog.getByLabel('평가 시작 시간').fill('10:30');
  await dialog.getByLabel('평가 종료 시간').fill('16:00');

  const name = `달력 생성 검증 ${Date.now()}`;
  await dialog.getByLabel('대회 이름').fill(name);
  const [created] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/competition/rooms') && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: '대회 생성' }).click(),
  ]);
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ status: 'DRAFT' });
  const request = created.request().postDataJSON();
  const prefix = `${year}-${String(Number(month)).padStart(2, '0')}`;
  expect(request).toMatchObject({
    recruitmentOpensAt: `${prefix}-02T00:00:00.000Z`,
    evaluationStartsAt: `${prefix}-06T01:30:00.000Z`,
    evaluationEndsAt: `${prefix}-12T07:00:00.000Z`,
    timezoneName: 'Asia/Seoul',
  });

  const noMatch = `찾을 수 없는 대회 ${Date.now()}`;
  const filtered = page.waitForResponse((response) => response.url().includes('/api/v1/competition/rooms/public?')
    && new URL(response.url()).searchParams.get('q') === noMatch);
  await page.getByRole('searchbox', { name: '대회 검색' }).fill(noMatch);
  expect((await filtered).status()).toBe(200);
  await expect(page.getByText('검색 결과가 없습니다.', { exact: true })).toBeVisible();
  const cleared = page.waitForResponse((response) => response.url().includes('/api/v1/competition/rooms/public?')
    && new URL(response.url()).searchParams.get('q') === '');
  await page.getByRole('button', { name: '대회 검색어 지우기' }).click();
  expect((await cleared).status()).toBe(200);

  for (const viewport of VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByRole('heading', { name: '모의투자' }), viewport.name).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), viewport.name).toBe(true);
  }

  const createLauncher = page.getByRole('button', { name: '대회 만들기' });
  await createLauncher.focus();
  await page.keyboard.press('Enter');
  const keyboardDialog = page.getByRole('dialog', { name: '대회 만들기' });
  await keyboardDialog.getByText('검증된 표준 채점·수수료·구매력 정책을 자동 적용합니다.').waitFor();
  await expect(keyboardDialog.getByRole('button', { name: '대회 만들기 닫기' })).toBeFocused();
  await page.keyboard.press('Shift+Tab');
  await expect(keyboardDialog.getByRole('button', { name: '대회 생성' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(keyboardDialog).toBeHidden();
  await expect(createLauncher).toBeFocused();

  const owned = page.getByRole('listitem', { name: `${name} 관리` });
  await expect(owned).toBeVisible();
  await owned.click();
  const manager = page.getByRole('region', { name: `${name} 관리` });
  await manager.getByLabel('대회 취소 사유').fill('LOCAL_E2E_CLEANUP');
  await manager.getByLabel('대회 취소 확인').fill('취소');
  const [cancelled] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/cancellation') && response.request().method() === 'POST'),
    manager.getByRole('button', { name: '대회 취소', exact: true }).click(),
  ]);
  expect(cancelled.status()).toBe(200);
  await expect(manager.getByRole('status')).toContainText('대회를 취소했습니다.');
});

test('creates a secret room and exercises its one-time invitation controls', async ({ page }) => {
  const email = `competition-secret-${Date.now()}@example.com`;
  const password = 'CompetitionUser!2026';

  await page.goto('/signup');
  await page.getByLabel('가입 이메일').fill(email);
  await page.getByLabel('가입 비밀번호', { exact: true }).fill(password);
  await page.getByLabel('가입 비밀번호 확인', { exact: true }).fill(password);
  const [signup] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/signup')),
    page.getByRole('button', { name: '가입', exact: true }).click(),
  ]);
  expect(signup.status()).toBe(202);

  await page.getByLabel('로그인 이메일').fill(email);
  await page.getByLabel('로그인 비밀번호', { exact: true }).fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login') && response.status() === 200),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);
  await page.goto('/competition');

  await page.getByRole('button', { name: '대회 만들기' }).click();
  const dialog = page.getByRole('dialog', { name: '대회 만들기' });
  await dialog.getByText('검증된 표준 채점·수수료·구매력 정책을 자동 적용합니다.').waitFor();
  await dialog.getByLabel('접근 방식').selectOption('SECRET');
  await dialog.getByRole('button', { name: '다음 달' }).click();
  const monthLabel = await dialog.locator('.competition-schedule-calendar > header strong').innerText();
  const [, year, month] = monthLabel.match(/(\d{4})년 (\d+)월/) ?? [];
  expect(year && month).toBeTruthy();
  for (const [label, suffix, day] of [['모집 시작', '으로', 3], ['평가 시작', '으로', 7], ['평가 종료', '로', 13]] as const) {
    await dialog.getByRole('gridcell', { name: `${year}년 ${Number(month)}월 ${day}일을 ${label}${suffix} 선택` }).click();
  }
  await dialog.getByLabel('모집 시작 시간').fill('09:00');
  await dialog.getByLabel('평가 시작 시간').fill('10:30');
  await dialog.getByLabel('평가 종료 시간').fill('16:00');

  const name = `비밀 대회 검증 ${Date.now()}`;
  await dialog.getByLabel('대회 이름').fill(name);
  const [created] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/competition/rooms') && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: '대회 생성' }).click(),
  ]);
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ accessType: 'SECRET', status: 'DRAFT' });

  const owned = page.getByRole('listitem', { name: `${name} 관리` });
  await expect(owned).toContainText('SECRET');
  await owned.click();
  let manager = page.getByRole('region', { name: `${name} 관리` });
  await expect(manager).toContainText('방장에게만 공개되는 설정·초대·참가 관리 화면입니다.');
  await manager.getByLabel('초대 종류').selectOption('CODE');
  const [issued] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations') && response.request().method() === 'POST'),
    manager.getByRole('button', { name: '초대 생성' }).click(),
  ]);
  expect(issued.status()).toBe(201);
  await expect(manager.locator('.competition-api-inline-status')).toContainText('초대를 생성했습니다.');

  // Leave the manager before any screenshot or later failure can retain the
  // one-time credential. The refreshed room keeps only its invitation metadata.
  await manager.getByRole('button', { name: '대회 목록' }).click();
  await page.getByRole('listitem', { name: `${name} 관리` }).click();
  manager = page.getByRole('region', { name: `${name} 관리` });
  const invitationPanel = manager.getByRole('region', { name: '초대 관리' });
  const [revoked] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/invitations/') && response.request().method() === 'DELETE'),
    invitationPanel.getByRole('button', { name: '취소' }).click(),
  ]);
  expect(revoked.status()).toBe(204);
  await expect(manager.locator('.competition-api-inline-status')).toContainText('초대를 취소했습니다.');

  await manager.getByLabel('대회 취소 사유').fill('LOCAL_E2E_CLEANUP');
  await manager.getByLabel('대회 취소 확인').fill('취소');
  const [cancelled] = await Promise.all([
    page.waitForResponse((response) => response.url().includes('/cancellation') && response.request().method() === 'POST'),
    manager.getByRole('button', { name: '대회 취소', exact: true }).click(),
  ]);
  expect(cancelled.status()).toBe(200);
  await expect(manager.locator('.competition-api-inline-status')).toContainText('대회를 취소했습니다.');
});
