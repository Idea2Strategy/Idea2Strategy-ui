import { afterEach, describe, expect, it, vi } from 'vitest';
import { createDashboardClient } from './dashboard';
import { setSessionAccessToken } from './sessionAccessToken';

describe('dashboard API client', () => {
  afterEach(() => setSessionAccessToken(null));

  it('loads the authenticated aggregate without inventing missing projections', async () => {
    setSessionAccessToken('dashboard-token');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: '2026-08-07T12:00:00Z',
      bots: [{
        botId: '30000000-0000-4000-8000-000000000001',
        name: 'Confirmed bot',
        state: 'running',
        lifecycleChangedAt: '2026-08-07T11:59:00Z',
        performance: {
          equityAmount: 10540,
          totalReturnPct: 5.4,
          maxDrawdownPct: -2.1,
          sharpeRatio: null,
          calculationRulesVersion: 'performance-v1',
          updatedAt: '2026-08-07T11:59:30Z',
        },
        competition: null,
      }, {
        botId: '30000000-0000-4000-8000-000000000002',
        name: 'Waiting bot',
        state: 'waiting',
        lifecycleChangedAt: '2026-08-07T11:58:00Z',
        performance: null,
        competition: null,
      }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const snapshot = await createDashboardClient({ fetchImpl }).getSnapshot();

    expect(snapshot.bots[0].performance?.equityAmount).toBe(10540);
    expect(snapshot.bots[1].performance).toBeNull();
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/dashboard', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer dashboard-token' }),
    }));
  });

  it('rejects malformed performance values instead of presenting them as live data', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      generatedAt: '2026-08-07T12:00:00Z',
      bots: [{
        botId: '30000000-0000-4000-8000-000000000001',
        name: 'Broken bot',
        state: 'running',
        lifecycleChangedAt: '2026-08-07T11:59:00Z',
        performance: { equityAmount: 'not-a-number' },
        competition: null,
      }],
    }), { status: 200 }));

    await expect(createDashboardClient({ fetchImpl }).getSnapshot())
      .rejects.toThrow('Invalid equityAmount');
  });
});
