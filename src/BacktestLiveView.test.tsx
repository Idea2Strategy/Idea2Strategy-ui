import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { BacktestClient, BacktestOverview } from './api/backtests';
import { BacktestLiveView } from './views/BacktestLiveView';

const run = {
  runId: '10000000-0000-4000-8000-000000000001',
  strategyVersionId: '20000000-0000-4000-8000-000000000001',
  status: 'COMPLETE' as const,
  requestedAt: '2026-07-31T12:00:00Z',
};

const overview: BacktestOverview = {
  ...run,
  startedAt: '2026-07-31T12:01:00Z',
  finishedAt: '2026-07-31T12:05:00Z',
  reasonCode: null,
  missingRequirements: [],
  resultManifestId: '30000000-0000-4000-8000-000000000001',
};

function client(overrides: Partial<BacktestClient> = {}): BacktestClient {
  return {
    listRuns: vi.fn().mockResolvedValue([run]),
    getOverview: vi.fn().mockResolvedValue(overview),
    getPerformance: vi.fn().mockResolvedValue({
      runSnapshotId: 'a'.repeat(64),
      orderCount: 4,
      fillCount: 2,
      cancellationCount: 1,
      rejectionCount: 1,
      totalFees: '2.20',
      totalSlippage: '0.50',
      realizedPnl: '123.45',
      initialCash: '10000',
      endingCash: '10123.45',
      endingPositions: [],
    }),
    listMonthlyJudgments: vi.fn().mockResolvedValue([{
      summaryId: '40000000-0000-4000-8000-000000000001',
      etMonth: '2026-07',
      timezoneId: 'America/New_York',
      failureCounts: [{ mode: 'BASIC', scopeId: 'flow-1', conditionId: 'rsi', count: 3 }],
      tradeRecordIds: ['50000000-0000-4000-8000-000000000001'],
    }]),
    listMonthlyTrades: vi.fn().mockResolvedValue([{
      recordId: '50000000-0000-4000-8000-000000000001',
      occurredAt: '2026-07-31T14:31:00Z',
      kind: 'FILL',
      orderId: '60000000-0000-4000-8000-000000000001',
      instrumentId: '70000000-0000-4000-8000-000000000001',
      orderStatus: 'FILLED',
      cashAfter: '9897.80',
      reasonCode: null,
      fillId: '80000000-0000-4000-8000-000000000001',
      quantity: '1',
      price: '100.05',
      fee: '2.20',
      realizedPnl: '0',
    }]),
    ...overrides,
  };
}

describe('BacktestLiveView', () => {
  it('renders complete performance, ET monthly judgments, and trade details', async () => {
    render(<BacktestLiveView client={client()} />);

    expect(screen.getByRole('status')).toHaveTextContent('백테스트 결과를 불러오는 중');
    expect(await screen.findByText('완료')).toBeInTheDocument();
    expect(await screen.findByText('$10,123.45')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '2026년 7월 ET 결과 보기' })).toBeInTheDocument();
    expect(await screen.findByText('FILLED')).toBeInTheDocument();
    expect(screen.getByText('rsi')).toBeInTheDocument();
    expect(screen.getByText('3회')).toBeInTheDocument();
  });

  it('keeps queued runs out of result-only endpoints', async () => {
    const queued = { ...run, status: 'QUEUED' as const };
    const api = client({
      listRuns: vi.fn().mockResolvedValue([queued]),
      getOverview: vi.fn().mockResolvedValue({
        ...overview,
        ...queued,
        startedAt: null,
        finishedAt: null,
        resultManifestId: null,
      }),
    });

    render(<BacktestLiveView client={api} />);

    expect(await screen.findByText('대기 중')).toBeInTheDocument();
    expect(await screen.findByText('공식 백테스트 실행을 기다리고 있습니다.')).toBeInTheDocument();
    expect(api.getPerformance).not.toHaveBeenCalled();
    expect(api.listMonthlyJudgments).not.toHaveBeenCalled();
  });

  it('shows unavailable reasons and missing requirements explicitly', async () => {
    const unavailable = { ...run, status: 'UNAVAILABLE' as const };
    const api = client({
      listRuns: vi.fn().mockResolvedValue([unavailable]),
      getOverview: vi.fn().mockResolvedValue({
        ...overview,
        ...unavailable,
        finishedAt: '2026-07-31T12:02:00Z',
        reasonCode: 'REQUIRED_DATA_MISSING',
        missingRequirements: ['resolution:1m', 'symbol:XYZ'],
        resultManifestId: null,
      }),
    });

    render(<BacktestLiveView client={api} />);

    expect(await screen.findByText('실행 불가')).toBeInTheDocument();
    expect(await screen.findByText('REQUIRED_DATA_MISSING')).toBeInTheDocument();
    expect(screen.getByText('resolution:1m')).toBeInTheDocument();
    expect(screen.getByText('symbol:XYZ')).toBeInTheDocument();
  });

  it('shows failed runs without requesting result-only endpoints', async () => {
    const failed = { ...run, status: 'FAILED' as const };
    const api = client({
      listRuns: vi.fn().mockResolvedValue([failed]),
      getOverview: vi.fn().mockResolvedValue({
        ...overview,
        ...failed,
        finishedAt: '2026-07-31T12:02:00Z',
        reasonCode: 'ENGINE_EXECUTION_FAILED',
        resultManifestId: null,
      }),
    });

    render(<BacktestLiveView client={api} />);

    expect(await screen.findByText('ENGINE_EXECUTION_FAILED')).toBeInTheDocument();
    expect(api.getPerformance).not.toHaveBeenCalled();
    expect(api.listMonthlyJudgments).not.toHaveBeenCalled();
  });

  it('renders empty and retryable transport-error states', async () => {
    const user = userEvent.setup();
    const listRuns = vi.fn()
      .mockRejectedValueOnce(new Error('network down'))
      .mockResolvedValueOnce([]);

    render(<BacktestLiveView client={client({ listRuns })} />);

    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('백테스트 결과를 불러오지 못했습니다.');
    await user.click(within(alert).getByRole('button', { name: '다시 시도' }));

    await waitFor(() => expect(listRuns).toHaveBeenCalledTimes(2));
    expect(await screen.findByText('아직 실행된 공식 백테스트가 없습니다.')).toBeInTheDocument();
  });
});
