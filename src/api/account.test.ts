import { describe, expect, it, vi } from 'vitest';
import { AccountApiError, createAccountClient } from './account';

describe('account API client', () => {
  it('accepts the immediate-signup contract without requiring email delivery', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-1',
      verificationRequired: false,
      verificationExpiresAt: null,
    }), { status: 201 }));

    const client = createAccountClient({ fetchImpl });

    await expect(client.signup('new@example.com', 'StrongPass!2026')).resolves.toEqual({
      accountId: 'account-1',
      verificationRequired: false,
      verificationExpiresAt: null,
    });
  });

  it('stores the one-time login token and sends correlation evidence', async () => {
    const setAccessToken = vi.fn();
    const signIn = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-1', tokenType: 'Bearer',
      accessToken: 'access-jwt',
      accessExpiresAt: '2026-08-03T00:00:00Z', refreshExpiresAt: '2026-08-03T12:00:00Z',
    }), { status: 200 }));
    const client = createAccountClient({
      baseUrl: 'https://api.example.com/', fetchImpl, setAccessToken,
      sessionStore: {
        read: vi.fn().mockReturnValue({ status: 'anonymous', reason: 'absent' }),
        accessToken: vi.fn(), canRefresh: vi.fn(), signIn, signOut: vi.fn(), subscribe: vi.fn(),
      },
      createCorrelationId: () => 'correlation-1',
    });

    await client.login('user@example.com', 'password');

    expect(setAccessToken).toHaveBeenCalledWith('access-jwt');
    expect(signIn).toHaveBeenCalledWith(expect.objectContaining({ email: 'user@example.com' }));
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/login', expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: expect.objectContaining({ 'X-Correlation-Id': 'correlation-1' }),
    }));
  });

  it('exchanges a Google credential for a session and publishes it to both stores', async () => {
    const setAccessToken = vi.fn();
    const signIn = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-9', tokenType: 'Bearer',
      accessToken: 'google-access',
      accessExpiresAt: '2026-08-07T00:00:00Z', refreshExpiresAt: '2026-08-07T12:00:00Z',
    }), { status: 200 }));
    const client = createAccountClient({
      baseUrl: 'https://api.example.com', fetchImpl, setAccessToken,
      sessionStore: { read: vi.fn(), accessToken: vi.fn(), canRefresh: vi.fn(), signIn, signOut: vi.fn(), subscribe: vi.fn() },
      createCorrelationId: () => 'correlation-google',
    });

    await client.loginWithGoogle!('google-id-token', 'nonce-1');

    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/auth/oidc/login', expect.objectContaining({
      method: 'POST',
      body: JSON.stringify({ providerCode: 'GOOGLE', idToken: 'google-id-token', expectedNonce: 'nonce-1' }),
    }));
    expect(setAccessToken).toHaveBeenCalledWith('google-access');
    expect(signIn).toHaveBeenCalledWith({
      accessToken: 'google-access', accountId: 'account-9',
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
      sessionStore: {
        read: vi.fn().mockReturnValue({
          status: 'authenticated',
          session: { accessToken: 'session-token', accountId: 'account-1', email: 'user@example.com', expiresAt: null },
        }),
        accessToken: vi.fn(), canRefresh: vi.fn(), signIn: vi.fn(), signOut: vi.fn(), subscribe: vi.fn(),
      },
    });

    await client.requestWithdrawal('password', 'withdrawal-1');

    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/account/withdrawal-requests', expect.objectContaining({
      body: JSON.stringify({ email: 'user@example.com', password: 'password', acceptedPolicyDocumentIds: [] }),
      headers: expect.objectContaining({
        Authorization: 'Bearer session-token', 'Idempotency-Key': 'withdrawal-1',
      }),
    }));
  });

  it('preserves stable server error codes and correlation ids', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 'STEP_UP_REQUIRED', correlationId: 'server-correlation',
      }), { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        code: 'AUTHENTICATION_REJECTED', correlationId: 'refresh-correlation',
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

  it('fails closed before protected requests when no bearer access token exists', async () => {
    const fetchImpl = vi.fn();
    await expect(createAccountClient({ fetchImpl, getAccessToken: () => null, createCorrelationId: () => 'corr-auth' }).preferences())
      .rejects.toEqual(expect.objectContaining({ status: 401, code: 'AUTHENTICATION_REQUIRED', correlationId: 'corr-auth' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('rotates the refresh JWT and replaces the in-memory access token', async () => {
    const setAccessToken = vi.fn();
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      accountId: 'account-1', tokenType: 'Bearer', accessToken: 'rotated-access',
      accessExpiresAt: '2026-08-04T00:00:00Z', refreshExpiresAt: '2026-08-04T12:00:00Z',
    }), { status: 200 }));
    await expect(createAccountClient({ fetchImpl, getAccessToken: () => 'old-token', setAccessToken }).rotateSession())
      .resolves.toEqual({
        accountId: 'account-1', tokenType: 'Bearer', accessToken: 'rotated-access',
        accessExpiresAt: '2026-08-04T00:00:00Z', refreshExpiresAt: '2026-08-04T12:00:00Z',
      });
    expect(setAccessToken).toHaveBeenCalledWith('rotated-access');
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/auth/refresh', expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: expect.not.objectContaining({ Authorization: expect.anything() }),
    }));
  });

  it('coalesces concurrent refreshes so rotation reuse detection is not triggered locally', async () => {
    let resolve!: (response: Response) => void;
    const pending = new Promise<Response>((done) => { resolve = done; });
    const fetchImpl = vi.fn().mockReturnValue(pending);
    const client = createAccountClient({ fetchImpl });

    const first = client.rotateSession();
    const second = client.rotateSession();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    resolve(new Response(JSON.stringify({
      accountId: 'account-1', tokenType: 'Bearer', accessToken: 'access-2',
      accessExpiresAt: '2026-08-04T00:00:00Z', refreshExpiresAt: '2026-09-03T00:00:00Z',
    }), { status: 200 }));

    await expect(Promise.all([first, second])).resolves.toHaveLength(2);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('silently refreshes and retries one protected request after access JWT expiry', async () => {
    let accessToken = 'expired-access';
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        accountId: 'account-1', tokenType: 'Bearer', accessToken: 'fresh-access',
        accessExpiresAt: '2026-08-04T00:00:00Z', refreshExpiresAt: '2026-09-03T00:00:00Z',
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        languageCode: 'ko', timezoneName: 'Asia/Seoul', themePreference: 'SYSTEM',
        updatedAt: '2026-08-03T00:00:00Z',
      }), { status: 200 }));
    const client = createAccountClient({
      fetchImpl,
      getAccessToken: () => accessToken,
      setAccessToken: (token) => { accessToken = token ?? ''; },
    });

    await expect(client.preferences()).resolves.toEqual(expect.objectContaining({ languageCode: 'ko' }));
    expect(fetchImpl.mock.calls.map((call) => call[0])).toEqual([
      '/api/v1/account/preferences', '/api/v1/auth/refresh', '/api/v1/account/preferences',
    ]);
    expect((fetchImpl.mock.calls[2][1] as RequestInit).headers).toEqual(
      expect.objectContaining({ Authorization: 'Bearer fresh-access' }),
    );
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
