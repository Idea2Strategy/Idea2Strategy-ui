import { act, fireEvent, render as renderBare, screen, waitFor } from '@testing-library/react';
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
    fireEvent.click(screen.getByRole('button', { name: '첫 전략 만들기' }));
    expect(screen.getByRole('dialog', { name: '새 전략 선택' })).toBeInTheDocument();
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
    const onCreateStrategy = vi.fn();
    render(<BotsView operationsClient={botClient(() => request.promise)} tradingClient={null} onCreateStrategy={onCreateStrategy} />);

    expect(screen.getByRole('status')).toHaveTextContent('봇 목록을 불러오는 중입니다.');
    expect(screen.queryByText('Atlas 07')).not.toBeInTheDocument();

    request.resolve([]);
    expect(await screen.findByText('운용 중인 봇이 없습니다.')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: '봇 운영 안내' })).toHaveTextContent('운용할 봇을 선택하면');
    fireEvent.click(screen.getByRole('button', { name: '전략 만들기' }));
    expect(onCreateStrategy).toHaveBeenCalledOnce();
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
    expect(screen.queryByText(/운용 유형 미제공|전략 —/)).not.toBeInTheDocument();
    expect(screen.getByText(/출시 봇 · 상태 변경/)).toBeInTheDocument();
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

  test('offers the next useful action when a bot has no published performance yet', async () => {
    setSessionAccessToken('dashboard-session');
    try {
      const setPage = vi.fn();
      render(<DashboardView
        setPage={setPage}
        dataSource="live"
        dashboardClient={dashboardClient(() => Promise.resolve(dashboardSnapshot('Pending Bot', false)))}
      />);

      await screen.findByText('성과 계산이 아직 완료되지 않았습니다.');
      fireEvent.click(screen.getByRole('button', { name: '백테스트 결과 보기' }));
      expect(setPage).toHaveBeenCalledWith('backtest');
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
      const setPage = vi.fn();
      const empty = render(<DashboardView
        setPage={setPage}
        dataSource="live"
        dashboardClient={dashboardClient(() => Promise.resolve(dashboardSnapshot()))}
      />);
      expect(await screen.findByText('운용 중인 봇이 없습니다.')).toBeInTheDocument();
      expect(screen.getByRole('heading', { name: '첫 백테스트까지 3단계' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: '첫 전략 만들기' }));
      expect(setPage).toHaveBeenCalledWith('strategy');
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
    const nextSnapshot = deferred<{ instrumentId: string; symbol: string; timeframe: '30m'; bars: MarketBar[] }>();
    const bar: MarketBar = {
      eventId: 'event-aapl', occurredAt: '2026-08-07T12:00:00Z', sequence: 1, revision: 0,
      open: 100, high: 102, low: 99, close: 101, volume: 1000, provider: 'ALPACA', feed: 'SIP',
    };
    const marketDataClient: MarketDataClient = {
      getRecentBars: vi.fn((instrumentId) => instrumentId === 'instrument-aapl'
        ? Promise.resolve({ instrumentId, symbol: 'AAPL', timeframe: '30m' as const, bars: [bar] })
        : nextSnapshot.promise),
      streamPrices: vi.fn((_instrumentId, _onPrice, signal) => new Promise<void>((resolve) => {
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

    expect(await screen.findByText('시장 데이터')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: '4시간' }));
    await waitFor(() => expect(marketDataClient.getRecentBars).toHaveBeenCalledWith(
      'instrument-aapl', '4h', 400, expect.any(AbortSignal),
    ));
    fireEvent.click(screen.getByRole('button', { name: 'MSFT 차트 보기' }));
    expect(await screen.findByText('시세 데이터 대기')).toBeInTheDocument();
    expect(screen.queryByText('시장 데이터')).not.toBeInTheDocument();
  });

  test('calls the chart realtime only after a websocket price arrives', async () => {
    let emitPrice!: Parameters<MarketDataClient['streamPrices']>[1];
    const marketDataClient: MarketDataClient = {
      getRecentBars: vi.fn((instrumentId) => Promise.resolve({
        instrumentId, symbol: 'AAPL', timeframe: '30m' as const, bars: [],
      })),
      streamPrices: vi.fn((_instrumentId, onPrice, signal) => {
        emitPrice = onPrice;
        return new Promise<void>((resolve) => {
          signal?.addEventListener('abort', () => resolve(), { once: true });
        });
      }),
    };
    const runtime = { ...operation('Socket Bot'), instruments: [
      { instrumentId: 'instrument-aapl', symbol: 'AAPL' },
    ] };

    render(<BotsView
      operationsClient={botClient(() => Promise.resolve([runtime]))}
      tradingClient={null}
      marketDataClient={marketDataClient}
    />);

    expect(await screen.findByRole('tab', { name: '차트' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.queryByRole('tab', { name: '실시간' })).not.toBeInTheDocument();
    await waitFor(() => expect(marketDataClient.streamPrices).toHaveBeenCalled());

    act(() => emitPrice({
      schemaVersion: 1,
      instrumentId: 'instrument-aapl',
      symbol: 'AAPL',
      price: 101.25,
      lastTradeSize: 2,
      intervalOpen: 101,
      intervalHigh: 101.5,
      intervalLow: 100.75,
      intervalClose: 101.25,
      intervalVolume: 2,
      intervalTradeCount: 1,
      providerTradeId: 7,
      occurredAt: '2026-08-07T12:02:00Z',
      publishedAt: '2026-08-07T12:02:00Z',
    }));

    expect(await screen.findByRole('tab', { name: '실시간' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: '실시간으로 이동' })).toBeInTheDocument();
  });

  /* Home reads the server once per visit. A manual refresh button invited the
     reader to treat the figures as live-on-demand, which they are not. */
  test('carries no manual refresh action', async () => {
    setSessionAccessToken('dashboard-session');
    const read = vi.fn().mockResolvedValue(dashboardSnapshot('Confirmed Bot'));
    try {
      render(<DashboardView
        setPage={() => {}}
        dataSource="live"
        dashboardClient={dashboardClient(read)}
      />);
      expect(await screen.findAllByText('Confirmed Bot')).not.toHaveLength(0);

      expect(screen.queryByRole('button', { name: '새로고침' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: '새로고침 중' })).not.toBeInTheDocument();
      expect(read).toHaveBeenCalledTimes(1);
    } finally {
      setSessionAccessToken(null);
    }
  });

  test('shows the failure page rather than inventing figures when the first read fails', async () => {
    setSessionAccessToken('dashboard-session');
    const read = vi.fn().mockRejectedValue(new Error('offline'));
    try {
      render(<DashboardView
        setPage={() => {}}
        dataSource="live"
        dashboardClient={dashboardClient(read)}
      />);

      expect(await screen.findByText('Home 데이터를 불러오지 못했습니다.')).toBeInTheDocument();
      expect(screen.queryByText('Confirmed Bot')).not.toBeInTheDocument();
    } finally {
      setSessionAccessToken(null);
    }
  });
});
