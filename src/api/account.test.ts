import { describe, expect, it, vi } from 'vitest';
import { AccountApiError, createAccountClient } from './account';

describe('account API client', () => {
  it('stores the one-time login token and sends correlation evidence', async () => {
    const setAccessToken = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-1', sessionId: 'session-1', tokenType: 'Bearer',
      accessToken: 'access-jwt', refreshToken: 'refresh-jwt',
      accessExpiresAt: '2026-08-03T00:00:00Z', refreshExpiresAt: '2026-08-03T12:00:00Z',
    }), { status: 200 }));
    const client = createAccountClient({
      baseUrl: 'https://api.example.com/', fetchImpl, setAccessToken,
      createCorrelationId: () => 'correlation-1',
    });

    await client.login('user@example.com', 'password', 'browser');

    expect(setAccessToken).toHaveBeenCalledWith('access-jwt');
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: expect.objectContaining({ 'X-Correlation-Id': 'correlation-1' }),
    }));
  });

  it('exchanges a Google credential for a session and publishes it to both stores', async () => {
    const setAccessToken = vi.fn();
    const signIn = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-9', sessionId: 'session-9', tokenType: 'Bearer',
      accessToken: 'google-access', refreshToken: 'google-refresh',
      accessExpiresAt: '2026-08-07T00:00:00Z', refreshExpiresAt: '2026-08-07T12:00:00Z',
    }), { status: 200 }));
    const client = createAccountClient({
      baseUrl: 'https://api.example.com', fetchImpl, setAccessToken,
      sessionStore: { read: vi.fn(), accessToken: vi.fn(), signIn, signOut: vi.fn(), subscribe: vi.fn() },
      createCorrelationId: () => 'correlation-google',
    });

    await client.loginWithGoogle!('google-id-token', 'nonce-1', 'Web browser');

    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/oidc/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ providerCode: 'GOOGLE', idToken: 'google-id-token', expectedNonce: 'nonce-1', deviceLabel: 'Web browser' }),
    }));
    expect(setAccessToken).toHaveBeenCalledWith('google-access');
    expect(signIn).toHaveBeenCalledWith({
      accessToken: 'google-access', refreshToken: 'google-refresh', accountId: 'account-9',
      expiresAt: '2026-08-07T00:00:00Z', refreshExpiresAt: '2026-08-07T12:00:00Z',
    });
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

    await expect(createAccountClient({ fetchImpl, getAccessToken: () => 'session-token' }).preferences())
      .rejects.toEqual(expect.objectContaining<Partial<AccountApiError>>({
        status: 401, code: 'STEP_UP_REQUIRED', correlationId: 'server-correlation',
      }));
  });

  it('decodes the exact backend preferences contract without inventing an account id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      languageCode: 'ko', timezoneName: 'Asia/Seoul', themePreference: 'SYSTEM',
      updatedAt: '2026-08-03T00:00:00Z',
    }), { status: 200 }));

    await expect(createAccountClient({ fetchImpl, getAccessToken: () => 'session-token' }).preferences())
      .resolves.toEqual({
        languageCode: 'ko', timezoneName: 'Asia/Seoul', themePreference: 'SYSTEM',
        updatedAt: '2026-08-03T00:00:00Z',
      });
  });

  it('clears the local session only after logout succeeds', async () => {
    const setAccessToken = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));

    await createAccountClient({ fetchImpl, getAccessToken: () => 'session-token', setAccessToken }).logoutCurrent();

    expect(setAccessToken).toHaveBeenCalledWith(null);
  });

  it('fails closed before protected requests when no bearer session exists', async () => {
    const fetchImpl = vi.fn();
    await expect(createAccountClient({ fetchImpl, getAccessToken: () => null, createCorrelationId: () => 'corr-auth' }).sessions())
      .rejects.toEqual(expect.objectContaining({ status: 401, code: 'AUTHENTICATION_REQUIRED', correlationId: 'corr-auth' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('decodes the exact backend sessionId and issuedAt contract', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify([{
      sessionId: 'session-1', deviceLabel: 'browser', issuedAt: '2026-08-01T00:00:00Z',
      lastSeenAt: null, expiresAt: '2026-08-03T00:00:00Z', current: true,
    }]), { status: 200 }));

    await expect(createAccountClient({ fetchImpl, getAccessToken: () => 'session-token' }).sessions())
      .resolves.toEqual([expect.objectContaining({ sessionId: 'session-1', issuedAt: '2026-08-01T00:00:00Z' })]);
  });

  it('rotates the exact backend session contract and replaces the in-memory token', async () => {
    const setAccessToken = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      sessionId: 'session-2', tokenType: 'Bearer', accessToken: 'rotated-access', refreshToken: 'rotated-refresh',
      accessExpiresAt: '2026-08-04T00:00:00Z', refreshExpiresAt: '2026-08-04T12:00:00Z',
    }), { status: 200 }));
    await expect(createAccountClient({ fetchImpl, getAccessToken: () => 'old-token', setAccessToken }).rotateSession())
      .resolves.toEqual({
        sessionId: 'session-2', tokenType: 'Bearer', accessToken: 'rotated-access', refreshToken: 'rotated-refresh',
        accessExpiresAt: '2026-08-04T00:00:00Z', refreshExpiresAt: '2026-08-04T12:00:00Z',
      });
    expect(setAccessToken).toHaveBeenCalledWith('rotated-access');
  });

  it('uses non-enumerating password recovery request and reset contracts', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ accepted: true }), { status: 202 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createAccountClient({ fetchImpl });
    await expect(client.requestPasswordReset('user@example.com')).resolves.toBe(true);
    await expect(client.resetPassword('reset-token', 'new-password')).resolves.toBeUndefined();
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/auth/password-reset-requests');
    expect(fetchImpl.mock.calls[1][0]).toBe('/api/v1/auth/password-resets');
  });
});
