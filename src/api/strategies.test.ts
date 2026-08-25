import { afterEach, describe, expect, it, vi } from 'vitest';
import { createStrategyAuthoringClient, createStrategyCatalogClient, createStrategyLibraryClient, StrategyApiError } from './strategies';
import { setSessionAccessToken } from './sessionAccessToken';

describe('strategy library API client', () => {
  afterEach(() => setSessionAccessToken(null));

  it('uses the authenticated browser session when no token provider is overridden', async () => {
    setSessionAccessToken('browser-session-token');
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [], nextCursor: null, hasMore: false,
    }), { status: 200 }));

    await createStrategyLibraryClient({ fetchImpl }).list();

    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/strategies?limit=10', expect.objectContaining({
      headers: expect.objectContaining({ Authorization: 'Bearer browser-session-token' }),
    }));
  });

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
        blockCount: 3,
        symbols: ['AAPL', 'MSFT'],
      }],
      nextCursor: null,
      hasMore: false,
    }), { status: 200, headers: { 'Content-Type': 'application/json' } }));

    const page = await createStrategyLibraryClient({
      baseUrl: 'https://api.example.com/',
      fetchImpl,
    }).list(10);

    expect(page.items[0]).toMatchObject({
      mode: 'BASIC',
      validationStatus: 'VALID',
      editable: true,
      blockCount: 3,
      symbols: ['AAPL', 'MSFT'],
    });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/strategies?limit=10',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejects malformed strategy modes', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      items: [{
        id: 'id', kind: 'draft', mode: 'UNKNOWN', name: 'Broken', status: 'DRAFT',
        validationStatus: null, backtestStatus: null, editable: true,
        updatedAt: '2026-08-01T12:00:00Z', version: null, description: null, blockCount: 0, symbols: [],
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

  it('creates an owned strategy copy through the dedicated command', async () => {
    const copyId = '20000000-0000-4000-8000-000000000002';
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: copyId }), { status: 201 }));
    const client = createStrategyAuthoringClient({ fetchImpl });

    await expect(client.copyStrategy(document.strategyId)).resolves.toEqual({ id: copyId });
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/v1/strategies/${document.strategyId}/copies`,
      expect.objectContaining({ method: 'POST', credentials: 'include' }),
    );
  });

  it('soft-deletes an owned strategy through the versioned command', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
    const client = createStrategyAuthoringClient({ baseUrl: 'https://api.example.com/', fetchImpl });

    await client.deleteStrategy!(document.strategyId);

    expect(fetchImpl).toHaveBeenCalledWith(
      `https://api.example.com/api/v1/strategies/${document.strategyId}`,
      expect.objectContaining({ method: 'DELETE', credentials: 'include' }),
    );
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
    expect(fetchImpl.mock.calls.at(-1)?.[1]).toEqual(expect.objectContaining({
      method: 'DELETE', keepalive: true,
    }));
  });

  it('validates the saved revision against an explicit published catalog', async () => {
    const validation = {
      validationRunId: '21000000-0000-4000-8000-000000000001',
      strategyId: document.strategyId,
      status: 'VALID',
      requestedEditSequence: 4,
      semanticHash: 'a'.repeat(64),
      elementCatalogVersionId: '0f1a0000-0000-4000-8000-000000000001',
      findings: [
        {
          severity: 'INFORMATION', code: 'BACKTEST_FEED_REQUIRED', location: 'groups[0]',
          message: 'Historical coverage is required', requirements: ['feed:ADJUSTED_BAR@30m'],
        },
        {
          severity: 'BLOCKING_ERROR', code: 'REQUIRED_PARAMETER_MISSING', location: 'groups[0].blocks[0]',
          message: 'A required parameter is missing', requirements: [],
        },
      ],
      completedAt: '2026-08-07T12:00:00Z',
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify(validation), { status: 201 }));
    const client = createStrategyAuthoringClient({ fetchImpl });

    await expect(client.validateStrategy(document.strategyId, validation.elementCatalogVersionId))
      .resolves.toEqual(validation);
    expect(fetchImpl).toHaveBeenCalledWith(
      `/api/v1/strategies/${document.strategyId}/validations`,
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ catalogId: validation.elementCatalogVersionId }),
      }),
    );
  });

  it('loads the current valid revisions so reopening an editor preserves launchability', async () => {
    const current = {
      validationRunId: '21000000-0000-4000-8000-000000000001',
      strategyId: document.strategyId,
      strategyName: 'Validated strategy',
      requestedEditSequence: 3,
      semanticHash: document.semanticHash,
      elementCatalogVersionId: '0f1a0000-0000-4000-8000-000000000001',
      languageVersion: 'basic/v1',
      schemaVersion: 'basic-semantic/v1',
      catalogVersion: 'basic-elements:2026-08-07',
      completedAt: '2026-08-07T12:00:00Z',
    };
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({ items: [current] }), { status: 200 }));
    const client = createStrategyAuthoringClient({ fetchImpl });

    await expect(client.getCurrentValidations!()).resolves.toEqual([expect.objectContaining({
      validationRunId: current.validationRunId,
      strategyId: document.strategyId,
      requestedEditSequence: 3,
      semanticHash: document.semanticHash,
    })]);
    expect(fetchImpl).toHaveBeenCalledWith('/api/v1/strategy-validations/current', expect.objectContaining({
      credentials: 'include',
    }));
  });

  it('creates an immutable release without client-selected policy or datasets', async () => {
    const release = {
      validationRunId: 'validation-id', initialCashAmount: '100000', budgetCapBps: 10000,
    };
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ releaseId: 'release-id', botId: 'bot-id', backtestLane: 'BASIC' }), { status: 201 }),
    );
    const client = createStrategyAuthoringClient({ fetchImpl });

    await expect(client.releaseStrategy(document.strategyId, release)).resolves.toEqual({ releaseId: 'release-id', botId: 'bot-id', backtestLane: 'BASIC' });
    expect(fetchImpl.mock.calls.map(([url, init]) => [url, (init as RequestInit).method ?? 'GET'])).toEqual([
      [`/api/v1/strategies/${document.strategyId}/releases`, 'POST'],
    ]);
    expect(JSON.parse((fetchImpl.mock.calls[0][1] as RequestInit).body as string)).toEqual(release);
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

