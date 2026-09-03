import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { SESSION_STORAGE_KEY } from '../src/lib/session';
import {
  BOT_ID,
  FAILED_RUN,
  OWNER_ACCOUNT_ID,
  OWNER_TOKEN,
  QUEUED_RUN,
  RUNNING_RUN,
  RUN_ID,
  UNAVAILABLE_RUN,
} from '../src/test/backtestFixtures';
import { MOCK_API_URL } from './ports';

/*
  The backtest screens, end to end.

  Real: Chromium, the Vite-served application, the router, `defaultBacktestClient`,
  the session store, and HTTP over a socket to a separate origin.

  Mocked: the backtest engine itself. `e2e/mockApi.ts` serves the fixtures the unit
  suite asserts against, with the engine's own status codes and envelope shapes. No
  backtest is executed anywhere in this file, and none of these specs is evidence
  about the engine's correctness.
*/

const BACKTESTS = '/backtests';

/**
 * Put a session where the app keeps one, before any of the app's code runs.
 *
 * This is the same `sessionStorage` record the sign-in flow writes; nothing here
 * reaches into the app's internals or stubs the client. A test that could not sign in
 * this way would mean the store is not actually reading real session state.
 */
async function signIn(page: Page, token: string = OWNER_TOKEN, expiresAt: string | null = null): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key, value),
    [
      SESSION_STORAGE_KEY,
      JSON.stringify({ accessToken: token, accountId: OWNER_ACCOUNT_ID, expiresAt }),
    ] as const,
  );
}

type RunFixture = Record<string, unknown>;

const escapePattern = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const listPattern = new RegExp(`^${escapePattern(MOCK_API_URL)}/api/v1/backtests(?:\\?.*)?$`);
const runPattern = new RegExp(`^${escapePattern(MOCK_API_URL)}/api/v1/backtests/${RUN_ID}$`);
const attemptsPattern = new RegExp(`^${escapePattern(MOCK_API_URL)}/api/v1/backtests/${RUN_ID}/attempts$`);
const cancellationPattern = new RegExp(`^${escapePattern(MOCK_API_URL)}/api/v1/backtests/${RUN_ID}/cancellation$`);

async function routeRun(page: Page, run: RunFixture, listDelayMs = 0): Promise<void> {
  await page.route(listPattern, async (route) => {
    if (listDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, listDelayMs));
    await route.fulfill({ json: { items: [run], limit: 25, offset: 0 } });
  });
  await page.route(runPattern, (route) => route.fulfill({ json: run }));
  await page.route(attemptsPattern, (route) => route.fulfill({ json: { items: [] } }));
}

function observeUnexpectedBrowserErrors(page: Page, allowedStatuses: readonly number[] = []) {
  const expectedStatuses = new Set([401, 404, ...allowedStatuses]);
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() !== 'error') return;
    const expectedControlResponse = [...expectedStatuses]
      .some((status) => message.text().includes(`status of ${status}`));
    if (!expectedControlResponse) errors.push(`console:${message.text()}`);
  });
  page.on('requestfailed', (request) => {
    if (!request.failure()?.errorText.includes('ERR_ABORTED')) {
      errors.push(`request:${new URL(request.url()).pathname}:${request.failure()?.errorText ?? 'unknown'}`);
    }
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && !expectedStatuses.has(response.status())) {
      errors.push(`response:${response.status()}:${new URL(response.url()).pathname}`);
    }
  });
  return errors;
}

/** Every request the page makes to the backtest API, in order. */
function recordApiRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (request) => {
    const url = new URL(request.url());
    if (request.url().startsWith(MOCK_API_URL)
        && url.pathname.startsWith('/api/v1/backtests')) seen.push(request);
  });
  return seen;
}

