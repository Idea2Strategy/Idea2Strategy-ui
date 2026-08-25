import { describe, expect, test } from 'vitest';
import type { BasicStrategyCatalog } from '../api/strategies';
import {
  BasicDocumentBuildError,
  buildBasicSemanticDocument,
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