describe('Basic strategy catalog API client', () => {
  it('loads official elements, features, and instrument identifiers', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: {
        id: 'catalog-id', languageVersion: 'basic/v1', schemaVersion: 'schema/v1',
        catalogVersion: 'catalog/v1', dataRequirementVersion: 'data/v1',
        definitionHash: 'catalog-hash', publishedAt: '2026-08-01T12:00:00Z', retiredAt: null,
      },
      elements: [{
        id: 'element-id', catalogId: 'catalog-id', elementCode: 'RSI', elementKind: 'CONDITION',
        parameterSchema: { required: ['period'] }, inputPortSchema: {}, outputPortSchema: {},
        executionContract: { containers: ['BUY', 'SELL'] }, definitionHash: 'element-hash',
      }],
      features: [{
        id: 'feature-id', catalogId: 'catalog-id', featureCode: 'RSI_14', calculatorVersion: '1.0.0',
        resolution: '1m', normalizedParameters: { period: 14 }, outputValueType: 'NUMBER',
        requiredHistoryPoints: 14, definitionHash: 'feature-hash',
      }],
      instruments: [{
        id: 'instrument-id', assetType: 'STOCK', primaryExchangeMic: 'XNAS', currencyCode: 'USD', symbol: 'AAPL',
      }],
    }), { status: 200 }));

    const catalog = await createStrategyCatalogClient({ baseUrl: 'https://api.example.com/', fetchImpl }).getBasic();

    expect(catalog.version.id).toBe('catalog-id');
    expect(catalog.elements[0].parameterSchema).toEqual({ required: ['period'] });
    expect(catalog.instruments[0]).toMatchObject({ id: 'instrument-id', symbol: 'AAPL' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.example.com/api/v1/strategy-catalogs/basic',
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejects malformed catalog collections', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response(JSON.stringify({
      version: {}, elements: [], features: [], instruments: null,
    }), { status: 200 }));

    await expect(createStrategyCatalogClient({ fetchImpl }).getBasic())
      .rejects.toThrow('Invalid Basic strategy catalog collections');
  });
});
