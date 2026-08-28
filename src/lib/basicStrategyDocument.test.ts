import { describe, expect, test } from 'vitest';
import type { BasicStrategyCatalog } from '../api/strategies';
import {
  BasicDocumentBuildError,
  buildBasicSemanticDocument,
  rebuildBasicSnapshot,
  validateMaxPositionPercent,
} from './basicStrategyDocument';
import type { BasicDocumentSnapshot } from './basicStrategyDocument';

const catalog = { version: { id: 'catalog-v2' } } as BasicStrategyCatalog;

const snapshot = (limits: Record<string, number | string> = { AAPL: 25, MSFT: 40 }): BasicDocumentSnapshot => ({
  sections: [{
    id: 'section-1', symbol: 'AAPL · MSFT', instrumentIds: ['instrument-aapl', 'instrument-msft'],
    allocation: 100, timeframe: '1시간봉', x: 0, y: 0,
    cards: { buy: ['buy-1'], sell: [], risk: [] }, cardOrder: ['buy-1'], cardPositions: {},
  }],
  cardBlocks: { 'buy-1': [{ id: 'condition-1', label: 'RSI 반등', op: '↑', value: '37', tone: 'condition' }] },
  cardMeta: {},
  buySettings: {
    'buy-1': { maxOrderPercent: 20, entryMode: '1회만', cycle: '매 거래일', cycleInterval: 1, reentryWait: '조건 재충족', reentryInterval: 1, maxEntries: 1 },
  },
  sellSettings: {},
  symbolLimits: { 'section-1': limits },
});

describe('buildBasicSemanticDocument', () => {
  test('expands a card per instrument and serializes each literal position cap', () => {
    const document = buildBasicSemanticDocument(snapshot(), catalog);

    expect(document.groups.map((group) => ({
      id: group.id,
      allocationGroupId: group.allocationGroupId,
      instrumentIds: group.instrumentIds,
      cap: group.blocks.at(-1)?.parameters.maxPositionPercent,
      threshold: group.blocks[0].parameters.threshold,
      resolution: group.blocks[0].parameters.resolution,
    }))).toEqual([
      { id: 'buy-1:instrument-aapl', allocationGroupId: 'buy-1', instrumentIds: ['instrument-aapl'], cap: '25', threshold: '37', resolution: '1h' },
      { id: 'buy-1:instrument-msft', allocationGroupId: 'buy-1', instrumentIds: ['instrument-msft'], cap: '40', threshold: '37', resolution: '1h' },
    ]);
  });

  test.each([
    ['', 'BASIC_POSITION_CAP_REQUIRED'],
    [0, 'BASIC_POSITION_CAP_OUT_OF_RANGE'],
    [-1, 'BASIC_POSITION_CAP_OUT_OF_RANGE'],
    ['many', 'BASIC_POSITION_CAP_NUMBER_REQUIRED'],
    [100.1, 'BASIC_POSITION_CAP_OUT_OF_RANGE'],
  ])('rejects invalid cap %p at the exact instrument field', (value, code) => {
    expect(validateMaxPositionPercent(value, 'section-1', 'AAPL')).toEqual({
      code,
      location: 'symbolLimits.section-1.AAPL',
    });
  });

  test('rejects an unknown UI label instead of emitting an empty element code', () => {
    const unknown = snapshot();
    unknown.cardBlocks['buy-1'][0].label = '없는 조건';

    expect(() => buildBasicSemanticDocument(unknown, catalog)).toThrow(BasicDocumentBuildError);
    expect(() => buildBasicSemanticDocument(unknown, catalog)).toThrow(/BASIC_UNKNOWN_BLOCK_LABEL/);
  });
});

