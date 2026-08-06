import { expect, test } from '@playwright/test';
import type { Page, Request } from '@playwright/test';
import { SESSION_STORAGE_KEY } from '../src/lib/session';
import {
  BOT_ID,
  OWNER_ACCOUNT_ID,
  OWNER_TOKEN,
  RUN_ID,
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
async function signIn(page: Page, token: string = OWNER_TOKEN): Promise<void> {
  await page.addInitScript(
    ([key, value]) => window.sessionStorage.setItem(key, value),
    [
      SESSION_STORAGE_KEY,
      JSON.stringify({ accessToken: token, accountId: OWNER_ACCOUNT_ID, expiresAt: null }),
    ] as const,
  );
}

/** Every request the page makes to the backtest API, in order. */
function recordApiRequests(page: Page): Request[] {
  const seen: Request[] = [];
  page.on('request', (request) => {
    if (request.url().startsWith(MOCK_API_URL)) seen.push(request);
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
    await expect(runs.getByRole('listitem').first()).toContainText(BOT_ID.slice(0, 8));
    await expect(runs.getByRole('listitem').first()).toContainText('완료');

    // The credential really left the browser on the wire, from the session store and
    // through the shipped client — not from a constant compiled into the bundle.
    const listRequest = requests.find((request) => new URL(request.url()).pathname
      .endsWith('/api/v1/backtests'));
    expect(listRequest).toBeDefined();
    expect(await listRequest!.headerValue('authorization')).toBe(`Bearer ${OWNER_TOKEN}`);
  });

  test('loads the selected run detail: status, attempts and published performance', async ({ page }) => {
    await signIn(page);

    await page.goto(BACKTESTS);

    const detail = page.getByRole('region', { name: '선택한 백테스트 결과' });
    await expect(detail).toBeVisible();
    await expect(detail).toContainText('검증된 공식 결과가 발행되었습니다.');

    const attempts = detail.getByRole('table', { name: '자동 실행 시도 기록' });
    await expect(attempts.getByRole('row')).toHaveCount(2);
    await expect(attempts).toContainText('SUCCEEDED');
    await expect(attempts).toContainText('worker-execution-1');

    // The metrics document, rendered from `metricsDocument` rather than from zeroes.
    await expect(detail).toContainText('$10,299.96');
    await expect(detail).toContainText('2.9996%');
    await expect(detail).toContainText('metrics:1.0.0');
  });

  test('renders an ET month as individual trades, not as evidence manifests', async ({ page }) => {
    const requests = recordApiRequests(page);
    await signIn(page);

    await page.goto(BACKTESTS);
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

  test('says an ET month traded nothing instead of showing an empty table', async ({ page }) => {
    await signIn(page);

    await page.goto(BACKTESTS);

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
});
