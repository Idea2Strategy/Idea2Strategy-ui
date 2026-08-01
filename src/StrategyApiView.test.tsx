import { render, screen } from '@testing-library/react';
import { describe, expect, test, vi } from 'vitest';
import type { StrategyLibraryClient } from './api/strategies';
import { StrategyHome } from './views/StrategyViews';

describe('Strategy API view', () => {
  test('renders owner strategies returned by the live library API', async () => {
    const client: StrategyLibraryClient = {
      list: vi.fn().mockResolvedValue({
        items: [{
          id: '20000000-0000-4000-8000-000000000001',
          kind: 'draft',
          mode: 'BASIC',
          name: 'Live Momentum',
          description: null,
          status: 'DRAFT',
          validationStatus: 'VALID',
          backtestStatus: 'AVAILABLE',
          editable: true,
          updatedAt: '2026-08-01T12:00:00Z',
          version: null,
        }],
        nextCursor: null,
        hasMore: false,
      }),
    };

    render(<StrategyHome openEditor={() => {}} client={client} />);

    expect(await screen.findByTestId('strategy-row-Live Momentum')).toBeInTheDocument();
    expect(screen.getByTestId('strategy-counts')).toHaveTextContent('출시 가능 1');
    expect(client.list).toHaveBeenCalledWith(50, undefined, expect.any(AbortSignal));
  });
});
