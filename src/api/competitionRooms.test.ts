import { describe, expect, test, vi } from 'vitest';
import { CompetitionApiError, createCompetitionRoomsClient } from './competitionRooms';

const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), {
  status,
  headers: { 'Content-Type': 'application/json' },
});

const room = {
  id: '11111111-1111-4111-8111-111111111111',
  name: 'ETF Sprint',
  organizerType: 'USER',
  createdAt: '2026-08-01T00:00:00Z',
  recruitmentOpensAt: '2026-08-01T00:00:00Z',
  participationClosesAt: '2026-08-10T00:00:00Z',
  botParticipationLimit: 25,
  perAccountBotLimit: 2,
};

describe('competition rooms API client', () => {
  test('browses public rooms with credentials and an access token', async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ items: [room], nextCursor: 'next', hasMore: true }));
    const client = createCompetitionRoomsClient({ fetchImpl, getAccessToken: () => 'token' });

    await expect(client.searchRooms({ q: 'ETF', limit: 10 })).resolves.toMatchObject({ items: [room], hasMore: true });
    expect(fetchImpl).toHaveBeenCalledWith(
      '/api/v1/competition/rooms/public?q=ETF&limit=10',
      expect.objectContaining({ credentials: 'include', headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
    );
  });

  test('uses the exact create, join, leaderboard, my-bots and choice routes', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith('/participations') && init?.method === 'POST') return jsonResponse({ id: 'p1', roomId: room.id, botId: 'b1', anonymousAlias: 'Bot 3F9A', joinedAt: room.createdAt }, 201);
      if (url.includes('/leaderboard/my-bots?')) return jsonResponse({ snapshotId: null, snapshotStatus: null, cutoffAt: null, items: [], nextCursor: null, hasMore: false });
      if (url.includes('/leaderboard?')) return jsonResponse({ snapshotId: null, snapshotStatus: null, cutoffAt: null, items: [], nextCursor: null, hasMore: false });
      if (url.endsWith('/post-evaluation-choice') && init?.method === 'PUT') return jsonResponse({ roomId: room.id, participationId: 'p1', action: 'CONTINUE_PRIVATE', recordedAt: room.createdAt, lockedAt: null });
      if (url.endsWith('/post-evaluation-choice')) return jsonResponse({ roomId: room.id, participationId: 'p1', action: 'STOP_AFTER_EVALUATION', recordedAt: room.createdAt, lockedAt: null });
      return jsonResponse({ id: room.id, accessType: 'PUBLIC', status: 'RECRUITING' }, 201);
    });
    const client = createCompetitionRoomsClient({ fetchImpl });

    await client.createRoom({ name: 'Room', accessType: 'PUBLIC' } as never);
    await client.joinRoom(room.id, { validationRunId: 'v1' } as never);
    await client.leaderboard(room.id);
    await client.myBots(room.id);
    await client.getPostEvaluationChoice(room.id, 'p1');
    await client.setPostEvaluationChoice(room.id, 'p1', 'CONTINUE_PRIVATE');

    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/competition/rooms',
      `/api/v1/competition/rooms/${room.id}/participations`,
      `/api/v1/competition/rooms/${room.id}/leaderboard?limit=50`,
      `/api/v1/competition/rooms/${room.id}/leaderboard/my-bots?limit=50`,
      `/api/v1/competition/rooms/${room.id}/participations/p1/post-evaluation-choice`,
      `/api/v1/competition/rooms/${room.id}/participations/p1/post-evaluation-choice`,
    ]);
    expect(fetchImpl.mock.calls.at(-1)?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ action: 'CONTINUE_PRIVATE' }) });
  });

  test('preserves permission failures and rejects malformed successful responses', async () => {
    const denied = createCompetitionRoomsClient({ fetchImpl: async () => jsonResponse({ title: 'Leaderboard access denied', detail: 'private room' }, 403) });
    await expect(denied.leaderboard(room.id)).rejects.toMatchObject({ status: 403, detail: 'private room' } satisfies Partial<CompetitionApiError>);

    const malformed = createCompetitionRoomsClient({ fetchImpl: async () => jsonResponse({ items: [{ ...room, name: '' }], nextCursor: null, hasMore: false }) });
    await expect(malformed.searchRooms()).rejects.toThrow('Invalid room name');
  });

  test('reads the server-owned room input and current validation catalogs', async () => {
    const fetchImpl = vi.fn(async (input: RequestInfo | URL) => String(input).endsWith('/room-input-catalog')
      ? jsonResponse({
        scoringTemplates: [{
          id: 'score-1', templateCode: 'TOTAL_RETURN', version: '1.0.0', kind: 'SINGLE', calculationRulesVersion: '1.0.0',
          components: [{ metric: 'TOTAL_RETURN', direction: 'HIGHER_IS_BETTER', coefficient: 1 }],
          adjustments: [{ code: 'minimumTrades', unit: 'COUNT', minimum: 1, maximum: 20, scale: 0 }], rulesHash: 'a'.repeat(64),
        }],
        feePolicies: [{ id: 'fee-1', policyCode: 'OFFICIAL', version: '1.0.0', feeRateBps: 20, calculationRulesVersion: '1.0.0', rulesHash: 'b'.repeat(64), effectiveFrom: '2026-08-04T00:00:00Z', effectiveTo: null, publishedAt: '2026-08-03T00:00:00Z' }],
        buyingPowerBufferPolicies: [{ id: 'buffer-1', policyCode: 'DEFAULT', version: '1.0.0', bufferBps: 100, roundingRulesVersion: '1.0.0', rulesHash: 'c'.repeat(64), effectiveFrom: '2026-08-04T00:00:00Z', effectiveTo: null, publishedAt: '2026-08-03T00:00:00Z' }],
      })
      : jsonResponse({ items: [{ validationRunId: 'validation-1', strategyId: 'strategy-1', strategyName: 'Momentum', requestedEditSequence: 7, semanticHash: 'd'.repeat(64), elementCatalogVersionId: 'catalog-1', completedAt: '2026-08-04T09:59:00Z' }] }));
    const client = createCompetitionRoomsClient({ fetchImpl });

    await expect(client.roomInputCatalog()).resolves.toMatchObject({
      scoringTemplates: [{ id: 'score-1', templateCode: 'TOTAL_RETURN' }],
      feePolicies: [{ id: 'fee-1', feeRateBps: 20 }],
      buyingPowerBufferPolicies: [{ id: 'buffer-1', bufferBps: 100 }],
    });
    await expect(client.currentStrategyValidations()).resolves.toEqual({ items: [expect.objectContaining({ validationRunId: 'validation-1', strategyName: 'Momentum', requestedEditSequence: 7 })] });
    expect(fetchImpl.mock.calls.map(([url]) => String(url))).toEqual([
      '/api/v1/competition/room-input-catalog', '/api/v1/strategy-validations/current',
    ]);
  });
});
