export const OPERATOR_OIDC_TRANSACTION_KEY = 'idea2strategy.operator.oidc.transaction.v1';

export interface OperatorOidcConfig {
  issuer: string;
  authorizationEndpoint: string;
  tokenEndpoint: string;
  endSessionEndpoint?: string;
  clientId: string;
  audience: string;
  redirectUri: string;
  postLogoutRedirectUri: string;
  logoutRedirectParameter: 'post_logout_redirect_uri' | 'logout_uri';
  scopes: string[];
  signingAlgorithm: string;
}

export type OperatorOidcSnapshot =
  | { kind: 'unauthenticated' }
  | { kind: 'loading' }
  | { kind: 'authenticated'; expiresAt: number }
  | { kind: 'error'; code: string };

interface RedirectTransaction {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  expiresAt: number;
}

interface LocationPort {
  href: string;
  origin: string;
  pathname: string;
  search: string;
  assign(url: string): void;
}

interface SessionOptions {
  config: OperatorOidcConfig;
  storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
  fetchImpl?: typeof fetch;
  location: LocationPort;
  replaceLocation: (url: string) => void;
  now?: () => number;
  randomBytes?: (length: number) => Uint8Array;
  schedule?: (callback: () => void | Promise<void>, delayMs: number) => unknown;
  cancelSchedule?: (handle: unknown) => void;
}

export interface OperatorOidcSession {
  snapshot(): OperatorOidcSnapshot;
  subscribe(listener: (snapshot: OperatorOidcSnapshot) => void): () => void;
  start(): Promise<void>;
  login(returnTo?: string): Promise<void>;
  completeCallback(url: URL): Promise<void>;
  getAccessToken(): string | null;
  logout(): void;
}

const REQUIRED_ENV = [
  'VITE_OPERATOR_OIDC_ISSUER',
  'VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT',
  'VITE_OPERATOR_OIDC_TOKEN_ENDPOINT',
  'VITE_OPERATOR_OIDC_CLIENT_ID',
  'VITE_OPERATOR_OIDC_AUDIENCE',
  'VITE_OPERATOR_OIDC_REDIRECT_URI',
  'VITE_OPERATOR_OIDC_POST_LOGOUT_REDIRECT_URI',
  'VITE_OPERATOR_OIDC_SCOPES',
  'VITE_OPERATOR_OIDC_SIGNING_ALGORITHM',
] as const;

/** Reads deployment inputs only for production. Development keeps using no production identity path. */
export function readProductionOperatorOidcConfig(
  env: Record<string, string | undefined>,
  mode: string,
  applicationOrigin: string,
): OperatorOidcConfig | null {
  if (mode !== 'production' || env.VITE_OPERATOR_OIDC_ENABLED !== 'true') return null;
  for (const name of REQUIRED_ENV) {
    if (!env[name]?.trim()) throw new Error(`${name} is required when operator OIDC is enabled`);
  }
  const scopes = env.VITE_OPERATOR_OIDC_SCOPES!.trim().split(/\s+/).filter(Boolean);
  if (!scopes.includes('openid')) throw new Error('VITE_OPERATOR_OIDC_SCOPES must include openid');
  const redirectUri = secureUrl(env.VITE_OPERATOR_OIDC_REDIRECT_URI!, 'VITE_OPERATOR_OIDC_REDIRECT_URI');
  const postLogoutRedirectUri = secureUrl(
    env.VITE_OPERATOR_OIDC_POST_LOGOUT_REDIRECT_URI!,
    'VITE_OPERATOR_OIDC_POST_LOGOUT_REDIRECT_URI',
  );
  if (redirectUri.origin !== applicationOrigin || postLogoutRedirectUri.origin !== applicationOrigin) {
    throw new Error('operator OIDC redirect URIs must use the application origin');
  }
  const issuer = secureUrl(env.VITE_OPERATOR_OIDC_ISSUER!, 'VITE_OPERATOR_OIDC_ISSUER').href.replace(/\/$/, '');
  const authorizationEndpoint = secureUrl(
    env.VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT!,
    'VITE_OPERATOR_OIDC_AUTHORIZATION_ENDPOINT',
  ).href;
  const tokenEndpoint = secureUrl(env.VITE_OPERATOR_OIDC_TOKEN_ENDPOINT!, 'VITE_OPERATOR_OIDC_TOKEN_ENDPOINT').href;
  const endSessionEndpoint = env.VITE_OPERATOR_OIDC_END_SESSION_ENDPOINT?.trim()
    ? secureUrl(env.VITE_OPERATOR_OIDC_END_SESSION_ENDPOINT, 'VITE_OPERATOR_OIDC_END_SESSION_ENDPOINT').href
    : undefined;
  const logoutRedirectParameter = env.VITE_OPERATOR_OIDC_LOGOUT_REDIRECT_PARAMETER?.trim()
    || 'post_logout_redirect_uri';
  if (logoutRedirectParameter !== 'post_logout_redirect_uri' && logoutRedirectParameter !== 'logout_uri') {
    throw new Error('VITE_OPERATOR_OIDC_LOGOUT_REDIRECT_PARAMETER is invalid');
  }
  return {
    issuer,
    authorizationEndpoint,
    tokenEndpoint,
    ...(endSessionEndpoint ? { endSessionEndpoint } : {}),
    clientId: env.VITE_OPERATOR_OIDC_CLIENT_ID!.trim(),
    audience: env.VITE_OPERATOR_OIDC_AUDIENCE!.trim(),
    redirectUri: redirectUri.href,
    postLogoutRedirectUri: postLogoutRedirectUri.href,
    logoutRedirectParameter,
    scopes,
    signingAlgorithm: env.VITE_OPERATOR_OIDC_SIGNING_ALGORITHM!.trim(),
  };
}

