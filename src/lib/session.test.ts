import { describe, expect, it } from 'vitest';
import { SESSION_STORAGE_KEY, createSessionStore } from './session';
import type { Session, SessionStorage } from './session';

/*
  The store's whole job is to be honest about whether there is a credential, so these
  tests are about the answers it gives when there is not one. Nothing here asserts on
  a mock: each case writes bytes into a storage the store then has to read back.
*/
function memoryStorage(seed: Record<string, string> = {}): SessionStorage & { map: Map<string, string> } {
  const map = new Map(Object.entries(seed));
  return {
    map,
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key),
  };
}

function stored(session: Partial<Session>): Record<string, string> {
  return {
    [SESSION_STORAGE_KEY]: JSON.stringify({
      accessToken: 'owner-token',
      accountId: '66666666-6666-4666-8666-666666666666',
      expiresAt: null,
      ...session,
    }),
  };
}

describe('session store', () => {
  it('is anonymous, not empty-handed, when nothing was ever stored', () => {
    const store = createSessionStore(memoryStorage());

    expect(store.read()).toEqual({ status: 'anonymous', reason: 'absent' });
    expect(store.accessToken()).toBeNull();
  });

  it('reads back the session the sign-in flow stored', () => {
    const store = createSessionStore(memoryStorage(stored({})));

    expect(store.read()).toEqual({
      status: 'authenticated',
      session: {
        accessToken: 'owner-token',
        accountId: '66666666-6666-4666-8666-666666666666',
        expiresAt: null,
      },
    });
    expect(store.accessToken()).toBe('owner-token');
  });

  it('keeps the signed-in email in tab storage for password step-up actions', () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);

    store.signIn({
      accessToken: 'owner-token',
      accountId: 'account-1',
      email: 'user@example.com',
      expiresAt: null,
    });

    expect(store.read()).toEqual({
      status: 'authenticated',
      session: expect.objectContaining({ email: 'user@example.com' }),
    });
    expect(storage.map.get(SESSION_STORAGE_KEY)).toContain('user@example.com');
  });

  it('never persists a refresh credential in browser storage', () => {
    const storage = memoryStorage();
    const store = createSessionStore(storage);

    store.signIn({
      accessToken: 'access-jwt',
      accountId: 'account-1',
      expiresAt: '2026-08-07T00:05:00Z',
      refreshExpiresAt: '2026-08-07T12:00:00Z',
    });

    expect(storage.map.get(SESSION_STORAGE_KEY)).not.toContain('refreshToken');
  });

  it('never invents a credential for a build that has none', () => {
    // The defect this module exists for: a default token would make this pass a
    // bearer header on a machine nobody signed in on.
    const store = createSessionStore(memoryStorage());

    expect(store.accessToken()).toBeNull();
  });

  it.each([
    ['not JSON at all', 'not-json'],
    ['a JSON array', '[]'],
    ['a blank token', JSON.stringify({ accessToken: '   ', accountId: 'a' })],
    ['no account', JSON.stringify({ accessToken: 'owner-token' })],
    ['an unparseable expiry', JSON.stringify({ accessToken: 't', accountId: 'a', expiresAt: 'soon' })],
  ])('reports %s as malformed rather than sending it', (_label, raw) => {
    const store = createSessionStore(memoryStorage({ [SESSION_STORAGE_KEY]: raw }));

    expect(store.read()).toEqual({ status: 'anonymous', reason: 'malformed' });
    expect(store.accessToken()).toBeNull();
  });

  it('stops offering a session once its own expiry has passed', () => {
    let clock = Date.parse('2026-08-03T11:59:00Z');
    const store = createSessionStore(
      memoryStorage(stored({ expiresAt: '2026-08-03T12:00:00Z' })),
      { now: () => clock },
    );

    expect(store.accessToken()).toBe('owner-token');

    clock = Date.parse('2026-08-03T12:00:01Z');

    expect(store.read()).toEqual({ status: 'anonymous', reason: 'expired' });
    expect(store.accessToken()).toBeNull();
  });

  it('distinguishes a credential the server refused from never having had one', () => {
    const storage = memoryStorage(stored({}));
    const store = createSessionStore(storage);

    store.signOut('rejected');

    expect(store.read()).toEqual({ status: 'anonymous', reason: 'rejected' });
    // The refused token is gone, not merely flagged: nothing can send it again.
    expect(storage.map.has(SESSION_STORAGE_KEY)).toBe(false);
    expect(store.accessToken()).toBeNull();
  });

  it('reports a deliberate sign-out as absent, not as a rejection', () => {
    const store = createSessionStore(memoryStorage(stored({})));

    store.signOut();

    expect(store.read()).toEqual({ status: 'anonymous', reason: 'absent' });
  });

  it('clears the rejection once a new session is signed in', () => {
    const store = createSessionStore(memoryStorage(stored({})));
    store.signOut('rejected');

    store.signIn({ accessToken: 'fresh-token', accountId: 'account', expiresAt: null });

    expect(store.accessToken()).toBe('fresh-token');
  });

  it('tells subscribers when the session changes, and stops when they leave', () => {
    const store = createSessionStore(memoryStorage(stored({})));
    let calls = 0;
    const unsubscribe = store.subscribe(() => { calls += 1; });

    store.signOut('rejected');
    expect(calls).toBe(1);

    unsubscribe();
    store.signIn({ accessToken: 'fresh-token', accountId: 'account', expiresAt: null });
    expect(calls).toBe(1);
  });

  it('returns the same snapshot object until something changes', () => {
    // useSyncExternalStore spins forever on a snapshot that is a new object each read.
    const store = createSessionStore(memoryStorage(stored({})));

    expect(store.read()).toBe(store.read());

    store.signOut();

    expect(store.read()).toBe(store.read());
  });

  it('is anonymous rather than broken when storage is unavailable', () => {
    const store = createSessionStore(null);

    expect(store.read()).toEqual({ status: 'anonymous', reason: 'absent' });
    expect(() => store.signOut()).not.toThrow();
  });

  it('is anonymous rather than broken when storage throws on read', () => {
    const store = createSessionStore({
      getItem: () => { throw new Error('storage disabled'); },
      setItem: () => {},
      removeItem: () => {},
    });

    expect(store.read()).toEqual({ status: 'anonymous', reason: 'absent' });
  });
});
