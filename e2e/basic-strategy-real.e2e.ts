import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

const PROOF_VIEWPORTS = [
  { name: 'phone', width: 390, height: 844 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1440, height: 900 },
  { name: 'desktop', width: 1920, height: 1080 },
] as const;

async function assertResponsiveWorkspace(page: Page, testId: string) {
  for (const viewport of PROOF_VIEWPORTS) {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await expect(page.getByTestId(testId), viewport.name).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), viewport.name).toBe(true);
  }
}

test.skip(!process.env.A23_FULL_STACK_E2E, 'requires the deploy-like local stack');

test.afterEach(async ({ page }) => {
  const match = /\/strategies\/([^/]+)\/basic$/.exec(new URL(page.url()).pathname);
  if (!match || await page.getByRole('heading', { name: '다른 곳에서 편집 중입니다.' }).count()) return;
  const released = page.waitForResponse((response) => response.url().endsWith(`/api/v1/strategies/${match[1]}/edit-lease`)
    && response.request().method() === 'DELETE' && response.status() === 204, { timeout: 5_000 }).catch(() => null);
  await page.goto('/strategies');
  await released;
});

test('opens the CLI-authored full Basic catalog across four resolutions', async ({ page }) => {
  const email = process.env.A23_TEST_EMAIL;
  const password = process.env.A23_TEST_PASSWORD;
  const strategyId = process.env.A23_CLI_STRATEGY_ID;
  if (!email || !password || !strategyId) {
    test.skip(true, 'requires the local CLI-authored strategy fixture');
  }

  await page.goto('/login');
  await page.getByLabel('로그인 이메일').fill(email!);
  await page.getByLabel('로그인 비밀번호', { exact: true }).fill(password!);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login') && response.status() === 200),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);

  await page.goto(`/strategies/${strategyId}/basic`);

  await expect(page.getByTestId('basic-editor-workspace')).toBeVisible();
  await expect(page.getByText('이 전략은 현재 편집기에서 열 수 없습니다.')).toHaveCount(0);
  await expect(page.getByRole('article', { name: 'PARTITION 01' })).toContainText('AAPL');
  await expect(page.getByRole('article', { name: 'PARTITION 01' })).toContainText('30분봉');
  await expect(page.getByRole('article', { name: 'PARTITION 02' })).toContainText('MSFT');
  await expect(page.getByRole('article', { name: 'PARTITION 02' })).toContainText('1시간봉');
  await expect(page.getByRole('article', { name: 'PARTITION 03' })).toContainText('META');
  await expect(page.getByRole('article', { name: 'PARTITION 03' })).toContainText('4시간봉');
  await expect(page.getByRole('article', { name: 'PARTITION 04' })).toContainText('NVDA');
  await expect(page.getByRole('article', { name: 'PARTITION 04' })).toContainText('일봉');
  await expect(page.locator('[data-strategy-card]')).toHaveCount(14);
  await assertResponsiveWorkspace(page, 'basic-editor-workspace');

  // Every user-visible Basic condition family is represented by the canonical
  // fixture. Order emission is implicit in each card and verified by the
  // compiler/result integration suites.
  for (const blockLabel of [
    '가격 비교', '가격 변화율', '현재 수익률', '보유 기간', '거래량',
    '연속 상승·하락', '최고 수익률', '평균선 교차', 'RSI 반등',
    '고점 대비 하락', 'MACD 전환', '가격 띠 반전',
  ]) {
    await expect(page.getByText(blockLabel, { exact: true }).first()).toBeVisible();
  }

  const released = page.waitForResponse((response) => response.url().endsWith(`/api/v1/strategies/${strategyId}/edit-lease`)
    && response.request().method() === 'DELETE');
  await page.getByRole('button', { name: '목록', exact: true }).click();
  expect((await released).status()).toBe(204);
});

