import type { BasicStrategyCatalog } from '../api/strategies';
import type { MarketTimeframe } from '../api/marketData';

export const BASIC_EXECUTABLE_ELEMENT_CODES = [
  'BASIC_PRICE_COMPARE',
  'BASIC_PRICE_CHANGE_PERCENT',
  'BASIC_VOLUME_COMPARE',
  'BASIC_STREAK',
  'BASIC_SMA_CROSS',
  'BASIC_RSI_CROSS',
  'BASIC_MACD_CROSS',
  'BASIC_BOLLINGER_REVERSAL',
  'BASIC_POSITION_RETURN',
  'BASIC_HOLDING_PERIOD',
  'BASIC_PEAK_RETURN',
  'BASIC_DRAWDOWN_FROM_PEAK',
  'BASIC_SCHEDULE',
  'BASIC_EQUAL_ALLOCATION_ORDER',
] as const;

export type BasicSide = 'buy' | 'sell' | 'risk';
export type BasicBuyCycle = '매 거래일' | '매주 첫 거래일' | '매월 첫 거래일' | '매월 마지막 거래일' | 'N거래일마다';
export type BasicRerunWait = '조건 재충족' | 'N봉 이후' | 'N거래일 이후';

export interface BasicDocumentBlockInput {
  id: string;
  label: string;
  op?: string;
  value?: string;
  base?: string;
  tone: string;
}

export interface BasicDocumentSectionInput {
  id: string;
  symbol: string;
  instrumentIds?: string[];
  allocation?: number;
  timeframe: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  cards: Record<BasicSide, string[]>;
  cardOrder: string[];
  cardPositions?: Record<string, unknown>;
}

export interface BasicDocumentSnapshot {
  sections: BasicDocumentSectionInput[];
  cardBlocks: Record<string, BasicDocumentBlockInput[]>;
  cardMeta?: Record<string, unknown>;
  buySettings: Record<string, {
    maxOrderPercent: number;
    entryMode: '1회만' | '주기마다' | '대기 후 재진입';
    cycle: BasicBuyCycle;
    cycleInterval: number;
    reentryWait: BasicRerunWait;
    reentryInterval: number;
    maxEntries: number;
  }>;
  sellSettings: Record<string, {
    sellPercent: number | '';
    executeMode: '1회만' | '대기 후 재실행';
    reexecWait: BasicRerunWait;
    reexecInterval: number;
    maxExecutions: number;
  }>;
  symbolLimits: Record<string, Record<string, unknown>>;
}

export interface BasicSemanticBlock {
  id: string;
  elementCode: string;
  parameters: Record<string, string>;
}

export interface BasicSemanticConnection {
  fromBlockId: string;
  outputPort: 'passed';
  toBlockId: string;
  inputPort: 'passed';
}

export interface BasicSemanticGroup {
  id: string;
  allocationGroupId: string;
  container: 'BUY' | 'SELL';
  evaluationMode: 'INDEPENDENT';
  allocationMode: 'EQUAL';
  instrumentIds: string[];
  blocks: BasicSemanticBlock[];
  connections: BasicSemanticConnection[];
}

export interface BasicSemanticDocument {
  [key: string]: unknown;
  mode: 'BASIC';
  catalogId: string;
  groups: BasicSemanticGroup[];
}

export interface BasicPositionCapIssue {
  code: 'BASIC_POSITION_CAP_REQUIRED' | 'BASIC_POSITION_CAP_NUMBER_REQUIRED' | 'BASIC_POSITION_CAP_OUT_OF_RANGE';
  location: string;
}

export class BasicDocumentBuildError extends Error {
  constructor(
    readonly code: string,
    readonly location: string,
  ) {
    super(`${code} at ${location}`);
    this.name = 'BasicDocumentBuildError';
  }
}

export const validateMaxPositionPercent = (
  value: unknown,
  sectionId: string,
  symbol: string,
): BasicPositionCapIssue | null => {
  const location = `symbolLimits.${sectionId}.${symbol}`;
  if (value === '' || value === null || value === undefined) {
    return { code: 'BASIC_POSITION_CAP_REQUIRED', location };
  }
  const numeric = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isFinite(numeric)) {
    return { code: 'BASIC_POSITION_CAP_NUMBER_REQUIRED', location };
  }
  if (numeric <= 0 || numeric > 100) {
    return { code: 'BASIC_POSITION_CAP_OUT_OF_RANGE', location };
  }
  return null;
};

const basicCompareOperator = (operator: string | undefined): string => {
  if (operator === '>' || operator === '↑') return 'GT';
  if (operator === '≥') return 'GTE';
  if (operator === '=') return 'EQ';
  return 'LT';
};

