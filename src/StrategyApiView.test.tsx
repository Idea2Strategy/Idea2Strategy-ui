import { render as renderBare, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { ReactElement } from 'react';

// Views navigate to /login for sign-in states, so every render needs a router.
const render = (ui: ReactElement) => renderBare(<MemoryRouter>{ui}</MemoryRouter>);
import userEvent from '@testing-library/user-event';
import { describe, expect, test, vi } from 'vitest';
import type { BasicStrategyCatalog, StrategyAuthoringClient, StrategyCatalogClient, StrategyDocument, StrategyLibraryClient } from './api/strategies';
import type { MarketDataClient } from './api/marketData';
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
          blockCount: 2,
          symbols: ['AAPL'],
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

  test('copies an owned draft before opening the independent document', async () => {
    const user = userEvent.setup();
    const openEditor = vi.fn();
    const client: StrategyLibraryClient = {
      list: vi.fn().mockResolvedValue({
        items: [{
          id: 'source-id', kind: 'draft', mode: 'BASIC', name: '원본 전략', description: null,
          status: 'DRAFT', validationStatus: 'VALID', backtestStatus: null, editable: true,
          updatedAt: '2026-08-01T12:00:00Z', version: null, blockCount: 2, symbols: ['AAPL'],
        }],
        nextCursor: null,
        hasMore: false,
      }),
    };
    const authoringClient = {
      copyStrategy: vi.fn().mockResolvedValue({ id: 'copy-id' }),
    } as unknown as StrategyAuthoringClient;

    render(<StrategyHome openEditor={openEditor} client={client} authoringClient={authoringClient} />);
    await user.click(await screen.findByRole('button', { name: '원본 전략 복사' }));

    await waitFor(() => expect(openEditor).toHaveBeenCalledWith('basic', false, 'copy-id'));
    expect(authoringClient.copyStrategy).toHaveBeenCalledWith('source-id');
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
      copyStrategy: vi.fn(),
      getDocument: vi.fn().mockImplementation(async () => { loadOrder.push('document'); return document; }),
      acquireLease: vi.fn().mockImplementation(async () => { loadOrder.push('lease'); return { leaseToken: 'lease-token', expiresAt: '2026-08-01T12:02:00Z' }; }),
      heartbeatLease: vi.fn(),
      releaseLease: vi.fn().mockResolvedValue(undefined),
      saveDocument: vi.fn().mockResolvedValue({ ...document, editSequence: 1 }),
      validateStrategy: vi.fn(),
      getReleaseInputs: vi.fn(),
      releaseStrategy: vi.fn(),
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
    const marketDataClient: MarketDataClient = {
      getRecentBars: vi.fn().mockResolvedValue({
        instrumentId: 'spy-id', symbol: 'SPY', timeframe: '1m',
        bars: [
          { eventId: 'bar-1', occurredAt: '2026-08-07T11:58:00Z', sequence: 1, revision: 0, open: 100, high: 102, low: 99, close: 101, volume: 1000, provider: 'alpaca', feed: 'sip' },
          { eventId: 'bar-2', occurredAt: '2026-08-07T11:59:00Z', sequence: 2, revision: 0, open: 101, high: 103, low: 100, close: 102, volume: 1100, provider: 'alpaca', feed: 'sip' },
        ],
      }),
      streamBars: vi.fn(),
    };

    const { unmount } = render(<BasicEditor blank goBack={() => {}} strategyId="strategy-id" authoringClient={authoringClient} catalogClient={catalogClient} marketDataClient={marketDataClient} />);
    await waitFor(() => expect(catalogClient.getBasic).toHaveBeenCalledWith(expect.any(AbortSignal)));
    await user.click(screen.getByRole('button', { name: 'PARTITION 01 종목 관리' }));
    await user.selectOptions(screen.getByRole('combobox', { name: '추가할 종목' }), 'spy-id');
    await user.click(screen.getByRole('button', { name: '종목 추가' }));
    expect(screen.getByRole('dialog', { name: 'PARTITION 1 종목 관리' })).toHaveTextContent('SPY');
    expect(loadOrder).toEqual(['document', 'lease']);
    await user.click(screen.getByRole('button', { name: '완료' }));
    await user.click(screen.getByRole('button', { name: 'PARTITION 01 전략 미리보기' }));
    expect(await screen.findByTestId('strategy-preview-canvas')).toBeInTheDocument();
    expect(marketDataClient.getRecentBars).toHaveBeenCalledWith('spy-id', 300, expect.any(AbortSignal));
    const save = screen.getByRole('button', { name: '저장' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(authoringClient.saveDocument).toHaveBeenCalledWith('strategy-id', expect.objectContaining({
      expectedEditSequence: 0,
      leaseToken: 'lease-token',
      semanticDocument: { mode: 'BASIC', catalogId: 'catalog-id', groups: [] },
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

  test('saves a real Basic document, validates that revision, and releases with server-owned inputs', async () => {
    const user = userEvent.setup();
    const onLaunchBot = vi.fn();
    const strategyId = '20000000-0000-4000-8000-000000000001';
    const catalogId = '0f1a0000-0000-4000-8000-000000000001';
    const presentationDocument = {
      basicEditor: {
        version: 1,
        snapshot: {
          sections: [{
            id: 'section-1', symbol: 'AAPL', instrumentIds: ['aapl-id'], allocation: 100,
            timeframe: '1분봉', x: 290, y: 108,
            cards: { buy: ['buy-card'], sell: [], risk: [] }, cardOrder: ['buy-card'],
            cardPositions: { 'buy-card': { x: 24, y: 136 } },
          }],
          cardBlocks: { 'buy-card': [{ id: 'rsi-condition', label: 'RSI 반등', op: '↓', value: '30', tone: 'condition' }] },
          cardMeta: { 'buy-card': { title: 'RSI 매수', detail: '종목별 평가', explanation: '' } },
          buySettings: { 'buy-card': { maxOrderPercent: 100, entryMode: '1회만', cycle: '매 거래일', cycleInterval: 2, reentryWait: '조건 재충족', reentryInterval: 1, maxEntries: 2 } },
          sellSettings: {}, symbolLimits: { 'section-1': { AAPL: 100 } },
        },
        viewport: { pan: { x: 0, y: 0 }, zoom: 1 },
      },
    };
    const document: StrategyDocument = {
      strategyId, semanticDocument: { mode: 'BASIC', groups: [] }, presentationDocument,
      semanticSchemaVersion: 'basic-semantic/v1', presentationSchemaVersion: 'basic-presentation/v1',
      semanticHash: 'old-hash', presentationHash: 'presentation-hash', editSequence: 0,
      updatedAt: '2026-08-07T12:00:00Z',
    };
    const validation = {
      validationRunId: '21000000-0000-4000-8000-000000000001', strategyId, status: 'VALID' as const,
      requestedEditSequence: 1, semanticHash: 'new-hash', elementCatalogVersionId: catalogId,
      findings: [], completedAt: '2026-08-07T12:01:00Z',
    };
    const releaseInputs = {
      executionPolicies: [{
        version: 'policy-v1', brokerRulesVersion: 'market-v1', accountingRulesVersion: 'accounting-v1',
        precisionRulesVersion: 'precision-v1', feePolicyId: 'fee-id', feeRateBps: 20,
        buyingPowerBufferPolicyId: 'buffer-id', buyingPowerBufferBps: 1,
      }],
      datasets: [{
        id: 'dataset-id', feedCode: 'alpaca-sip', dataLayer: 'ADJUSTED', resolution: '1m',
        periodStart: '2025-01-01', periodEnd: '2026-01-01', schemaVersion: 'market-bars-v2',
      }],
      observedAt: '2026-08-07T12:01:00Z',
    };
    const authoringClient: StrategyAuthoringClient = {
      createBasic: vi.fn(), copyStrategy: vi.fn(), getDocument: vi.fn().mockResolvedValue(document),
      acquireLease: vi.fn().mockResolvedValue({ leaseToken: 'lease-token', expiresAt: '2026-08-07T12:02:00Z' }),
      heartbeatLease: vi.fn(), releaseLease: vi.fn().mockResolvedValue(undefined),
      saveDocument: vi.fn().mockImplementation(async (_id, input) => ({
        ...document, semanticDocument: input.semanticDocument, presentationDocument: input.presentationDocument,
        semanticHash: 'new-hash', editSequence: 1,
      })),
      validateStrategy: vi.fn().mockResolvedValue(validation),
      getReleaseInputs: vi.fn().mockResolvedValue(releaseInputs),
      releaseStrategy: vi.fn().mockResolvedValue({ botId: 'bot-id', backtestLane: 'BASIC' }),
    };
    const element = (elementCode: string) => ({
      id: `${elementCode}-id`, catalogId, elementCode, elementKind: 'BLOCK', parameterSchema: {},
      inputPortSchema: {}, outputPortSchema: {}, executionContract: {}, definitionHash: `${elementCode}-hash`,
    });
    const catalog: BasicStrategyCatalog = {
      version: { id: catalogId, languageVersion: 'basic/v1', schemaVersion: 'basic-semantic/v1', catalogVersion: 'basic-elements:2026-08-04', dataRequirementVersion: 'alpaca-sip/v1', definitionHash: 'catalog-hash', publishedAt: '2026-08-04T00:00:00Z', retiredAt: null },
      elements: [element('BASIC_RSI_READ'), element('BASIC_VALUE_COMPARE'), element('BASIC_EQUAL_ALLOCATION_ORDER')],
      features: [], instruments: [{ id: 'aapl-id', assetType: 'STOCK', primaryExchangeMic: 'XNAS', currencyCode: 'USD', symbol: 'AAPL' }],
    };

    render(<BasicEditor goBack={() => {}} strategyId={strategyId} authoringClient={authoringClient} catalogClient={{ getBasic: vi.fn().mockResolvedValue(catalog) }} onLaunchBot={onLaunchBot} />);
    const save = await screen.findByRole('button', { name: '저장' });
    await waitFor(() => expect(save).toBeEnabled());
    await user.click(save);

    await waitFor(() => expect(authoringClient.validateStrategy).toHaveBeenCalledWith(strategyId, catalogId));
    const savedInput = vi.mocked(authoringClient.saveDocument).mock.calls[0][1];
    expect(savedInput.semanticDocument).toMatchObject({
      mode: 'BASIC', catalogId,
      groups: [expect.objectContaining({
        id: 'buy-card', container: 'BUY', instrumentIds: ['aapl-id'],
        blocks: [
          expect.objectContaining({ elementCode: 'BASIC_RSI_READ', parameters: { resolution: '1m' } }),
          expect.objectContaining({ elementCode: 'BASIC_VALUE_COMPARE', parameters: { operator: 'LT', threshold: '30' } }),
          expect.objectContaining({ elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER' }),
        ],
      })],
    });
    await user.click(screen.getByRole('button', { name: '개인 봇 출시' }));
    expect(await screen.findByRole('combobox', { name: '실행 정책' })).toHaveValue('policy-v1');
    await user.click(screen.getByRole('button', { name: '봇 출시하기' }));

    await waitFor(() => expect(authoringClient.releaseStrategy).toHaveBeenCalledWith(strategyId, expect.objectContaining({
      validationRunId: validation.validationRunId,
      datasetManifestId: 'dataset-id', executionPolicyVersion: 'policy-v1',
      feePolicyId: 'fee-id', buyingPowerBufferPolicyId: 'buffer-id',
    })));
    expect(onLaunchBot).toHaveBeenCalledWith({ name: '', description: '', botId: 'bot-id' });
  });

  test('distinguishes a missing strategy from a transport failure', async () => {
    const authoringClient = {
      createBasic: vi.fn(),
      copyStrategy: vi.fn(),
      getDocument: vi.fn().mockRejectedValue(new (await import('./api/strategies')).StrategyApiError(404, 'document')),
      acquireLease: vi.fn(), heartbeatLease: vi.fn(), releaseLease: vi.fn(), saveDocument: vi.fn(), validateStrategy: vi.fn(), getReleaseInputs: vi.fn(), releaseStrategy: vi.fn(),
    } as StrategyAuthoringClient;

    render(<BasicEditor blank goBack={() => {}} strategyId="missing" authoringClient={authoringClient} catalogClient={null} />);

    expect(await screen.findByRole('alert')).toHaveTextContent('전략을 찾을 수 없습니다.');
    expect(screen.queryByText('전략을 불러오지 못했습니다.')).not.toBeInTheDocument();
    expect(authoringClient.acquireLease).not.toHaveBeenCalled();
  });
});
