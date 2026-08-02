import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createBacktestClient } from './api/backtests';
import {
  BACKTEST_API_BASE,
  FAILED_RUN,
  JULY_FILL_RECORD_ID,
  JULY_REJECTION_RECORD_ID,
  JULY_TRADES,
  OWNER_ACCOUNT_ID,
  OWNER_TOKEN,
  QUEUED_RUN,
  RUNNING_RUN,
  RUN_ID,
  UNAVAILABLE_RUN,
  backtestHandlers,
} from './test/backtestApi';
import { createSessionStore } from './lib/session';
import type { SessionStore } from './lib/session';
import { BacktestLiveView } from './views/BacktestLiveView';

/*
  The screen is driven through the real client against request-level handlers that
  serve the engine's own payloads. Nothing here stubs a client method, so a path or a
  field the server does not publish fails the test rather than the browser.

  The credential comes from a real session store rather than a constant, because the
  screen's behaviour depends on both halves: what the store says before a request is
  sent, and what the store is left holding after the server refuses one.
*/
const server = setupServer(...backtestHandlers());

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
});
afterAll(() => server.close());

function memorySession(token: string | null): SessionStore {
  const map = new Map<string, string>();
  const store = createSessionStore({
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  });
  if (token !== null) {
    store.signIn({ accessToken: token, accountId: OWNER_ACCOUNT_ID, expiresAt: null });
  }
  return store;
}

function view(token: string | null = OWNER_TOKEN, session = memorySession(token)) {
  const client = createBacktestClient({
    baseUrl: BACKTEST_API_BASE,
    getAccessToken: () => session.accessToken(),
  });
  return { session, ...render(<BacktestLiveView client={client} session={session} />) };
}

/**
 * Narrow a `monthly-trades` override to July.
 *
 * The screen opens on the most recent ET month, so August is fetched before anything
 * is pressed. An override that answered every month would spend itself on August and
 * leave July healthy — the opposite of what these tests are checking.
 */
function julyOnly(request: Request, answer: () => Response): Response {
  const etMonth = new URL(request.url).searchParams.get('et_month');
  return etMonth === '2026-07'
    ? answer()
    : HttpResponse.json({ backtestRunId: RUN_ID, etMonth, items: [] });
}

/** Records the paths the screen actually asks for. */
function recordRequests(): string[] {
  const paths: string[] = [];
  server.events.on('request:start', ({ request }) => paths.push(new URL(request.url).pathname));
  return paths;
}

