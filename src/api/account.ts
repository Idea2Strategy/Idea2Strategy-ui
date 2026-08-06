import {
  getSessionAccessToken,
  getSessionRefreshToken,
  setSessionAccessToken,
  setSessionTokens,
} from './sessionAccessToken';
import { browserSessionStore } from '../lib/session';
import type { SessionStore } from '../lib/session';

export type ThemePreference = 'LIGHT' | 'DARK' | 'SYSTEM';
export type AccountLifecycleStatus = 'ACTIVE' | 'DORMANT' | 'CLOSING' | 'CLOSED';

export interface AccountPreferences {
  languageCode: string;
  timezoneName: string;
  themePreference: ThemePreference;
  updatedAt: string;
}

export interface SessionView {
  sessionId: string;
  deviceLabel: string | null;
  issuedAt: string;
  lastSeenAt: string | null;
  expiresAt: string;
  current: boolean;
}

export interface LoginResult {
  accountId: string;
  sessionId: string;
  tokenType: 'Bearer';
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: string;
  refreshExpiresAt: string;
}

export type RotatedTokenPair = Omit<LoginResult, 'accountId'>;

export interface LifecycleResult {
  accountId: string;
  status: AccountLifecycleStatus;
  version: number;
  withdrawalRequestedAt: string | null;
  cancellationDeadlineAt: string | null;
  applied: boolean;
}

export class AccountApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    public readonly correlationId: string | null,
  ) {
    super(code);
    this.name = 'AccountApiError';
  }
}

interface AccountClientOptions {
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  getAccessToken?: () => string | null;
  getRefreshToken?: () => string | null;
  setAccessToken?: (token: string | null) => void;
  setTokenPair?: (accessToken: string | null, refreshToken: string | null) => void;
  createCorrelationId?: () => string;
  /*
    The backtest screens read their credential from the tab session store, not
    the in-memory token the other clients share. Wiring the store here keeps
    the two in step: login/rotate publish the session, logout drops it.
  */
  sessionStore?: SessionStore;
}

export interface AccountClient {
  signup(email: string, password: string, signal?: AbortSignal): Promise<{ accountId: string; verificationExpiresAt: string }>;
  verifyEmail(verificationToken: string, signal?: AbortSignal): Promise<void>;
  resendVerification(accountId: string, signal?: AbortSignal): Promise<{ verificationRequired: boolean; verificationExpiresAt: string }>;
  login(email: string, password: string, deviceLabel?: string, signal?: AbortSignal): Promise<LoginResult>;
  /*
    Optional because the backend endpoint (POST /api/v1/auth/oauth/google) is
    a proposed contract, not yet in the published API spec. The auth screens
    only offer Google sign-in when a client id is configured AND the client
    implements this — never a dead button.
  */
  loginWithGoogle?(idToken: string, expectedNonce: string, deviceLabel?: string, signal?: AbortSignal): Promise<LoginResult>;
  requestPasswordReset(email: string, signal?: AbortSignal): Promise<boolean>;
  resetPassword(resetToken: string, newPassword: string, signal?: AbortSignal): Promise<void>;
  sessions(signal?: AbortSignal): Promise<SessionView[]>;
  rotateSession(signal?: AbortSignal): Promise<RotatedTokenPair>;
  logoutCurrent(signal?: AbortSignal): Promise<void>;
  logoutSession(sessionId: string, signal?: AbortSignal): Promise<void>;
  logoutAll(signal?: AbortSignal): Promise<void>;
  preferences(signal?: AbortSignal): Promise<AccountPreferences>;
  updatePreferences(input: Pick<AccountPreferences, 'languageCode' | 'timezoneName' | 'themePreference'>, signal?: AbortSignal): Promise<AccountPreferences>;
  requestWithdrawal(email: string, password: string, idempotencyKey: string, signal?: AbortSignal): Promise<LifecycleResult>;
  cancelWithdrawal(email: string, password: string, idempotencyKey: string, signal?: AbortSignal): Promise<LifecycleResult>;
  reactivateWithPassword(email: string, password: string, acceptedPolicyDocumentIds: string[], idempotencyKey: string, signal?: AbortSignal): Promise<LifecycleResult>;
}

