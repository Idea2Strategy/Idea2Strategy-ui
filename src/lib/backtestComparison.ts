export interface StrategyEquityPoint {
  occurredAt: string;
  equity: number;
}
export interface BenchmarkClosePoint {
  occurredAt: string;
  close: number;
}

export interface BenchmarkInput {
  id: string;
  label: string;
  symbol: string;
  points: BenchmarkClosePoint[];
}

export interface ComparisonPoint {
  occurredAt: string;
  returnPct: number;
}

export interface ComparisonSeries {
  id: string;
  label: string;
  symbol: string | null;
  points: ComparisonPoint[];
  finalReturnPct: number;
}

export type BacktestComparison = {
  kind: 'ready';
  from: string;
  to: string;
  series: ComparisonSeries[];
} | {
  kind: 'unavailable';
  reason: 'NO_COMMON_RANGE' | 'INVALID_BASELINE' | 'MISSING_SERIES';
};

const percentChange = (value: number, baseline: number) =>
  Math.round(((value / baseline) - 1) * 100 * 1e8) / 1e8;

export function buildBacktestComparison(
  strategy: StrategyEquityPoint[],
  benchmarks: BenchmarkInput[],
): BacktestComparison {
  const inputs = [
    { id: 'strategy', label: '전략', symbol: null, points: strategy.map((point) => ({ ...point, value: point.equity })) },
    ...benchmarks.map((benchmark) => ({
      id: benchmark.id,
      label: benchmark.label,
      symbol: benchmark.symbol,
      points: benchmark.points.map((point) => ({ ...point, value: point.close })),
    })),
  ];
  if (inputs.some((input) => input.points.length === 0)) {
    return { kind: 'unavailable', reason: 'MISSING_SERIES' };
  }
  const from = inputs.map((input) => input.points[0].occurredAt).sort().at(-1)!;
  const to = inputs.map((input) => input.points.at(-1)!.occurredAt).sort()[0];
  if (from > to) return { kind: 'unavailable', reason: 'NO_COMMON_RANGE' };

  const clipped = inputs.map((input) => ({
    ...input,
    points: input.points.filter((point) => point.occurredAt >= from && point.occurredAt <= to),
  }));
  if (clipped.some((input) => input.points.length === 0)) {
    return { kind: 'unavailable', reason: 'NO_COMMON_RANGE' };
  }
  if (clipped.some((input) => !Number.isFinite(input.points[0].value) || input.points[0].value <= 0)) {
    return { kind: 'unavailable', reason: 'INVALID_BASELINE' };
  }
  const series = clipped.map((input): ComparisonSeries => {
    const baseline = input.points[0].value;
    const points = input.points.map((point) => ({
      occurredAt: point.occurredAt,
      returnPct: percentChange(point.value, baseline),
    }));
    return {
      id: input.id,
      label: input.label,
      symbol: input.symbol,
      points,
      finalReturnPct: points.at(-1)!.returnPct,
    };
  });
  return { kind: 'ready', from, to, series };
}