export function createOperatorOidcSession({
  config,
  storage,
  fetchImpl = fetch,
  location,
  replaceLocation,
  now = Date.now,
  randomBytes = secureRandomBytes,
  schedule = (callback, delayMs) => window.setTimeout(callback, delayMs),
  cancelSchedule = (handle) => window.clearTimeout(handle as number),
}: SessionOptions): OperatorOidcSession {
  let current: OperatorOidcSnapshot = { kind: 'unauthenticated' };
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let expiresAt = 0;
  let refreshHandle: unknown = null;
  const listeners = new Set<(snapshot: OperatorOidcSnapshot) => void>();

  const emit = (snapshot: OperatorOidcSnapshot) => {
    current = snapshot;
    listeners.forEach((listener) => listener(snapshot));
  };
  const clearMemory = () => {
    accessToken = null;
    refreshToken = null;
    expiresAt = 0;
    if (refreshHandle !== null) cancelSchedule(refreshHandle);
    refreshHandle = null;
  };
  const fail = (code: string) => {
    clearMemory();
    storage.removeItem(OPERATOR_OIDC_TRANSACTION_KEY);
    emit({ kind: 'error', code });
  };
  const scheduleRefresh = () => {
    if (refreshHandle !== null) cancelSchedule(refreshHandle);
    const delay = Math.max(0, expiresAt - now() - 30_000);
    refreshHandle = schedule(async () => {
      if (!refreshToken) {
        fail('OPERATOR_OIDC_SESSION_EXPIRED');
        return;
      }
      try {
        const response = await requestTokens(new URLSearchParams({
          grant_type: 'refresh_token',
          client_id: config.clientId,
          refresh_token: refreshToken,
        }));
        acceptTokens(response, null, refreshToken);
      } catch {
        fail('OPERATOR_OIDC_REFRESH_FAILED');
      }
    }, delay);
  };
  const requestTokens = async (body: URLSearchParams) => {
    const response = await fetchImpl(config.tokenEndpoint, {
      method: 'POST',
      credentials: 'omit',
      headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
      body: body.toString(),
    });
    if (!response.ok) throw new OidcFailure('OPERATOR_OIDC_TOKEN_EXCHANGE_FAILED');
    try { return record(await response.json()); }
    catch { throw new OidcFailure('OPERATOR_OIDC_TOKEN_RESPONSE_INVALID'); }
  };
  const acceptTokens = (response: Record<string, unknown>, nonce: string | null, priorRefresh: string | null = null) => {
    const token = requiredText(response.access_token, 'access_token');
    if (requiredText(response.token_type, 'token_type').toLowerCase() !== 'bearer') {
      throw new OidcFailure('OPERATOR_OIDC_TOKEN_TYPE_INVALID');
    }
    const lifetime = positiveNumber(response.expires_in, 'expires_in');
    const accessClaims = validateJwt(token, config.signingAlgorithm);
    validateClaims(accessClaims, config.issuer, config.audience, now());
    if (nonce !== null) {
      const idToken = requiredText(response.id_token, 'id_token');
      const idClaims = validateJwt(idToken, config.signingAlgorithm);
      validateClaims(idClaims, config.issuer, config.clientId, now());
      if (idClaims.nonce !== nonce) throw new OidcFailure('OPERATOR_OIDC_NONCE_INVALID');
    } else if (typeof response.id_token === 'string') {
      validateClaims(validateJwt(response.id_token, config.signingAlgorithm), config.issuer, config.clientId, now());
    }
    const claimExpiry = positiveNumber(accessClaims.exp, 'access token exp') * 1000;
    accessToken = token;
    refreshToken = optionalText(response.refresh_token) ?? priorRefresh;
    expiresAt = Math.min(claimExpiry, now() + lifetime * 1000);
    if (expiresAt <= now()) throw new OidcFailure('OPERATOR_OIDC_TOKEN_EXPIRED');
    emit({ kind: 'authenticated', expiresAt });
    scheduleRefresh();
  };

  return {
    snapshot: () => current,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async start() {
      const callback = new URL(location.href);
      if (callback.pathname === new URL(config.redirectUri).pathname
          && (callback.searchParams.has('code') || callback.searchParams.has('error'))) {
        await this.completeCallback(callback);
      }
    },
    async login(returnTo = '/operations/rbac') {
      clearMemory();
      const safeReturnTo = safePath(returnTo);
      const state = base64Url(randomBytes(32));
      const nonce = base64Url(randomBytes(32));
      const verifier = base64Url(randomBytes(48));
      const challenge = base64Url(new Uint8Array(await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(verifier),
      )));
      const transaction: RedirectTransaction = {
        state, nonce, verifier, returnTo: safeReturnTo, expiresAt: now() + 5 * 60_000,
      };
      storage.setItem(OPERATOR_OIDC_TRANSACTION_KEY, JSON.stringify(transaction));
      const authorization = new URL(config.authorizationEndpoint);
      authorization.search = new URLSearchParams({
        response_type: 'code',
        client_id: config.clientId,
        redirect_uri: config.redirectUri,
        scope: config.scopes.join(' '),
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }).toString();
      location.assign(authorization.href);
    },
    async completeCallback(url) {
      emit({ kind: 'loading' });
      const transaction = readTransaction(storage.getItem(OPERATOR_OIDC_TRANSACTION_KEY));
      storage.removeItem(OPERATOR_OIDC_TRANSACTION_KEY);
      try {
        if (url.searchParams.has('error')) throw new OidcFailure('OPERATOR_OIDC_AUTHORIZATION_DENIED');
        if (!transaction || transaction.expiresAt <= now()) {
          throw new OidcFailure('OPERATOR_OIDC_TRANSACTION_EXPIRED');
        }
        if (url.searchParams.get('state') !== transaction.state) {
          throw new OidcFailure('OPERATOR_OIDC_STATE_INVALID');
        }
        const code = url.searchParams.get('code');
        if (!code) throw new OidcFailure('OPERATOR_OIDC_CODE_MISSING');
        const response = await requestTokens(new URLSearchParams({
          grant_type: 'authorization_code',
          client_id: config.clientId,
          redirect_uri: config.redirectUri,
          code,
          code_verifier: transaction.verifier,
        }));
        acceptTokens(response, transaction.nonce);
        replaceLocation(transaction.returnTo);
      } catch (cause) {
        fail(cause instanceof OidcFailure ? cause.code : 'OPERATOR_OIDC_TOKEN_EXCHANGE_FAILED');
      }
    },
    getAccessToken() {
      if (!accessToken || expiresAt <= now()) {
        if (accessToken) fail('OPERATOR_OIDC_SESSION_EXPIRED');
        return null;
      }
      return accessToken;
    },
    logout() {
      clearMemory();
      storage.removeItem(OPERATOR_OIDC_TRANSACTION_KEY);
      emit({ kind: 'unauthenticated' });
      if (config.endSessionEndpoint) {
        const logout = new URL(config.endSessionEndpoint);
        logout.searchParams.set('client_id', config.clientId);
        logout.searchParams.set(config.logoutRedirectParameter, config.postLogoutRedirectUri);
        location.assign(logout.href);
      } else {
        replaceLocation(new URL(config.postLogoutRedirectUri).pathname);
      }
    },
  };
}