export function createAccountClient({
  baseUrl = '',
  fetchImpl = fetch,
  getAccessToken,
  getRefreshToken,
  setAccessToken,
  setTokenPair,
  createCorrelationId = () => crypto.randomUUID(),
  sessionStore,
}: AccountClientOptions = {}): AccountClient {
  const root = baseUrl.replace(/\/$/, '');
  const requireSession = () => {
    if (!getRefreshToken?.() && !getAccessToken?.()) throw new AccountApiError(401, 'AUTHENTICATION_REQUIRED', createCorrelationId());
  };
  const publishTokens = (result: LoginResult) => {
    setTokenPair?.(result.accessToken, result.refreshToken);
    if (!setTokenPair) setAccessToken?.(result.accessToken);
    sessionStore?.signIn({
      accessToken: result.accessToken,
      refreshToken: result.refreshToken,
      accountId: result.accountId,
      expiresAt: result.accessExpiresAt,
      refreshExpiresAt: result.refreshExpiresAt,
    });
  };
  const request = async (path: string, init: RequestInit = {}) => {
    const correlationId = createCorrelationId();
    const token = getAccessToken?.();
    const response = await fetchImpl(`${root}${path}`, {
      credentials: 'include',
      ...init,
      headers: {
        Accept: 'application/json',
        'X-Correlation-Id': correlationId,
        ...(init.body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...init.headers,
      },
    });
    if (!response.ok) throw await readError(response, correlationId);
    return response;
  };
  const lifecycle = async (
    path: string,
    email: string,
    password: string,
    acceptedPolicyDocumentIds: string[],
    idempotencyKey: string,
    signal?: AbortSignal,
  ) => readLifecycle(await (await request(path, {
    method: 'POST', signal,
    headers: { 'Idempotency-Key': idempotencyKey },
    body: JSON.stringify({ email, password, acceptedPolicyDocumentIds }),
  })).json());

  return {
    async signup(email, password, signal) {
      const value = object(await (await request('/api/v1/auth/signup', {
        method: 'POST', signal, body: JSON.stringify({ email, password }),
      })).json());
      return {
        accountId: string(value.accountId, 'accountId'),
        verificationExpiresAt: string(value.verificationExpiresAt, 'verificationExpiresAt'),
      };
    },
    async verifyEmail(verificationToken, signal) {
      await request('/api/v1/auth/verify-email', {
        method: 'POST', signal, body: JSON.stringify({ verificationToken }),
      });
    },
    async resendVerification(accountId, signal) {
      const value = object(await (await request('/api/v1/auth/resend-verification', {
        method: 'POST', signal, body: JSON.stringify({ accountId }),
      })).json());
      if (typeof value.verificationRequired !== 'boolean') throw new Error('Invalid verificationRequired');
      return {
        verificationRequired: value.verificationRequired,
        verificationExpiresAt: string(value.verificationExpiresAt, 'verificationExpiresAt'),
      };
    },
    async login(email, password, deviceLabel, signal) {
      const value = object(await (await request('/api/v1/auth/login', {
        method: 'POST', signal, body: JSON.stringify({ email, password, deviceLabel: deviceLabel ?? null }),
      })).json());
      const result = readLoginResult(value);
      publishTokens(result);
      return result;
    },
    async loginWithGoogle(idToken, expectedNonce, deviceLabel, signal) {
      const value = object(await (await request('/api/v1/auth/oidc/login', {
        method: 'POST', signal, body: JSON.stringify({
          providerCode: 'GOOGLE', idToken, expectedNonce, deviceLabel: deviceLabel ?? null,
        }),
      })).json());
      const result = readLoginResult(value);
      publishTokens(result);
      return result;
    },
    async requestPasswordReset(email, signal) {
      const value = object(await (await request('/api/v1/auth/password-reset-requests', {
        method: 'POST', signal, body: JSON.stringify({ email }),
      })).json());
      if (typeof value.accepted !== 'boolean') throw new Error('Invalid reset acceptance');
      return value.accepted;
    },
    async resetPassword(resetToken, newPassword, signal) {
      await request('/api/v1/auth/password-resets', {
        method: 'POST', signal, body: JSON.stringify({ resetToken, newPassword }),
      });
    },
    async sessions(signal) {
      requireSession();
      const value = await (await request('/api/v1/auth/sessions', {
        signal, headers: { Authorization: `Bearer ${getRefreshToken?.() ?? getAccessToken?.()}` },
      })).json();
      if (!Array.isArray(value)) throw new Error('Invalid sessions response');
      return value.map(readSession);
    },
    async rotateSession(signal) {
      requireSession();
      const value = object(await (await request('/api/v1/auth/sessions/rotate', {
        method: 'POST', signal, headers: { Authorization: `Bearer ${getRefreshToken?.() ?? getAccessToken?.()}` },
      })).json());
      const rotated = readRotatedTokenPair(value);
      setTokenPair?.(rotated.accessToken, rotated.refreshToken);
      if (!setTokenPair) setAccessToken?.(rotated.accessToken);
      if (sessionStore) {
        const current = sessionStore.read();
        if (current.status === 'authenticated') {
          sessionStore.signIn({
            accessToken: rotated.accessToken,
            refreshToken: rotated.refreshToken,
            accountId: current.session.accountId,
            expiresAt: rotated.accessExpiresAt,
            refreshExpiresAt: rotated.refreshExpiresAt,
          });
        }
      }
      return rotated;
    },
    async logoutCurrent(signal) {
      requireSession();
      await request('/api/v1/auth/sessions/current', { method: 'DELETE', signal,
        headers: { Authorization: `Bearer ${getRefreshToken?.() ?? getAccessToken?.()}` } });
      setTokenPair?.(null, null);
      if (!setTokenPair) setAccessToken?.(null);
      sessionStore?.signOut();
    },
    async logoutSession(sessionId, signal) {
      requireSession();
      await request(`/api/v1/auth/sessions/${encodeURIComponent(sessionId)}`, { method: 'DELETE', signal,
        headers: { Authorization: `Bearer ${getRefreshToken?.() ?? getAccessToken?.()}` } });
    },
    async logoutAll(signal) {
      requireSession();
      await request('/api/v1/auth/sessions', { method: 'DELETE', signal,
        headers: { Authorization: `Bearer ${getRefreshToken?.() ?? getAccessToken?.()}` } });
      setTokenPair?.(null, null);
      if (!setTokenPair) setAccessToken?.(null);
      sessionStore?.signOut();
    },
    async preferences(signal) {
      requireSession();
      return readPreferences(await (await request('/api/v1/account/preferences', { signal })).json());
    },
    async updatePreferences(input, signal) {
      requireSession();
      return readPreferences(await (await request('/api/v1/account/preferences', {
        method: 'PATCH', signal, body: JSON.stringify(input),
      })).json());
    },
    requestWithdrawal(email, password, idempotencyKey, signal) {
      return lifecycle('/api/v1/account/withdrawal-requests', email, password, [], idempotencyKey, signal);
    },
    cancelWithdrawal(email, password, idempotencyKey, signal) {
      return lifecycle('/api/v1/account/withdrawal-cancellations', email, password, [], idempotencyKey, signal);
    },
    reactivateWithPassword(email, password, acceptedPolicyDocumentIds, idempotencyKey, signal) {
      return lifecycle('/api/v1/account/reactivations/password', email, password, acceptedPolicyDocumentIds, idempotencyKey, signal);
    },
  };
}

async function readError(response: Response, fallbackCorrelationId: string): Promise<AccountApiError> {
  let body: Record<string, unknown> = {};
  try { body = object(await response.json()); } catch { /* non-JSON failure */ }
  const code = typeof body.code === 'string'
    ? body.code
    : response.status === 401 ? 'AUTHENTICATION_REQUIRED'
      : response.status === 403 ? 'FORBIDDEN' : 'REQUEST_FAILED';
  const correlationId = typeof body.correlationId === 'string'
    ? body.correlationId
    : response.headers.get('X-Correlation-Id') ?? fallbackCorrelationId;
  return new AccountApiError(response.status, code, correlationId);
}

function readLoginResult(value: Record<string, unknown>): LoginResult {
  const pair = readRotatedTokenPair(value);
  return { accountId: string(value.accountId, 'accountId'), ...pair };
}

function readRotatedTokenPair(value: Record<string, unknown>): RotatedTokenPair {
  const tokenType = string(value.tokenType, 'tokenType');
  if (tokenType !== 'Bearer') throw new Error('Invalid tokenType');
  return {
    sessionId: string(value.sessionId, 'sessionId'),
    tokenType,
    accessToken: string(value.accessToken, 'accessToken'),
    refreshToken: string(value.refreshToken, 'refreshToken'),
    accessExpiresAt: string(value.accessExpiresAt, 'accessExpiresAt'),
    refreshExpiresAt: string(value.refreshExpiresAt, 'refreshExpiresAt'),
  };
}

function readPreferences(value: unknown): AccountPreferences {
  const result = object(value);
  const theme = string(result.themePreference, 'themePreference');
  if (!['LIGHT', 'DARK', 'SYSTEM'].includes(theme)) throw new Error('Invalid themePreference');
  return {
    languageCode: string(result.languageCode, 'languageCode'),
    timezoneName: string(result.timezoneName, 'timezoneName'),
    themePreference: theme as ThemePreference,
    updatedAt: string(result.updatedAt, 'updatedAt'),
  };
}

function readSession(value: unknown): SessionView {
  const result = object(value);
  return {
    sessionId: string(result.sessionId, 'sessionId'),
    deviceLabel: nullableString(result.deviceLabel),
    issuedAt: string(result.issuedAt, 'issuedAt'),
    lastSeenAt: nullableString(result.lastSeenAt),
    expiresAt: string(result.expiresAt, 'expiresAt'),
    current: Boolean(result.current),
  };
}

function readLifecycle(value: unknown): LifecycleResult {
  const result = object(value);
  const status = string(result.status, 'status');
  if (!['ACTIVE', 'DORMANT', 'CLOSING', 'CLOSED'].includes(status)) throw new Error('Invalid lifecycle status');
  if (!Number.isSafeInteger(result.version) || (result.version as number) <= 0) throw new Error('Invalid lifecycle version');
  if (typeof result.applied !== 'boolean') throw new Error('Invalid lifecycle applied');
  return {
    accountId: string(result.accountId, 'accountId'),
    status: status as AccountLifecycleStatus,
    version: result.version as number,
    withdrawalRequestedAt: nullableString(result.withdrawalRequestedAt),
    cancellationDeadlineAt: nullableString(result.cancellationDeadlineAt),
    applied: result.applied,
  };
}

function object(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) throw new Error('Invalid API response');
  return value as Record<string, unknown>;
}

