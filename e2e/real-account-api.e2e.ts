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
  const [login] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login') && response.status() === 200),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);
  expect(login.status()).toBe(200);
  // The default returnTo lands on the account page with the JWT login live.
  await expect(page).toHaveURL(/\/account$/);
  const loadedPreferences = await preferencesLoaded;
  expect(loadedPreferences.status()).toBe(200);
  await expect(page.getByRole('heading', { name: '로그인 및 보안' })).toBeVisible();

  // Display preferences intentionally live outside the account screen. The
  // account route exposes only customer-facing security and notification
  // controls. The new email-preference response is covered by backend tests
  // until the root repository points at that backend revision.
  await expect(page.getByLabel('서버 시간대')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: '이메일 알림' })).toBeVisible();

  await page.getByRole('button', { name: '문의하기', exact: true }).click();
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

  // A real strategy is not complete until an official catalog instrument can be selected.
  // The old smoke test stopped before this dialog, so a zero-instrument catalog still passed.
  await page.getByRole('button', { name: 'PARTITION 01 종목 관리' }).click();
  const instrumentDialog = page.getByRole('dialog', { name: 'PARTITION 1 종목 관리' });
  await expect(instrumentDialog.getByRole('option')).toHaveCount(3);
  for (const symbol of ['AAPL', 'MSFT']) {
    await instrumentDialog.getByRole('combobox', { name: '종목 검색' }).fill(symbol);
    await instrumentDialog.getByRole('option', { name: new RegExp(`^${symbol}`) }).click();
    await instrumentDialog.getByRole('button', { name: '종목 추가' }).click();
  }
  await instrumentDialog.getByRole('button', { name: '완료' }).click();
  await expect(page.getByRole('button', { name: 'PARTITION 01 종목 관리' })).toContainText('2개 종목');

  // Build a genuinely composite strategy through the visible editor: five buy conditions and
  // five sell conditions, with every editable variable changed away from its unset state.
  await page.getByRole('tab', { name: /패키지/ }).click();
  await page.getByRole('button', { name: 'RSI 반등 패키지 적용' }).click();
  const partition = page.getByRole('article', { name: 'PARTITION 01' });
  const buyCard = partition.locator('[data-strategy-card]').nth(0);
  const sellCard = partition.locator('[data-strategy-card]').nth(1);

  const choose = async (scope: typeof buyCard, label: string, option: string) => {
    await scope.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  const selectCard = async (card: typeof buyCard, side: '매수' | '매도') => {
    if (await card.getAttribute('data-selected') !== 'true') {
      await card.getByRole('group', { name: `${side} 전략 카드 이동 영역` }).press('Enter');
    }
    await expect(card).toHaveAttribute('data-selected', 'true');
  };
  const addBlock = async (card: typeof buyCard, label: string) => {
    const blocks = card.locator('.draggable-strategy-block');
    const before = await blocks.count();
    await page.getByRole('button', { name: `${label} 블록 추가` }).last().click();
    await expect(blocks).toHaveCount(before + 1);
  };
  await choose(buyCard, 'RSI 반등 방향', '상승');
  await buyCard.getByRole('spinbutton', { name: 'RSI 반등 값' }).fill('31');
  await choose(buyCard, '거래량 비교', '초과');
  await choose(buyCard, '거래량 값 선택', '최근 20봉 평균 거래량 2배');

  await selectCard(buyCard, '매수');
  await page.getByRole('tab', { name: /블록/ }).click();
  for (const label of ['가격 비교', '가격 변화율', '평균선 교차']) {
    await addBlock(buyCard, label);
  }
  await choose(buyCard, '가격 비교 비교', '초과');
  await choose(buyCard, '가격 비교 값 선택', '이전 20봉 최고 가격');
  await choose(buyCard, '가격 변화율 기준 선택', '당일 장 시작가');
  await choose(buyCard, '가격 변화율 방향', '상승');
  await buyCard.getByRole('spinbutton', { name: '가격 변화율 값' }).fill('2.5');
  await choose(buyCard, '평균선 교차 방향', '상승');
  await choose(buyCard, '평균선 교차 값 선택', '20봉 · 60봉');

  await selectCard(sellCard, '매도');
  await choose(sellCard, 'RSI 반등 방향', '하락');
  await sellCard.getByRole('spinbutton', { name: 'RSI 반등 값' }).fill('69');
  for (const label of ['현재 수익률', '보유 기간', '최고 수익률', '고점 대비 하락']) {
    await addBlock(sellCard, label);
  }
  await choose(sellCard, '현재 수익률 방향', '손실');
  await sellCard.getByRole('spinbutton', { name: '현재 수익률 값' }).fill('4');
  await choose(sellCard, '보유 기간 값 선택', '5거래일');
  await choose(sellCard, '최고 수익률 비교', '초과');
  await sellCard.getByRole('spinbutton', { name: '최고 수익률 값' }).fill('12');
  await choose(sellCard, '고점 대비 하락 비교', '초과');
  await sellCard.getByRole('spinbutton', { name: '고점 대비 하락 값' }).fill('6');
  await sellCard.getByRole('spinbutton', { name: '매도 비율' }).fill('50');

  const validationResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/strategies/${strategyId}/validations`)
      && response.request().method() === 'POST');
  const documentSaveResponse = page.waitForResponse((response) =>
    response.url().endsWith(`/api/v1/strategies/${strategyId}/document`)
      && response.request().method() === 'PUT');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const savedDocument = await (await documentSaveResponse).json() as {
    semanticDocument: { groups: Array<{ blocks: Array<{ elementCode: string; parameters: Record<string, string> }> }> };
  };
  const validated = await validationResponse;
  expect(validated.status()).toBe(201);
  const validationBody = await validated.json() as { status: string; findings: Array<{ severity: string }> };
  expect(validationBody.status).toBe('VALID');
  expect(validationBody.findings.some((finding) => finding.severity === 'INFORMATION')).toBe(true);
  await expect(page.getByRole('alert')).toContainText('검증된 출시 가능 상태로 저장했습니다.');

  const savedConditions = savedDocument.semanticDocument.groups.flatMap((group) => group.blocks)
    .filter((block) => block.elementCode !== 'BASIC_EQUAL_ALLOCATION_ORDER');
  expect(savedConditions.map((block) => block.elementCode)).toEqual([
    'BASIC_RSI_CROSS', 'BASIC_VOLUME_COMPARE', 'BASIC_PRICE_COMPARE', 'BASIC_PRICE_CHANGE_PERCENT',
    'BASIC_SMA_CROSS', 'BASIC_RSI_CROSS', 'BASIC_POSITION_RETURN', 'BASIC_HOLDING_PERIOD',
    'BASIC_PEAK_RETURN', 'BASIC_DRAWDOWN_FROM_PEAK',
  ]);
  expect(savedConditions.find((block) => block.elementCode === 'BASIC_PRICE_CHANGE_PERCENT')?.parameters)
    .toMatchObject({ base: 'SESSION_OPEN', direction: 'UP', thresholdPercent: '2.5', resolution: '30m' });
  expect(savedConditions.find((block) => block.elementCode === 'BASIC_HOLDING_PERIOD')?.parameters)
    .toMatchObject({ unit: 'TRADING_DAY', amount: '5', resolution: '30m' });

  const persistedLease = page.waitForResponse((response) =>
    response.url().endsWith('/edit-lease') && response.request().method() === 'POST' && response.status() === 201);
  await page.reload();
  await persistedLease;
  await expect(page.getByRole('spinbutton', { name: '가격 변화율 값' })).toHaveValue('2.5');
  await expect(page.getByRole('spinbutton', { name: '현재 수익률 값' })).toHaveValue('4');
  await expect(page.getByRole('button', { name: '개인 봇 출시' })).toBeEnabled();

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
