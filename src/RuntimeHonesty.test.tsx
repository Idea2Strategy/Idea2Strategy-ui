import { fireEvent, render as renderBare, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// Views navigate to /login for sign-in states, so every render needs a router.
const render = (ui: ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>, { wrapper: undefined });
const wrap = (ui: ReactElement) => <MemoryRouter>{ui}</MemoryRouter>;
import { describe, expect, test, vi } from 'vitest';
import { BotOperationsApiError } from './api/botOperations';
import { setSessionAccessToken } from './api/sessionAccessToken';
import type { BotOperationsClient, BotOperationsView } from './api/botOperations';
import type { DashboardClient, DashboardSnapshot } from './api/dashboard';
import type { MarketBar, MarketDataClient } from './api/marketData';
import { StrategyApiError } from './api/strategies';
import type { StrategyLibraryClient, StrategyLibraryPage } from './api/strategies';
import { LanguageProvider } from './lib/i18n';
import { BotsView } from './views/BotsView';
import { DashboardView } from './views/DashboardView';
import { StrategyHome } from './views/StrategyViews';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

const strategyPage = (name?: string): StrategyLibraryPage => ({
  items: name ? [{
    id: '20000000-0000-4000-8000-000000000001',
    kind: 'draft',
    mode: 'BASIC',
    name,
    description: null,
    status: 'DRAFT',
    validationStatus: 'VALID',
    backtestStatus: 'AVAILABLE',
    editable: true,
    updatedAt: '2026-08-04T12:00:00Z',
    version: null,
    blockCount: 2,
    symbols: ['AAPL'],
  }] : [],
  nextCursor: null,
  hasMore: false,
});

const strategyClient = (read: () => Promise<StrategyLibraryPage>): StrategyLibraryClient => ({
  list: vi.fn(read),
});

const operation = (name: string): BotOperationsView => ({
  botId: '30000000-0000-4000-8000-000000000001',
  name,
  state: 'running',
  lifecycleChangedAt: '2026-08-04T12:00:00Z',
  executionBlockedAt: null,
  executionBlockReasonCode: null,
  lastEventSequence: 0,
  instruments: [],
});

const botClient = (read: () => Promise<BotOperationsView[]>): BotOperationsClient => ({
  listOperations: vi.fn(read),
  listJudgments: vi.fn().mockResolvedValue({ entries: [], nextAfterSequence: 0, hasMore: false }),
  runBot: vi.fn(),
  stopBot: vi.fn(),
});

const dashboardSnapshot = (name?: string, withPerformance = true): DashboardSnapshot => ({
  generatedAt: '2026-08-07T12:00:00Z',
  bots: name ? [{
    botId: '30000000-0000-4000-8000-000000000001',
    name,
    state: 'running',
    lifecycleChangedAt: '2026-08-07T11:59:00Z',
    performance: withPerformance ? {
      equityAmount: 10540,
      totalReturnPct: 5.4,
      maxDrawdownPct: -2.1,
      sharpeRatio: 1.25,
      calculationRulesVersion: 'performance-v1',
      updatedAt: '2026-08-07T11:59:30Z',
    } : null,
    competition: null,
  }] : [],
});

const dashboardClient = (read: () => Promise<DashboardSnapshot>): DashboardClient => ({
  getSnapshot: vi.fn(read),
});

describe('production runtime honesty', () => {
  test('strategy library shows loading then a real empty result without seeded strategies', async () => {
    const request = deferred<StrategyLibraryPage>();
    render(<StrategyHome openEditor={() => {}} client={strategyClient(() => request.promise)} />);

    expect(screen.getByRole('status')).toHaveTextContent('전략 목록을 불러오는 중입니다.');
    expect(screen.queryByTestId('strategy-row-Opening Range Flow')).not.toBeInTheDocument();

    request.resolve(strategyPage());
    expect(await screen.findByText('아직 만든 전략이 없습니다.')).toBeInTheDocument();
    expect(screen.queryByTestId('strategy-row-Opening Range Flow')).not.toBeInTheDocument();
  });

  test('strategy library failure never falls back to seeded success data', async () => {
    render(<StrategyHome
      openEditor={() => {}}
      client={strategyClient(() => Promise.reject(new Error('offline')))}
    />);

    expect(await screen.findByRole('alert')).toHaveTextContent('전략 목록을 불러오지 못했습니다.');
    expect(screen.queryByTestId('strategy-row-Opening Range Flow')).not.toBeInTheDocument();
  });

  test('strategy library preserves only a previously confirmed server result', async () => {
    const first = strategyClient(() => Promise.resolve(strategyPage('Confirmed Strategy')));
    const second = strategyClient(() => Promise.reject(new Error('offline')));
    const view = render(<StrategyHome openEditor={() => {}} client={first} />);
    expect(await screen.findByTestId('strategy-row-Confirmed Strategy')).toBeInTheDocument();

    view.rerender(wrap(<StrategyHome openEditor={() => {}} client={second} />));

    expect(await screen.findByRole('alert')).toHaveTextContent('마지막으로 확인한 전략 목록');
    expect(screen.getByTestId('strategy-row-Confirmed Strategy')).toBeInTheDocument();
    expect(screen.queryByTestId('strategy-row-Opening Range Flow')).not.toBeInTheDocument();
  });

  test('bot operations show loading then a real empty result without static bots', async () => {
    const request = deferred<BotOperationsView[]>();
    render(<BotsView operationsClient={botClient(() => request.promise)} tradingClient={null} />);

    expect(screen.getByRole('status')).toHaveTextContent('봇 목록을 불러오는 중입니다.');
    expect(screen.queryByText('Atlas 07')).not.toBeInTheDocument();

    request.resolve([]);
    expect(await screen.findByText('운용 중인 봇이 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '봇 운영 안내' })).toHaveTextContent('운용할 봇을 선택하면');
    expect(screen.queryByText('Atlas 07')).not.toBeInTheDocument();
  });

  test('bot operations failure never falls back to static bot success data', async () => {
    render(<BotsView
      operationsClient={botClient(() => Promise.reject(new Error('offline')))}
      tradingClient={null}
    />);

    expect(await screen.findByRole('alert')).toHaveTextContent('봇 목록을 불러오지 못했습니다.');
    expect(screen.queryByText('Atlas 07')).not.toBeInTheDocument();
  });

  test('a live bot with a sample name does not inherit sample money or performance', async () => {
    render(<BotsView
      operationsClient={botClient(() => Promise.resolve([operation('Atlas 07')]))}
      tradingClient={null}
    />);

    expect(await screen.findByRole('button', { name: 'Atlas 07 상세 보기' })).toBeInTheDocument();
    expect(screen.queryByText('$10,540.00')).not.toBeInTheDocument();
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByLabelText(/Atlas 07 손익과 수익률 차트/)).not.toBeInTheDocument();
  });

  test('bot operations preserve a confirmed list when a later refresh source fails', async () => {
    const view = render(<BotsView
      operationsClient={botClient(() => Promise.resolve([operation('Confirmed Bot')]))}
      tradingClient={null}
    />);
    expect(await screen.findByRole('button', { name: 'Confirmed Bot 상세 보기' })).toBeInTheDocument();

    view.rerender(wrap(<BotsView
      operationsClient={botClient(() => Promise.reject(new Error('offline')))}
      tradingClient={null}
    />));

    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('마지막으로 확인한 봇 목록'));
    expect(screen.getByRole('button', { name: 'Confirmed Bot 상세 보기' })).toBeInTheDocument();
    expect(screen.queryByText('Atlas 07')).not.toBeInTheDocument();
  });

  test('a signed-out strategy library renders the sign-in state, not a failure', async () => {
    render(<StrategyHome
      openEditor={() => {}}
      client={strategyClient(() => Promise.reject(new StrategyApiError(401, 'Strategy library request')))}
    />);

    expect(await screen.findByText('로그인이 필요합니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByText('전략 목록을 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  test('a signed-out bot list renders the sign-in state, not a failure', async () => {
    render(<BotsView
      operationsClient={botClient(() => Promise.reject(new BotOperationsApiError(401)))}
      tradingClient={null}
    />);

    expect(await screen.findByText('로그인이 필요합니다')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '로그인' })).toBeInTheDocument();
    expect(screen.queryByText('봇 목록을 불러오지 못했습니다.')).not.toBeInTheDocument();
  });

  test('a signed-out production dashboard is the shared sign-in page, with no synthetic performance', () => {
    render(<DashboardView setPage={() => {}} dataSource="unavailable" />);

    expect(screen.getByRole('status')).toHaveTextContent('로그인이 필요합니다');
    expect(screen.queryByText('$10,540.00')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/수익률 차트/)).not.toBeInTheDocument();
  });

  test('a signed-in production dashboard loads the server aggregate without synthetic charts', async () => {
    setSessionAccessToken('dashboard-session');
    try {
      render(<DashboardView
        setPage={() => {}}
        dataSource="live"
        dashboardClient={dashboardClient(() => Promise.resolve(dashboardSnapshot('Confirmed Bot')))}
      />);

      expect(await screen.findAllByText('Confirmed Bot')).not.toHaveLength(0);
      expect(screen.getAllByText(/10,540\.00/)).not.toHaveLength(0);
      expect(screen.queryByLabelText(/수익률 차트/)).not.toBeInTheDocument();
    } finally {
      setSessionAccessToken(null);
    }
  });

  test('the live dashboard formats dynamic operation copy in English', async () => {
    window.localStorage.setItem('i2s-language', 'en');
    setSessionAccessToken('dashboard-session');
    try {
      render(<LanguageProvider><DashboardView
        setPage={() => {}}
        dataSource="live"
        dashboardClient={dashboardClient(() => Promise.resolve(dashboardSnapshot('Confirmed Bot')))}
      /></LanguageProvider>);

      expect(await screen.findByText('1 of 1 bots are running.')).toBeInTheDocument();
      expect(screen.getByText(/State changed/)).toBeInTheDocument();
      expect(screen.queryByText(/상태 변경|개가 실행 중/)).not.toBeInTheDocument();
    } finally {
      window.localStorage.clear();
      setSessionAccessToken(null);
    }
  });

  test('a real empty dashboard is an empty state while a failed request is an error', async () => {
    setSessionAccessToken('dashboard-session');
    try {
      const empty = render(<DashboardView
        setPage={() => {}}
        dataSource="live"
        dashboardClient={dashboardClient(() => Promise.resolve(dashboardSnapshot()))}
      />);
      expect(await screen.findByText('운용 중인 봇이 없습니다.')).toBeInTheDocument();
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();

      empty.unmount();
      render(<DashboardView
        setPage={() => {}}
        dataSource="live"
        dashboardClient={dashboardClient(() => Promise.reject(new Error('offline')))}
      />);
      expect(await screen.findByRole('alert')).toHaveTextContent('Home 데이터를 불러오지 못했습니다.');
    } finally {
      setSessionAccessToken(null);
    }
  });

  test('clears the previous symbol market bars while the next symbol is loading', async () => {
    const nextSnapshot = deferred<{ instrumentId: string; symbol: string; timeframe: '1m'; bars: MarketBar[] }>();
    const bar: MarketBar = {
      eventId: 'event-aapl', occurredAt: '2026-08-07T12:00:00Z', sequence: 1, revision: 0,
      open: 100, high: 102, low: 99, close: 101, volume: 1000, provider: 'ALPACA', feed: 'SIP',
    };
    const marketDataClient: MarketDataClient = {
      getRecentBars: vi.fn((instrumentId) => instrumentId === 'instrument-aapl'
        ? Promise.resolve({ instrumentId, symbol: 'AAPL', timeframe: '1m' as const, bars: [bar] })
        : nextSnapshot.promise),
      streamBars: vi.fn((_instrumentId, _onBar, signal) => new Promise<void>((resolve) => {
        signal?.addEventListener('abort', () => resolve(), { once: true });
      })),
    };
    const runtime = { ...operation('Two Symbols'), instruments: [
      { instrumentId: 'instrument-aapl', symbol: 'AAPL' },
      { instrumentId: 'instrument-msft', symbol: 'MSFT' },
    ] };

    render(<BotsView
      operationsClient={botClient(() => Promise.resolve([runtime]))}
      tradingClient={null}
      marketDataClient={marketDataClient}
    />);

    expect(await screen.findByText('실시간 API')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'MSFT 차트 보기' }));
    expect(await screen.findByText('시세 데이터 대기')).toBeInTheDocument();
    expect(screen.queryByText('실시간 API')).not.toBeInTheDocument();
  });

  test('a failed refresh keeps the last confirmed dashboard and marks it stale', async () => {
    setSessionAccessToken('dashboard-session');
    const read = vi.fn()
      .mockResolvedValueOnce(dashboardSnapshot('Confirmed Bot'))
      .mockRejectedValueOnce(new Error('offline'));
    try {
      render(<DashboardView
        setPage={() => {}}
        dataSource="live"
        dashboardClient={dashboardClient(read)}
      />);
      expect(await screen.findAllByText('Confirmed Bot')).not.toHaveLength(0);

      fireEvent.click(screen.getByRole('button', { name: '새로고침' }));

      expect(await screen.findByRole('status', { name: '' })).toBeInTheDocument();
      expect(screen.getByText('마지막으로 확인한 데이터를 표시하고 있습니다.')).toBeInTheDocument();
      expect(screen.getAllByText('Confirmed Bot')).not.toHaveLength(0);
    } finally {
      setSessionAccessToken(null);
    }
  });
});