test.describe('backtest screens against the /api/v1 contract', () => {
  test('sends a signed-out visit straight to the sign-in screen, and asks the API for nothing', async ({ page }) => {
    const requests = recordApiRequests(page);

    await page.goto(BACKTESTS);

    // The route guard redirects before any backtest surface renders: no
    // intermediate page, no spinner, and not a single request to find out
    // what the missing session already answered.
    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
    await expect(page.getByRole('list', { name: '공식 백테스트 실행 목록' })).toHaveCount(0);
    expect(requests).toHaveLength(0);
  });

  test('loads the run list for the signed-in owner, with a real bearer credential', async ({ page }) => {
    const requests = recordApiRequests(page);
    await signIn(page);

    await page.goto(BACKTESTS);

    const runs = page.getByRole('list', { name: '공식 백테스트 실행 목록' });
    await expect(runs).toBeVisible();
    await expect(runs.getByRole('listitem')).toHaveCount(1);
    await expect(runs.getByRole('listitem').first()).toContainText('테스트 봇');
    await expect(runs.getByRole('listitem').first()).toContainText('완료');

    // The credential really left the browser on the wire, from the session store and
    // through the shipped client — not from a constant compiled into the bundle.
    const listRequest = requests.find((request) => new URL(request.url()).pathname
      .endsWith('/api/v1/backtests'));
    expect(listRequest).toBeDefined();
    expect(await listRequest!.headerValue('authorization')).toBe(`Bearer ${OWNER_TOKEN}`);
  });

  test('hard navigation does not wait for the competition workspace module', async ({ page }) => {
    let operationsModuleRequested = false;
    let preferencesRequestPending = false;
    await page.route('**/src/views/OperationsViews.tsx*', async () => {
      operationsModuleRequested = true;
      await new Promise(() => undefined);
    });
    await page.route('**/api/v1/account/preferences', async () => {
      preferencesRequestPending = true;
      await new Promise(() => undefined);
    });
    await signIn(page);

    await page.goto(BACKTESTS);

    await expect(page.getByTestId('backtest-live-workspace')).toBeVisible({ timeout: 3_000 });
    await expect.poll(() => preferencesRequestPending).toBe(true);
    expect(operationsModuleRequested).toBe(false);
  });

  test('opens the new backtest form as a modal with product-styled dropdowns', async ({ page }) => {
    await page.route('**/api/v1/bots/operations', (route) => route.fulfill({
      json: [
        { botId: 'bot-1', name: 'RSI Momentum' },
        { botId: 'bot-2', name: 'Moving Average Cross' },
      ],
    }));
    await page.route('**/api/v1/strategy-release-inputs', (route) => route.fulfill({
      json: {
        executionPolicies: [{ version: 'policy-v1' }, { version: 'policy-v2' }],
        datasets: [
          { id: 'dataset-1', feedCode: 'SIP', resolution: '30m', periodStart: '2025-01-01', periodEnd: '2026-06-30' },
          { id: 'dataset-2', feedCode: 'SIP', resolution: '1d', periodStart: '2025-07-01', periodEnd: '2026-06-30' },
        ],
      },
    }));
    await signIn(page);
    await page.goto(BACKTESTS);

    await page.getByRole('button', { name: '새 백테스트' }).click();
    const dialog = page.getByRole('dialog', { name: '새 백테스트' });
    await expect(dialog).toBeVisible();
    await expect(page.locator('.backtest-request-panel')).toHaveCount(0);

    const botSelect = dialog.getByRole('combobox', { name: '백테스트 봇' });
    await expect(dialog.getByRole('combobox', { name: '백테스트 데이터' })).toHaveCount(0);
    await expect(dialog.getByText('공식 시장 데이터는 전략과 기간에 맞춰 시스템이 자동으로 선택합니다.')).toHaveCount(0);
    await botSelect.click();
    const botOptions = dialog.getByRole('listbox', { name: '백테스트 봇 옵션' });
    await expect(botOptions).toBeVisible();
    await expect(botOptions.getByRole('option').first()).toHaveAttribute('aria-selected', 'true');
  });

  test('loads the selected run detail and separates performance from execution information', async ({ page }) => {
    await signIn(page);

    await page.goto(BACKTESTS);

    const detail = page.getByRole('region', { name: '선택한 백테스트 결과' });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('시장 대비 누적 수익률');
    await expect(detail.getByRole('img', { name: '전략과 시장 ETF 누적 수익률 선 그래프' })).toBeVisible();
    await expect(detail.getByTestId('backtest-comparison-series-strategy')).toBeVisible();
    await expect(detail.getByTestId('backtest-comparison-series-spy')).toBeVisible();
    await expect(detail.getByTestId('backtest-comparison-series-qqq')).toBeVisible();

    // The metrics document, rendered from `metricsDocument` rather than from zeroes.
    await expect(detail).toContainText('$10,299.96');
    await expect(detail).toContainText('2.9996%');
    await expect(detail.getByText('계산 기준 보기')).toHaveCount(0);
    const totalReturnHelp = detail.getByRole('button', { name: '총 수익률 설명' });
    const totalReturnTooltip = detail.getByRole('tooltip', {
      name: '시작 자산과 비교해 종료 자산이 얼마나 늘거나 줄었는지 보여줍니다.',
    });
    await expect(totalReturnTooltip).toBeHidden();
    await totalReturnHelp.hover();
    await expect(totalReturnTooltip).toBeVisible();

    await detail.getByRole('tab', { name: '월별 분석' }).click();
    const monthlyReturns = detail.getByRole('grid', { name: '월간 수익률' });
    await expect(monthlyReturns).toBeVisible();
    await monthlyReturns.getByRole('gridcell', { name: /2026년 7월/ }).click();
    await expect(detail.getByRole('region', { name: '2026년 7월 월간 성과 상세' })).toContainText('+3.00%');
    await expect(detail.getByText('America/New_York')).toHaveCount(0);
    const diagnostic = detail.getByRole('region', { name: '2026년 7월 전략 실행 진단' });
    await expect(diagnostic).toContainText('평가 횟수');
    await expect(diagnostic).toContainText('21회');
    const counterHelp = [
      ['평가 횟수', '해당 월에 전략 조건을 확인한 총 평가 횟수입니다.'],
      ['활성 분기', '해당 월의 평가에 실제로 참여한 서로 다른 전략 흐름의 수입니다.'],
      ['트리거 발생', '전략 조건이 충족되어 거래 판단이 시작된 횟수입니다.'],
      ['거래 이벤트', '전략 실행 과정에서 생성된 거래 관련 이벤트의 수입니다.'],
      ['데이터 공백', '평가에 필요한 시장 데이터가 없거나 충분하지 않았던 횟수입니다.'],
      ['거부', '거래 판단이나 주문이 검증 또는 실행 단계에서 거부로 집계된 건수입니다.'],
    ] as const;
    for (const [label, description] of counterHelp) {
      const help = detail.getByRole('button', { name: `${label} 설명` });
      const tooltip = detail.getByRole('tooltip', { name: description });
      await expect(tooltip).toBeHidden();
      await help.hover();
      await expect(tooltip).toBeVisible();
    }
    await expect(detail.getByText('RSI BELOW 30')).toBeVisible();
    const firstFailureHelp = detail.getByRole('button', { name: '첫 실패 조건 설명' });
    const firstFailureTooltip = detail.getByRole('tooltip', {
      name: '월별 전략 평가가 다음 단계로 진행되지 못했을 때, 가장 먼저 충족되지 않은 조건과 그 횟수를 보여줍니다. 시스템 오류를 뜻하지 않습니다.',
    });
    await expect(firstFailureTooltip).toBeHidden();
    await firstFailureHelp.hover();
    await expect(firstFailureTooltip).toBeVisible();
    await expect(detail.getByText('BASIC · BASIC')).toHaveCount(0);

    await detail.getByRole('tab', { name: '실행 정보' }).click();
    const attempts = detail.getByRole('table', { name: '자동 실행 시도 기록' });
    await expect(attempts.getByRole('row')).toHaveCount(2);
    await expect(attempts).toContainText('SUCCEEDED');
    await expect(attempts).not.toContainText('실행 키');
    await expect(attempts).not.toContainText('실패 코드');
    await expect(attempts).not.toContainText('worker-execution-1');
  });

  test('renders an ET month as individual trades, not as evidence manifests', async ({ page }) => {
    const requests = recordApiRequests(page);
    await signIn(page);

    await page.goto(BACKTESTS);
    await page.getByRole('tab', { name: '거래 내역' }).click();
    await page.getByRole('tab', { name: '2026년 7월 ET 결과 보기' }).click();

    const trades = page.getByRole('table', { name: '2026년 7월 개별 거래' });
    await expect(trades).toBeVisible();

    // One row per trade record. A manifest row describes a Parquet part five records
    // deep and could never produce these.
    const rows = trades.locator('tbody tr');
    await expect(rows).toHaveCount(2);

    const fill = rows.nth(0);
    await expect(fill).toContainText('체결');
    await expect(fill).toContainText('FILLED');
    await expect(fill).toContainText('$100.05');
    await expect(fill).toContainText('$2.20');
    await expect(fill).toContainText('$9,897.80');
    // Its `occurredAt` is 2026-08-01T03:30:00Z — 23:30 on 31 July in New York. Under
    // the July tab it has to read as July.
    await expect(fill).toContainText('2026. 07. 31.');

    const rejection = rows.nth(1);
    await expect(rejection).toContainText('거부');
    await expect(rejection).toContainText('INSUFFICIENT_BUYING_POWER');
    // A rejected order has no quantity, price or fee, and must not be shown one.
    await expect(rejection).not.toContainText('$0.00');

    // The month is a required query parameter the server never defaults.
    const tradeRequest = requests.find((request) => request.url().includes('/monthly-trades'));
    expect(tradeRequest).toBeDefined();
    expect(new URL(tradeRequest!.url()).searchParams.get('et_month')).toBe('2026-08');
    expect(requests.some((request) => request.url()
      .endsWith(`/api/v1/backtests/${RUN_ID}/monthly-trades?et_month=2026-07`))).toBe(true);
  });

  test('keeps selected backtest controls readable in dark and light themes', async ({ page }) => {
    await signIn(page);
    await page.goto(BACKTESTS);

    const resultTab = page.getByRole('tab', { name: '월별 분석' });
    await resultTab.click();
    const monthCell = page.getByRole('gridcell', { name: /2026년 8월/ });

    await page.getByRole('button', { name: '화면 설정 열기' }).click();
    await page.getByRole('button', { name: '다크 모드' }).click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'dark');
    await expect(resultTab).toHaveCSS('color', 'rgb(220, 227, 228)');
    await expect(monthCell.locator('strong')).toHaveCSS('font-size', '11px');

    await page.getByRole('button', { name: '라이트 모드' }).click();
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light');
    await expect(resultTab).toHaveCSS('color', 'rgb(26, 34, 36)');
    await expect(monthCell.locator('strong')).toHaveCSS('font-size', '11px');
  });

  test('says an ET month traded nothing instead of showing an empty table', async ({ page }) => {
    await signIn(page);

    await page.goto(BACKTESTS);
    await page.getByRole('tab', { name: '거래 내역' }).click();

    // August is COMPLETED with no trade records: `200 {"items": []}` is the answer,
    // and it opens first because the screen selects the most recent month.
    await expect(page.getByText('2026년 8월에 기록된 개별 거래가 없습니다.')).toBeVisible();
    await expect(page.getByRole('table', { name: '2026년 8월 개별 거래' })).toHaveCount(0);
    await expect(page.getByRole('status')).toHaveCount(0);
  });

  test('drops a credential the server answers 401 to and stops resending it', async ({ page }) => {
    const requests = recordApiRequests(page);
    await signIn(page, 'a-token-this-server-does-not-know');

    await page.goto(BACKTESTS);

    // The refused token is dropped, and with no session left the route guard
    // moves the visit to the sign-in screen instead of retrying.
    await expect(page).toHaveURL(/\/login$/);

    // Nothing may resend the refused token: after the drop, no further
    // backtest request leaves. Signed out the top bar carries no product tabs,
    // so the revisit steers the SPA history directly; the route guard turns it
    // straight back to sign-in. (Only /api/v1/backtests requests count — other
    // screens ask the same mock origin for their own lists.)
    const backtestRequests = () => requests.filter((request) => request.url().includes('/api/v1/backtests'));
    await page.waitForLoadState('networkidle');
    const before = backtestRequests().length;
    await page.evaluate(() => {
      window.history.pushState({}, '', '/backtests');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL(/\/login$/);
    await page.waitForLoadState('networkidle');
    expect(backtestRequests()).toHaveLength(before);

    const stored = await page.evaluate(
      (key) => window.sessionStorage.getItem(key),
      SESSION_STORAGE_KEY,
    );
    expect(stored).toBeNull();
  });

  const stateScenarios: Array<{ name: string; run: RunFixture; copy: string }> = [
    { name: 'queued', run: QUEUED_RUN as RunFixture, copy: '공식 백테스트 실행을 기다리고 있습니다.' },
    { name: 'running', run: RUNNING_RUN as RunFixture, copy: '고정된 입력으로 공식 백테스트를 실행하고 있습니다.' },
    {
      name: 'cancelling',
      run: { ...(RUNNING_RUN as RunFixture), cancellationRequestedAt: '2026-08-08T12:00:00Z', cancellationReasonCode: 'USER_CANCELLED' },
      copy: '취소 요청을 전달했습니다. 워커가 다음 안전 지점에서 실행을 종료합니다.',
    },
    {
      name: 'cancelled',
      run: {
        ...(QUEUED_RUN as RunFixture), status: 'CANCELLED', completedAt: '2026-08-08T12:01:00Z',
        cancelledAt: '2026-08-08T12:01:00Z', cancellationReasonCode: 'USER_CANCELLED',
      },
      copy: '사용자가 백테스트 실행을 취소했습니다.',
    },
    { name: 'failed', run: FAILED_RUN as RunFixture, copy: '백테스트 실행이 실패했습니다.' },
    { name: 'unavailable', run: UNAVAILABLE_RUN as RunFixture, copy: '필수 입력이 없어 백테스트를 실행할 수 없습니다.' },
  ];

  for (const scenario of stateScenarios) {
    test(`renders the ${scenario.name} lifecycle state in a fresh browser context`, async ({ page }) => {
      const errors = observeUnexpectedBrowserErrors(page);
      await routeRun(page, scenario.run);
      await signIn(page);

      await page.goto(BACKTESTS);

      await expect(page.getByText(scenario.copy, { exact: true })).toBeVisible();
      expect(errors).toEqual([]);
    });
  }

  test('renders loading and then the honest empty state', async ({ page }) => {
    const errors = observeUnexpectedBrowserErrors(page);
    await page.route(listPattern, async (route) => {
      await new Promise((resolve) => setTimeout(resolve, 800));
      await route.fulfill({ json: { items: [], limit: 25, offset: 0 } });
    });
    await signIn(page);

    await page.goto(BACKTESTS);
    await expect(page.getByRole('status')).toContainText('백테스트 결과를 불러오는 중입니다.');
    await expect(page.getByText('백테스트할 봇이 없습니다.', { exact: true })).toBeVisible();
    await expect(page.getByText('출시된 봇이 생기면 공식 백테스트가 자동으로 시작되고 이곳에 결과가 표시됩니다.')).toBeVisible();
    expect(errors).toEqual([]);
  });

  test('renders a forbidden list without discarding the valid customer session', async ({ page }) => {
    const errors = observeUnexpectedBrowserErrors(page, [403]);
    await page.route(listPattern, (route) => route.fulfill({ status: 403, json: { detail: 'forbidden' } }));
    await signIn(page);

    await page.goto(BACKTESTS);

    await expect(page.getByRole('heading', { name: '백테스트 결과를 볼 권한이 없습니다.' })).toBeVisible();
    expect(await page.evaluate((key) => window.sessionStorage.getItem(key), SESSION_STORAGE_KEY)).not.toBeNull();
    expect(errors).toEqual([]);
  });

  test('expires a locally stale session before any backtest request leaves', async ({ page }) => {
    const requests = recordApiRequests(page);
    const errors = observeUnexpectedBrowserErrors(page);
    await signIn(page, OWNER_TOKEN, '2020-01-01T00:00:00Z');

    await page.goto(BACKTESTS);

    await expect(page).toHaveURL(/\/login$/);
    await expect(page.getByRole('heading', { name: '로그인' })).toBeVisible();
    expect(requests).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('keeps a cancellation conflict visible and retryable', async ({ page }) => {
    const errors = observeUnexpectedBrowserErrors(page, [409]);
    await routeRun(page, RUNNING_RUN as RunFixture);
    await page.route(cancellationPattern, (route) => route.fulfill({
      status: 409,
      json: { detail: { reasonCode: 'BACKTEST_TERMINAL_STATE', message: 'run already terminal' } },
    }));
    await signIn(page);

    await page.goto(BACKTESTS);
    await page.getByRole('button', { name: '실행 취소' }).click();

    await expect(page.getByText('백테스트 취소 요청을 처리하지 못했습니다. 상태를 새로고침한 뒤 다시 시도해 주세요.')).toBeVisible();
    await expect(page.getByRole('button', { name: '실행 취소' })).toBeEnabled();
    expect(errors).toEqual([]);
  });

  for (const viewport of [
    { name: 'phone', width: 390, height: 844 },
    { name: 'tablet', width: 768, height: 1024 },
    { name: 'laptop', width: 1440, height: 900 },
    { name: 'desktop', width: 1920, height: 1080 },
  ] as const) {
    test(`keeps the completed analysis usable at ${viewport.name} width`, async ({ page }) => {
      const errors = observeUnexpectedBrowserErrors(page);
      await page.setViewportSize({ width: viewport.width, height: viewport.height });
      await signIn(page);
      await page.goto(BACKTESTS);
      await expect(page.getByTestId('backtest-live-workspace')).toBeVisible();

      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
      const actions = await page.locator('.backtest-live-page button:not(:disabled), .backtest-live-page a[href], .backtest-live-page input:not(:disabled), .backtest-live-page select:not(:disabled)')
        .evaluateAll((elements) => elements.filter((element) => {
          const node = element as HTMLElement;
          const style = getComputedStyle(node);
          return style.display !== 'none' && style.visibility !== 'hidden' && node.getClientRects().length > 0;
        }).map((element) => ({
          name: element.getAttribute('aria-label')?.trim()
            || (element as HTMLElement).innerText?.trim()
            || ('labels' in element ? (element as HTMLInputElement).labels?.[0]?.innerText.trim() : '')
            || element.getAttribute('title')?.trim()
            || '',
          html: element.outerHTML.slice(0, 240),
        })));
      expect(actions.length).toBeGreaterThan(0);
      expect(actions.filter((action) => !action.name)).toEqual([]);

      const launcher = page.getByRole('button', { name: '새 백테스트' });
      await launcher.focus();
      await page.keyboard.press('Enter');
      const dialog = page.getByRole('dialog', { name: '새 백테스트' });
      await expect(dialog).toBeVisible();
      await expect(dialog.getByRole('button', { name: '새 백테스트 창 닫기' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(dialog).toBeHidden();
      await expect(launcher).toBeFocused();
      expect(errors).toEqual([]);
    });
  }
});