describe('rebuildBasicSnapshot', () => {
  const officialCatalog = {
    version: { id: 'catalog-v2' },
    instruments: [
      { id: 'instrument-aapl', symbol: 'AAPL' },
      { id: 'instrument-msft', symbol: 'MSFT' },
    ],
  } as BasicStrategyCatalog;

  test('rebuilds a CLI-authored strategy from the canonical semantic document', () => {
    const semanticDocument = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [
        {
          id: 'aapl-buy', allocationGroupId: 'aapl-buy', container: 'BUY',
          evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL', instrumentIds: ['instrument-aapl'],
          blocks: [
            { id: 'aapl-rsi', elementCode: 'BASIC_RSI_CROSS', parameters: { resolution: '1h', direction: 'UP', period: '14', threshold: '37' } },
            { id: 'aapl-order', elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '20', maxPositionPercent: '35', executionMode: '대기 후 재진입', waitMode: 'N봉 이후', waitInterval: '3', maxExecutions: '4' } },
          ],
          connections: [{ fromBlockId: 'aapl-rsi', outputPort: 'passed', toBlockId: 'aapl-order', inputPort: 'passed' }],
        },
        {
          id: 'msft-sell', allocationGroupId: 'msft-sell', container: 'SELL',
          evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL', instrumentIds: ['instrument-msft'],
          blocks: [
            { id: 'msft-macd', elementCode: 'BASIC_MACD_CROSS', parameters: { resolution: '4h', direction: 'DOWN', fastPeriod: '12', slowPeriod: '26', signalPeriod: '9' } },
            { id: 'msft-order', elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '75', maxPositionPercent: '40', executionMode: '대기 후 재실행', waitMode: 'N거래일 이후', waitInterval: '2', maxExecutions: '5' } },
          ],
          connections: [{ fromBlockId: 'msft-macd', outputPort: 'passed', toBlockId: 'msft-order', inputPort: 'passed' }],
        },
      ],
    };
    const legacyPresentation = {
      schemaVersion: 1,
      sections: [
        { id: 'section-aapl', symbol: 'AAPL', instrumentIds: ['instrument-aapl'], timeframe: '1시간봉', cards: { buy: ['aapl-buy'], sell: [], risk: [] }, cardOrder: ['aapl-buy'], cardPositions: {} },
        { id: 'section-msft', symbol: 'MSFT', instrumentIds: ['instrument-msft'], timeframe: '4시간봉', cards: { buy: [], sell: ['msft-sell'], risk: [] }, cardOrder: ['msft-sell'], cardPositions: {} },
      ],
    };

    const rebuilt = rebuildBasicSnapshot(semanticDocument, legacyPresentation, officialCatalog);

    expect(rebuilt).not.toBeNull();
    expect(rebuilt?.sections).toEqual([
      expect.objectContaining({ id: 'section-aapl', symbol: 'AAPL', timeframe: '1시간봉', cards: { buy: ['aapl-buy'], sell: [], risk: [] } }),
      expect.objectContaining({ id: 'section-msft', symbol: 'MSFT', timeframe: '4시간봉', cards: { buy: [], sell: ['msft-sell'], risk: [] } }),
    ]);
    expect(rebuilt?.cardBlocks['aapl-buy']).toEqual([
      expect.objectContaining({ id: 'aapl-rsi', label: 'RSI 반등', op: '↑', value: '37' }),
    ]);
    expect(rebuilt?.buySettings['aapl-buy']).toMatchObject({ maxOrderPercent: 20, entryMode: '대기 후 재진입', reentryWait: 'N봉 이후', reentryInterval: 3, maxEntries: 4 });
    expect(rebuilt?.cardBlocks['msft-sell']).toEqual([
      expect.objectContaining({ id: 'msft-macd', label: 'MACD 전환', op: '↓', value: '12 · 26 · 9' }),
    ]);
    expect(rebuilt?.sellSettings['msft-sell']).toMatchObject({ sellPercent: 75, executeMode: '대기 후 재실행', reexecWait: 'N거래일 이후', reexecInterval: 2, maxExecutions: 5 });
    expect(rebuilt?.symbolLimits).toEqual({ 'section-aapl': { AAPL: 35 }, 'section-msft': { MSFT: 40 } });
  });

  test('round-trips multiple buy and sell cards as independent executable groups', () => {
    const source = snapshot();
    source.sections[0].cards = { buy: ['buy-1', 'buy-2'], sell: ['sell-1', 'sell-2'], risk: [] };
    source.sections[0].cardOrder = ['buy-1', 'sell-1', 'buy-2', 'sell-2'];
    source.cardBlocks = {
      ...source.cardBlocks,
      'buy-2': [{ id: 'buy-2-rsi', label: 'RSI 반등', op: '↑', value: '42', tone: 'condition' }],
      'sell-1': [
        { id: 'sell-1-rsi', label: 'RSI 반등', op: '↓', value: '68', tone: 'condition' },
        { id: 'sell-1-return', label: '현재 수익률', op: '수익', value: '8', tone: 'risk' },
      ],
      'sell-2': [
        { id: 'sell-2-rsi', label: 'RSI 반등', op: '↓', value: '72', tone: 'condition' },
        { id: 'sell-2-drawdown', label: '고점 대비 하락', op: '>', value: '4', tone: 'risk' },
      ],
    };
    source.buySettings['buy-2'] = { ...source.buySettings['buy-1'], maxOrderPercent: 35 };
    source.sellSettings = {
      'sell-1': { sellPercent: 50, executeMode: '1회만', reexecWait: '조건 재충족', reexecInterval: 1, maxExecutions: 1 },
      'sell-2': { sellPercent: 100, executeMode: '대기 후 재실행', reexecWait: 'N봉 이후', reexecInterval: 3, maxExecutions: 2 },
    };

    const document = buildBasicSemanticDocument(source, catalog);

    expect(document.groups).toHaveLength(8);
    expect(document.groups.map((group) => group.allocationGroupId)).toEqual([
      'buy-1', 'buy-1', 'sell-1', 'sell-1', 'buy-2', 'buy-2', 'sell-2', 'sell-2',
    ]);
    expect(document.groups.map((group) => group.container)).toEqual([
      'BUY', 'BUY', 'SELL', 'SELL', 'BUY', 'BUY', 'SELL', 'SELL',
    ]);
    expect(document.groups.filter((group) => group.allocationGroupId === 'buy-2')[0].blocks[0].parameters.threshold).toBe('42');
    expect(document.groups.filter((group) => group.allocationGroupId === 'sell-2')[0].blocks.at(-1)?.parameters.orderPercent).toBe('100');

    const rebuilt = rebuildBasicSnapshot(document, {}, officialCatalog);
    expect(rebuilt?.sections).toHaveLength(1);
    expect(rebuilt?.sections[0].cards).toEqual({
      buy: ['buy-1', 'buy-2'],
      sell: ['sell-1', 'sell-2'],
      risk: [],
    });
    expect(buildBasicSemanticDocument(rebuilt!, officialCatalog, document)).toEqual(document);
  });

  test('rebuilds a semantic-only CLI strategy and preserves multi-instrument grouping', () => {
    const semanticDocument = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [{
        id: 'buy', allocationGroupId: 'buy', container: 'BUY', evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL',
        instrumentIds: ['instrument-aapl', 'instrument-msft'],
        blocks: [
          { id: 'schedule', elementCode: 'BASIC_SCHEDULE', parameters: { resolution: '30m', cycle: 'EVERY_N_TRADING_DAYS', interval: '3' } },
          { id: 'condition', elementCode: 'BASIC_PRICE_COMPARE', parameters: { resolution: '30m', operator: 'GT', reference: 'PREVIOUS_CLOSE' } },
          { id: 'order', elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '15', maxPositionPercent: '25', executionMode: '주기마다', waitMode: '조건 재충족', waitInterval: '1', maxExecutions: '6' } },
        ],
        connections: [
          { fromBlockId: 'schedule', outputPort: 'passed', toBlockId: 'condition', inputPort: 'passed' },
          { fromBlockId: 'condition', outputPort: 'passed', toBlockId: 'order', inputPort: 'passed' },
        ],
      }],
    };

    const rebuilt = rebuildBasicSnapshot(semanticDocument, {}, officialCatalog);

    expect(rebuilt?.sections).toHaveLength(1);
    expect(rebuilt?.sections[0]).toMatchObject({ symbol: 'AAPL · MSFT', instrumentIds: ['instrument-aapl', 'instrument-msft'], timeframe: '30분봉' });
    expect(rebuilt?.cardBlocks.buy).toEqual([expect.objectContaining({ label: '가격 비교', op: '>', value: '전일 종가' })]);
    expect(rebuilt?.buySettings.buy).toMatchObject({ maxOrderPercent: 15, entryMode: '주기마다', cycle: 'N거래일마다', cycleInterval: 3, maxEntries: 6 });
    expect(rebuilt?.symbolLimits).toEqual({ 'section-1': { AAPL: 25, MSFT: 25 } });

    const saved = buildBasicSemanticDocument(rebuilt!, officialCatalog, semanticDocument);
    expect(saved).toEqual(semanticDocument);

    rebuilt!.cardBlocks.buy[0].op = '≤';
    const edited = buildBasicSemanticDocument(rebuilt!, officialCatalog, semanticDocument);
    expect(edited.groups).toHaveLength(1);
    expect(edited.groups[0]).toMatchObject({
      id: 'buy', allocationGroupId: 'buy', instrumentIds: ['instrument-aapl', 'instrument-msft'],
      blocks: [
        expect.objectContaining({ id: 'schedule' }),
        expect.objectContaining({ id: 'condition', parameters: expect.objectContaining({ operator: 'LTE' }) }),
        expect.objectContaining({ id: 'order' }),
      ],
    });

    rebuilt!.cardBlocks.buy.push({ id: 'new-rsi', label: 'RSI 반등', op: '↑', value: '35', tone: 'condition' });
    const structurallyEdited = buildBasicSemanticDocument(rebuilt!, officialCatalog, semanticDocument);
    expect(structurallyEdited.groups).toHaveLength(1);
    expect(structurallyEdited.groups[0]).toMatchObject({
      id: 'buy', instrumentIds: ['instrument-aapl', 'instrument-msft'],
    });
    expect(structurallyEdited.groups[0].blocks.map((block) => block.id)).toEqual([
      'schedule', 'condition', 'new-rsi', 'order',
    ]);

    rebuilt!.cardBlocks.buy = [{ id: 'replacement-condition', label: '가격 비교', op: '>', value: '전일 종가', tone: 'data' }];
    const replaced = buildBasicSemanticDocument(rebuilt!, officialCatalog, semanticDocument);
    expect(replaced.groups[0].blocks.map((block) => block.id)).toEqual([
      'schedule', 'replacement-condition', 'order',
    ]);
  });

  test.each(['2', '3'])('preserves the runtime multiplier for previous-volume comparisons: %sx', (multiplier) => {
    const semanticDocument = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [{
        id: 'volume-group', allocationGroupId: 'volume-card', container: 'BUY',
        evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL', instrumentIds: ['instrument-aapl'],
        blocks: [
          { id: 'volume-condition', elementCode: 'BASIC_VOLUME_COMPARE', parameters: { resolution: '1h', operator: 'GTE', reference: 'PREVIOUS_VOLUME', period: '1', multiplier } },
          { id: 'volume-order', elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '10', maxPositionPercent: '25', executionMode: '1회만', waitMode: '조건 재충족', waitInterval: '1', maxExecutions: '1' } },
        ],
        connections: [{ fromBlockId: 'volume-condition', outputPort: 'passed', toBlockId: 'volume-order', inputPort: 'passed' }],
      }],
    };

    const rebuilt = rebuildBasicSnapshot(semanticDocument, {}, officialCatalog)!;
    expect(rebuilt.cardBlocks['volume-card'][0]).toMatchObject({ value: `이전 봉 거래량 ${multiplier}배` });
    expect(buildBasicSemanticDocument(rebuilt, officialCatalog, semanticDocument)).toEqual(semanticDocument);
  });

  test('preserves repeated condition execution without inventing a schedule trigger', () => {
    const semanticDocument = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [{
        id: 'buy', allocationGroupId: 'buy', container: 'BUY', evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL',
        instrumentIds: ['instrument-aapl'],
        blocks: [
          { id: 'condition', elementCode: 'BASIC_PRICE_COMPARE', parameters: { resolution: '1h', operator: 'GT', reference: 'PREVIOUS_CLOSE' } },
          { id: 'order', elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '10', maxPositionPercent: '25', executionMode: '주기마다', waitMode: 'N봉 이후', waitInterval: '5', maxExecutions: '20' } },
        ],
        connections: [{ fromBlockId: 'condition', outputPort: 'passed', toBlockId: 'order', inputPort: 'passed' }],
      }],
    };

    const rebuilt = rebuildBasicSnapshot(semanticDocument, {}, officialCatalog)!;
    const rebuiltSemantic = buildBasicSemanticDocument(rebuilt, officialCatalog);

    expect(rebuilt.buySettings.buy.entryMode).toBe('조건 충족마다');
    expect(rebuiltSemantic.groups[0].blocks.map((block) => block.elementCode)).toEqual([
      'BASIC_PRICE_COMPARE', 'BASIC_EQUAL_ALLOCATION_ORDER',
    ]);
    expect(rebuiltSemantic.groups[0].blocks.at(-1)?.parameters.executionMode).toBe('주기마다');
  });

  test('round-trips repeated sell execution used by CLI-authored mixed-resolution strategies', () => {
    const semanticDocument = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [
        ['aapl-buy', 'BUY', 'instrument-aapl', '30m', 'GT'],
        ['aapl-sell', 'SELL', 'instrument-aapl', '30m', 'LT'],
        ['msft-buy', 'BUY', 'instrument-msft', '4h', 'GT'],
        ['msft-sell', 'SELL', 'instrument-msft', '4h', 'LT'],
      ].map(([id, container, instrumentId, resolution, operator]) => ({
        id, allocationGroupId: id, container, evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL',
        instrumentIds: [instrumentId],
        blocks: [
          { id: `${id}-condition`, elementCode: 'BASIC_PRICE_COMPARE', parameters: { resolution, operator, reference: 'PREVIOUS_CLOSE' } },
          { id: `${id}-order`, elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '100', maxPositionPercent: '25', executionMode: '주기마다', waitMode: '조건 재충족', waitInterval: '1', maxExecutions: '100' } },
        ],
        connections: [{ fromBlockId: `${id}-condition`, outputPort: 'passed', toBlockId: `${id}-order`, inputPort: 'passed' }],
      })),
    };

    const rebuilt = rebuildBasicSnapshot(semanticDocument, { positions: {}, viewport: { x: 0, y: 0, zoom: 1 } }, officialCatalog);

    expect(rebuilt).not.toBeNull();
    expect(rebuilt?.sections.map(({ symbol, timeframe }) => ({ symbol, timeframe }))).toEqual([
      { symbol: 'AAPL', timeframe: '30분봉' },
      { symbol: 'MSFT', timeframe: '4시간봉' },
    ]);
    expect(rebuilt?.sellSettings['aapl-sell'].executeMode).toBe('조건 충족마다');
    expect(rebuilt?.sellSettings['msft-sell'].executeMode).toBe('조건 충족마다');
    expect(buildBasicSemanticDocument(rebuilt!, officialCatalog, semanticDocument)).toEqual(semanticDocument);
  });

  test('refuses semantics the Basic editor cannot represent without loss', () => {
    const semanticDocument = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [{
        id: 'future', container: 'BUY', evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL', instrumentIds: ['instrument-aapl'],
        blocks: [{ id: 'future-block', elementCode: 'BASIC_FUTURE_ELEMENT', parameters: {} }], connections: [],
      }],
    };

    expect(rebuildBasicSnapshot(semanticDocument, {}, officialCatalog)).toBeNull();
  });

  test.each([
    [{ id: 'condition', label: '가격 비교', op: '>', value: '이전 20봉 최고 가격', tone: 'data' }],
    [{ id: 'condition', label: '가격 비교', op: '≤', value: '전일 종가', tone: 'data' }],
    [{ id: 'condition', label: '가격 비교', op: '≠', value: '당일 장 시작가', tone: 'data' }],
    [{ id: 'condition', label: '가격 변화율', op: '↑', value: '3%', base: '전일 종가', tone: 'data' }],
    [{ id: 'condition', label: '거래량', op: '≥', value: '최근 20봉 평균 거래량 2배', tone: 'data' }],
    [{ id: 'condition', label: '연속 상승·하락', op: '↓', value: '5봉', tone: 'indicator' }],
    [{ id: 'condition', label: '평균선 교차', op: '↑', value: '20봉 · 60봉', tone: 'indicator' }],
    [{ id: 'condition', label: 'RSI 반등', op: '↓', value: '70', tone: 'condition' }],
    [{ id: 'condition', label: 'MACD 전환', op: '↑', value: '12 · 26 · 9', tone: 'condition' }],
    [{ id: 'condition', label: '가격 띠 반전', op: '↓', value: '20봉 · 2σ', tone: 'condition' }],
    [{ id: 'condition', label: '현재 수익률', op: '수익', value: '8%', tone: 'risk' }],
    [{ id: 'condition', label: '보유 기간', value: '5거래일', tone: 'risk' }],
    [{ id: 'condition', label: '최고 수익률', op: '≥', value: '12%', tone: 'risk' }],
    [{ id: 'condition', label: '고점 대비 하락', op: '>', value: '4%', tone: 'risk' }],
  ])('round-trips every CLI-editable condition through the semantic contract: %o', (block) => {
    const source = snapshot({ AAPL: 25 });
    source.sections[0].symbol = 'AAPL';
    source.sections[0].instrumentIds = ['instrument-aapl'];
    source.sections[0].cards = { buy: ['buy-1'], sell: [], risk: [] };
    source.sections[0].cardOrder = ['buy-1'];
    source.cardBlocks['buy-1'] = [block];
    const semantic = buildBasicSemanticDocument(source, officialCatalog);

    const rebuilt = rebuildBasicSnapshot(semantic, {}, officialCatalog);

    expect(rebuilt?.cardBlocks['buy-1']).toEqual([block]);
  });

  test('refuses a semantic document pinned to a different catalog', () => {
    const source = snapshot({ AAPL: 25 });
    source.sections[0].symbol = 'AAPL';
    source.sections[0].instrumentIds = ['instrument-aapl'];
    const semantic = buildBasicSemanticDocument(source, officialCatalog);
    semantic.catalogId = 'retired-catalog';

    expect(rebuildBasicSnapshot(semantic, {}, officialCatalog)).toBeNull();
  });

  test.each([
    ['BUY', '1회만', true],
    ['BUY', '대기 후 재실행', false],
    ['SELL', '주기마다', true],
  ])('refuses an unrepresentable schedule/execution combination: %s %s schedule=%s', (container, executionMode, withSchedule) => {
    const blocks = [
      ...(withSchedule ? [{ id: 'schedule', elementCode: 'BASIC_SCHEDULE', parameters: { resolution: '30m', cycle: 'EVERY_TRADING_DAY', interval: '1' } }] : []),
      { id: 'condition', elementCode: 'BASIC_PRICE_COMPARE', parameters: { resolution: '30m', operator: 'GT', reference: 'PREVIOUS_CLOSE' } },
      { id: 'order', elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '10', maxPositionPercent: '25', executionMode, waitMode: '조건 재충족', waitInterval: '1', maxExecutions: '2' } },
    ];
    const semantic = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [{
        id: 'group', container, evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL', instrumentIds: ['instrument-aapl'], blocks,
        connections: blocks.slice(0, -1).map((block, index) => ({ fromBlockId: block.id, outputPort: 'passed', toBlockId: blocks[index + 1].id, inputPort: 'passed' })),
      }],
    };

    expect(rebuildBasicSnapshot(semantic, {}, officialCatalog)).toBeNull();
  });

  test.each([
    ['waitMode', '나중에'],
    ['waitInterval', '0'],
    ['maxExecutions', 'many'],
  ])('refuses invalid execution control %s=%s instead of silently changing it', (key, value) => {
    const semantic = {
      mode: 'BASIC', catalogId: 'catalog-v2', groups: [{
        id: 'group', allocationGroupId: 'group', container: 'BUY', evaluationMode: 'INDEPENDENT', allocationMode: 'EQUAL',
        instrumentIds: ['instrument-aapl'],
        blocks: [
          { id: 'condition', elementCode: 'BASIC_PRICE_COMPARE', parameters: { resolution: '30m', operator: 'GT', reference: 'PREVIOUS_CLOSE' } },
          { id: 'order', elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: { orderPercent: '10', maxPositionPercent: '25', executionMode: '1회만', waitMode: '조건 재충족', waitInterval: '1', maxExecutions: '2', [key]: value } },
        ],
        connections: [{ fromBlockId: 'condition', outputPort: 'passed', toBlockId: 'order', inputPort: 'passed' }],
      }],
    };

    expect(rebuildBasicSnapshot(semantic, {}, officialCatalog)).toBeNull();
  });
});
