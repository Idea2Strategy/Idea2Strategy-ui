import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HttpResponse, http } from 'msw';
import { setupServer } from 'msw/node';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { createBacktestClient } from './api/backtests';
import {
  BACKTEST_API_BASE,
  FAILED_RUN,
  OWNER_TOKEN,
  QUEUED_RUN,
  RUNNING_RUN,
  RUN_ID,
  UNAVAILABLE_RUN,
  backtestHandlers,
} from './test/backtestApi';
import { BacktestLiveView } from './views/BacktestLiveView';

/*
  The screen is driven through the real client against request-level handlers that
  serve the engine's own payloads. Nothing here stubs a client method, so a path or a
  field the server does not publish fails the test rather than the browser.
*/
const server = setupServer(...backtestHandlers());

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  server.resetHandlers();
  server.events.removeAllListeners();
});
afterAll(() => server.close());

function view(token: string | null = OWNER_TOKEN) {
  const client = createBacktestClient({
    baseUrl: BACKTEST_API_BASE,
    getAccessToken: () => token,
  });
  return render(<BacktestLiveView client={client} />);
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

  it('tells an unauthenticated caller to sign in rather than blaming the network', async () => {
    view(null);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('백테스트 결과를 볼 권한이 없습니다.');
    expect(within(alert).queryByRole('button', { name: '다시 시도' })).not.toBeInTheDocument();
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
