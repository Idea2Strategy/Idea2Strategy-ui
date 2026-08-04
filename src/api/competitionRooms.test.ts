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
});
