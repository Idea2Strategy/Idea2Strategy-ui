import { getSessionAccessToken } from './sessionAccessToken';

export interface MarketBar {
  eventId: string;
  occurredAt: string;
  sequence: number;
  revision: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  provider: string;
  feed: string;
}

export interface MarketBarSnapshot {
  instrumentId: string;
  symbol: string;
  timeframe: '1m';
  bars: MarketBar[];
}

export interface MarketDataClient {
  getRecentBars(instrumentId: string, limit?: number, signal?: AbortSignal): Promise<MarketBarSnapshot>;
  streamBars(
    instrumentId: string,
    onBar: (bar: MarketBar) => void,
    signal?: AbortSignal,
  ): Promise<void>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
}

export function createMarketDataClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken = getSessionAccessToken,
}: ClientOptions = {}): MarketDataClient {
  const root = baseUrl.replace(/\/$/, '');
  const headers = (accept: string): HeadersInit => {
    const token = getAccessToken?.();
    return {
      Accept: accept,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  };
  const path = (instrumentId: string) =>
    `/api/v1/market-data/instruments/${encodeURIComponent(instrumentId)}/bars`;

  return {
    async getRecentBars(instrumentId, limit = 300, signal) {
      const response = await fetchImpl(
        `${root}${path(instrumentId)}?limit=${encodeURIComponent(String(limit))}`,
        { credentials: 'include', headers: headers('application/json'), signal },
      );
      if (!response.ok) throw new Error(`Market data snapshot failed (${response.status})`);
      return readSnapshot(await response.json());
    },

    async streamBars(instrumentId, onBar, signal) {
      const response = await fetchImpl(`${root}${path(instrumentId)}/stream`, {
        credentials: 'include',
        headers: headers('text/event-stream'),
        signal,
      });
      if (!response.ok) throw new Error(`Market data stream failed (${response.status})`);
      if (!response.body) throw new Error('Market data stream has no response body');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      try {
        while (true) {
          const { done, value } = await reader.read();
          buffer += decoder.decode(value, { stream: !done });
          const parts = buffer.split(/\r?\n\r?\n/);
          buffer = parts.pop() ?? '';
          parts.forEach((event) => dispatchEvent(event, onBar));
          if (done) {
            if (buffer.trim()) dispatchEvent(buffer, onBar);
            return;
          }
        }
      } finally {
        reader.releaseLock();
      }
    },
  };
}

function dispatchEvent(encoded: string, onBar: (bar: MarketBar) => void) {
  let eventName = 'message';
  const data: string[] = [];
  encoded.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('event:')) eventName = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).trimStart());
  });
  if (eventName === 'bar' && data.length > 0) {
    onBar(readBar(JSON.parse(data.join('\n'))));
  }
}

function readSnapshot(value: unknown): MarketBarSnapshot {
  const snapshot = object(value, 'Invalid market data snapshot');
  if (!Array.isArray(snapshot.bars)) throw new Error('Invalid market data bars');
  const timeframe = string(snapshot.timeframe, 'timeframe');
  if (timeframe !== '1m') throw new Error(`Unsupported market data timeframe: ${timeframe}`);
  return {
    instrumentId: string(snapshot.instrumentId, 'instrumentId'),
    symbol: string(snapshot.symbol, 'symbol'),
    timeframe,
    bars: snapshot.bars.map(readBar),
  };
}

function readBar(value: unknown): MarketBar {
  const bar = object(value, 'Invalid market bar');
  const parsed = {
    eventId: string(bar.eventId, 'eventId'),
    occurredAt: string(bar.occurredAt, 'occurredAt'),
    sequence: integer(bar.sequence, 'sequence'),
    revision: integer(bar.revision, 'revision'),
    open: number(bar.open, 'open'),
    high: number(bar.high, 'high'),
    low: number(bar.low, 'low'),
    close: number(bar.close, 'close'),
    volume: number(bar.volume, 'volume'),
    provider: string(bar.provider, 'provider'),
    feed: string(bar.feed, 'feed'),
  };
  if (parsed.high < Math.max(parsed.open, parsed.close)
    || parsed.low > Math.min(parsed.open, parsed.close)) {
    throw new Error('Invalid market bar price range');
  }
  return parsed;
}

function object(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error(label);
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new Error(`Invalid ${label}`);
  return value;
}

function number(value: unknown, label: string): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Invalid ${label}`);
  return parsed;
}

function integer(value: unknown, label: string): number {
  const parsed = number(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

export const defaultMarketDataClient = createMarketDataClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