class OidcFailure extends Error {
  constructor(readonly code: string) { super(code); }
}

function secureUrl(value: string, name: string) {
  const url = new URL(value);
  const loopback = url.hostname === '127.0.0.1' || url.hostname === 'localhost';
  if (url.protocol !== 'https:' && !(loopback && url.protocol === 'http:')) {
    throw new Error(`${name} must use HTTPS`);
  }
  return url;
}

function safePath(value: string) {
  if (!value.startsWith('/') || value.startsWith('//')) return '/operations/rbac';
  return value;
}

function secureRandomBytes(length: number) {
  return crypto.getRandomValues(new Uint8Array(length));
}

function base64Url(bytes: Uint8Array) {
  let binary = '';
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function validateJwt(token: string, expectedAlgorithm: string) {
  const parts = token.split('.');
  if (parts.length !== 3 || !parts.every(Boolean)) throw new OidcFailure('OPERATOR_OIDC_TOKEN_INVALID');
  const header = decodeJwtPart(parts[0]);
  if (header.alg !== expectedAlgorithm) throw new OidcFailure('OPERATOR_OIDC_ALGORITHM_INVALID');
  return decodeJwtPart(parts[1]);
}

function decodeJwtPart(value: string) {
  try {
    const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=');
    const binary = atob(padded);
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
    return record(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    throw new OidcFailure('OPERATOR_OIDC_TOKEN_INVALID');
  }
}

function validateClaims(claims: Record<string, unknown>, issuer: string, audience: string, nowMs: number) {
  if (claims.iss !== issuer) throw new OidcFailure('OPERATOR_OIDC_ISSUER_INVALID');
  const audiences = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!audiences.includes(audience)) throw new OidcFailure('OPERATOR_OIDC_AUDIENCE_INVALID');
  const nowSeconds = Math.floor(nowMs / 1000);
  if (positiveNumber(claims.exp, 'exp') <= nowSeconds) throw new OidcFailure('OPERATOR_OIDC_TOKEN_EXPIRED');
  if (typeof claims.nbf === 'number' && claims.nbf > nowSeconds + 30) {
    throw new OidcFailure('OPERATOR_OIDC_TOKEN_NOT_YET_VALID');
  }
  if (typeof claims.iat === 'number' && claims.iat > nowSeconds + 30) {
    throw new OidcFailure('OPERATOR_OIDC_TOKEN_FUTURE_ISSUED');
  }
}

function readTransaction(value: string | null): RedirectTransaction | null {
  if (!value) return null;
  try {
    const parsed = record(JSON.parse(value));
    return {
      state: requiredText(parsed.state, 'state'),
      nonce: requiredText(parsed.nonce, 'nonce'),
      verifier: requiredText(parsed.verifier, 'verifier'),
      returnTo: safePath(requiredText(parsed.returnTo, 'returnTo')),
      expiresAt: positiveNumber(parsed.expiresAt, 'expiresAt'),
    };
  } catch { return null; }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new OidcFailure('OPERATOR_OIDC_TOKEN_RESPONSE_INVALID');
  }
  return value as Record<string, unknown>;
}

function requiredText(value: unknown, name: string) {
  if (typeof value !== 'string' || !value.trim()) throw new OidcFailure(`OPERATOR_OIDC_${name.toUpperCase()}_INVALID`);
  return value;
}

function optionalText(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function positiveNumber(value: unknown, name: string) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new OidcFailure(`OPERATOR_OIDC_${name.toUpperCase()}_INVALID`);
  }
  return value;
}
