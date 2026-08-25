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
  timeframe: ChartTimeframe;
  bars: MarketBar[];
}

export type PreviewWindow = '1m' | '3m';
export type MarketBarCoverageStatus = 'COMPLETE' | 'PARTIAL' | 'EMPTY';

export interface MarketBarPreviewSnapshot extends MarketBarSnapshot {
  window: PreviewWindow;
  requestedFrom: string | null;
  requestedTo: string | null;
  availableFrom: string | null;
  availableTo: string | null;
  coverageStatus: MarketBarCoverageStatus;
  reasonCode: string | null;
}

export class MarketDataRequestError extends Error {
  constructor(
    public readonly code: 'AUTHENTICATION_REQUIRED' | 'MARKET_DATA_NOT_FOUND' | 'MARKET_DATA_UNAVAILABLE' | 'MARKET_DATA_REQUEST_FAILED',
    public readonly status: number,
    public readonly detail: string,
  ) {
    super(detail);
    this.name = 'MarketDataRequestError';
  }
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
    timeframe?: ChartTimeframe,
    limit?: number,
    signal?: AbortSignal,
  ): Promise<MarketBarSnapshot>;
  getPreviewBars?(
    instrumentId: string,
    timeframe: MarketTimeframe,
    window: PreviewWindow,
    signal?: AbortSignal,
  ): Promise<MarketBarPreviewSnapshot>;
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
    async getRecentBars(instrumentId, timeframe = '30m', limit = 1000, signal) {
      const response = await fetchImpl(
        `${root}${path(instrumentId)}?timeframe=${encodeURIComponent(timeframe)}&limit=${encodeURIComponent(String(limit))}`,
        { credentials: 'include', headers: headers('application/json'), signal },
      );
      if (!response.ok) throw new Error(`Market data snapshot failed (${response.status})`);
      return readSnapshot(await response.json());
    },

    async getPreviewBars(instrumentId, timeframe, window, signal) {
      const response = await fetchImpl(
        `${root}${path(instrumentId)}?timeframe=${encodeURIComponent(timeframe)}&window=${encodeURIComponent(window)}`,
        { credentials: 'include', headers: headers('application/json'), signal },
      );
      if (!response.ok) throw await previewRequestError(response);
      return readPreviewSnapshot(await response.json());
    },

    async streamPrices(instrumentId, onPrice, signal) {
      let failures = 0;
      while (!signal?.aborted) {
        try {
          await connectPriceSocket(
            root, instrumentId, onPrice, signal, fetchImpl, headers, webSocketFactory,
          );
          return;
        } catch (error) {
          if (signal?.aborted) return;
          failures += 1;
          const backoff = Math.min(30_000, 500 * (2 ** Math.min(failures - 1, 6)));
          await abortableDelay(backoff, signal);
        }
      }
    },
  };
}

async function previewRequestError(response: Response): Promise<MarketDataRequestError> {
  let detail = `Market data preview failed (${response.status})`;
  try {
    const problem = object(await response.json(), 'Invalid market data error');
    if (typeof problem.detail === 'string' && problem.detail.trim()) detail = problem.detail;
  } catch {
    // The status still provides a precise category when an intermediary returns non-JSON.
  }
  const code = response.status === 401 || response.status === 403
    ? 'AUTHENTICATION_REQUIRED'
    : response.status === 404
      ? 'MARKET_DATA_NOT_FOUND'
      : response.status >= 500
        ? 'MARKET_DATA_UNAVAILABLE'
        : 'MARKET_DATA_REQUEST_FAILED';
  return new MarketDataRequestError(code, response.status, detail);
}

function readSnapshot(value: unknown): MarketBarSnapshot {
  const snapshot = object(value, 'Invalid market data snapshot');
  if (!Array.isArray(snapshot.bars)) throw new Error('Invalid market data bars');
  const timeframe = string(snapshot.timeframe, 'timeframe');
  if (!isChartTimeframe(timeframe)) throw new Error(`Unsupported market data timeframe: ${timeframe}`);
  return {
    instrumentId: string(snapshot.instrumentId, 'instrumentId'),
    symbol: string(snapshot.symbol, 'symbol'),
    timeframe,
    bars: snapshot.bars.map(readBar),
  };
}

function readPreviewSnapshot(value: unknown): MarketBarPreviewSnapshot {
  const base = readSnapshot(value);
  const snapshot = object(value, 'Invalid market data preview');
  const window = string(snapshot.window, 'window');
  if (window !== '1m' && window !== '3m') throw new Error(`Unsupported preview window: ${window}`);
  const coverageStatus = string(snapshot.coverageStatus, 'coverageStatus');
  if (!['COMPLETE', 'PARTIAL', 'EMPTY'].includes(coverageStatus)) {
    throw new Error(`Unsupported market data coverage: ${coverageStatus}`);
  }
  const requestedFrom = nullableString(snapshot.requestedFrom, 'requestedFrom');
  const requestedTo = nullableString(snapshot.requestedTo, 'requestedTo');
  const availableFrom = nullableString(snapshot.availableFrom, 'availableFrom');
  const availableTo = nullableString(snapshot.availableTo, 'availableTo');
  if (coverageStatus === 'EMPTY' && (base.bars.length > 0 || availableFrom !== null || availableTo !== null)) {
    throw new Error('Invalid empty market data coverage');
  }
  if (coverageStatus !== 'EMPTY' && (!requestedFrom || !requestedTo || !availableFrom || !availableTo)) {
    throw new Error('Invalid non-empty market data coverage');
  }
  return {
    ...base,
    window,
    requestedFrom,
    requestedTo,
    availableFrom,
    availableTo,
    coverageStatus: coverageStatus as MarketBarCoverageStatus,
    reasonCode: nullableString(snapshot.reasonCode, 'reasonCode'),
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

export function isChartTimeframe(value: string): value is ChartTimeframe {
  return isStrategyTimeframe(value) || isDisplayTimeframe(value);
}

async function connectPriceSocket(
  root: string,
  instrumentId: string,
  onPrice: (price: DisplayPriceUpdate) => void,
  signal: AbortSignal | undefined,
  fetchImpl: typeof fetch,
  headers: (accept: string) => HeadersInit,
  webSocketFactory: (url: string) => WebSocket,
): Promise<void> {
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
    let settled = false;
    const finish = (failure?: Error) => {
      if (settled) return;
      settled = true;
      signal?.removeEventListener('abort', abort);
      if (failure) reject(failure); else resolve();
    };
    const abort = () => {
      socket.close(1000, 'client navigation');
      finish();
    };
    signal?.addEventListener('abort', abort, { once: true });
    socket.onopen = () => socket.send(JSON.stringify({ action: 'subscribe', instrumentId }));
    socket.onmessage = (event) => {
      const value = JSON.parse(String(event.data)) as unknown;
      const parsed = readDisplayPrice(value);
      if (parsed) onPrice(parsed);
    };
    socket.onerror = () => finish(new Error('Market data WebSocket failed'));
    socket.onclose = (event) => {
      if (signal?.aborted || event.code === 1000) finish();
      else finish(new Error(`Market data WebSocket closed (${event.code})`));
    };
  });
}

function abortableDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = window.setTimeout(done, milliseconds);
    function done() {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
  });
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

function nullableString(value: unknown, label: string): string | null {
  if (value === null || value === undefined) return null;
  return string(value, label);
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
