import type { BacktestPerformanceSeries } from '../api/backtests';

export interface BacktestMonthlyPerformance {
  month: string;
  returnPct: number | null;
  startEquity: string | null;
  endEquity: string | null;
  maxDrawdownPct: number | null;
  observationCount: number;
  partial: boolean;
}

interface EquityPoint {
  occurredAt: string;
  equity: string;
  value: number;
}

const etMonthFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  year: 'numeric',
  month: '2-digit',
});

export function buildMonthlyPerformance(
  series: BacktestPerformanceSeries | null,
  summaryMonths: string[],
): BacktestMonthlyPerformance[] {
  const grouped = new Map<string, EquityPoint[]>();
  for (const point of series?.points ?? []) {
    const value = Number(point.equity);
    if (!Number.isFinite(value) || value <= 0) continue;
    const month = etMonth(point.occurredAt);
    const bucket = grouped.get(month) ?? [];
    bucket.push({ ...point, value });
    grouped.set(month, bucket);
  }
  grouped.forEach((points) => points.sort((left, right) => left.occurredAt.localeCompare(right.occurredAt)));

  const months = [...new Set([...summaryMonths, ...grouped.keys()])].sort();
  return months.map((month) => {
    const points = grouped.get(month) ?? [];
    if (points.length === 0) return unavailableMonth(month);

    const priorPoints = grouped.get(previousMonth(month)) ?? [];
    const priorClose = priorPoints.at(-1);
    const baseline = priorClose ?? (points.length > 1 ? points[0] : null);
    const end = points.at(-1)!;
    if (baseline === null) {
      return {
        month,
        returnPct: null,
        startEquity: null,
        endEquity: end.equity,
        maxDrawdownPct: null,
        observationCount: points.length,
        partial: true,
      };
    }

    const path = priorClose ? [priorClose, ...points] : points;
    return {
      month,
      returnPct: ((end.value / baseline.value) - 1) * 100,
      startEquity: baseline.equity,
      endEquity: end.equity,
      maxDrawdownPct: maximumDrawdown(path),
      observationCount: points.length,
      partial: priorClose === undefined,
    };
  });
}

function etMonth(instant: string): string {
  const parts = etMonthFormatter.formatToParts(new Date(instant));
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  if (year === undefined || month === undefined) throw new Error('Unable to resolve ET month');
  return `${year}-${month}`;
}

function previousMonth(value: string): string {
  const [year, month] = value.split('-').map(Number);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, '0')}`;
}

function maximumDrawdown(points: EquityPoint[]): number {
  let peak = points[0].value;
  let drawdown = 0;
  for (const point of points) {
    peak = Math.max(peak, point.value);
    drawdown = Math.min(drawdown, ((point.value / peak) - 1) * 100);
  }
  return drawdown;
}

function unavailableMonth(month: string): BacktestMonthlyPerformance {
  return {
    month,
    returnPct: null,
    startEquity: null,
    endEquity: null,
    maxDrawdownPct: null,
    observationCount: 0,
    partial: false,
  };
}
