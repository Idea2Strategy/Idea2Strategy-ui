/*
  Where this app holds the signed-in session, and the only place a request learns
  whether it has a credential to send.

  Before this module the API clients accepted a `getAccessToken` option and nobody
  passed one, so `defaultBacktestClient` sent every request with no `Authorization`
  header. Against the real engine that is a 401 on all eight query routes
  (`backtest_engine/api.py`: "the request carried no usable credential"), and the
  screen reported it as a permission problem the person could do nothing about. The
  fix is not a token baked into the bundle; it is one owner of session state that can
  say *anonymous* out loud.

  Three rules this module exists to keep:

  * **Nothing is invented.** The credential is read from storage or it is absent. No
    default token, no dev fallback, no "any token works" branch. A build with no
    session signed in makes zero authenticated requests.
  * **Anonymous is a value, not an absence.** `SessionState` names why there is no
    credential — never stored, unreadable, past its expiry, or refused by the server —
    so a screen can say something true instead of spinning or blanking.
  * **`sessionStorage`, not `localStorage`.** The existing `i2s-*` localStorage keys
    hold display preferences (theme, palette, language, bot icons); a bearer token is
    not a display preference and should not outlive the tab it was issued to.

  Populating the session is the sign-in flow's job. This module reads it, validates
  it, publishes changes, and drops it when the server says it is no good.
*/
import { useSyncExternalStore } from 'react';

/** The `sessionStorage` key the sign-in flow writes and this store reads. */
export const SESSION_STORAGE_KEY = 'i2s.session';

export interface Session {
  /** The bearer token sent as `Authorization: Bearer <token>`. */
  readonly accessToken: string;
  /** Rotating JWT used only against session-management endpoints. */
  readonly refreshToken?: string;
  /** The account the token authenticates. Runs owned by anyone else answer 403. */
  readonly accountId: string;
  /** ISO-8601 instant, or `null` when the issuer published no expiry. */
  readonly expiresAt: string | null;
  /** Refresh JWT expiry; access expiry remains `expiresAt` for compatibility. */
  readonly refreshExpiresAt?: string | null;
}

/**
 * Why there is no usable credential.
 *
 * * `absent` — nothing was ever stored: signed out, or never signed in.
 * * `malformed` — something is stored but it is not a session this app can use.
 * * `expired` — the stored session names an expiry that has passed.
 * * `rejected` — the server answered 401 to a request carrying the stored token,
 *   so the token is dead however good it looked locally.
 */
export type AnonymousReason = 'absent' | 'malformed' | 'expired' | 'rejected';

export type SessionState =
  | { readonly status: 'authenticated'; readonly session: Session }
  | { readonly status: 'anonymous'; readonly reason: AnonymousReason };

/** The `Storage` surface this store uses; narrowed so tests can supply a map. */
export interface SessionStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface SessionStore {
  /** The current state. Stable by identity between changes, so it is a safe snapshot. */
  read(): SessionState;
  /** The bearer token to send, or `null`. This is what an API client is given. */
  accessToken(): string | null;
  refreshToken?(): string | null;
  signIn(session: Session): void;
  /**
   * Drop the stored credential. `'rejected'` records that the server refused it, which
   * is the difference between "please sign in" and "your session ended".
   */
  signOut(reason?: 'absent' | 'rejected'): void;
  subscribe(listener: () => void): () => void;
}

const ABSENT: SessionState = { status: 'anonymous', reason: 'absent' };
const MALFORMED: SessionState = { status: 'anonymous', reason: 'malformed' };
const EXPIRED: SessionState = { status: 'anonymous', reason: 'expired' };
const REJECTED: SessionState = { status: 'anonymous', reason: 'rejected' };

/**
 * Read one stored session, or say why it is not one.
 *
 * Deliberately strict: a half-written record is `malformed`, never a session with an
 * empty token that would be sent as `Authorization: Bearer ` and come back 401.
 */
