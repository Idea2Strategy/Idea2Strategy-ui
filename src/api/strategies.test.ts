import { describe, expect, it, vi } from 'vitest';
import { createStrategyAuthoringClient, createStrategyLibraryClient, StrategyApiError } from './strategies';

describe('strategy library API client', () => {
  it('loads the owner strategy library from the versioned API', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: '20000000-0000-4000-8000-000000000001',
        kind: 'draft',
        mode: 'BASIC',
        name: 'Opening Range Flow',
        description: 'Momentum draft',
        status: 'DRAFT',
        validationStatus: 'VALID',
        backtestStatus: 'AVAILABLE',
        editable: true,
        updatedAt: '2026-08-01T12:00:00Z',
        version: null,
      }],
      nextCursor: null,
      hasMore: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const page = await createStrategyLibraryClient({
      baseUrl: 'https://api.example.com/',
      fetchImpl,
    }).list(50);

    expect(page.items[0]).toMatchObject({
      mode: 'BASIC',
      validationStatus: 'VALID',
      editable: true,
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/strategies?limit=50',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejects malformed strategy modes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 'id', kind: 'draft', mode: 'UNKNOWN', name: 'Broken', status: 'DRAFT',
        validationStatus: null, backtestStatus: null, editable: true,
        updatedAt: '2026-08-01T12:00:00Z', version: null, description: null,
      }],
      nextCursor: null,
      hasMore: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    await expect(createStrategyLibraryClient({ fetchImpl }).list())
      .rejects.toThrow('Unsupported strategy mode');
  });
});

describe('strategy authoring API client', () => {
  const document = {
    strategyId: '20000000-0000-4000-8000-000000000001',
    semanticDocument: { mode: 'BASIC', groups: [] },
    presentationDocument: { viewport: { x: 0, y: 0 } },
    semanticSchemaVersion: 'basic-semantic.v1',
    presentationSchemaVersion: 'basic-presentation.v1',
    semanticHash: 'semantic-hash',
    presentationHash: 'presentation-hash',
    editSequence: 3,
    updatedAt: '2026-08-01T12:00:00Z',
  };

  it('creates a Basic draft and sends credentials', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: document.strategyId, mode: 'BASIC' }), { status: 201 }));
    const client = createStrategyAuthoringClient({ baseUrl: 'https://api.example.com/', fetchImpl });

    await expect(client.createBasic('새 전략')).resolves.toEqual({ id: document.strategyId, mode: 'BASIC' });
    expect(fetchImpl).toHaveBeenCalledWith('https://api.example.com/api/v1/strategies', expect.objectContaining({
      method: 'POST', credentials: 'include', body: JSON.stringify({ name: '새 전략', description: null, mode: 'BASIC' }),
    }));
  });

  it('loads, leases, heartbeats, saves, and releases an owned document', async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify(document), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ leaseToken: 'secret-token', expiresAt: '2026-08-01T12:02:00Z' }), { status: 201 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ leaseToken: null, expiresAt: '2026-08-01T12:03:00Z' }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ ...document, editSequence: 4 }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 204 }));
    const client = createStrategyAuthoringClient({ fetchImpl });

    await expect(client.getDocument(document.strategyId)).resolves.toMatchObject({ editSequence: 3 });
    await expect(client.acquireLease(document.strategyId)).resolves.toMatchObject({ leaseToken: 'secret-token' });
    await expect(client.heartbeatLease(document.strategyId, 'secret-token')).resolves.toMatchObject({ expiresAt: '2026-08-01T12:03:00Z' });
    await expect(client.saveDocument(document.strategyId, {
      expectedEditSequence: 3,
      leaseToken: 'secret-token',
      semanticDocument: document.semanticDocument,
      presentationDocument: document.presentationDocument,
    })).resolves.toMatchObject({ editSequence: 4 });
    await client.releaseLease(document.strategyId, 'secret-token');

    expect(fetchImpl.mock.calls.map(([url, init]) => [url, (init as RequestInit).method ?? 'GET'])).toEqual([
      [`/api/v1/strategies/${document.strategyId}/document`, 'GET'],
      [`/api/v1/strategies/${document.strategyId}/edit-lease`, 'POST'],
      [`/api/v1/strategies/${document.strategyId}/edit-lease`, 'PUT'],
      [`/api/v1/strategies/${document.strategyId}/document`, 'PUT'],
      [`/api/v1/strategies/${document.strategyId}/edit-lease`, 'DELETE'],
    ]);
  });

  it('exposes conflict status without leaking a lease token', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: 'conflict' }), { status: 409 }));

    await expect(createStrategyAuthoringClient({ fetchImpl }).saveDocument('strategy-id', {
      expectedEditSequence: 2,
      leaseToken: 'do-not-leak',
      semanticDocument: {},
      presentationDocument: {},
    })).rejects.toEqual(expect.objectContaining<Partial<StrategyApiError>>({ status: 409 }));
    await expect(createStrategyAuthoringClient({ fetchImpl }).saveDocument('strategy-id', {
      expectedEditSequence: 2,
      leaseToken: 'do-not-leak',
      semanticDocument: {},
      presentationDocument: {},
    })).rejects.not.toThrow(/do-not-leak/);
  });
});
