import { describe, expect, it } from 'vitest';
import { buildBacktestComparison } from './backtestComparison';

describe('backtest cumulative-return comparison', () => {
  it('rebases strategy and benchmarks to zero over the exact common observed range', () => {
    const comparison = buildBacktestComparison(
      [
        { occurredAt: '2024-01-01T20:00:00Z', equity: 100 },
        { occurredAt: '2024-01-02T20:00:00Z', equity: 110 },
        { occurredAt: '2024-01-03T20:00:00Z', equity: 121 },
      ],
      [{
        id: 'spy', label: 'S&P 500 (SPY)', symbol: 'SPY',
        points: [
          { occurredAt: '2024-01-02T20:00:00Z', close: 200 },
          { occurredAt: '2024-01-03T20:00:00Z', close: 210 },
          { occurredAt: '2024-01-04T20:00:00Z', close: 220 },
        ],
      }],
    );

    expect(comparison).toMatchObject({
      kind: 'ready', from: '2024-01-02T20:00:00Z', to: '2024-01-03T20:00:00Z',
    });
    if (comparison.kind !== 'ready') throw new Error('comparison should be ready');
    expect(comparison.series[0].points.map((point) => point.returnPct)).toEqual([0, 10]);
    expect(comparison.series[1].points.map((point) => point.returnPct)).toEqual([0, 5]);
  });

  it('refuses to fabricate a line when series do not overlap or have no positive baseline', () => {
    expect(buildBacktestComparison(
      [{ occurredAt: '2024-01-01T20:00:00Z', equity: 100 }],
      [{ id: 'spy', label: 'S&P 500 (SPY)', symbol: 'SPY', points: [
        { occurredAt: '2024-02-01T20:00:00Z', close: 200 },
      ] }],
    )).toEqual({ kind: 'unavailable', reason: 'NO_COMMON_RANGE' });

    expect(buildBacktestComparison(
      [{ occurredAt: '2024-01-01T20:00:00Z', equity: 0 }],
      [],
    )).toEqual({ kind: 'unavailable', reason: 'INVALID_BASELINE' });
  });
});
