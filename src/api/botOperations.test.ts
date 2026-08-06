import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBotOperationsClient } from './botOperations';
import { setSessionAccessToken } from './sessionAccessToken';

describe('bot operations API client', () => {
  afterEach(() => setSessionAccessToken(null));

  it('uses the authenticated browser session when no token provider is overridden', async () => {
    setSessionAccessToken('browser-session-token');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));

    await createBotOperationsClient({ fetchImpl }).listOperations();

    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/bots/operations', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer browser-session-token' }),
    }));
  });

  it('loads owner bot states and advances the judgment cursor', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([
        {
          botId: '30000000-0000-4000-8000-000000000001',
          name: 'Atlas 07',
          state: 'data-degraded',
          lifecycleChangedAt: '2026-08-01T12:00:00Z',
          executionBlockedAt: '2026-08-01T12:01:00Z',
          executionBlockReasonCode: 'MARKET_DATA_STALE',
          lastEventSequence: 8,
        },
      ]), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        entries: [{
          eventId: '40000000-0000-4000-8000-000000000001',
          sequence: 8,
          eventType: 'BOT_EVALUATED',
          occurredAt: '2026-08-01T12:01:00Z',
          summary: { decision: 'BUY', symbol: 'AAPL' },
        }],
        nextAfterSequence: 8,
        hasMore: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createBotOperationsClient({ baseUrl: 'https://api.example.com/', fetchImpl });

    const bots = await client.listOperations();
    const page = await client.listJudgments(bots[0].botId, 7, 20);

    expect(bots[0].state).toBe('data-degraded');
    expect(page.entries[0].summary).toEqual({ decision: 'BUY', symbol: 'AAPL' });
    expect(page.nextAfterSequence).toBe(8);
    expect(fetchImpl).toHaveBeenNthCalledWith(1, 'https://api.example.com/api/v1/bots/operations', expect.objectContaining({ credentials: 'include' }));
    expect(fetchImpl).toHaveBeenNthCalledWith(2, 'https://api.example.com/api/v1/bots/30000000-0000-4000-8000-000000000001/judgments?afterSequence=7&limit=20', expect.any(Object));
  });

  it('rejects unknown states instead of treating them as healthy', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      botId: '30000000-0000-4000-8000-000000000001',
      name: 'Atlas 07',
      state: 'mystery-state',
      lifecycleChangedAt: '2026-08-01T12:00:00Z',
      executionBlockedAt: null,
      executionBlockReasonCode: null,
      lastEventSequence: 0,
    }]), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(createBotOperationsClient({ fetchImpl }).listOperations())
      .rejects.toThrow('Unsupported bot operations state');
  });

  it('surfaces non-success responses', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('unavailable', { status: 503 }));

    await expect(createBotOperationsClient({ fetchImpl }).listOperations())
      .rejects.toThrow('Bot operations request failed (503)');
  });

  it('issues versioned run and permanent stop commands', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ created: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' },
      }));
    const client = createBotOperationsClient({ baseUrl: 'https://api.example.com', fetchImpl });

    await client.runBot('30000000-0000-4000-8000-000000000001');
    await client.stopBot('30000000-0000-4000-8000-000000000001', 'USER_REQUESTED');

    expect(fetchImpl).toHaveBeenNthCalledWith(
      1,
      'https://api.example.com/api/v1/bots/30000000-0000-4000-8000-000000000001/run',
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
    expect(fetchImpl).toHaveBeenNthCalledWith(
      2,
      'https://api.example.com/api/v1/bots/30000000-0000-4000-8000-000000000001/stop',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reasonCode: 'USER_REQUESTED' }),
      }),
    );
  });

  it('loads preflight and renews the server-owned continuation deadline', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        botId: 'bot-1', ready: false, issues: [{ code: 'DATA_STALE', detail: '시장 데이터가 오래되었습니다.' }],
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        botId: 'bot-1', dueAt: '2026-09-01T00:00:00Z', renewalAvailableFrom: '2026-08-15T00:00:00Z',
        lastRenewedAt: '2026-08-07T00:00:00Z', renewalAllowed: false,
      }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    const client = createBotOperationsClient({ baseUrl: 'https://api.example.com', fetchImpl });

    const preflight = await client.getPreflight?.('bot-1');
    const continuation = await client.renewContinuation?.('bot-1');

    expect(preflight).toMatchObject({ ready: false, issues: [{ code: 'DATA_STALE' }] });
    expect(continuation?.renewalAllowed).toBe(false);
    expect(fetchImpl).toHaveBeenNthCalledWith(2,
      'https://api.example.com/api/v1/bots/bot-1/continuation/renew',
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
