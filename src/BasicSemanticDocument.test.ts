import { describe, expect, test } from 'vitest';
import type { BasicStrategyCatalog } from './api/strategies';
import { buildBasicSemanticDocument } from './views/StrategyViews';

const catalog = {
  version: {
    id: 'catalog-full', languageVersion: 'basic/v1', schemaVersion: 'basic-semantic/v1',
    catalogVersion: 'basic-elements:full', dataRequirementVersion: 'alpaca-sip/v1',
    definitionHash: 'hash', publishedAt: '2026-08-07T00:00:00Z', retiredAt: null,
  },
  elements: [], features: [], instruments: [],
} satisfies BasicStrategyCatalog;

describe('Basic semantic document catalog parity', () => {
  test('serializes every editor-visible block into an executable catalog element', () => {
    const snapshot = {
      sections: [{
        id: 'section-1', symbol: 'AAPL', instrumentIds: ['instrument-aapl'], allocation: 100,
        timeframe: '1분봉', x: 0, y: 0,
        cards: { buy: ['buy'], sell: ['sell'], risk: [] },
        cardOrder: ['buy', 'sell'], cardPositions: { buy: { x: 0, y: 0 }, sell: { x: 1, y: 0 } },
      }],
      cardBlocks: {
        buy: [
          { id: 'price', label: '가격 비교', op: '>', value: '최근 20봉 평균 가격', tone: 'data' },
          { id: 'change', label: '가격 변화율', base: '전일 종가', op: '상승', value: '2', tone: 'data' },
          { id: 'volume', label: '거래량', op: '>', value: '최근 20봉 평균 거래량 2배', tone: 'data' },
          { id: 'streak', label: '연속 상승·하락', op: '↑', value: '3봉', tone: 'indicator' },
          { id: 'sma', label: '평균선 교차', op: '↑', value: '5봉 · 20봉', tone: 'indicator' },
          { id: 'rsi', label: 'RSI 반등', op: '↑', value: '30', tone: 'condition' },
          { id: 'macd', label: 'MACD 전환', op: '↑', value: '12 · 26 · 9', tone: 'condition' },
          { id: 'band', label: '가격 띠 반전', op: '↑', value: '20봉 · 2σ', tone: 'condition' },
        ],
        sell: [
          { id: 'return', label: '현재 수익률', op: '수익', value: '5', tone: 'risk' },
          { id: 'holding', label: '보유 기간', op: '≥', value: '5봉', tone: 'risk' },
          { id: 'peak', label: '최고 수익률', op: '>', value: '10', tone: 'risk' },
          { id: 'drawdown', label: '고점 대비 하락', op: '>', value: '3', tone: 'risk' },
        ],
      },
      cardMeta: {},
      buySettings: { buy: { maxOrderPercent: 80, entryMode: '1회만', cycle: '매 거래일', cycleInterval: 2, reentryWait: '조건 재충족', reentryInterval: 1, maxEntries: 2 } },
      sellSettings: { sell: { sellPercent: 100, executeMode: '1회만', reexecWait: '조건 재충족', reexecInterval: 1, maxExecutions: 2 } },
      symbolLimits: { 'section-1': { AAPL: 100 } },
    };

    const document = buildBasicSemanticDocument(snapshot as never, catalog) as { groups: Array<{ blocks: Array<{ elementCode: string; parameters: Record<string, unknown> }> }> };

    expect(document.groups).toHaveLength(2);
    expect(document.groups[0].blocks.map((block) => block.elementCode)).toEqual([
      'BASIC_PRICE_COMPARE',
      'BASIC_PRICE_CHANGE_PERCENT',
      'BASIC_VOLUME_COMPARE',
      'BASIC_STREAK',
      'BASIC_SMA_CROSS',
      'BASIC_RSI_CROSS',
      'BASIC_MACD_CROSS',
      'BASIC_BOLLINGER_REVERSAL',
      'BASIC_EQUAL_ALLOCATION_ORDER',
    ]);
    expect(document.groups[1].blocks.map((block) => block.elementCode)).toEqual([
      'BASIC_POSITION_RETURN',
      'BASIC_HOLDING_PERIOD',
      'BASIC_PEAK_RETURN',
      'BASIC_DRAWDOWN_FROM_PEAK',
      'BASIC_EQUAL_ALLOCATION_ORDER',
    ]);
    expect(document.groups[0].blocks.at(-1)?.parameters).toMatchObject({ orderPercent: '80' });
    expect(document.groups[1].blocks.at(-1)?.parameters).toMatchObject({ orderPercent: '100' });
  });

  test('serializes a scheduled package as a server-side schedule trigger', () => {
    const snapshot = {
      sections: [{
        id: 'section-1', symbol: 'SPY', instrumentIds: ['instrument-spy'], allocation: 100,
        timeframe: '1분봉', x: 0, y: 0,
        cards: { buy: ['scheduled'], sell: [], risk: [] }, cardOrder: ['scheduled'],
        cardPositions: { scheduled: { x: 0, y: 0 } },
      }],
      cardBlocks: { scheduled: [] }, cardMeta: {},
      buySettings: { scheduled: { maxOrderPercent: 25, entryMode: '주기마다', cycle: '매월 첫 거래일', cycleInterval: 1, reentryWait: '조건 재충족', reentryInterval: 1, maxEntries: 60 } },
      sellSettings: {}, symbolLimits: { 'section-1': { SPY: 100 } },
    };

    const document = buildBasicSemanticDocument(snapshot as never, catalog) as { groups: Array<{ blocks: Array<{ elementCode: string; parameters: Record<string, unknown> }> }> };

    expect(document.groups[0].blocks).toEqual(expect.arrayContaining([
      expect.objectContaining({ elementCode: 'BASIC_SCHEDULE', parameters: expect.objectContaining({ cycle: 'MONTH_FIRST_TRADING_DAY' }) }),
      expect.objectContaining({ elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER', parameters: expect.objectContaining({ orderPercent: '25' }) }),
    ]));
  });
});