describe('BacktestLiveView against the /api/v1 backtest surface', () => {
  it('renders the completed run overview, performance and provenance', async () => {
    view();

    expect(screen.getByRole('status')).toHaveTextContent('백테스트 결과를 불러오는 중');
    expect(await screen.findAllByText('완료')).not.toHaveLength(0);
    expect(await screen.findByText('$10,299.96')).toBeInTheDocument();
    expect(screen.getByText('$123.45')).toBeInTheDocument();
    expect(screen.getByText('2.9996%')).toBeInTheDocument();
    expect(screen.getByText('-1.00%')).toBeInTheDocument();
    expect(screen.getByText('9.16515139')).toBeInTheDocument();
    expect(screen.getByText('37.50%')).toBeInTheDocument();
    expect(screen.getByText('metrics:1.0.0')).toBeInTheDocument();
    expect(screen.getByText('metric-rules:1.0.0')).toBeInTheDocument();
  });

  it('shows the automatic execution attempt history', async () => {
    view();

    const attempts = await screen.findByRole('table', { name: '자동 실행 시도 기록' });
    const row = within(attempts).getAllByRole('row')[1];
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(within(row).getByText('SUCCEEDED')).toBeInTheDocument();
    expect(within(row).getByText('worker-execution-1')).toBeInTheDocument();
  });

  it('renders the six ET monthly counters and the first failure condition', async () => {
    const user = userEvent.setup();
    view();

    // The most recent ET month is selected first; July is the month with activity.
    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));

    const judgment = await screen.findByRole('region', { name: '2026년 7월 ET 월별 판단' });
    expect(within(judgment).getByText('평가 21회')).toBeInTheDocument();
    expect(within(judgment).getByText('활성 분기 2개')).toBeInTheDocument();
    expect(within(judgment).getByText('거래 이벤트 2건')).toBeInTheDocument();
    expect(within(judgment).getByText('데이터 공백 1회')).toBeInTheDocument();
    expect(within(judgment).getByText('트리거 2회')).toBeInTheDocument();
    expect(within(judgment).getByText('거부 1건')).toBeInTheDocument();
    expect(within(judgment).getByText('rsi-below-30')).toBeInTheDocument();
    expect(within(judgment).getByText('BASIC · BASIC')).toBeInTheDocument();
    expect(within(judgment).getByText('3회')).toBeInTheDocument();
  });

  it('joins ET Monday week detail parts onto the selected ET month', async () => {
    const user = userEvent.setup();
    view();

    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));
    const july = await screen.findByRole('table', { name: '2026년 7월 거래 상세 증거' });
    // 07-20 sits inside July; 07-27 runs into August and still covers July.
    expect(within(july).getAllByRole('row')).toHaveLength(3);
    expect(within(july).getByText('2026-07-20')).toBeInTheDocument();
    expect(within(july).getByText('2026-07-27')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '2026년 8월 ET 결과 보기' }));
    const august = await screen.findByRole('table', { name: '2026년 8월 거래 상세 증거' });
    expect(within(august).getAllByRole('row')).toHaveLength(3);
    expect(within(august).getByText('2026-08-10')).toBeInTheDocument();
    expect(within(august).getByText('POSITION_SNAPSHOT')).toBeInTheDocument();
    expect(within(august).queryByText('2026-07-20')).not.toBeInTheDocument();
  });

  it('renders the month as individual trades, not as evidence manifests', async () => {
    const user = userEvent.setup();
    view();

    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));

    const trades = await screen.findByRole('table', { name: '2026년 7월 개별 거래' });
    const rows = within(trades).getAllByRole('row').slice(1);
    expect(rows).toHaveLength(2);
    // One row per trade record, keyed by the engine's own record identity — the thing
    // a manifest row (a Parquet part, five rows deep) could never give the screen.
    expect(rows.map((row) => row.getAttribute('data-record-id')))
      .toEqual([JULY_FILL_RECORD_ID, JULY_REJECTION_RECORD_ID]);

    const fill = within(rows[0]);
    expect(fill.getByText('체결')).toBeInTheDocument();
    expect(fill.getByText('FILLED')).toBeInTheDocument();
    expect(fill.getByText('$100.05')).toBeInTheDocument();
    expect(fill.getByText('$2.20')).toBeInTheDocument();
    expect(fill.getByText('$9,897.80')).toBeInTheDocument();
  });

  it('files a trade under its ET month, not the UTC date it carries', async () => {
    const user = userEvent.setup();
    view();

    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));

    // The fill's `occurredAt` is 2026-08-01T03:30:00Z — 23:30 on 31 July in New York.
    // Formatting it in UTC would print an August date under the July tab.
    const trades = await screen.findByRole('table', { name: '2026년 7월 개별 거래' });
    const fill = within(trades).getAllByRole('row')[1];
    expect(within(fill).getByText(/2026\. 07\. 31\./)).toBeInTheDocument();
  });

  it('leaves a rejected order without a quantity, price or fee it never had', async () => {
    const user = userEvent.setup();
    view();

    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));

    const trades = await screen.findByRole('table', { name: '2026년 7월 개별 거래' });
    const rejection = within(trades).getAllByRole('row')[2];
    expect(within(rejection).getByText('거부')).toBeInTheDocument();
    expect(within(rejection).getByText('INSUFFICIENT_BUYING_POWER')).toBeInTheDocument();
    // Six nulls: quantity, price, fee, realised P&L and the two the row does not show.
    // A zero here would be this screen inventing a free trade.
    expect(within(rejection).getAllByText('—').length).toBeGreaterThanOrEqual(4);
    expect(within(rejection).queryByText('$0.00')).not.toBeInTheDocument();
  });

  it('asks the server for the month that was pressed, and only that month', async () => {
    const user = userEvent.setup();
    const urls: string[] = [];
    server.events.on('request:start', ({ request }) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/monthly-trades')) urls.push(url.search);
    });

    view();

    // The most recent month is opened first, so August is asked for before anything
    // is pressed. `et_month` is a required parameter the server never defaults.
    await waitFor(() => expect(urls).toEqual(['?et_month=2026-08']));
    await user.click(screen.getByRole('tab', { name: '2026년 7월 ET 결과 보기' }));
    await waitFor(() => expect(urls).toEqual(['?et_month=2026-08', '?et_month=2026-07']));
  });

  it('says a month traded nothing rather than showing an empty table', async () => {
    view();

    // August is COMPLETED with no trade records: `200 {"items": []}` is the true
    // answer, and it must not read as a loading or a broken month.
    expect(await screen.findByText('2026년 8월에 기록된 개별 거래가 없습니다.')).toBeInTheDocument();
    expect(screen.queryByRole('table', { name: '2026년 8월 개별 거래' })).not.toBeInTheDocument();
  });

  it('refuses a month whose trades disagree with its own judgment summary', async () => {
    const user = userEvent.setup();
    server.use(http.get(
      `${BACKTEST_API_BASE}/api/v1/backtests/:runId/monthly-trades`,
      // July's summary names two record ids; this answer carries one of them.
      ({ request }) => julyOnly(request, () => HttpResponse.json({
        backtestRunId: RUN_ID,
        etMonth: '2026-07',
        items: [JULY_TRADES[0]],
      })),
    ));

    view();
    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));

    expect(await screen.findByText('2026년 7월 거래 기록이 월별 집계와 일치하지 않습니다.'))
      .toBeInTheDocument();
    // A short list is not a quiet month: no partial table is rendered.
    expect(screen.queryByRole('table', { name: '2026년 7월 개별 거래' })).not.toBeInTheDocument();
  });

  it('retries a month whose trades failed in transport, then shows them', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(http.get(
      `${BACKTEST_API_BASE}/api/v1/backtests/:runId/monthly-trades`,
      ({ request }) => julyOnly(request, () => {
        attempt += 1;
        return attempt === 1
          ? new HttpResponse('unavailable', { status: 503 })
          : HttpResponse.json({ backtestRunId: RUN_ID, etMonth: '2026-07', items: JULY_TRADES });
      }),
    ));

    view();
    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));

    const alert = await screen.findByText('2026년 7월 개별 거래를 불러오지 못했습니다.');
    await user.click(within(alert.closest('[role="alert"]')!).getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByRole('table', { name: '2026년 7월 개별 거래' })).toBeInTheDocument();
  });

  it('leaves a queued run out of the result-only endpoints', async () => {
    const paths = recordRequests();
    server.use(...backtestHandlers({ runs: [QUEUED_RUN], performance: null }));

    view();

    expect(await screen.findByText('공식 백테스트 실행을 기다리고 있습니다.')).toBeInTheDocument();
    await waitFor(() => expect(paths).toContain(`/api/v1/backtests/${RUN_ID}/attempts`));
    expect(paths).not.toContain(`/api/v1/backtests/${RUN_ID}/performance`);
    expect(paths).not.toContain(`/api/v1/backtests/${RUN_ID}/monthly-summaries`);
  });

  it('reports a running run as still executing', async () => {
    server.use(...backtestHandlers({ runs: [RUNNING_RUN], performance: null }));

    view();

    expect(await screen.findByText('고정된 입력으로 공식 백테스트를 실행하고 있습니다.')).toBeInTheDocument();
  });

  it('surfaces the real UNAVAILABLE reason code, not a generic message', async () => {
    const paths = recordRequests();
    server.use(...backtestHandlers({ runs: [UNAVAILABLE_RUN], performance: null }));

    view();

    expect(await screen.findByText('MARKET_DATA_GAP')).toBeInTheDocument();
    expect(screen.getByText('필수 입력이 없어 백테스트를 실행할 수 없습니다.')).toBeInTheDocument();
    await waitFor(() => expect(paths).toContain(`/api/v1/backtests/${RUN_ID}/attempts`));
    expect(paths).not.toContain(`/api/v1/backtests/${RUN_ID}/performance`);
  });

  it('surfaces the failure code of a failed run', async () => {
    server.use(...backtestHandlers({ runs: [FAILED_RUN], performance: null }));

    view();

    expect(await screen.findByText('ENGINE_EXECUTION_FAILED')).toBeInTheDocument();
    expect(screen.getByText('백테스트 실행이 실패했습니다.')).toBeInTheDocument();
  });

  it('says the performance summary is not published yet instead of showing zeroes', async () => {
    server.use(...backtestHandlers({ performance: null }));

    view();

    expect(await screen.findByText('성과 요약이 아직 발행되지 않았습니다.')).toBeInTheDocument();
    // The monthly judgment the server does publish is still shown.
    expect(screen.getByRole('tab', { name: '2026년 8월 ET 결과 보기' })).toBeInTheDocument();
  });

  it('stops a signed-out visit at a visible gate instead of firing requests', async () => {
    const paths = recordRequests();

    view(null);

    const gate = await screen.findByTestId('backtest-session-gate');
    expect(gate).toHaveAttribute('data-reason', 'absent');
    expect(within(gate).getByRole('alert')).toHaveTextContent('로그인이 필요합니다.');
    // Not a spinner, not a blank panel, and not eight 401s to find out what the store
    // already knew.
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    await waitFor(() => expect(paths).toEqual([]));
  });

  it('says the session expired when the stored credential is past its own expiry', async () => {
    const session = memorySession(null);
    session.signIn({
      accessToken: OWNER_TOKEN,
      accountId: OWNER_ACCOUNT_ID,
      expiresAt: '2020-01-01T00:00:00Z',
    });

    view(OWNER_TOKEN, session);

    const gate = await screen.findByTestId('backtest-session-gate');
    expect(gate).toHaveAttribute('data-reason', 'expired');
    expect(within(gate).getByRole('alert')).toHaveTextContent('로그인 세션이 만료되었습니다.');
  });

  it('drops a credential the server answers 401 to, and says so', async () => {
    // A token that looks fine locally and is unknown to the server: the engine calls
    // that 401, not 403, and the only useful next step is signing in again.
    const { session } = view('stale-token');

    const gate = await screen.findByTestId('backtest-session-gate');
    expect(gate).toHaveAttribute('data-reason', 'rejected');
    expect(within(gate).getByRole('alert'))
      .toHaveTextContent('로그인 세션이 더 이상 유효하지 않습니다.');
    // The refused token is gone, so a retry cannot resend it.
    expect(session.accessToken()).toBeNull();
  });

  it('keeps the session when the run belongs to another account (403, not 401)', async () => {
    server.use(http.get(
      `${BACKTEST_API_BASE}/api/v1/backtests/:runId`,
      () => HttpResponse.json({ detail: 'belongs to another account' }, { status: 403 }),
    ));

    const { session } = view();

    expect(await screen.findByText('이 백테스트를 볼 권한이 없습니다.')).toBeInTheDocument();
    // A valid credential on somebody else's run is not a reason to sign anyone out.
    expect(session.accessToken()).toBe(OWNER_TOKEN);
    expect(screen.queryByTestId('backtest-session-gate')).not.toBeInTheDocument();
  });

  it('reports a run that no longer exists as missing', async () => {
    server.use(http.get(`${BACKTEST_API_BASE}/api/v1/backtests/:runId`, () => HttpResponse.json(
      { detail: 'backtest run not found' },
      { status: 404 },
    )));

    view();

    expect(await screen.findByText('선택한 백테스트를 찾을 수 없습니다.')).toBeInTheDocument();
  });

  it('refuses to render a malformed run payload', async () => {
    server.use(http.get(
      `${BACKTEST_API_BASE}/api/v1/backtests/:runId`,
      () => HttpResponse.json({ backtestRunId: RUN_ID, status: 'COMPLETED' }),
    ));

    view();

    expect(await screen.findByText('선택한 백테스트 상세를 불러오지 못했습니다.')).toBeInTheDocument();
  });

  it('retries the run list after a transport failure and then shows the empty state', async () => {
    const user = userEvent.setup();
    let attempt = 0;
    server.use(http.get(`${BACKTEST_API_BASE}/api/v1/backtests`, () => {
      attempt += 1;
      return attempt === 1
        ? new HttpResponse('unavailable', { status: 503 })
        : HttpResponse.json({ items: [], limit: 50, offset: 0 });
    }));

    view();

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('백테스트 결과를 불러오지 못했습니다.');
    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('아직 실행된 공식 백테스트가 없습니다.')).toBeInTheDocument();
    expect(attempt).toBe(2);
  });
});