const basicDirection = (operator: string | undefined): string => (
  operator === '↑' || operator === '상승' || operator === '수익' ? 'UP' : 'DOWN'
);

const numericParameter = (value: string | undefined): string => String(value ?? '').replace('%', '').trim();
const firstNumber = (value: string | undefined, fallback = 0): number => {
  const match = String(value ?? '').match(/\d+/);
  return match ? Number(match[0]) : fallback;
};
const allNumbers = (value: string | undefined): number[] => (
  [...String(value ?? '').matchAll(/\d+/g)].map((match) => Number(match[0]))
);
export const resolutionCode = (timeframe: string): MarketTimeframe => ({
  '30분봉': '30m', '1시간봉': '1h', '4시간봉': '4h', '일봉': '1d',
}[timeframe] as MarketTimeframe | undefined) ?? '30m';

const priceReferenceCode = (value: string | undefined): string => {
  const exact: Record<string, string> = {
    '전일 종가': 'PREVIOUS_CLOSE',
    '당일 장 시작가': 'SESSION_OPEN',
    '평균 진입가': 'AVERAGE_ENTRY_PRICE',
  };
  if (value && exact[value]) return exact[value];
  const period = firstNumber(value);
  if (value?.includes('평균 가격')) return `SMA_${period}`;
  if (value?.includes('최고 가격')) return `HIGH_${period}`;
  if (value?.includes('최저 가격')) return `LOW_${period}`;
  return '';
};

const volumeReference = (value: string | undefined): Record<string, string> => {
  if (value === '이전 봉 거래량') return { reference: 'PREVIOUS_VOLUME', period: '1', multiplier: '1' };
  const numbers = allNumbers(value);
  return { reference: 'AVERAGE_VOLUME', period: String(numbers[0] ?? 0), multiplier: String(numbers[1] ?? 1) };
};

const scheduleCycleCode = (cycle: BasicBuyCycle): string => ({
  '매 거래일': 'EVERY_TRADING_DAY',
  '매주 첫 거래일': 'WEEK_FIRST_TRADING_DAY',
  '매월 첫 거래일': 'MONTH_FIRST_TRADING_DAY',
  '매월 마지막 거래일': 'MONTH_LAST_TRADING_DAY',
  'N거래일마다': 'EVERY_N_TRADING_DAYS',
}[cycle]);

const blockElement = (block: BasicDocumentBlockInput, resolution: string): Omit<BasicSemanticBlock, 'id'> => {
  const common = { resolution };
  switch (block.label) {
    case '가격 비교':
      return { elementCode: 'BASIC_PRICE_COMPARE', parameters: { ...common, operator: basicCompareOperator(block.op), reference: priceReferenceCode(block.value) } };
    case '가격 변화율':
      return { elementCode: 'BASIC_PRICE_CHANGE_PERCENT', parameters: { ...common, base: priceReferenceCode(block.base), direction: basicDirection(block.op), thresholdPercent: numericParameter(block.value) } };
    case '거래량':
      return { elementCode: 'BASIC_VOLUME_COMPARE', parameters: { ...common, operator: basicCompareOperator(block.op), ...volumeReference(block.value) } };
    case '연속 상승·하락':
      return { elementCode: 'BASIC_STREAK', parameters: { ...common, direction: basicDirection(block.op), bars: String(firstNumber(block.value)) } };
    case '평균선 교차': {
      const [shortPeriod = 0, longPeriod = 0] = allNumbers(block.value);
      return { elementCode: 'BASIC_SMA_CROSS', parameters: { ...common, direction: basicDirection(block.op), shortPeriod: String(shortPeriod), longPeriod: String(longPeriod) } };
    }
    case 'RSI 반등':
      return { elementCode: 'BASIC_RSI_CROSS', parameters: { ...common, direction: basicDirection(block.op), period: '14', threshold: numericParameter(block.value) } };
    case 'MACD 전환': {
      const [fastPeriod = 12, slowPeriod = 26, signalPeriod = 9] = allNumbers(block.value);
      return { elementCode: 'BASIC_MACD_CROSS', parameters: { ...common, direction: basicDirection(block.op), fastPeriod: String(fastPeriod), slowPeriod: String(slowPeriod), signalPeriod: String(signalPeriod) } };
    }
    case '가격 띠 반전': {
      const [period = 20, deviations = 2] = allNumbers(block.value);
      return { elementCode: 'BASIC_BOLLINGER_REVERSAL', parameters: { ...common, direction: basicDirection(block.op), period: String(period), deviations: String(deviations) } };
    }
    case '현재 수익률':
      return { elementCode: 'BASIC_POSITION_RETURN', parameters: { direction: block.op === '수익' ? 'PROFIT' : 'LOSS', thresholdPercent: numericParameter(block.value) } };
    case '보유 기간': {
      const value = String(block.value ?? '');
      const unit = value === '당일 장 마감' ? 'SESSION_CLOSE' : value.includes('거래일') ? 'TRADING_DAY' : 'BAR';
      return { elementCode: 'BASIC_HOLDING_PERIOD', parameters: { unit, amount: String(value === '당일 장 마감' ? 0 : firstNumber(value)), resolution } };
    }
    case '최고 수익률':
      return { elementCode: 'BASIC_PEAK_RETURN', parameters: { operator: basicCompareOperator(block.op), thresholdPercent: numericParameter(block.value) } };
    case '고점 대비 하락':
      return { elementCode: 'BASIC_DRAWDOWN_FROM_PEAK', parameters: { operator: basicCompareOperator(block.op), thresholdPercent: numericParameter(block.value) } };
    default:
      throw new BasicDocumentBuildError('BASIC_UNKNOWN_BLOCK_LABEL', `cardBlocks.${block.id}.label`);
  }
};

