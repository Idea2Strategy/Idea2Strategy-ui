import { describe, expect, test } from 'vitest';
import type { BasicStrategyCatalog } from './api/strategies';
import { buildBasicSemanticDocument } from './views/StrategyViews';

const catalog = {
  version: { id: '0f4a0000-0000-4000-8000-000000000001' },
} as BasicStrategyCatalog;

const block = (id: string, label: string, op: string, value: string, base?: string) => ({
  id, label, op, value, base, tone: 'condition',
});

describe('published Basic catalog coverage', () => {
  test('serializes every visible block, edited variable, schedule and terminal action', () => {
    const snapshot = {
      sections: [
        {
          id: 'section-1', symbol: 'AAPL · MSFT', instrumentIds: ['instrument-aapl', 'instrument-msft'],
          allocation: 70, timeframe: '4시간봉', x: 0, y: 0,
          cards: { buy: ['buy-1'], sell: ['sell-1'], risk: [] }, cardOrder: ['buy-1', 'sell-1'], cardPositions: {},
        },
        {
          id: 'section-2', symbol: 'SPY', instrumentIds: ['instrument-spy'],
          allocation: 30, timeframe: '일봉', x: 0, y: 0,
          cards: { buy: ['buy-2'], sell: ['sell-2'], risk: [] }, cardOrder: ['buy-2', 'sell-2'], cardPositions: {},
        },
      ],
      cardBlocks: {
        'buy-1': [
          block('price', '가격 비교', '>', '이전 60봉 최고 가격'),
          block('change', '가격 변화율', '상승', '3.5%', '당일 장 시작가'),
          block('volume', '거래량', '>', '최근 20봉 평균 거래량 3배'),
          block('streak', '연속 상승·하락', '↓', '10봉'),
          block('sma', '평균선 교차', '↑', '20봉 · 60봉'),
        ],
        'sell-1': [
          block('rsi', 'RSI 반등', '↓', '72'),
          block('macd', 'MACD 전환', '↓', '12 · 26 · 9'),
          block('band', '가격 띠 반전', '↓', '20봉 · 2σ'),
          block('return', '현재 수익률', '손실', '4.25%'),
          block('holding', '보유 기간', '≥', '5거래일'),
        ],
        'buy-2': [],
        'sell-2': [
          block('peak', '최고 수익률', '>', '12%'),
          block('drawdown', '고점 대비 하락', '>', '6.5%'),
        ],
      },
      cardMeta: {},
      buySettings: {
        'buy-1': { maxOrderPercent: 35, entryMode: '대기 후 재진입', cycle: '매 거래일', cycleInterval: 2, reentryWait: 'N봉 이후', reentryInterval: 3, maxEntries: 4 },
        'buy-2': { maxOrderPercent: 20, entryMode: '주기마다', cycle: 'N거래일마다', cycleInterval: 5, reentryWait: '조건 재충족', reentryInterval: 1, maxEntries: 8 },
      },
      sellSettings: {
        'sell-1': { sellPercent: 60, executeMode: '대기 후 재실행', reexecWait: 'N거래일 이후', reexecInterval: 2, maxExecutions: 3 },
        'sell-2': { sellPercent: 100, executeMode: '1회만', reexecWait: '조건 재충족', reexecInterval: 1, maxExecutions: 1 },
      },
      symbolLimits: { 'section-1': { AAPL: 25, MSFT: 40 }, 'section-2': { SPY: 50 } },
    } as unknown as Parameters<typeof buildBasicSemanticDocument>[0];

    const semantic = buildBasicSemanticDocument(snapshot, catalog) as {
      groups: Array<{ id: string; instrumentIds: string[]; blocks: Array<{ elementCode: string; parameters: Record<string, string> }> }>;
    };
    const conditionBlocks = semantic.groups.flatMap((group) => group.blocks)
      .filter((entry) => !['BASIC_SCHEDULE', 'BASIC_EQUAL_ALLOCATION_ORDER'].includes(entry.elementCode));

    expect(conditionBlocks.map((entry) => entry.elementCode)).toEqual([
      'BASIC_PRICE_COMPARE', 'BASIC_PRICE_CHANGE_PERCENT', 'BASIC_VOLUME_COMPARE', 'BASIC_STREAK',
      'BASIC_SMA_CROSS', 'BASIC_RSI_CROSS', 'BASIC_MACD_CROSS', 'BASIC_BOLLINGER_REVERSAL',
      'BASIC_POSITION_RETURN', 'BASIC_HOLDING_PERIOD', 'BASIC_PEAK_RETURN', 'BASIC_DRAWDOWN_FROM_PEAK',
    ]);
    expect(conditionBlocks.map((entry) => entry.parameters)).toEqual([
      { resolution: '4h', operator: 'GT', reference: 'HIGH_60' },
      { resolution: '4h', base: 'SESSION_OPEN', direction: 'UP', thresholdPercent: '3.5' },
      { resolution: '4h', operator: 'GT', reference: 'AVERAGE_VOLUME', period: '20', multiplier: '3' },
      { resolution: '4h', direction: 'DOWN', bars: '10' },
      { resolution: '4h', direction: 'UP', shortPeriod: '20', longPeriod: '60' },
      { resolution: '4h', direction: 'DOWN', period: '14', threshold: '72' },
      { resolution: '4h', direction: 'DOWN', fastPeriod: '12', slowPeriod: '26', signalPeriod: '9' },
      { resolution: '4h', direction: 'DOWN', period: '20', deviations: '2' },
      { direction: 'LOSS', thresholdPercent: '4.25' },
      { unit: 'TRADING_DAY', amount: '5', resolution: '4h' },
      { operator: 'GT', thresholdPercent: '12' },
      { operator: 'GT', thresholdPercent: '6.5' },
    ]);
    expect(semantic.groups.find((group) => group.id === 'buy-2')?.blocks[0]).toMatchObject({
      elementCode: 'BASIC_SCHEDULE',
      parameters: { cycle: 'EVERY_N_TRADING_DAYS', interval: '5', resolution: '1d' },
    });
    expect(semantic.groups.map((group) => group.instrumentIds)).toEqual([
      ['instrument-aapl', 'instrument-msft'], ['instrument-aapl', 'instrument-msft'],
      ['instrument-spy'], ['instrument-spy'],
    ]);
    expect(semantic.groups.flatMap((group) => group.blocks.filter((entry) => entry.elementCode === 'BASIC_EQUAL_ALLOCATION_ORDER'))).toHaveLength(4);
  });
});
