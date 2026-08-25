import { readFileSync } from 'node:fs';
import { render as renderBare, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// Views navigate to /login for sign-in states, so every render needs a router.
const render = (ui: ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);
import userEvent from '@testing-library/user-event';
import { HttpResponse, delay, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
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
const balancedStyles = readFileSync('src/styles/balanced.css', 'utf8');

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

function view(token: string | null = OWNER_TOKEN, session = memorySession(token), activePollIntervalMs?: number, onCreateStrategy?: () => void) {
  const client = createBacktestClient({
    baseUrl: BACKTEST_API_BASE,
    getAccessToken: () => session.accessToken(),
  });
  return { session, ...render(<BacktestLiveView
    client={client}
    session={session}
    activePollIntervalMs={activePollIntervalMs}
    onCreateStrategy={onCreateStrategy}
  />) };
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

async function openResultTab(
  user: ReturnType<typeof userEvent.setup>,
  name: '성과 요약' | '월별 분석' | '거래 내역' | '실행 정보',
) {
  await user.click(await screen.findByRole('tab', { name }));
}

describe('BacktestLiveView against the /api/v1 backtest surface', () => {
  it('requests a custom backtest from server-confirmed bots and immutable inputs', async () => {
    let received: Record<string, unknown> | null = null;
    server.use(
      http.get(`${BACKTEST_API_BASE}/api/v1/bots/operations`, () => HttpResponse.json([
        { botId: 'bot-1', name: 'RSI bot' },
      ])),
      http.get(`${BACKTEST_API_BASE}/api/v1/strategy-release-inputs`, () => HttpResponse.json({
        executionPolicies: [{ version: 'policy-v1' }],
        datasets: [{ id: 'dataset-1', feedCode: 'SIP', resolution: '30m', periodStart: '2026-01-01', periodEnd: '2026-06-30' }],
      })),
      http.post(`${BACKTEST_API_BASE}/api/v1/bots/:botId/backtests`, async ({ request }) => {
        received = await request.json() as Record<string, unknown>;
        return HttpResponse.json({ messageId: 'message-1', eventType: 'CUSTOM_BACKTEST_REQUESTED', created: true, runId: 'run-2' }, { status: 202 });
      }),
    );
    const user = userEvent.setup();
    view();

    await user.click(screen.getByRole('button', { name: '새 백테스트' }));
    const dialog = await screen.findByRole('dialog', { name: '새 백테스트' });
    expect(document.querySelector('.backtest-request-panel')).not.toBeInTheDocument();

    const botSelect = within(dialog).getByRole('combobox', { name: '백테스트 봇' });
    expect(botSelect).toHaveAttribute('data-value', 'bot-1');
    expect(within(dialog).queryByRole('combobox', { name: '백테스트 실행 정책' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('실행 정책')).not.toBeInTheDocument();
    await user.click(botSelect);
    const botOptions = within(dialog).getByRole('listbox', { name: '백테스트 봇 옵션' });
    expect(within(botOptions).getByRole('option', { name: 'RSI bot' })).toHaveAttribute('aria-selected', 'true');
    await user.click(within(botOptions).getByRole('option', { name: 'RSI bot' }));

    await user.clear(within(dialog).getByLabelText('백테스트 시작일'));
    await user.type(within(dialog).getByLabelText('백테스트 시작일'), '2026-02-01');
    await user.click(within(dialog).getByRole('button', { name: '백테스트 요청' }));

    await waitFor(() => expect(received).toMatchObject({
      datasetManifestId: 'dataset-1', periodStart: '2026-02-01', executionPolicyVersion: 'policy-v1',
    }));
    expect(await screen.findByText(/백테스트 요청을 접수했습니다/)).toBeInTheDocument();
  });

  it('closes the new backtest modal with Escape without resizing the page workspace', async () => {
    server.use(
      http.get(`${BACKTEST_API_BASE}/api/v1/bots/operations`, () => HttpResponse.json([])),
      http.get(`${BACKTEST_API_BASE}/api/v1/strategy-release-inputs`, () => HttpResponse.json({
        executionPolicies: [], datasets: [],
      })),
    );
    const user = userEvent.setup();
    view();

    await user.click(screen.getByRole('button', { name: '새 백테스트' }));
    expect(await screen.findByRole('dialog', { name: '새 백테스트' })).toBeInTheDocument();
    expect(document.querySelector('.backtest-request-backdrop')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: '새 백테스트' })).not.toBeInTheDocument();
  });

  it('lets the owner cancel a queued backtest and renders the terminal state', async () => {
    server.use(...backtestHandlers({ runs: [QUEUED_RUN] }));
    const user = userEvent.setup();
    view();

    await user.click(await screen.findByRole('button', { name: '실행 취소' }));

    expect(await screen.findByText('사용자가 백테스트 실행을 취소했습니다.')).toBeInTheDocument();
    expect(screen.getAllByText('취소됨').length).toBeGreaterThan(0);
  });

  it('renders the completed run overview with concise metric help', async () => {
    view();

    expect(screen.getByRole('status')).toHaveTextContent('백테스트 결과를 불러오는 중');
    expect(await screen.findAllByText('완료')).not.toHaveLength(0);
    expect(await screen.findByText('$10,299.96')).toBeInTheDocument();
    expect(screen.getByText('$123.45')).toBeInTheDocument();
    expect(screen.getByText('2.9996%')).toBeInTheDocument();
    expect(screen.getByText('-1.00%')).toBeInTheDocument();
    expect(screen.getByText('9.16515139')).toBeInTheDocument();
    expect(screen.getByText('37.50%')).toBeInTheDocument();
    expect(screen.queryByText('계산 기준 보기')).not.toBeInTheDocument();
    expect(screen.getByLabelText('총 수익률 설명')).toBeInTheDocument();
    expect(screen.getByRole('tooltip', { name: '시작 자산과 비교해 종료 자산이 얼마나 늘거나 줄었는지 보여줍니다.' }))
      .toBeInTheDocument();
  });

  it('keeps real results inside the original selector, overview chart and compact metric layout', async () => {
    view();

    const workspace = await screen.findByTestId('backtest-live-workspace');
    expect(workspace).toHaveClass('backtest-comparison-workspace');

    const overview = await screen.findByRole('region', { name: '선택한 백테스트 성과 개요' });
    expect(within(overview).getByText('월별 활동')).toBeInTheDocument();
    expect(within(overview).getByRole('img', { name: '월별 백테스트 활동' })).toBeInTheDocument();
    expect(within(overview).getByText('2026.07')).toBeInTheDocument();
    expect(within(overview).getByText('2026.08')).toBeInTheDocument();

    expect(screen.getByTestId('backtest-live-metrics')).toHaveClass('backtest-metric-panel');
    expect(balancedStyles).toMatch(/\.backtest-live-overview-chart\s*\{[^}]*height:\s*330px/s);
  });

  it('separates dense result categories into one-at-a-time tabs', async () => {
    const user = userEvent.setup();
    view();

    const tabs = await screen.findByRole('tablist', { name: '백테스트 결과 분류' });
    expect(within(tabs).getByRole('tab', { name: '성과 요약' })).toHaveAttribute('aria-selected', 'true');
    expect(within(tabs).getByRole('tab', { name: '월별 분석' })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: '거래 내역' })).toBeInTheDocument();
    expect(within(tabs).getByRole('tab', { name: '실행 정보' })).toBeInTheDocument();
    expect(screen.getByTestId('backtest-live-metrics')).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'ET 월별 판단' })).not.toBeInTheDocument();

    await user.click(within(tabs).getByRole('tab', { name: '월별 분석' }));
    expect(await screen.findByRole('heading', { name: 'ET 월별 판단' })).toBeVisible();
    expect(screen.queryByTestId('backtest-live-metrics')).not.toBeInTheDocument();

    await user.click(within(tabs).getByRole('tab', { name: '거래 내역' }));
    expect(await screen.findByRole('heading', { name: 'ET 월별 거래' })).toBeVisible();

    await user.click(within(tabs).getByRole('tab', { name: '실행 정보' }));
    expect(await screen.findByRole('table', { name: '자동 실행 시도 기록' })).toBeVisible();
  });

  it('keeps active result controls readable in both light and dark themes', () => {
    const monthActiveRule = balancedStyles.match(/\.backtest-live-month-tabs button\.active\s*\{[^}]*\}/s)?.[0] ?? '';
    const resultActiveRule = balancedStyles.match(/\.backtest-live-result-tabs button\.active\s*\{[^}]*\}/s)?.[0] ?? '';

    expect(monthActiveRule).toMatch(/color:\s*var\(--accent\)/);
    expect(monthActiveRule).not.toMatch(/color:\s*var\(--accent-ink\)/);
    expect(resultActiveRule).toMatch(/color:\s*var\(--text\)/);
  });

  it('shows the automatic execution attempt history', async () => {
    const user = userEvent.setup();
    view();
    await openResultTab(user, '실행 정보');

    const attempts = await screen.findByRole('table', { name: '자동 실행 시도 기록' });
    const row = within(attempts).getAllByRole('row')[1];
    expect(within(row).getByText('1')).toBeInTheDocument();
    expect(within(row).getByText('SUCCEEDED')).toBeInTheDocument();
    expect(within(attempts).queryByText('실행 키')).not.toBeInTheDocument();
    expect(within(attempts).getByText('실패 사유')).toBeInTheDocument();
    expect(within(attempts).queryByText('worker-execution-1')).not.toBeInTheDocument();
  });

  it('shows exhausted run and attempt failure reasons with the attempt count', async () => {
    server.use(...backtestHandlers({
      runs: [{ ...FAILED_RUN, attemptCount: 5, failureCode: 'MAX_ATTEMPTS_EXHAUSTED' }],
      attempts: [{
        attemptId: '00000000-0000-4000-8000-000000000905',
        backtestRunId: RUN_ID,
        attemptNumber: 5,
        workerExecutionKey: 'worker-execution-5',
        status: 'FAILED',
        startedAt: '2026-07-31T12:20:00Z',
        completedAt: '2026-07-31T12:25:00Z',
        failureCode: 'WORKER_TIMEOUT',
      }],
    }));

    view();

    expect(await screen.findByText('MAX_ATTEMPTS_EXHAUSTED')).toBeInTheDocument();
    expect(await screen.findByText('공식 백테스트 워커가 처리한 실행 시도 · 총 1회')).toBeInTheDocument();
    expect(screen.getByText('WORKER_TIMEOUT')).toBeInTheDocument();
  });

  it('renders the six ET monthly counters and the first failure condition', async () => {
    const user = userEvent.setup();
    view();

    await openResultTab(user, '월별 분석');
    // The most recent ET month is selected first; July is the month with activity.
    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));

    const judgment = await screen.findByRole('region', { name: '2026년 7월 ET 월별 판단' });
    expect(within(judgment).queryByText('America/New_York')).not.toBeInTheDocument();
    expect(within(judgment).getByRole('article', { name: '평가 21회' })).toBeInTheDocument();
    expect(within(judgment).getByRole('article', { name: '활성 분기 2개' })).toBeInTheDocument();
    expect(within(judgment).getByRole('article', { name: '거래 이벤트 2건' })).toBeInTheDocument();
    expect(within(judgment).getByRole('article', { name: '데이터 공백 1회' })).toBeInTheDocument();
    expect(within(judgment).getByRole('article', { name: '트리거 2회' })).toBeInTheDocument();
    expect(within(judgment).getByRole('article', { name: '거부 1건' })).toBeInTheDocument();
    const counterHelp = [
      ['평가', '해당 월에 전략 조건을 확인한 총 평가 횟수입니다.'],
      ['활성 분기', '해당 월의 평가에 실제로 참여한 서로 다른 전략 흐름의 수입니다.'],
      ['트리거', '전략 조건이 충족되어 거래 판단이 시작된 횟수입니다.'],
      ['거래 이벤트', '전략 실행 과정에서 생성된 거래 관련 이벤트의 수입니다.'],
      ['데이터 공백', '평가에 필요한 시장 데이터가 없거나 충분하지 않았던 횟수입니다.'],
      ['거부', '거래 판단이나 주문이 검증 또는 실행 단계에서 거부로 집계된 건수입니다.'],
    ] as const;
    counterHelp.forEach(([label, description]) => {
      expect(within(judgment).getByLabelText(`${label} 설명`)).toBeInTheDocument();
      expect(within(judgment).getByRole('tooltip', { name: description })).toBeInTheDocument();
    });
    expect(within(judgment).getByText('RSI BELOW 30')).toBeInTheDocument();
    expect(within(judgment).getByLabelText('첫 실패 조건 설명')).toBeInTheDocument();
    expect(within(judgment).getByRole('tooltip', {
      name: '월별 전략 평가가 다음 단계로 진행되지 못했을 때, 가장 먼저 충족되지 않은 조건과 그 횟수를 보여줍니다. 시스템 오류를 뜻하지 않습니다.',
    })).toBeInTheDocument();
    expect(within(judgment).queryByText('BASIC · BASIC')).not.toBeInTheDocument();
    expect(within(judgment).queryByText(/\|step-/)).not.toBeInTheDocument();
    expect(within(judgment).getByText('3회')).toBeInTheDocument();
  });

  it('joins ET Monday week detail parts onto the selected ET month', async () => {
    const user = userEvent.setup();
    view();

    await openResultTab(user, '거래 내역');
    await user.click(await screen.findByRole('tab', { name: '2026년 7월 ET 결과 보기' }));
    await user.click(screen.getByText('데이터 증거 보기'));
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

    await openResultTab(user, '거래 내역');
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

    await openResultTab(user, '거래 내역');
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

    await openResultTab(user, '거래 내역');
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

    // Dense trade detail stays lazy until its result category is actually opened.
    await screen.findByRole('tablist', { name: '백테스트 결과 분류' });
    expect(urls).toEqual([]);
    await openResultTab(user, '거래 내역');
    // The most recent month is opened first. `et_month` is required by the server.
    await waitFor(() => expect(urls).toEqual(['?et_month=2026-08']));
    await user.click(screen.getByRole('tab', { name: '2026년 7월 ET 결과 보기' }));
    await waitFor(() => expect(urls).toEqual(['?et_month=2026-08', '?et_month=2026-07']));
  });

  it('says a month traded nothing rather than showing an empty table', async () => {
    const user = userEvent.setup();
    view();
    await openResultTab(user, '거래 내역');

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
    await openResultTab(user, '거래 내역');
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
    await openResultTab(user, '거래 내역');
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

  it('marks a queued run as an active wait rather than a settled state', async () => {
    server.use(...backtestHandlers({ runs: [QUEUED_RUN], performance: null }));

    view();

    const waiting = await screen.findByText('공식 백테스트 실행을 기다리고 있습니다.');
    expect(waiting.closest('[role="status"]')).not.toBeNull();
    expect(waiting.closest('[role="status"]')).toHaveClass('backtest-live-wait');
    expect(waiting.closest('[role="status"]')!.querySelector('.backtest-live-wait-signal')).not.toBeNull();
    expect(waiting.closest('[role="status"]')!.querySelector('.is-spinning')).toBeNull();
  });

  it('centers the queued signal and disables its motion when reduced motion is requested', () => {
    expect(balancedStyles).toMatch(/\.backtest-live-wait\s*\{[^}]*display:\s*grid[^}]*place-items:\s*center/s);
    expect(balancedStyles).toMatch(/prefers-reduced-motion:\s*reduce[\s\S]*?\.backtest-live-wait-signal i\s*\{[^}]*animation:\s*none/s);
  });

  /* Reproducibility fingerprints, plan checksums and dataset hashes are audit
     material, not something a customer reads off the run screen. */
  it('does not show the locked run inputs or fetch them', async () => {
    const paths = recordRequests();
    server.use(...backtestHandlers({ runs: [QUEUED_RUN], performance: null }));

    view();

    await screen.findByText('공식 백테스트 실행을 기다리고 있습니다.');
    expect(screen.queryByText('잠긴 실행 입력')).not.toBeInTheDocument();
    expect(paths).not.toContain(`/api/v1/backtests/${RUN_ID}/inputs`);
  });

  it('carries no manual refresh action in the page heading', async () => {
    server.use(...backtestHandlers({ runs: [QUEUED_RUN], performance: null }));

    view();

    await screen.findByText('공식 백테스트 실행을 기다리고 있습니다.');
    expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();
  });

  it('reports a running run as still executing', async () => {
    server.use(...backtestHandlers({ runs: [RUNNING_RUN], performance: null }));

    view();

    expect(await screen.findByText('고정된 입력으로 공식 백테스트를 실행하고 있습니다.')).toBeInTheDocument();
  });

  it('explains that a long monthly trade load is verifying source evidence', async () => {
    const user = userEvent.setup();
    server.use(http.get(
      `${BACKTEST_API_BASE}/api/v1/backtests/:runId/monthly-trades`,
      async () => {
        await delay(1_000);
        return HttpResponse.json({ backtestRunId: RUN_ID, etMonth: '2026-08', items: [] });
      },
    ));

    view();
    await openResultTab(user, '거래 내역');

    expect(await screen.findByText('2026년 8월 원본 거래 증거를 검증하는 중입니다.')).toBeInTheDocument();
    expect(screen.getByText('전체 기간이 길면 최대 20초 정도 걸릴 수 있습니다.')).toBeInTheDocument();
  });

  it('polls an active run until the server reports a terminal state', async () => {
    let listCalls = 0;
    server.use(
      http.get(`${BACKTEST_API_BASE}/api/v1/backtests`, () => {
        listCalls += 1;
        return HttpResponse.json({ items: [listCalls === 1 ? QUEUED_RUN : FAILED_RUN], limit: 25, offset: 0 });
      }),
    );

    view(OWNER_TOKEN, memorySession(OWNER_TOKEN), 20);

    expect(await screen.findAllByText('대기 중')).not.toHaveLength(0);
    await waitFor(() => expect(screen.getAllByText('실패').length).toBeGreaterThan(0));
    expect(listCalls).toBeGreaterThanOrEqual(2);
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
    const user = userEvent.setup();
    server.use(...backtestHandlers({ performance: null }));

    view();

    expect(await screen.findByText('성과 요약이 아직 발행되지 않았습니다.')).toBeInTheDocument();
    // The monthly judgment the server does publish is still shown.
    await openResultTab(user, '월별 분석');
    expect(screen.getByRole('tab', { name: '2026년 8월 ET 결과 보기' })).toBeInTheDocument();
  });

  it('stops a signed-out visit at a visible gate instead of firing requests', async () => {
    const paths = recordRequests();

    view(null);

    const gate = await screen.findByTestId('backtest-session-gate');
    expect(gate).toHaveAttribute('data-reason', 'absent');
    // The gate is the shared sign-in state, not a failure alert.
    expect(within(gate).getByRole('status')).toHaveTextContent('로그인이 필요합니다');
    expect(within(gate).getByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    // Not a spinner, not a blank panel, and not eight 401s to find out what the store
    // already knew.
    expect(screen.queryByText(/불러오는 중/)).not.toBeInTheDocument();
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
    // The message is the same sign-in page as everywhere; the reason stays
    // machine-readable on the gate.
    expect(within(gate).getByRole('status')).toHaveTextContent('로그인이 필요합니다');
  });

  it('drops a credential the server answers 401 to, and says so', async () => {
    // A token that looks fine locally and is unknown to the server: the engine calls
    // that 401, not 403, and the only useful next step is signing in again.
    const { session } = view('stale-token');

    const gate = await screen.findByTestId('backtest-session-gate');
    expect(gate).toHaveAttribute('data-reason', 'rejected');
    expect(within(gate).getByRole('status')).toHaveTextContent('로그인이 필요합니다');
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
    const onCreateStrategy = vi.fn();
    let attempt = 0;
    server.use(http.get(`${BACKTEST_API_BASE}/api/v1/backtests`, () => {
      attempt += 1;
      return attempt === 1
        ? new HttpResponse('unavailable', { status: 503 })
        : HttpResponse.json({ items: [], limit: 50, offset: 0 });
    }));

    view(OWNER_TOKEN, memorySession(OWNER_TOKEN), undefined, onCreateStrategy);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('백테스트 결과를 불러오지 못했습니다.');
    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));

    expect(await screen.findByText('백테스트할 봇이 없습니다.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '전략 만들기' }));
    expect(onCreateStrategy).toHaveBeenCalledOnce();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(attempt).toBe(2);
  });
});