test('releases missing Basic blocks and renders the real official backtest result', async ({ page }) => {
  const email = process.env.A23_TEST_EMAIL;
  const password = process.env.A23_TEST_PASSWORD;
  const receiptPath = process.env.A23_RECEIPT_PATH;
  if (!email || !password || !receiptPath) throw new Error('full-stack account and receipt environment is required');

  await page.goto('/login');
  await page.getByLabel('로그인 이메일').fill(email);
  await page.getByLabel('로그인 비밀번호', { exact: true }).fill(password);
  await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/auth/login') && response.status() === 200),
    page.getByRole('button', { name: '로그인', exact: true }).click(),
  ]);

  await page.goto('/strategies');
  const strategyName = `Real Basic Result ${Date.now()}`;
  await page.getByRole('button', { name: '새 전략' }).click();
  await page.getByRole('textbox', { name: '전략 이름' }).fill(strategyName);
  const [created] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith('/api/v1/strategies') && response.request().method() === 'POST'),
    page.getByRole('button', { name: 'Basic으로 시작' }).click(),
  ]);
  expect(created.status()).toBe(201);
  const strategyId = String((await created.json()).id);
  await expect(page.getByTestId('basic-editor-workspace')).toBeVisible();

  await page.getByRole('button', { name: 'PARTITION 01 종목 관리' }).click();
  const instruments = page.getByRole('dialog', { name: 'PARTITION 1 종목 관리' });
  await instruments.getByRole('combobox', { name: '종목 검색' }).fill('AAPL');
  await instruments.getByRole('option', { name: /^AAPL/ }).click();
  await instruments.getByRole('button', { name: '종목 추가' }).click();
  await instruments.getByRole('button', { name: '완료' }).click();

  await page.getByRole('tab', { name: /패키지/ }).click();
  await page.getByRole('button', { name: '정기 매수 패키지 적용' }).click();
  const card = page.getByRole('article', { name: 'PARTITION 01' }).locator('[data-strategy-card]').first();
  if (await card.getAttribute('data-selected') !== 'true') {
    await card.getByRole('group', { name: '매수 전략 카드 이동 영역' }).press('Enter');
  }
  await expect(card).toHaveAttribute('data-selected', 'true');
  await page.getByRole('tab', { name: /블록/ }).click();
  for (const label of ['연속 상승·하락', 'MACD 전환', '가격 띠 반전']) {
    const blocks = card.locator('.draggable-strategy-block');
    const before = await blocks.count();
    await page.getByRole('button', { name: `${label} 블록 추가` }).last().press('Enter');
    await expect(blocks).toHaveCount(before + 1);
  }
  const choose = async (label: string, option: string) => {
    await card.getByRole('combobox', { name: label }).click();
    await page.getByRole('option', { name: option, exact: true }).click();
  };
  await choose('연속 상승·하락 방향', '상승');
  await choose('연속 상승·하락 값 선택', '3봉');
  await choose('MACD 전환 방향', '상승');
  await choose('MACD 전환 값 선택', '12 · 26 · 9');
  await choose('가격 띠 반전 방향', '상승');
  await choose('가격 띠 반전 값 선택', '20봉 · 2σ');

  const saveResponse = page.waitForResponse((response) => response.url().endsWith(`/api/v1/strategies/${strategyId}/document`)
    && response.request().method() === 'PUT');
  const validationResponse = page.waitForResponse((response) => response.url().endsWith(`/api/v1/strategies/${strategyId}/validations`)
    && response.request().method() === 'POST');
  await page.getByRole('button', { name: '저장', exact: true }).click();
  const saved = await (await saveResponse).json() as { semanticDocument: { groups: Array<{ blocks: Array<{ elementCode: string }> }> } };
  const validation = await validationResponse;
  expect(validation.status()).toBe(201);
  expect((await validation.json()).status).toBe('VALID');
  expect(saved.semanticDocument.groups[0].blocks.map((block) => block.elementCode)).toEqual([
    'BASIC_SCHEDULE', 'BASIC_STREAK', 'BASIC_MACD_CROSS', 'BASIC_BOLLINGER_REVERSAL',
    'BASIC_EQUAL_ALLOCATION_ORDER',
  ]);

  await page.getByRole('button', { name: '개인 봇 출시' }).click();
  const launch = page.getByRole('dialog', { name: '개인 운용 봇 출시' });
  await launch.getByLabel('초기 운용 자금').fill('100000');
  await launch.getByLabel('전략 운용 예산 비율').fill('100');
  const [releasedResponse] = await Promise.all([
    page.waitForResponse((response) => response.url().endsWith(`/api/v1/strategies/${strategyId}/releases`)
      && response.request().method() === 'POST'),
    launch.getByRole('button', { name: '봇 출시하기' }).click(),
  ]);
  const releasedBody = await releasedResponse.json();
  expect(releasedResponse.status(), JSON.stringify(releasedBody)).toBe(201);
  const released = releasedBody as { releaseId: string; botId: string; backtestLane: string };
  expect(released.backtestLane).toBe('BASIC');

  let completedRun: { backtestRunId: string; status: string; resultHash: string | null } | undefined;
  await expect.poll(async () => {
    const list = await page.evaluate(async () => {
      const session = JSON.parse(sessionStorage.getItem('i2s.session') ?? '{}') as { accessToken?: string };
      const response = await fetch('/api/v1/backtests?limit=25&offset=0', {
        headers: session.accessToken ? { Authorization: `Bearer ${session.accessToken}` } : {},
      });
      return response.ok ? response.json() : { items: [] };
    }) as { items: Array<{ backtestRunId: string; botId: string; status: string; resultHash: string | null }> };
    completedRun = list.items.find((run) => run.botId === released.botId);
    return completedRun?.status;
  }, { timeout: 180_000, intervals: [1_000, 2_000, 5_000] }).toBe('COMPLETED');

  await page.goto('/backtests');
  await expect(page.getByTestId('backtest-live-workspace')).toBeVisible();
  const selectedResult = page.getByRole('region', { name: '선택한 백테스트 결과' });
  await expect(selectedResult.getByRole('heading', { name: `${strategyName} 성과 개요` })).toBeVisible();
  await expect(selectedResult.getByText('완료', { exact: true }).first()).toBeVisible();
  await expect(selectedResult.getByText('시장 대비 누적 수익률', { exact: true })).toBeVisible();
  await expect(page.getByTestId('backtest-live-metrics')).toBeVisible();
  expect(completedRun?.resultHash).toMatch(/^[0-9a-f]{64}$/);
  await assertResponsiveWorkspace(page, 'backtest-live-workspace');

  mkdirSync(path.dirname(receiptPath), { recursive: true });
  writeFileSync(receiptPath, `${JSON.stringify({
    schemaVersion: 1, strategyId, releaseId: released.releaseId, botId: released.botId,
    runs: { BASIC: { runId: completedRun?.backtestRunId, terminalState: completedRun?.status, resultChecksum: completedRun?.resultHash } },
  }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
});
