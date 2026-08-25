import { describe, expect, it, vi } from 'vitest';
import { createOperatorRbacClient, OperatorRbacApiError } from './operatorRbac';

const role = { id: 'role-1', code: 'OPERATIONS_REVIEWER', hierarchyRank: 10 };
const permission = { id: 'permission-1', code: 'OPERATOR_RBAC_CATALOG_READ' };
const assignment = {
  id: 'assignment-1', operatorId: 'operator-1', roleId: 'role-1', roleCode: 'OPERATIONS_REVIEWER',
  catalogVersion: 'catalog-v1', grantedAt: '2026-08-03T00:00:00Z', expiresAt: null,
  revokedAt: null, revocationReasonCode: null, status: 'ACTIVE',
};
const response = (view: unknown) => new Response(JSON.stringify({ view, correlationId: 'server-corr' }), { status: 200 });

describe('operator RBAC read client', () => {
  it('reads self using only the trusted credential channel and omits provider identity fields', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({
      operatorId: 'operator-1', catalogVersion: 'catalog-v1', currentMfa: true,
      mfaAuthenticatedAt: '2026-08-03T00:00:00Z', lastMfaVerifiedAt: '2026-08-03T00:00:00Z',
      roles: [role], permissions: [permission], assignments: [assignment],
      subject: 'must-not-be-exposed', subjectHmac: 'must-not-be-exposed', accessToken: 'must-not-be-exposed',
    }));
    const client = createOperatorRbacClient({
      fetchImpl, getOperatorCsrfToken: () => 'operator-token', createCorrelationId: () => 'client-corr',
    });

    const result = await client.me();

    expect(result).toEqual({
      correlationId: 'server-corr',
      view: expect.objectContaining({ operatorId: 'operator-1', permissions: [permission], assignments: [assignment] }),
    });
    expect(result.view).not.toHaveProperty('subject');
    expect(result.view).not.toHaveProperty('subjectHmac');
    expect(result.view).not.toHaveProperty('accessToken');
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/operations/me', expect.objectContaining({
      credentials: 'include',
      headers: expect.objectContaining({ 'X-Operator-CSRF': 'operator-token', 'X-Correlation-Id': 'client-corr' }),
    }));
    const headers = fetchImpl.mock.calls[0][1]?.headers as Record<string, string>;
    expect(Object.keys(headers).filter((name) => /^authorization$|^x-(user|amzn-oidc)/i.test(name))).toEqual([]);
    expect(Object.keys(headers).sort()).toEqual(['Accept', 'X-Operator-CSRF', 'X-Correlation-Id'].sort());
  });

  it('relies only on the HttpOnly session cookie when no CSRF token is needed', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'OPERATOR_AUTHENTICATION_REQUIRED' }), { status: 401 }));
    await expect(createOperatorRbacClient({ fetchImpl, createCorrelationId: () => 'corr-auth' }).me())
      .rejects.toEqual(expect.objectContaining({ status: 401, code: 'OPERATOR_AUTHENTICATION_REQUIRED', correlationId: 'corr-auth' }));
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/operations/me', expect.objectContaining({ credentials: 'include' }));
  });

  it('reads the catalog and target assignment endpoints with exact response wrappers', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(response({ catalogVersion: 'catalog-v1', roles: [role], permissions: [permission], rolePermissions: [{ roleId: 'role-1', permissionId: 'permission-1', delegable: true }] }))
      .mockResolvedValueOnce(response({ operatorId: 'operator/2', assignments: [assignment] }));
    const client = createOperatorRbacClient({ fetchImpl, getOperatorCsrfToken: () => 'operator-token', createCorrelationId: () => 'corr' });

    await expect(client.catalog()).resolves.toEqual(expect.objectContaining({ view: expect.objectContaining({ catalogVersion: 'catalog-v1' }) }));
    await expect(client.assignments('operator/2')).resolves.toEqual(expect.objectContaining({ view: expect.objectContaining({ operatorId: 'operator/2' }) }));
    expect(fetchImpl.mock.calls.map(([url]) => url)).toEqual([
      '/api/v1/operations/rbac/catalog',
      '/api/v1/operations/rbac/operators/operator%2F2/assignments',
    ]);
  });

  it.each([
    [401, 'OPERATOR_AUTHENTICATION_REQUIRED'],
    [403, 'OPERATOR_RBAC_READ_FORBIDDEN'],
    [404, 'OPERATOR_NOT_FOUND'],
    [409, 'OPERATOR_RBAC_CATALOG_VERSION_CONFLICT'],
  ])('preserves stable %i errors', async (status, code) => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code, correlationId: 'server-error-corr' }), { status }));
    await expect(createOperatorRbacClient({ fetchImpl, getOperatorCsrfToken: () => 'operator-token' }).catalog()).rejects.toEqual(expect.objectContaining<Partial<OperatorRbacApiError>>({
      status, code, correlationId: 'server-error-corr',
    }));
  });

  it('rejects malformed DTOs instead of treating them as permissions', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(response({ operatorId: 'operator-1', permissions: [{ subject: 'hidden' }] }));
    await expect(createOperatorRbacClient({ fetchImpl, getOperatorCsrfToken: () => 'operator-token' }).me()).rejects.toThrow('Invalid catalogVersion');
  });
});