function string(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value) throw new Error(`Invalid ${label}`);
  return value;
}

function nullableString(value: unknown): string | null {
  return value === null || value === undefined ? null : string(value, 'string');
}

export const defaultAccountClient = createAccountClient({
  baseUrl: import.meta.env.VITE_API_BASE_URL ?? '',
  getAccessToken: () => getSessionAccessToken() ?? browserSessionStore.accessToken(),
  getRefreshToken: () => getSessionRefreshToken() ?? browserSessionStore.refreshToken?.() ?? null,
  setAccessToken: setSessionAccessToken,
  setTokenPair: setSessionTokens,
  sessionStore: browserSessionStore,
});

let refreshTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleDefaultRefresh() {
  if (refreshTimer !== null) clearTimeout(refreshTimer);
  refreshTimer = null;
  const state = browserSessionStore.read();
  if (state.status !== 'authenticated' || !state.session.refreshToken || !state.session.expiresAt) return;
  setSessionTokens(state.session.accessToken, state.session.refreshToken);
  const delay = Math.max(0, Math.min(Date.parse(state.session.expiresAt) - Date.now() - 60_000, 2_147_000_000));
  refreshTimer = setTimeout(() => {
    void defaultAccountClient.rotateSession().catch((cause: unknown) => {
      if (cause instanceof AccountApiError && cause.status === 401) {
        setSessionTokens(null, null);
        browserSessionStore.signOut('rejected');
        return;
      }
      refreshTimer = setTimeout(scheduleDefaultRefresh, 30_000);
    });
  }, delay);
}

if (typeof window !== 'undefined') {
  browserSessionStore.subscribe(scheduleDefaultRefresh);
  scheduleDefaultRefresh();
}
