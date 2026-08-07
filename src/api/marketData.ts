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
  timeframe: MarketTimeframe;
  bars: MarketBar[];
}

export type MarketTimeframe = '30m' | '1h' | '4h' | '1d';
export type DisplayTimeframe = '1m' | '5m' | '15m';
export type ChartTimeframe = DisplayTimeframe | MarketTimeframe;

export interface DisplayPriceUpdate {
  schemaVersion: 1;
  instrumentId: string;
  symbol: string;
  price: number;
  lastTradeSize: number;
  intervalOpen: number;
  intervalHigh: number;
  intervalLow: number;
  intervalClose: number;
  intervalVolume: number;
  intervalTradeCount: number;
  providerTradeId: number;
  occurredAt: string;
  publishedAt: string;
}

export interface MarketDataClient {
  getRecentBars(
    instrumentId: string,
    timeframe?: MarketTimeframe,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<MarketBarSnapshot>;
  streamPrices(instrumentId: string, onPrice: (price: DisplayPriceUpdate) => void, signal?: AbortSignal): Promise<void>;
}

interface ClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
  webSocketFactory?: (url: string) => WebSocket;
}

export function createMarketDataClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken = getSessionAccessToken,
  webSocketFactory = (url) => new WebSocket(url),
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
    async getRecentBars(instrumentId, timeframe = '30m', limit = 300, signal) {
      const response = await fetchImpl(
        `${root}${path(instrumentId)}?timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(String(limit))}`,
        { credentials: 'include', headers: headers('application/json'), signal },
      );
      if (!response.ok) throw new Error(`Market data snapshot failed (${response.status})`);
      return readSnapshot(await response.json());
    },

    async streamPrices(instrumentId, onPrice, signal) {
      const response = await fetchImpl(`${root}/api/v1/market-data/websocket-ticket`, {
        method: 'POST',
        credentials: 'include',
        headers: headers('application/json'),
        signal,
      });
      if (!response.ok) throw new Error(`Market data WebSocket ticket failed (${response.status})`);
      const ticketResponse = object(await response.json(), 'Invalid market data WebSocket ticket');
      const ticket = string(ticketResponse.ticket, 'ticket');
      const socketUrl = new URL(root || '/', window.location.origin);
      socketUrl.protocol = socketUrl.protocol === 'https:' ? 'wss:' : 'ws:';
      socketUrl.pathname = '/ws/v1/market-data/prices';
      socketUrl.search = `ticket=${encodeURIComponent(ticket)}`;
      const socket = webSocketFactory(socketUrl.toString());
      if (signal?.aborted) {
        socket.close(1000, 'client navigation');
        return;
      }
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          socket.close(1000, 'client navigation');
          resolve();
        };
        signal?.addEventListener('abort', abort, { once: true });
        socket.onopen = () => socket.send(JSON.stringify({ action: 'subscribe', instrumentId }));
        socket.onmessage = (event) => {
          const value = JSON.parse(String(event.data)) as unknown;
          const parsed = readDisplayPrice(value);
          if (parsed) onPrice(parsed);
        };
        socket.onerror = () => reject(new Error('Market data WebSocket failed'));
        socket.onclose = (event) => {
          signal?.removeEventListener('abort', abort);
          if (signal?.aborted || event.code === 1000) resolve();
          else reject(new Error(`Market data WebSocket closed (${event.code})`));
        };
      });
    },
  };
}

function readSnapshot(value: unknown): MarketBarSnapshot {
  const snapshot = object(value, 'Invalid market data snapshot');
  if (!Array.isArray(snapshot.bars)) throw new Error('Invalid market data bars');
  const timeframe = string(snapshot.timeframe, 'timeframe');
  if (!isStrategyTimeframe(timeframe)) throw new Error(`Unsupported market data timeframe: ${timeframe}`);
  return {
    instrumentId: string(snapshot.instrumentId, 'instrumentId'),
    symbol: string(snapshot.symbol, 'symbol'),
    timeframe,
    bars: snapshot.bars.map(readBar),
  };
}

function readDisplayPrice(value: unknown): DisplayPriceUpdate | null {
  const update = object(value, 'Invalid display price update');
  if (update.type === 'subscribed') return null;
  const price = number(update.price, 'price');
  return {
    schemaVersion: 1,
    instrumentId: string(update.instrumentId, 'instrumentId'),
    symbol: string(update.symbol, 'symbol'),
    price,
    lastTradeSize: number(update.lastTradeSize, 'lastTradeSize'),
    intervalOpen: optionalNumber(update.intervalOpen, price, 'intervalOpen'),
    intervalHigh: optionalNumber(update.intervalHigh, price, 'intervalHigh'),
    intervalLow: optionalNumber(update.intervalLow, price, 'intervalLow'),
    intervalClose: optionalNumber(update.intervalClose, price, 'intervalClose'),
    intervalVolume: number(update.intervalVolume, 'intervalVolume'),
    intervalTradeCount: integer(update.intervalTradeCount, 'intervalTradeCount'),
    providerTradeId: integer(update.providerTradeId, 'providerTradeId'),
    occurredAt: string(update.occurredAt, 'occurredAt'),
    publishedAt: string(update.publishedAt, 'publishedAt'),
  };
}

export function isStrategyTimeframe(value: string): value is MarketTimeframe {
  return value === '30m' || value === '1h' || value === '4h' || value === '1d';
}

export function isDisplayTimeframe(value: string): value is DisplayTimeframe {
  return value === '1m' || value === '5m' || value === '15m';
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

function optionalNumber(value: unknown, fallback: number, label: string): number {
  return value === undefined ? fallback : number(value, label);
}

function integer(value: unknown, label: string): number {
  const parsed = number(value, label);
  if (!Number.isSafeInteger(parsed) || parsed < 0) throw new Error(`Invalid ${label}`);
  return parsed;
}

export const defaultMarketDataClient = createMarketDataClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
});
