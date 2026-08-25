import { describe, expect, it, vi } from 'vitest';
import { createOperatorSession } from './operatorSession';

const body = {
  operatorId: 'operator-1', csrfToken: 'csrf-1', mfaVerifiedAt: '2026-08-14T00:00:00Z',
  idleExpiresAt: '2026-08-14T00:15:00Z', absoluteExpiresAt: '2026-08-14T08:00:00Z',
};

describe('operator session client', () => {
  it('uses cookies, keeps CSRF only in memory, and never creates a bearer header', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 201 }));
    const session = createOperatorSession({ fetchImpl });
    await session.login({ loginName: 'admin', password: 'secret', totpCode: '123456' });
    expect(session.getCsrfToken()).toBe('csrf-1');
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.credentials).toBe('include');
    expect(init.cache).toBe('no-store');
    expect(init.headers).not.toHaveProperty('Authorization');
    expect(JSON.parse(String(init.body))).toEqual({ loginName: 'admin', password: 'secret', totpCode: '123456' });
  });

  it('restores a cookie session and sends CSRF on logout before clearing memory', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const session = createOperatorSession({ fetchImpl });
    await session.start();
    await session.logout();
    expect((fetchImpl.mock.calls[1][1] as RequestInit).headers).toEqual(expect.objectContaining({ 'X-Operator-CSRF': 'csrf-1' }));
    expect(session.getCsrfToken()).toBeNull();
    expect(session.snapshot()).toEqual({ kind: 'unauthenticated' });
  });
});