function parse(raw: string, now: number): SessionState {
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return MALFORMED;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return MALFORMED;

  const { accessToken, refreshToken, accountId, expiresAt, refreshExpiresAt } = value as Record<string, unknown>;
  if (typeof accessToken !== 'string' || accessToken.trim().length === 0) return MALFORMED;
  if (typeof accountId !== 'string' || accountId.length === 0) return MALFORMED;
  if (expiresAt !== undefined && expiresAt !== null && typeof expiresAt !== 'string') {
    return MALFORMED;
  }
  if (refreshToken !== undefined && (typeof refreshToken !== 'string' || refreshToken.trim().length === 0)) return MALFORMED;
  if (refreshExpiresAt !== undefined && refreshExpiresAt !== null && typeof refreshExpiresAt !== 'string') return MALFORMED;

  const expiry = typeof expiresAt === 'string' ? Date.parse(expiresAt) : null;
  // An unparseable expiry is not "no expiry": it is a record this app cannot reason
  // about, and treating it as eternal is how a dead token keeps being sent.
  if (expiry !== null && Number.isNaN(expiry)) return MALFORMED;
  if (expiry !== null && expiry <= now) return EXPIRED;

  return {
    status: 'authenticated',
    session: {
      accessToken: accessToken.trim(),
      ...(typeof refreshToken === 'string' ? { refreshToken: refreshToken.trim() } : {}),
      accountId,
      expiresAt: typeof expiresAt === 'string' ? expiresAt : null,
      ...(typeof refreshExpiresAt === 'string' ? { refreshExpiresAt } : {}),
    },
  };
}

export interface SessionStoreOptions {
  /** Injectable clock, so an expiry test does not have to wait for one. */
  now?: () => number;
}

/**
 * A session store over the given storage. `null` storage (no DOM, or a browser that
 * refuses storage access) is permanently anonymous rather than a thrown error.
 */
export function createSessionStore(
  storage: SessionStorage | null,
  { now = () => Date.now() }: SessionStoreOptions = {},
): SessionStore {
  const listeners = new Set<() => void>();
  /*
    `read` is a `useSyncExternalStore` snapshot, so it must return the same object
    until something actually changes; recomputing `parse` on every call would return a
    fresh object every render and spin React forever. The raw string is the change
    key, with one exception: an authenticated snapshot whose expiry has since passed
    has to flip without the stored string changing at all.
  */
  let cachedRaw: string | null = null;
  let cachedState: SessionState = ABSENT;
  let primed = false;
  /** The token the server refused, remembered only while nothing has replaced it. */
  let refused: string | null = null;

  const notify = () => {
    for (const listener of [...listeners]) listener();
  };

  const readRaw = (): string | null => {
    if (storage === null) return null;
    try {
      return storage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  };

  const read = (): SessionState => {
    const raw = readRaw();
    if (!primed || raw !== cachedRaw) {
      primed = true;
      cachedRaw = raw;
      if (raw === null) cachedState = refused === null ? ABSENT : REJECTED;
      else cachedState = parse(raw, now());
    } else if (cachedState.status === 'authenticated') {
      const { expiresAt } = cachedState.session;
      if (expiresAt !== null && Date.parse(expiresAt) <= now()) cachedState = EXPIRED;
    }
    return cachedState;
  };

  const write = (raw: string | null) => {
    if (storage === null) return;
    try {
      if (raw === null) storage.removeItem(SESSION_STORAGE_KEY);
      else storage.setItem(SESSION_STORAGE_KEY, raw);
    } catch {
      // A storage that refuses writes still gets a correct in-memory answer below.
    }
  };

  return {
    read,

    accessToken() {
      const state = read();
      return state.status === 'authenticated' ? state.session.accessToken : null;
    },

    refreshToken() {
      const state = read();
      return state.status === 'authenticated' ? state.session.refreshToken ?? null : null;
    },

    signIn(session) {
      refused = null;
      write(JSON.stringify({
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        accountId: session.accountId,
        expiresAt: session.expiresAt,
        refreshExpiresAt: session.refreshExpiresAt,
      }));
      primed = false;
      notify();
    },

    signOut(reason = 'absent') {
      const state = read();
      refused = reason === 'rejected' && state.status === 'authenticated'
        ? state.session.accessToken
        : null;
      write(null);
      primed = false;
      notify();
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function browserStorage(): SessionStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.sessionStorage;
  } catch {
    // Storage access can throw outright under a restrictive privacy setting.
    return null;
  }
}

/** The session this browser tab holds. The one the shipped API clients read. */
export const browserSessionStore: SessionStore = createSessionStore(browserStorage());

/** Subscribe a component to a session store. Re-renders when the session changes. */
export function useSessionState(store: SessionStore): SessionState {
  return useSyncExternalStore(store.subscribe, store.read, store.read);
}