const symbolsForSection = (section: BasicDocumentSectionInput): string[] => (
  section.symbol === '종목 선택' ? [] : section.symbol.split(/\s*·\s*/).map((symbol) => symbol.trim()).filter(Boolean)
);

export const buildBasicSemanticDocument = (
  snapshot: BasicDocumentSnapshot,
  catalog: BasicStrategyCatalog,
): BasicSemanticDocument => ({
  mode: 'BASIC',
  catalogId: catalog.version.id,
  groups: snapshot.sections.flatMap((section) => section.cardOrder.flatMap((cardId) => {
    const side = section.cards.buy.includes(cardId) ? 'buy' : section.cards.sell.includes(cardId) ? 'sell' : null;
    if (!side) return [];
    const resolution = resolutionCode(section.timeframe);
    const buy = side === 'buy' ? snapshot.buySettings[cardId] : null;
    const sell = side === 'sell' ? snapshot.sellSettings[cardId] : null;
    const schedule: BasicSemanticBlock[] = buy?.entryMode === '주기마다' ? [{
      id: `${cardId}-schedule`,
      elementCode: 'BASIC_SCHEDULE',
      parameters: { cycle: scheduleCycleCode(buy.cycle), interval: String(buy.cycleInterval), resolution },
    }] : [];
    const conditions: BasicSemanticBlock[] = (snapshot.cardBlocks[cardId] ?? []).map((block) => ({ id: block.id, ...blockElement(block, resolution) }));
    const instruments = section.instrumentIds?.length ? section.instrumentIds : [''];
    const symbols = symbolsForSection(section);

    return instruments.map((instrumentId, instrumentIndex): BasicSemanticGroup => {
      const symbol = symbols[instrumentIndex] ?? symbols[0] ?? instrumentId;
      const rawCap = snapshot.symbolLimits[section.id]?.[symbol] ?? 25;
      const capIssue = validateMaxPositionPercent(rawCap, section.id, symbol);
      if (capIssue) throw new BasicDocumentBuildError(capIssue.code, capIssue.location);
      const orderId = `${cardId}-order`;
      const orderPercent = side === 'buy' ? buy?.maxOrderPercent ?? 100 : sell?.sellPercent ?? '';
      const blocks: BasicSemanticBlock[] = [
        ...schedule,
        ...conditions,
        {
          id: orderId,
          elementCode: 'BASIC_EQUAL_ALLOCATION_ORDER',
          parameters: {
            orderPercent: String(orderPercent),
            maxPositionPercent: String(rawCap).trim(),
            executionMode: side === 'buy' ? buy?.entryMode ?? '1회만' : sell?.executeMode ?? '1회만',
            waitMode: side === 'buy' ? buy?.reentryWait ?? '조건 재충족' : sell?.reexecWait ?? '조건 재충족',
            waitInterval: String(side === 'buy' ? buy?.reentryInterval ?? 1 : sell?.reexecInterval ?? 1),
            maxExecutions: String(side === 'buy' ? buy?.maxEntries ?? 1 : sell?.maxExecutions ?? 1),
          },
        },
      ];
      return {
        id: instrumentId ? `${cardId}:${instrumentId}` : cardId,
        allocationGroupId: cardId,
        container: side.toUpperCase() as 'BUY' | 'SELL',
        evaluationMode: 'INDEPENDENT',
        allocationMode: 'EQUAL',
        instrumentIds: instrumentId ? [instrumentId] : [],
        blocks,
        connections: blocks.slice(0, -1).map((block, index) => ({
          fromBlockId: block.id,
          outputPort: 'passed',
          toBlockId: blocks[index + 1].id,
          inputPort: 'passed',
        })),
      };
    });
  })),
});
