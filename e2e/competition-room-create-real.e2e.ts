import { expect, test } from '@playwright/test';

test('creates and cancels a real competition room through the three-milestone calendar', async ({ page }) => {
  await page.goto('/login?returnTo=%2Fcompetition');
  await page.getByLabel('로그인 이메일').fill('developer@idea2strategy.local');
  await page.getByLabel('로그인 비밀번호', { exact: true }).fill('TestUser!2026');
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

  for (const [buttonName, marker] of [
    [/모집 시작 선택/, 'recruitment'],
    [/평가 시작 선택/, 'evaluation'],
    [/평가 종료 선택/, 'ending'],
  ] as const) {
    await dialog.getByRole('button', { name: buttonName }).click();
    await dialog.locator(`[role="gridcell"]:has(i.is-${marker})`).click();
  }

  const name = `달력 생성 검증 ${Date.now()}`;
  await dialog.getByLabel('대회 이름').fill(name);
  const [created] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/competition/rooms') && response.request().method() === 'POST'),
    dialog.getByRole('button', { name: '대회 생성' }).click(),
  ]);
  expect(created.status()).toBe(201);
  expect(await created.json()).toMatchObject({ status: 'DRAFT' });

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
