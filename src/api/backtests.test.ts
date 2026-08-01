import { describe, expect, it, vi } from 'vitest';
import { createBacktestClient } from './backtests';

const json = (value: unknown) => new Response(JSON.stringify(value), {
  status: 200,
  headers: { 'Content-Type': 'application/json' },
});

describe('backtest results API client', () => {
  it('loads owner runs, overview, performance, ET judgments, and monthly trades', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(json([{
        run_id: '10000000-0000-4000-8000-000000000001',
        strategy_version_id: '20000000-0000-4000-8000-000000000001',
        status: 'COMPLETE',
        requested_at: '2026-07-31T12:00:00Z',
      }]))
      .mockResolvedValueOnce(json({
        run_id: '10000000-0000-4000-8000-000000000001',
        strategy_version_id: '20000000-0000-4000-8000-000000000001',
        status: 'COMPLETE',
        requested_at: '2026-07-31T12:00:00Z',
        started_at: '2026-07-31T12:01:00Z',
        finished_at: '2026-07-31T12:05:00Z',
        reason_code: null,
        missing_requirements: [],
        result_manifest_id: '30000000-0000-4000-8000-000000000001',
      }))
      .mockResolvedValueOnce(json({
        run_snapshot_id: 'a'.repeat(64),
        order_count: 4,
        fill_count: 2,
        cancellation_count: 1,
        rejection_count: 1,
        total_fees: '2.20',
        total_slippage: '0.50',
        realized_pnl: '123.45',
        initial_cash: '10000',
        ending_cash: '10123.45',
        ending_positions: [],
      }))
      .mockResolvedValueOnce(json([{
        summary_id: '40000000-0000-4000-8000-000000000001',
        et_month: '2026-07',
        timezone_id: 'America/New_York',
        failure_counts: [{ mode: 'BASIC', scope_id: 'flow-1', condition_id: 'rsi', count: 3 }],
        trade_record_ids: ['50000000-0000-4000-8000-000000000001'],
      }]))
      .mockResolvedValueOnce(json([{
        record_id: '50000000-0000-4000-8000-000000000001',
        occurred_at: '2026-07-31T14:31:00Z',
        kind: 'FILL',
        order_id: '60000000-0000-4000-8000-000000000001',
        instrument_id: '70000000-0000-4000-8000-000000000001',
        order_status: 'FILLED',
        cash_after: '9897.80',
        reason_code: null,
        fill_id: '80000000-0000-4000-8000-000000000001',
        quantity: '1',
        price: '100.05',
        fee: '2.20',
        realized_pnl: '0',
      }]));
    const client = createBacktestClient({ baseUrl: 'https://api.example.com/', fetchImpl });

    const runs = await client.listRuns();
    const overview = await client.getOverview(runs[0].runId);
    const performance = await client.getPerformance(runs[0].runId);
    const judgments = await client.listMonthlyJudgments(runs[0].runId);
    const trades = await client.listMonthlyTrades(runs[0].runId, judgments[0].etMonth);

    expect(overview.status).toBe('COMPLETE');
    expect(performance.realizedPnl).toBe('123.45');
    expect(judgments[0].failureCounts[0].conditionId).toBe('rsi');
    expect(trades[0].orderStatus).toBe('FILLED');
    expect(fetchImpl).toHaveBeenNthCalledWith(
      5,
      'https://api.example.com/api/v1/backtests/10000000-0000-4000-8000-000000000001/monthly-trades?et_month=2026-07',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejects unknown run states instead of rendering them as healthy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json([{
      run_id: '10000000-0000-4000-8000-000000000001',
      strategy_version_id: '20000000-0000-4000-8000-000000000001',
      status: 'MYSTERY',
      requested_at: '2026-07-31T12:00:00Z',
    }]));

    await expect(createBacktestClient({ fetchImpl }).listRuns())
      .rejects.toThrow('Unsupported backtest status');
  });

  it('surfaces transport failures and malformed payloads', async () => {
    const unavailable = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));
    const malformed = vi.fn().mockResolvedValue(json({ runs: [] }));

    await expect(createBacktestClient({ fetchImpl: unavailable }).listRuns())
      .rejects.toThrow('Backtest request failed (503)');
    await expect(createBacktestClient({ fetchImpl: malformed }).listRuns())
      .rejects.toThrow('Invalid backtest run list');
  });
});
