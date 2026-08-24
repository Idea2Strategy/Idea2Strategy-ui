export type OperatorSessionSnapshot =
  | { kind: 'loading' }
  | { kind: 'unauthenticated' }
  | { kind: 'authenticated'; operatorId: string; mfaVerifiedAt: string; absoluteExpiresAt: string }
  | { kind: 'error'; code: string };

export interface OperatorCredentials { loginName: string; password: string; totpCode: string }
export interface OperatorReauthentication { password: string; totpCode: string }

export interface OperatorSession {
  snapshot(): OperatorSessionSnapshot;
  subscribe(listener: (snapshot: OperatorSessionSnapshot) => void): () => void;
  start(): Promise<void>;
  login(credentials: OperatorCredentials): Promise<void>;
  reauthenticate(credentials: OperatorReauthentication): Promise<void>;
  logout(): Promise<void>;
  getCsrfToken(): string | null;
}

export function createOperatorSession({ baseUrl = '', fetchImpl = fetch }: {
  baseUrl?: string; fetchImpl?: typeof fetch;
} = {}): OperatorSession {
  const root = baseUrl.replace(/\/$/, '');
  let state: OperatorSessionSnapshot = { kind: 'loading' };
  let csrf: string | null = null;
  const listeners = new Set<(snapshot: OperatorSessionSnapshot) => void>();
  const publish = (next: OperatorSessionSnapshot) => { state = next; listeners.forEach((listener) => listener(next)); };
  const apply = async (response: Response) => {
    if (!response.ok) {
      csrf = null;
      let code = response.status === 429 ? 'OPERATOR_AUTHENTICATION_RATE_LIMITED'
        : response.status >= 500 ? 'OPERATOR_AUTHENTICATION_UNAVAILABLE'
          : 'OPERATOR_AUTHENTICATION_REJECTED';
      try { const body = await response.json() as { code?: unknown }; if (typeof body.code === 'string') code = body.code; } catch { /* stable fallback */ }
      publish(response.status === 401 ? { kind: 'unauthenticated' } : { kind: 'error', code });
      throw new Error(code);
    }
    const body = await response.json() as Record<string, unknown>;
    if (typeof body.csrfToken !== 'string' || typeof body.operatorId !== 'string'
        || typeof body.mfaVerifiedAt !== 'string' || typeof body.absoluteExpiresAt !== 'string') {
      csrf = null; publish({ kind: 'error', code: 'OPERATOR_AUTHENTICATION_INVALID_RESPONSE' });
      throw new Error('OPERATOR_AUTHENTICATION_INVALID_RESPONSE');
    }
    csrf = body.csrfToken;
    publish({ kind: 'authenticated', operatorId: body.operatorId,
      mfaVerifiedAt: body.mfaVerifiedAt, absoluteExpiresAt: body.absoluteExpiresAt });
  };
  const request = (path: string, init: RequestInit = {}) => fetchImpl(`${root}${path}`, {
    ...init, credentials: 'include', cache: 'no-store',
    headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...(csrf ? { 'X-Operator-CSRF': csrf } : {}), ...init.headers },
  });
  return {
    snapshot: () => state,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
    async start() {
      publish({ kind: 'loading' });
      try { await apply(await request('/api/v1/operator-auth/session')); }
      catch { if (state.kind === 'loading') publish({ kind: 'unauthenticated' }); }
    },
    async login(credentials) {
      publish({ kind: 'loading' });
      await apply(await request('/api/v1/operator-auth/sessions', { method: 'POST', body: JSON.stringify(credentials) }));
    },
    async reauthenticate(credentials) {
      await apply(await request('/api/v1/operator-auth/reauthenticate', { method: 'POST', body: JSON.stringify(credentials) }));
    },
    async logout() {
      try { await request('/api/v1/operator-auth/logout', { method: 'POST' }); }
      finally { csrf = null; publish({ kind: 'unauthenticated' }); }
    },
    getCsrfToken: () => csrf,
  };
}
