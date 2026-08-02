import { describe, expect, it, vi } from 'vitest';
import { AccountApiError, createAccountClient } from './account';

describe('account API client', () => {
  it('stores the one-time login token and sends correlation evidence', async () => {
    const setAccessToken = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-1', sessionId: 'session-1', sessionToken: 'secret-session',
      expiresAt: '2026-08-03T00:00:00Z',
    }), { status: 200 }));
    const client = createAccountClient({
      baseUrl: 'https://api.example.com/', fetchImpl, setAccessToken,
      createCorrelationId: () => 'correlation-1',
    });

    await client.login('user@example.com', 'password', 'browser');

    expect(setAccessToken).toHaveBeenCalledWith('secret-session');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: expect.objectContaining({ 'X-Correlation-Id': 'correlation-1' }),
    }));
  });

  it('sends authorization and idempotency headers for withdrawal', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-1', status: 'CLOSING', version: 2,
      withdrawalRequestedAt: '2026-08-02T00:00:00Z',
      cancellationDeadlineAt: '2026-09-01T00:00:00Z', applied: true,
    }), { status: 202 }));
    const client = createAccountClient({
      fetchImpl, getAccessToken: () => 'session-token', createCorrelationId: () => 'correlation-2',
    });

    await client.requestWithdrawal('user@example.com', 'password', 'withdrawal-1');

    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/account/withdrawal-requests', expect.objectContaining({
      headers: expect.objectContaining({
        Authorization: 'Bearer session-token', 'Idempotency-Key': 'withdrawal-1',
      }),
    }));
  });

  it('preserves stable server error codes and correlation ids', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      code: 'STEP_UP_REQUIRED', correlationId: 'server-correlation',
    }), { status: 401 }));

    await expect(createAccountClient({ fetchImpl }).preferences())
      .rejects.toEqual(expect.objectContaining<Partial<AccountApiError>>({
        status: 401, code: 'STEP_UP_REQUIRED', correlationId: 'server-correlation',
      }));
  });

  it('clears the local session only after logout succeeds', async () => {
    const setAccessToken = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await createAccountClient({ fetchImpl, setAccessToken }).logoutCurrent();

    expect(setAccessToken).toHaveBeenCalledWith(null);
  });
});
