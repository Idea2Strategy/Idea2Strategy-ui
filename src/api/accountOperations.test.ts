import { describe, expect, it, vi } from 'vitest';
import { AccountOperationsApiError, createAccountOperationsClient, createAdminMcpClient } from './accountOperations';

const caseView = {
  id: 'case-1', accountId: 'account-1', type: 'APPEAL', status: 'OPEN', version: 1,
  evidenceObjectIds: ['evidence-1'], updatedAt: '2026-08-03T00:00:00Z',
};

describe('account operations API client', () => {
  it('submits a user case with idempotency and correlation headers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(caseView), { status: 201 }));
    const client = createAccountOperationsClient({ fetchImpl, createCorrelationId: () => 'corr-1', getAccessToken: () => 'token' });
    await expect(client.submitCase({ type: 'APPEAL', subject: 'appeal', description: 'review this', evidence: [] }, 'idem-1'))
      .resolves.toEqual(caseView);
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/cases', expect.objectContaining({
      method: 'POST', credentials: 'include',
      headers: expect.objectContaining({ Authorization: 'Bearer token', 'Idempotency-Key': 'idem-1', 'X-Correlation-Id': 'corr-1' }),
    }));
  });

  it('encodes all operator queue filters and validates the response', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{ caseId: 'case-1', type: 'REPORT', status: 'UNDER_REVIEW', version: 2, assigneeOperatorId: null, updatedAt: '2026-08-03T00:00:00Z' }],
      nextCursor: 'next',
    }), { status: 200 }));
    const client = createAccountOperationsClient({ fetchImpl, createCorrelationId: () => 'corr-2', getOperatorAccessToken: () => 'operator-token' });
    await expect(client.operatorCaseQueue({ types: ['REPORT', 'APPEAL'], statuses: ['OPEN'], limit: 25 }))
      .resolves.toEqual(expect.objectContaining({ nextCursor: 'next' }));
    const url = String(fetchImpl.mock.calls[0][0]);
    expect(url).toContain('type=REPORT');
    expect(url).toContain('type=APPEAL');
    expect(url).toContain('status=OPEN');
    expect(url).toContain('limit=25');
  });

  it('sends case commands with server-owned request hashing and surfaces the receipt', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'APPLIED', code: 'CASE_REVIEW_STARTED', correlationId: 'corr-3', caseVersion: 3 }), { status: 200 }));
    const client = createAccountOperationsClient({ fetchImpl, createCorrelationId: () => 'corr-3', getOperatorAccessToken: () => 'operator-token' });
    await expect(client.commandCase('case-1', 'START_REVIEW', { expectedVersion: 2, reasonCode: 'REVIEW_READY' }, 'idem-3'))
      .resolves.toEqual({ status: 'APPLIED', code: 'CASE_REVIEW_STARTED', correlationId: 'corr-3', caseVersion: 3 });
    const init = fetchImpl.mock.calls[0][1] as RequestInit;
    expect(init.headers).toEqual(expect.objectContaining({ 'Idempotency-Key': 'idem-3', 'X-Correlation-Id': 'corr-3' }));
    expect(JSON.parse(String(init.body))).toEqual(expect.objectContaining({ expectedVersion: 2, reasonCode: 'REVIEW_READY', evidenceIds: [], expectedSanctionVersion: 0 }));
  });

  it('binds RBAC idempotency, correlation, and a deterministic SHA-256 request hash into the body', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'OPERATOR_ROLE_GRANTED', correlationId: 'corr-rbac', assignmentId: 'assignment-1' }), { status: 200 }));
    const client = createAccountOperationsClient({ fetchImpl, createCorrelationId: () => 'corr-rbac', getOperatorAccessToken: () => 'operator-token' });
    await client.grantOperator({ targetOperatorId: 'operator-2', roleId: 'role-1', reasonCode: 'ON_CALL' }, 'idem-rbac');
    const body = JSON.parse(String((fetchImpl.mock.calls[0][1] as RequestInit).body));
    expect(body).toEqual(expect.objectContaining({ correlationId: 'corr-rbac', idempotencyKey: 'idem-rbac', expiresAt: null }));
    expect(body.requestHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('uses direct sanction command contracts without inventing a read model', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: 'ACCOUNT_SANCTION_APPLIED', sanctionReference: 'sanction-1', correlationId: 'corr-sanction', aggregateVersion: 1 }), { status: 200 }));
    const client = createAccountOperationsClient({ fetchImpl, createCorrelationId: () => 'corr-sanction', getOperatorAccessToken: () => 'operator-token' });
    await expect(client.applySanction('account-1', { sanctionId: 'sanction-1', type: 'PERMANENT', reasonCode: 'POLICY', sourceCaseId: 'case-1', expectedVersion: 0 }, 'idem-sanction'))
      .resolves.toEqual(expect.objectContaining({ aggregateVersion: 1, sanctionReference: 'sanction-1' }));
    expect(fetchImpl.mock.calls[0][0]).toBe('/api/v1/operations/accounts/account-1/sanctions');
  });

  it('normalizes problem details and preserves the backend correlation id', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ title: 'CASE_STALE_VERSION', correlationId: 'server-corr' }), { status: 409 }));
    const client = createAccountOperationsClient({ fetchImpl, createCorrelationId: () => 'client-corr', getOperatorAccessToken: () => 'operator-token' });
    await expect(client.operatorCase('case-1')).rejects.toEqual(expect.objectContaining<Partial<AccountOperationsApiError>>({
      status: 409, code: 'CASE_STALE_VERSION', correlationId: 'server-corr', conflict: true, retryable: false,
    }));
  });

  it('turns fetch rejection into a retryable correlated network failure', async () => {
    const client = createAccountOperationsClient({ fetchImpl: vi.fn().mockRejectedValue(new TypeError('offline')), createCorrelationId: () => 'corr-offline' });
    await expect(client.userCase('case-1')).rejects.toEqual(expect.objectContaining({ status: 0, code: 'NETWORK_ERROR', correlationId: 'corr-offline', retryable: true }));
  });

  it('never treats an ordinary account session as an operator credential', async () => {
    const fetchImpl = vi.fn();
    const client = createAccountOperationsClient({
      fetchImpl,
      getAccessToken: () => 'ordinary-session-token',
      createCorrelationId: () => 'corr-operator-guard',
    });

    await expect(client.operatorCaseQueue({ types: ['REPORT'] })).rejects.toEqual(expect.objectContaining({
      status: 403, code: 'OPERATOR_CONTEXT_REQUIRED', correlationId: 'corr-operator-guard',
    }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe('admin MCP client', () => {
  it('invokes only an explicitly named versioned tool with idempotency and correlation', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: 'EXECUTED', code: 'OK', result: { accepted: true }, correlationId: 'corr-mcp' }), { status: 200 }));
    const client = createAdminMcpClient({ baseUrl: 'https://admin.example/', fetchImpl, createCorrelationId: () => 'corr-mcp', getOperatorAccessToken: () => 'operator-token' });
    await expect(client.invoke('corporate_action_candidate.query', { registryVersion: 'mcp-v1', requestSchemaVersion: 'schema-v1', targetId: 'candidate-1', input: { candidateId: 'candidate-1' } }, 'idem-mcp'))
      .resolves.toEqual({ status: 'EXECUTED', code: 'OK', result: { accepted: true }, correlationId: 'corr-mcp' });
    expect(fetchImpl).toHaveBeenCalledWith('https://admin.example/mcp/v1/tools/corporate_action_candidate.query:invoke', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer operator-token', 'Idempotency-Key': 'idem-mcp', 'X-Correlation-Id': 'corr-mcp' }),
    }));
  });

  it('fails closed without an independently established operator credential', async () => {
    const fetchImpl = vi.fn();
    const client = createAdminMcpClient({ fetchImpl, createCorrelationId: () => 'corr-mcp-guard', getAccessToken: () => 'ordinary-session-token' });
    await expect(client.invoke('tool', { registryVersion: 'v1', requestSchemaVersion: 'v1', targetId: 'target', input: {} }, 'idem'))
      .rejects.toEqual(expect.objectContaining({ status: 403, code: 'OPERATOR_CONTEXT_REQUIRED' }));
    expect(fetchImpl).not.toHaveBeenCalled();
  });
});
