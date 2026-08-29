import { describe, expect, it } from 'vitest';
import type { BacktestPerformanceSeries } from '../api/backtests';
import { annualizedReturnPct, buildMonthlyPerformance } from './backtestMonthlyPerformance';

const series = (points: Array<{ occurredAt: string; equity: string }>): BacktestPerformanceSeries => ({
  backtestRunId: 'run-1',
  points,
  resultHash: 'result-hash',
  sourceSetHash: 'source-hash',
});

describe('buildMonthlyPerformance', () => {
  it('uses the previous ET month close and keeps a UTC-August point in ET July', () => {
    const result = buildMonthlyPerformance(series([
      { occurredAt: '2026-06-30T20:00:00Z', equity: '100.00' },
      { occurredAt: '2026-08-01T03:30:00Z', equity: '110.00' },
      { occurredAt: '2026-08-03T20:00:00Z', equity: '121.00' },
    ]), ['2026-06', '2026-07', '2026-08']);

    expect(result.map(({ month }) => month)).toEqual(['2026-06', '2026-07', '2026-08']);
    expect(result[0].returnPct).toBeNull();
    expect(result[1].returnPct).toBeCloseTo(10, 8);
    expect(result[2].returnPct).toBeCloseTo(10, 8);
  });

  it('distinguishes an observed zero return from a month without equity data', () => {
    const result = buildMonthlyPerformance(series([
      { occurredAt: '2026-01-02T21:00:00Z', equity: '100.00' },
      { occurredAt: '2026-01-30T21:00:00Z', equity: '100.00' },
    ]), ['2026-01', '2026-02']);

    expect(result[0]).toMatchObject({ month: '2026-01', returnPct: 0, partial: true, observationCount: 2 });
    expect(result[1]).toMatchObject({ month: '2026-02', returnPct: null, observationCount: 0 });
  });

  it('does not mislabel a multi-month gap as one month of return', () => {
    const result = buildMonthlyPerformance(series([
      { occurredAt: '2026-01-02T21:00:00Z', equity: '100.00' },
      { occurredAt: '2026-01-30T21:00:00Z', equity: '110.00' },
      { occurredAt: '2026-03-02T21:00:00Z', equity: '121.00' },
      { occurredAt: '2026-03-31T20:00:00Z', equity: '132.00' },
    ]), ['2026-01', '2026-02', '2026-03']);

    expect(result[2].returnPct).toBeCloseTo(9.0909, 4);
    expect(result[2].partial).toBe(true);
  });

  it('calculates intramonth drawdown from the same actual equity path', () => {
    const result = buildMonthlyPerformance(series([
      { occurredAt: '2026-01-30T21:00:00Z', equity: '100.00' },
      { occurredAt: '2026-02-02T21:00:00Z', equity: '120.00' },
      { occurredAt: '2026-02-13T21:00:00Z', equity: '90.00' },
      { occurredAt: '2026-02-27T21:00:00Z', equity: '110.00' },
    ]), ['2026-01', '2026-02']);

    expect(result[1].returnPct).toBeCloseTo(10, 8);
    expect(result[1].maxDrawdownPct).toBeCloseTo(-25, 8);
  });
});

describe('annualizedReturnPct', () => {
  it('annualizes the canonical first and last equity observations over their actual span', () => {
    expect(annualizedReturnPct(series([
      { occurredAt: '2020-01-01T00:00:00Z', equity: '100.00' },
      { occurredAt: '2021-01-01T00:00:00Z', equity: '121.00' },
    ]))).toBeCloseTo(20.9523, 3);
  });

  it('does not invent a rate without two positive observations and a positive duration', () => {
    expect(annualizedReturnPct(null)).toBeNull();
    expect(annualizedReturnPct(series([
      { occurredAt: '2026-01-01T00:00:00Z', equity: '100.00' },
    ]))).toBeNull();
    expect(annualizedReturnPct(series([
      { occurredAt: '2026-01-01T00:00:00Z', equity: '0' },
      { occurredAt: '2027-01-01T00:00:00Z', equity: '100.00' },
    ]))).toBeNull();
  });
});
