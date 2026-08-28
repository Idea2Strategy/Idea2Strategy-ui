import { expect, test } from '@playwright/test';

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
