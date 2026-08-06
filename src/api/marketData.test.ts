import { describe, expect, it, vi } from 'vitest';
import { createMarketDataClient } from './marketData';

const bar = {
  eventId: 'event-1', occurredAt: '2026-08-06T14:30:00Z', sequence: 1, revision: 0,
  open: 210, high: 211, low: 209, close: 210.5, volume: 2500,
  provider: 'ALPACA', feed: 'SIP',
};

describe('market data client', () => {
  it('loads authenticated one-minute snapshots', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      instrumentId: 'instrument-1', symbol: 'AAPL', timeframe: '1m', bars: [bar],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createMarketDataClient({
      baseUrl: 'https://api.example.com/', fetchImpl, getAccessToken: () => 'session-token',
    });

    const result = await client.getRecentBars('instrument-1', 300);

    expect(result.bars[0].close).toBe(210.5);
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/market-data/instruments/instrument-1/bars?limit=300',
      expect.objectContaining({
        credentials: 'include',
        headers: expect.objectContaining({ Authorization: 'Bearer session-token' }),
      }),
    );
  });

  it('decodes authenticated SSE bar events', async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(`event: ready\ndata: {}\n\nevent: bar\ndata: ${JSON.stringify(bar)}\n\n`));
        controller.close();
      },
    });
    const fetchImpl = vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
    const client = createMarketDataClient({ fetchImpl, getAccessToken: () => 'session-token' });
    const received: number[] = [];

    await client.streamBars('instrument-1', (value) => received.push(value.close));

    expect(received).toEqual([210.5]);
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/market-data/instruments/instrument-1/bars/stream',
      expect.objectContaining({
        headers: expect.objectContaining({
          Accept: 'text/event-stream', Authorization: 'Bearer session-token',
        }),
      }),
    );
  });
});
