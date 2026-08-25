import { describe, expect, it, vi } from 'vitest';
import { createMarketDataClient, isChartTimeframe, isStrategyTimeframe } from './marketData';
import type { DisplayPriceUpdate } from './marketData';

const bar = {
  eventId: 'event-1', occurredAt: '2026-08-06T14:30:00Z', sequence: 1, revision: 0,
  open: 210, high: 211, low: 209, close: 210.5, volume: 2500,
  provider: 'ALPACA', feed: 'SIP_30MIN_REST',
};

describe('market data client', () => {
  it('separates display periods from strategy periods while allowing both on the chart API', () => {
    expect(['1m', '5m', '15m'].map(isStrategyTimeframe)).toEqual([false, false, false]);
    expect(['30m', '1h', '4h', '1d'].map(isStrategyTimeframe)).toEqual([true, true, true, true]);
    expect(['1m', '5m', '15m', '30m', '1h', '4h', '1d'].every(isChartTimeframe)).toBe(true);
  });

  it('loads authenticated strategy snapshots by timeframe', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      instrumentId: 'instrument-1', symbol: 'AAPL', timeframe: '4h', bars: [bar],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createMarketDataClient({
      baseUrl: 'https://api.example.com/', fetchImpl, getAccessToken: () => 'session-token',
    });

    const result = await client.getRecentBars('instrument-1', '4h');

    expect(result.bars[0].close).toBe(210.5);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/market-data/instruments/instrument-1/bars?timeframe=4h&limit=1000',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      }),
    );
  });

  it('uses a one-use authenticated ticket for display WebSocket prices', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ticket: 'ticket-1', expiresAt: '2026-08-06T14:30:30Z',
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const sent: string[] = [];
    const socket = {
      onopen: null as (() => void) | null,
      onmessage: null as ((event: MessageEvent) => void) | null,
      onerror: null as (() => void) | null,
      onclose: null as ((event: CloseEvent) => void) | null,
      send: (value: string) => sent.push(value),
      close: () => socket.onclose?.({ code: 1000 } as CloseEvent),
    };
    const socketFactory = vi.fn(() => socket as unknown as WebSocket);
    const client = createMarketDataClient({
      baseUrl: 'https://api.example.com', fetchImpl,
      getAccessToken: () => 'session-token', webSocketFactory: socketFactory,
    });
    const received: DisplayPriceUpdate[] = [];
    const controller = new AbortController();
    const streaming = client.streamPrices('instrument-1', (value) => received.push(value), controller.signal);
    await vi.waitFor(() => expect(socketFactory).toHaveBeenCalledOnce());
    socket.onopen?.();
    socket.onmessage?.({ data: JSON.stringify({
      schemaVersion: 1, instrumentId: 'instrument-1', symbol: 'AAPL', price: 210.25,
      lastTradeSize: 2, intervalOpen: 210, intervalHigh: 211, intervalLow: 209.75,
      intervalClose: 210.25, intervalVolume: 5, intervalTradeCount: 2, providerTradeId: 42,
      occurredAt: '2026-08-06T14:30:00.100Z', publishedAt: '2026-08-06T14:30:00.250Z',
    }) } as MessageEvent);
    controller.abort();
    await streaming;

    expect(sent).toEqual([JSON.stringify({ action: 'subscribe', instrumentId: 'instrument-1' })]);
    expect(received).toEqual([expect.objectContaining({
      price: 210.25,
      intervalOpen: 210,
      intervalHigh: 211,
      intervalLow: 209.75,
      intervalClose: 210.25,
    })]);
    expect(socketFactory).toHaveBeenCalledWith(
      'wss://api.example.com/ws/v1/market-data/prices?ticket=ticket-1',
    );
  });

  it('gets a fresh ticket and reconnects after an abnormal close', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'ticket-1' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ticket: 'ticket-2' }), { status: 200 }));
    const sockets = [0, 1].map(() => {
      const socket = {
        onopen: null as (() => void) | null,
        onmessage: null as ((event: MessageEvent) => void) | null,
        onerror: null as (() => void) | null,
        onclose: null as ((event: CloseEvent) => void) | null,
        send: vi.fn(),
        close: () => socket.onclose?.({ code: 1000 } as CloseEvent),
      };
      return socket;
    });
    const socketFactory = vi.fn()
      .mockImplementationOnce(() => sockets[0] as unknown as WebSocket)
      .mockImplementationOnce(() => sockets[1] as unknown as WebSocket);
    const client = createMarketDataClient({
      baseUrl: 'https://api.example.com', fetchImpl,
      getAccessToken: () => 'session-token', webSocketFactory: socketFactory,
    });
    const controller = new AbortController();
    const streaming = client.streamPrices('instrument-1', () => {}, controller.signal);
    await vi.waitFor(() => expect(socketFactory).toHaveBeenCalledTimes(1));

    sockets[0].onclose?.({ code: 1006 } as CloseEvent);
    await vi.waitFor(() => expect(socketFactory).toHaveBeenCalledTimes(2), { timeout: 2_000 });
    controller.abort();
    await streaming;

    expect(socketFactory.mock.calls.map(([url]) => url)).toEqual([
      'wss://api.example.com/ws/v1/market-data/prices?ticket=ticket-1',
      'wss://api.example.com/ws/v1/market-data/prices?ticket=ticket-2',
    ]);
  });
});
