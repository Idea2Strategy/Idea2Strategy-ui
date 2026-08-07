import type {
  ChartTimeframe,
  DisplayPriceUpdate,
  DisplayTimeframe,
} from '../api/marketData';

export interface LiveMarketBar {
  time: string | number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

const TIMEFRAME_SECONDS: Record<ChartTimeframe, number> = {
  '1m': 60,
  '5m': 300,
  '15m': 900,
  '30m': 1800,
  '1h': 3600,
  '4h': 14400,
  '1d': 86400,
};

export function timeframeSeconds(timeframe: ChartTimeframe): number {
  return TIMEFRAME_SECONDS[timeframe];
}

export function appendDisplayUpdate(
  bars: readonly LiveMarketBar[],
  update: DisplayPriceUpdate,
  timeframe: DisplayTimeframe,
  capacity = 1000,
): LiveMarketBar[] {
  const occurredAt = Date.parse(update.occurredAt);
  if (!Number.isFinite(occurredAt)) return [...bars];
  const seconds = timeframeSeconds(timeframe);
  const bucket = Math.floor(occurredAt / 1000 / seconds) * seconds;
  const previous = bars.at(-1);
  const previousTime = previous ? numericTime(previous.time) : null;
  if (previousTime !== null && bucket < previousTime) return [...bars];

  const next = previousTime === bucket && previous
    ? {
        ...previous,
        high: Math.max(previous.high, update.intervalHigh),
        low: Math.min(previous.low, update.intervalLow),
        close: update.intervalClose,
        volume: (previous.volume ?? 0) + update.intervalVolume,
      }
    : {
        time: bucket,
        open: update.intervalOpen,
        high: update.intervalHigh,
        low: update.intervalLow,
        close: update.intervalClose,
        volume: update.intervalVolume,
      };
  const merged = previousTime === bucket ? [...bars.slice(0, -1), next] : [...bars, next];
  return merged.slice(-Math.max(1, capacity));
}

function numericTime(value: string | number): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? Math.floor(parsed / 1000) : null;
}
