import { describe, expect, it, vi } from 'vitest';
import { createStrategyLibraryClient } from './strategies';

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
