import { render as renderBare, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// Views navigate to /login for sign-in states, so every render needs a router.
const render = (ui: ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { BasicStrategyCatalog, StrategyAuthoringClient, StrategyCatalogClient, StrategyDocument, StrategyLibraryClient } from './api/strategies';
import { BasicEditor, StrategyHome } from './views/StrategyViews';

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

  test('creates a Basic draft before opening the blank editor', async () => {
    const user = userEvent.setup();
    const openEditor = vi.fn();
    const authoringClient = { createBasic: vi.fn().mockResolvedValue({ id: 'strategy-id', mode: 'BASIC' }) } as unknown as StrategyAuthoringClient;

    render(<StrategyHome openEditor={openEditor} client={null} authoringClient={authoringClient} />);
    await user.click(screen.getByRole('button', { name: '새 전략' }));
    await user.clear(screen.getByRole('textbox', { name: '전략 이름' }));
    await user.type(screen.getByRole('textbox', { name: '전략 이름' }), '내 모멘텀 전략');
    await user.click(screen.getByRole('button', { name: 'Basic으로 시작' }));

    await waitFor(() => expect(openEditor).toHaveBeenCalledWith('basic', true, 'strategy-id'));
    expect(authoringClient.createBasic).toHaveBeenCalledWith('내 모멘텀 전략');
  });

  test('loads an owned document, acquires a lease, and saves the Basic presentation safely', async () => {
    const user = userEvent.setup();
    const loadOrder: string[] = [];
    const document: StrategyDocument = {
      strategyId: 'strategy-id',
      semanticDocument: { mode: 'BASIC', groups: [] },
      presentationDocument: {},
      semanticSchemaVersion: 'basic-semantic.v1',
      presentationSchemaVersion: 'basic-presentation.v1',
      semanticHash: 'semantic-hash',
      presentationHash: 'presentation-hash',
      editSequence: 0,
      updatedAt: '2026-08-01T12:00:00Z',
    };
    const authoringClient: StrategyAuthoringClient = {
      createBasic: vi.fn(),
      getDocument: vi.fn().mockImplementation(async () => { loadOrder.push('document'); return document; }),
      acquireLease: vi.fn().mockImplementation(async () => { loadOrder.push('lease'); return { leaseToken: 'lease-token', expiresAt: '2026-08-01T12:02:00Z' }; }),
      heartbeatLease: vi.fn(),
      releaseLease: vi.fn().mockResolvedValue(undefined),
      saveDocument: vi.fn().mockResolvedValue({ ...document, editSequence: 1 }),
    };
    const catalog: BasicStrategyCatalog = {
      version: {
        id: 'catalog-id', languageVersion: 'basic/v1', schemaVersion: 'schema/v1', catalogVersion: 'catalog/v1',
        dataRequirementVersion: 'data/v1', definitionHash: 'catalog-hash', publishedAt: '2026-08-01T12:00:00Z', retiredAt: null,
      },
      elements: [],
      features: [],
      instruments: [
        { id: 'aapl-id', assetType: 'STOCK', primaryExchangeMic: 'XNAS', currencyCode: 'USD', symbol: 'AAPL' },
        { id: 'spy-id', assetType: 'ETF', primaryExchangeMic: 'ARCX', currencyCode: 'USD', symbol: 'SPY' },
      ],
    };
    const catalogClient: StrategyCatalogClient = { getBasic: vi.fn().mockResolvedValue(catalog) };

    const { unmount } = render(<BasicEditor blank goBack={() => {}} strategyId="strategy-id" authoringClient={authoringClient} catalogClient={catalogClient} />);
    await waitFor(() => expect(catalogClient.getBasic).toHaveBeenCalledWith(expect.any(AbortSignal)));
    await user.click(screen.getByRole('button', { name: 'PARTITION 01 종목 관리' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '추가할 종목' }), 'spy-id');
    await user.click(screen.getByRole('button', { name: '종목 추가' }));
    expect(screen.getByRole('dialog', { name: 'PARTITION 1 종목 관리' })).toHaveTextContent('SPY');
    expect(loadOrder).toEqual(['document', 'lease']);
    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));
    expect(screen.getByTestId('strategy-preview-unavailable')).toHaveTextContent('실제 시장 데이터 기반 미리보기만 표시합니다.');
    expect(screen.queryByTestId('strategy-preview-canvas')).not.toBeInTheDocument();
    const save = screen.getByRole('button', { name: '저장' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(authoringClient.saveDocument).toHaveBeenCalledWith('strategy-id', expect.objectContaining({
      expectedEditSequence: 0,
      leaseToken: 'lease-token',
      semanticDocument: { mode: 'BASIC', groups: [] },
      presentationDocument: expect.objectContaining({
        basicEditor: expect.objectContaining({
          version: 1,
          snapshot: expect.objectContaining({
            sections: [expect.objectContaining({ symbol: 'SPY', instrumentIds: ['spy-id'] })],
          }),
        }),
      }),
    })));
    unmount();
    await waitFor(() => expect(authoringClient.releaseLease).toHaveBeenCalledWith('strategy-id', 'lease-token'));
  });

  test('distinguishes a missing strategy from a transport failure', async () => {
    const authoringClient = {
      createBasic: vi.fn(),
      getDocument: vi.fn().mockRejectedValue(new (await import('./api/strategies')).StrategyApiError(404, 'document')),
      acquireLease: vi.fn(), heartbeatLease: vi.fn(), releaseLease: vi.fn(), saveDocument: vi.fn(),
    } as StrategyAuthoringClient;

    render(<BasicEditor blank goBack={() => {}} strategyId="missing" authoringClient={authoringClient} catalogClient={null} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('전략을 찾을 수 없습니다.');
    expect(screen.queryByText('전략을 불러오지 못했습니다.')).not.toBeInTheDocument();
    expect(authoringClient.acquireLease).not.toHaveBeenCalled();
  });
});
