import { describe, expect, it } from 'vitest';
import type { DisplayPriceUpdate } from '../api/marketData';
import { appendDisplayUpdate, timeframeSeconds } from './liveChartBars';

function update(overrides: Partial<DisplayPriceUpdate> = {}): DisplayPriceUpdate {
  return {
    schemaVersion: 1,
    instrumentId: 'instrument-1',
    symbol: 'AAPL',
    price: 101,
    lastTradeSize: 1,
    intervalOpen: 100,
    intervalHigh: 102,
    intervalLow: 99,
    intervalClose: 101,
    intervalVolume: 5,
    intervalTradeCount: 3,
    providerTradeId: 42,
    occurredAt: '2026-08-06T14:31:10.100Z',
    publishedAt: '2026-08-06T14:31:10.250Z',
    ...overrides,
  };
}

describe('display-only live chart bars', () => {
  it.each([
    ['1m', 60],
    ['5m', 300],
    ['15m', 900],
  ] as const)('supports the %s chart timeframe', (timeframe, seconds) => {
    expect(timeframeSeconds(timeframe)).toBe(seconds);
  });

  it('aggregates interval OHLCV into one-minute candles without fabricating gaps', () => {
    const first = appendDisplayUpdate([], update(), '1m');
    const second = appendDisplayUpdate(first, update({
      price: 103,
      intervalOpen: 101,
      intervalHigh: 104,
      intervalLow: 100.5,
      intervalClose: 103,
      intervalVolume: 7,
      providerTradeId: 43,
      occurredAt: '2026-08-06T14:31:40.100Z',
    }), '1m');
    const nextMinute = appendDisplayUpdate(second, update({
      price: 105,
      intervalOpen: 105,
      intervalHigh: 105,
      intervalLow: 105,
      intervalClose: 105,
      intervalVolume: 2,
      providerTradeId: 44,
      occurredAt: '2026-08-06T14:33:00.100Z',
    }), '1m');

    expect(nextMinute).toEqual([
      {
        time: 1786026660,
        open: 100,
        high: 104,
        low: 99,
        close: 103,
        volume: 12,
      },
      {
        time: 1786026780,
        open: 105,
        high: 105,
        low: 105,
        close: 105,
        volume: 2,
      },
    ]);
  });

  it('aligns five and fifteen minute candles to stable UTC boundaries', () => {
    expect(appendDisplayUpdate([], update(), '5m')[0].time).toBe(1786026600);
    expect(appendDisplayUpdate([], update(), '15m')[0].time).toBe(1786026600);
  });
});
