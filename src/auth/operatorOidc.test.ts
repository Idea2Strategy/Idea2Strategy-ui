import { describe, expect, it, vi } from 'vitest';
import {
  OPERATOR_OIDC_TRANSACTION_KEY,
  createOperatorOidcSession,
  readProductionOperatorOidcConfig,
  type OperatorOidcConfig,
} from './operatorOidc';

const now = Date.parse('2026-08-05T00:00:00Z');
const config = {
  issuer: 'https://idp.example.test',
  authorizationEndpoint: 'https://idp.example.test/authorize',
  tokenEndpoint: 'https://idp.example.test/token',
  endSessionEndpoint: 'https://idp.example.test/logout',
  clientId: 'operator-ui',
  audience: 'idea2strategy-operator',
  redirectUri: 'https://app.example.test/operations/callback',
  postLogoutRedirectUri: 'https://app.example.test/operations/login',
  logoutRedirectParameter: 'post_logout_redirect_uri' as const,
  scopes: ['openid', 'profile'],
  signingAlgorithm: 'RS256',
};

class MemoryStorage implements Pick<Storage, 'getItem' | 'setItem' | 'removeItem'> {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

function jwt(claims: Record<string, unknown>) {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'RS256', typ: 'JWT' })}.${encode(claims)}.mock-signature`;
}

function tokenResponse(nonce: string, expiresIn = 120) {
  return new Response(JSON.stringify({
    access_token: jwt({
      iss: config.issuer,
      aud: config.audience,
      sub: 'operator-subject',
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + expiresIn,
    }),
    id_token: jwt({
      iss: config.issuer,
      aud: config.clientId,
      sub: 'operator-subject',
      nonce,
      iat: Math.floor(now / 1000),
      exp: Math.floor(now / 1000) + expiresIn,
    }),
    refresh_token: 'memory-only-refresh-token',
    token_type: 'Bearer',
    expires_in: expiresIn,
  }), { status: 200, headers: { 'Content-Type': 'application/json' } });
}

function harness(fetchImpl: typeof fetch = vi.fn(), sessionConfig: OperatorOidcConfig = config) {
  const storage = new MemoryStorage();
  const assigned: string[] = [];
  const replaced: string[] = [];
  const timers: Array<() => void> = [];
  const session = createOperatorOidcSession({
    config: sessionConfig,
    storage,
    fetchImpl,
    now: () => now,
    randomBytes: (length) => new Uint8Array(length).fill(7),
    location: {
      href: 'https://app.example.test/operations/rbac',
      origin: 'https://app.example.test',
      pathname: '/operations/rbac',
      search: '',
      assign: (url) => assigned.push(url),
    },
    replaceLocation: (url) => replaced.push(url),
    schedule: (callback) => { timers.push(callback); return timers.length; },
    cancelSchedule: vi.fn(),
  });
  return { session, storage, assigned, replaced, timers };
}

describe('production operator OIDC configuration', () => {
  const env = {
    VITE_OPERATOR_OIDC_ENABLED: 'true',
    VITE_OPERATOR_OIDC_ISSUER: config.issuer,
    VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT: config.authorizationEndpoint,
    VITE_OPERATOR_OIDC_TOKEN_ENDPOINT: config.tokenEndpoint,
    VITE_OPERATOR_OIDC_END_SESSION_ENDPOINT: config.endSessionEndpoint,
    VITE_OPERATOR_OIDC_CLIENT_ID: config.clientId,
    VITE_OPERATOR_OIDC_AUDIENCE: config.audience,
    VITE_OPERATOR_OIDC_REDIRECT_URI: config.redirectUri,
    VITE_OPERATOR_OIDC_POST_LOGOUT_REDIRECT_URI: config.postLogoutRedirectUri,
    VITE_OPERATOR_OIDC_LOGOUT_REDIRECT_PARAMETER: config.logoutRedirectParameter,
    VITE_OPERATOR_OIDC_SCOPES: 'openid profile',
    VITE_OPERATOR_OIDC_SIGNING_ALGORITHM: 'RS256',
  };

  it('cannot activate in development even when VITE flags are present', () => {
    expect(readProductionOperatorOidcConfig(env, 'development', 'https://app.example.test')).toBeNull();
  });

  it('fails closed on a partial production registration', () => {
    expect(() => readProductionOperatorOidcConfig({
      VITE_OPERATOR_OIDC_ENABLED: 'true',
      VITE_OPERATOR_OIDC_ISSUER: config.issuer,
    }, 'production', 'https://app.example.test')).toThrow('VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT');
  });

  it('accepts an exact same-origin production registration', () => {
    expect(readProductionOperatorOidcConfig(env, 'production', 'https://app.example.test'))
      .toEqual(config);
  });
});

describe('operator authorization code and PKCE session', () => {
  it('persists only the short-lived redirect transaction and sends S256 parameters', async () => {
    const { session, storage, assigned } = harness();

    await session.login('/operations/rbac');

    expect([...storage.values.keys()]).toEqual([OPERATOR_OIDC_TRANSACTION_KEY]);
    expect(storage.getItem(OPERATOR_OIDC_TRANSACTION_KEY)).not.toContain('token');
    const authorization = new URL(assigned[0]);
    expect(authorization.origin + authorization.pathname).toBe(config.authorizationEndpoint);
    expect(authorization.searchParams.get('response_type')).toBe('code');
    expect(authorization.searchParams.get('code_challenge_method')).toBe('S256');
    expect(authorization.searchParams.get('code_challenge')).toBeTruthy();
    expect(authorization.searchParams.get('state')).toBeTruthy();
    expect(authorization.searchParams.get('nonce')).toBeTruthy();
  });

  it('exchanges a matching callback, validates nonce and claims, and keeps tokens in memory', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { session, storage, assigned, replaced } = harness(fetchImpl);
    await session.login('/operations/rbac');
    const authorization = new URL(assigned[0]);
    fetchImpl.mockResolvedValue(tokenResponse(authorization.searchParams.get('nonce')!));

    await session.completeCallback(new URL(
      `${config.redirectUri}?code=operator-code&state=${authorization.searchParams.get('state')}`,
    ));

    expect(session.snapshot().kind).toBe('authenticated');
    expect(session.getAccessToken()).toMatch(/^ey/);
    expect(storage.values.size).toBe(0);
    expect(replaced).toEqual(['/operations/rbac']);
    expect(fetchImpl).toHaveBeenCalledWith(config.tokenEndpoint, expect.objectContaining({
      method: 'POST', credentials: 'omit',
      body: expect.stringContaining('code_verifier='),
    }));
  });

  it('clears the transaction and never calls the token endpoint on state mismatch', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { session, storage } = harness(fetchImpl);
    await session.login('/operations/rbac');

    await session.completeCallback(new URL(`${config.redirectUri}?code=operator-code&state=wrong`));

    expect(session.snapshot()).toEqual({ kind: 'error', code: 'OPERATOR_OIDC_STATE_INVALID' });
    expect(session.getAccessToken()).toBeNull();
    expect(storage.values.size).toBe(0);
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each([
    ['wrong issuer', { iss: 'https://attacker.test', aud: config.audience, exp: Math.floor(now / 1000) + 120 }],
    ['wrong audience', { iss: config.issuer, aud: 'customer-api', exp: Math.floor(now / 1000) + 120 }],
    ['expired token', { iss: config.issuer, aud: config.audience, exp: Math.floor(now / 1000) - 1 }],
  ])('fails closed for a %s access token', async (_label, accessClaims) => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { session, assigned } = harness(fetchImpl);
    await session.login('/operations/rbac');
    const authorization = new URL(assigned[0]);
    fetchImpl.mockResolvedValue(new Response(JSON.stringify({
      access_token: jwt(accessClaims),
      id_token: jwt({
        iss: config.issuer, aud: config.clientId, nonce: authorization.searchParams.get('nonce'),
        exp: Math.floor(now / 1000) + 120,
      }),
      token_type: 'Bearer', expires_in: 120,
    }), { status: 200 }));

    await session.completeCallback(new URL(
      `${config.redirectUri}?code=operator-code&state=${authorization.searchParams.get('state')}`,
    ));

    expect(session.snapshot().kind).toBe('error');
    expect(session.getAccessToken()).toBeNull();
  });

  it('drops the bearer immediately when refresh fails', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { session, assigned, timers } = harness(fetchImpl);
    await session.login('/operations/rbac');
    const authorization = new URL(assigned[0]);
    fetchImpl.mockResolvedValueOnce(tokenResponse(authorization.searchParams.get('nonce')!));
    await session.completeCallback(new URL(
      `${config.redirectUri}?code=operator-code&state=${authorization.searchParams.get('state')}`,
    ));
    fetchImpl.mockRejectedValueOnce(new Error('IdP unavailable'));

    await timers[0]();

    expect(session.snapshot()).toEqual({ kind: 'error', code: 'OPERATOR_OIDC_REFRESH_FAILED' });
    expect(session.getAccessToken()).toBeNull();
  });

  it('logs out locally before redirecting and never places a token in the URL', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const { session, assigned } = harness(fetchImpl);
    await session.login('/operations/rbac');
    const authorization = new URL(assigned[0]);
    fetchImpl.mockResolvedValue(tokenResponse(authorization.searchParams.get('nonce')!));
    await session.completeCallback(new URL(
      `${config.redirectUri}?code=operator-code&state=${authorization.searchParams.get('state')}`,
    ));

    session.logout();

    expect(session.getAccessToken()).toBeNull();
    const logout = new URL(assigned.at(-1)!);
    expect(logout.origin + logout.pathname).toBe(config.endSessionEndpoint);
    expect(logout.searchParams.get('post_logout_redirect_uri')).toBe(config.postLogoutRedirectUri);
    expect(logout.href).not.toContain('token');
  });

  it('uses the configured Cognito logout_uri parameter without weakening local logout', () => {
    const cognitoConfig = { ...config, logoutRedirectParameter: 'logout_uri' as const };
    const { session, assigned } = harness(vi.fn(), cognitoConfig);

    session.logout();

    expect(session.getAccessToken()).toBeNull();
    const logout = new URL(assigned.at(-1)!);
    expect(logout.searchParams.get('logout_uri')).toBe(cognitoConfig.postLogoutRedirectUri);
    expect(logout.searchParams.has('post_logout_redirect_uri')).toBe(false);
  });
});
