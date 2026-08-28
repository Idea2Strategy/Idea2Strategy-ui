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
  cardMeta: Record<string, { title: string; detail: string; explanation: string }>;
  buySettings: Record<string, {
    maxOrderPercent: number;
    entryMode: '1회만' | '조건 충족마다' | '주기마다' | '대기 후 재진입';
    cycle: BasicBuyCycle;
    cycleInterval: number;
    reentryWait: BasicRerunWait;
    reentryInterval: number;
    maxEntries: number;
  }>;
  sellSettings: Record<string, {
    sellPercent: number | '';
    executeMode: '1회만' | '조건 충족마다' | '대기 후 재실행';
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
  if (operator === '≤') return 'LTE';
  if (operator === '≠') return 'NEQ';
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

const timeframeLabel = (resolution: string): string | null => ({
  '30m': '30분봉', '1h': '1시간봉', '4h': '4시간봉', '1d': '일봉',
}[resolution] ?? null);

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
  if (value?.startsWith('이전 봉 거래량')) {
    return { reference: 'PREVIOUS_VOLUME', period: '1', multiplier: String(firstNumber(value, 1)) };
  }
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
  previousSemanticDocument?: unknown,
): BasicSemanticDocument => preserveBasicSemanticProvenance({
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
            executionMode: side === 'buy'
              ? buy?.entryMode === '조건 충족마다' ? '주기마다' : buy?.entryMode ?? '1회만'
              : sell?.executeMode === '조건 충족마다' ? '주기마다' : sell?.executeMode ?? '1회만',
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
}, previousSemanticDocument);

const semanticShapeWithoutIds = (group: BasicSemanticGroup): string => JSON.stringify({
  container: group.container,
  evaluationMode: group.evaluationMode,
  allocationMode: group.allocationMode,
  blocks: group.blocks.map((block) => ({ elementCode: block.elementCode, parameters: block.parameters })),
});

/** Preserve unaffected CLI/server group boundaries and stable execution IDs across UI edits. */
function preserveBasicSemanticProvenance(
  next: BasicSemanticDocument,
  previousValue: unknown,
): BasicSemanticDocument {
  const previous = record(previousValue);
  if (previous?.mode !== 'BASIC' || previous.catalogId !== next.catalogId || !Array.isArray(previous.groups)) return next;
  const previousGroups = previous.groups.map((value) => record(value));
  if (previousGroups.some((group) => !group || typeof group.allocationGroupId !== 'string'
    || typeof group.id !== 'string' || !Array.isArray(group.instrumentIds)
    || !Array.isArray(group.blocks))) return next;

  const nextByAllocation = new Map<string, BasicSemanticGroup[]>();
  next.groups.forEach((group) => nextByAllocation.set(group.allocationGroupId, [
    ...(nextByAllocation.get(group.allocationGroupId) ?? []), group,
  ]));
  const restored: BasicSemanticGroup[] = [];
  const assigned = new Set<string>();
  for (const oldGroup of previousGroups) {
    const allocationGroupId = oldGroup!.allocationGroupId as string;
    const candidates = nextByAllocation.get(allocationGroupId);
    if (!candidates) continue;
    const activeInstrumentIds = (oldGroup!.instrumentIds as unknown[])
      .filter((id): id is string => typeof id === 'string'
        && candidates.some((candidate) => candidate.instrumentIds.includes(id))
        && !assigned.has(`${allocationGroupId}:${id}`));
    if (activeInstrumentIds.length === 0) continue;

    const partitions = new Map<string, string[]>();
    activeInstrumentIds.forEach((instrumentId) => {
      const template = candidates.find((candidate) => candidate.instrumentIds.includes(instrumentId))!;
      const shape = semanticShapeWithoutIds(template);
      partitions.set(shape, [...(partitions.get(shape) ?? []), instrumentId]);
    });
    let partitionIndex = 0;
    for (const instrumentIds of partitions.values()) {
      const template = candidates.find((candidate) => candidate.instrumentIds.includes(instrumentIds[0]))!;
      const oldBlocks = (oldGroup!.blocks as unknown[]).map((value) => record(value));
      const claimedOldIds = new Set<string>();
      const blocks = template.blocks.map((block) => {
        const exact = oldBlocks.find((old) => old?.id === block.id && old.elementCode === block.elementCode);
        const sameCode = oldBlocks.filter((old) => old?.elementCode === block.elementCode && typeof old.id === 'string');
        const generatedIdentity = block.elementCode === 'BASIC_SCHEDULE'
          || block.elementCode === 'BASIC_EQUAL_ALLOCATION_ORDER';
        const reusable = exact ?? (generatedIdentity && sameCode.length === 1 ? sameCode[0] : null);
        const id = reusable && !claimedOldIds.has(reusable.id as string) ? reusable.id as string : block.id;
        claimedOldIds.add(id);
        return { ...block, id };
      });
      restored.push({
        ...template,
        id: partitionIndex === 0 ? oldGroup!.id as string : template.id,
        allocationGroupId,
        instrumentIds,
        blocks,
        connections: blocks.slice(0, -1).map((block, index) => ({
          fromBlockId: block.id,
          outputPort: 'passed',
          toBlockId: blocks[index + 1].id,
          inputPort: 'passed',
        })),
      });
      instrumentIds.forEach((id) => assigned.add(`${allocationGroupId}:${id}`));
      partitionIndex += 1;
    }
  }
  next.groups.forEach((group) => {
    const unassigned = group.instrumentIds.filter((id) => !assigned.has(`${group.allocationGroupId}:${id}`));
    if (unassigned.length === 0) return;
    restored.push({ ...group, instrumentIds: unassigned });
    unassigned.forEach((id) => assigned.add(`${group.allocationGroupId}:${id}`));
  });
  return { ...next, groups: restored };
}

const record = (value: unknown): Record<string, unknown> | null => (
  typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
);

const stringRecord = (value: unknown): Record<string, string> | null => {
  const source = record(value);
  if (!source || Object.values(source).some((item) => typeof item !== 'string')) return null;
  return source as Record<string, string>;
};

const positiveInteger = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
};

const percentage = (value: string | undefined): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 100 ? parsed : null;
};

const directionOperator = (value: string | undefined): string | null => (
  value === 'UP' ? '↑' : value === 'DOWN' ? '↓' : null
);

const compareOperator = (value: string | undefined): string | null => ({
  GT: '>', GTE: '≥', EQ: '=', NEQ: '≠', LT: '<', LTE: '≤',
}[value ?? ''] ?? null);

const priceReferenceLabel = (value: string | undefined): string | null => {
  const exact: Record<string, string> = {
    PREVIOUS_CLOSE: '전일 종가', SESSION_OPEN: '당일 장 시작가', AVERAGE_ENTRY_PRICE: '평균 진입가',
  };
  if (value && exact[value]) return exact[value];
  const match = /^(SMA|HIGH|LOW)_(\d+)$/.exec(value ?? '');
  if (!match) return null;
  return match[1] === 'SMA'
    ? `최근 ${match[2]}봉 평균 가격`
    : `이전 ${match[2]}봉 ${match[1] === 'HIGH' ? '최고' : '최저'} 가격`;
};

const cycleLabel = (value: string | undefined): BasicBuyCycle | null => ({
  EVERY_TRADING_DAY: '매 거래일',
  WEEK_FIRST_TRADING_DAY: '매주 첫 거래일',
  MONTH_FIRST_TRADING_DAY: '매월 첫 거래일',
  MONTH_LAST_TRADING_DAY: '매월 마지막 거래일',
  EVERY_N_TRADING_DAYS: 'N거래일마다',
}[value ?? ''] as BasicBuyCycle | undefined) ?? null;

const decodeBlock = (
  id: string,
  elementCode: string,
  parameters: Record<string, string>,
): BasicDocumentBlockInput | null => {
  const directed = directionOperator(parameters.direction);
  switch (elementCode) {
    case 'BASIC_PRICE_COMPARE': {
      const op = compareOperator(parameters.operator);
      const value = priceReferenceLabel(parameters.reference);
      return op && value ? { id, label: '가격 비교', op, value, tone: 'data' } : null;
    }
    case 'BASIC_PRICE_CHANGE_PERCENT': {
      const base = priceReferenceLabel(parameters.base);
      return directed && base && parameters.thresholdPercent !== undefined
        ? { id, label: '가격 변화율', op: directed, value: `${parameters.thresholdPercent}%`, base, tone: 'data' }
        : null;
    }
    case 'BASIC_VOLUME_COMPARE': {
      const op = compareOperator(parameters.operator);
      const period = positiveInteger(parameters.period);
      const multiplier = positiveInteger(parameters.multiplier);
      if (period === null || multiplier === null) return null;
      const value = parameters.reference === 'PREVIOUS_VOLUME'
        ? `이전 봉 거래량${parameters.multiplier === '1' ? '' : ` ${parameters.multiplier}배`}`
        : parameters.reference === 'AVERAGE_VOLUME'
          ? `최근 ${parameters.period}봉 평균 거래량${parameters.multiplier === '1' ? '' : ` ${parameters.multiplier}배`}`
          : null;
      return op && value ? { id, label: '거래량', op, value, tone: 'data' } : null;
    }
    case 'BASIC_STREAK':
      return directed && parameters.bars
        ? { id, label: '연속 상승·하락', op: directed, value: `${parameters.bars}봉`, tone: 'indicator' }
        : null;
    case 'BASIC_SMA_CROSS':
      return directed && parameters.shortPeriod && parameters.longPeriod
        ? { id, label: '평균선 교차', op: directed, value: `${parameters.shortPeriod}봉 · ${parameters.longPeriod}봉`, tone: 'indicator' }
        : null;
    case 'BASIC_RSI_CROSS':
      return directed && parameters.threshold !== undefined
        ? { id, label: 'RSI 반등', op: directed, value: parameters.threshold, tone: 'condition' }
        : null;
    case 'BASIC_MACD_CROSS':
      return directed && parameters.fastPeriod && parameters.slowPeriod && parameters.signalPeriod
        ? { id, label: 'MACD 전환', op: directed, value: `${parameters.fastPeriod} · ${parameters.slowPeriod} · ${parameters.signalPeriod}`, tone: 'condition' }
        : null;
    case 'BASIC_BOLLINGER_REVERSAL':
      return directed && parameters.period && parameters.deviations
        ? { id, label: '가격 띠 반전', op: directed, value: `${parameters.period}봉 · ${parameters.deviations}σ`, tone: 'condition' }
        : null;
    case 'BASIC_POSITION_RETURN': {
      const op = parameters.direction === 'PROFIT' ? '수익' : parameters.direction === 'LOSS' ? '손실' : null;
      return op && parameters.thresholdPercent !== undefined
        ? { id, label: '현재 수익률', op, value: `${parameters.thresholdPercent}%`, tone: 'risk' }
        : null;
    }
    case 'BASIC_HOLDING_PERIOD': {
      const value = parameters.unit === 'SESSION_CLOSE'
        ? '당일 장 마감'
        : parameters.unit === 'TRADING_DAY'
          ? `${parameters.amount}거래일`
          : parameters.unit === 'BAR' ? `${parameters.amount}봉` : null;
      return value ? { id, label: '보유 기간', value, tone: 'risk' } : null;
    }
    case 'BASIC_PEAK_RETURN': {
      const op = compareOperator(parameters.operator);
      return op && parameters.thresholdPercent !== undefined
        ? { id, label: '최고 수익률', op, value: `${parameters.thresholdPercent}%`, tone: 'risk' }
        : null;
    }
    case 'BASIC_DRAWDOWN_FROM_PEAK': {
      const op = compareOperator(parameters.operator);
      return op && parameters.thresholdPercent !== undefined
        ? { id, label: '고점 대비 하락', op, value: `${parameters.thresholdPercent}%`, tone: 'risk' }
        : null;
    }
    default:
      return null;
  }
};

interface RebuiltCard {
  id: string;
  side: 'buy' | 'sell';
  instrumentIds: string[];
  timeframe: string;
  blocks: BasicDocumentBlockInput[];
  buySettings?: BasicDocumentSnapshot['buySettings'][string];
  sellSettings?: BasicDocumentSnapshot['sellSettings'][string];
  caps: Record<string, number>;
}

/**
 * Reconstructs the editor's disposable layout from the canonical Basic semantic document.
 * CLI/delegated edits intentionally operate on semantics, so presentation data may be absent or
 * use the pre-basicEditor layout. Returning null is reserved for a shape the current Basic UI
 * truly cannot represent without changing its meaning.
 */
export const rebuildBasicSnapshot = (
  semanticDocument: unknown,
  presentationDocument: unknown,
  catalog: BasicStrategyCatalog,
): BasicDocumentSnapshot | null => {
  const semantic = record(semanticDocument);
  const rawGroups = semantic?.groups;
  if (semantic?.mode !== 'BASIC' || semantic.catalogId !== catalog.version.id
    || !Array.isArray(rawGroups) || rawGroups.length === 0) return null;
  const instruments = new Map(catalog.instruments.map((instrument) => [instrument.id, instrument.symbol]));
  const cards = new Map<string, RebuiltCard>();

  for (const rawGroup of rawGroups) {
    const group = record(rawGroup);
    if (!group || (group.container !== 'BUY' && group.container !== 'SELL')
      || group.evaluationMode !== 'INDEPENDENT' || group.allocationMode !== 'EQUAL'
      || !Array.isArray(group.instrumentIds) || group.instrumentIds.length === 0
      || group.instrumentIds.some((id) => typeof id !== 'string' || !instruments.has(id))
      || !Array.isArray(group.blocks) || !Array.isArray(group.connections)) return null;
    const semanticBlocks = group.blocks.map((value) => {
      const block = record(value);
      const parameters = stringRecord(block?.parameters);
      return block && typeof block.id === 'string' && typeof block.elementCode === 'string' && parameters
        ? { id: block.id, elementCode: block.elementCode, parameters }
        : null;
    });
    if (semanticBlocks.some((block) => block === null) || semanticBlocks.length < 2) return null;
    const blocks = semanticBlocks as Array<{ id: string; elementCode: string; parameters: Record<string, string> }>;
    if (group.connections.length !== blocks.length - 1 || group.connections.some((value, index) => {
      const connection = record(value);
      return !connection || connection.fromBlockId !== blocks[index].id || connection.toBlockId !== blocks[index + 1].id
        || connection.outputPort !== 'passed' || connection.inputPort !== 'passed';
    })) return null;
    const order = blocks.at(-1);
    if (!order || order.elementCode !== 'BASIC_EQUAL_ALLOCATION_ORDER') return null;
    const schedules = blocks.filter((block) => block.elementCode === 'BASIC_SCHEDULE');
    if (schedules.length > 1 || (schedules.length === 1 && blocks[0].elementCode !== 'BASIC_SCHEDULE')) return null;
    const resolution = blocks.map((block) => block.parameters.resolution).find(Boolean) ?? '30m';
    const timeframe = timeframeLabel(resolution);
    if (!timeframe || blocks.some((block) => block.parameters.resolution && block.parameters.resolution !== resolution)) return null;
    const decoded = blocks.slice(schedules.length, -1).map((block) => decodeBlock(block.id, block.elementCode, block.parameters));
    if (decoded.some((block) => block === null)) return null;
    const cardId = typeof group.allocationGroupId === 'string' && group.allocationGroupId
      ? group.allocationGroupId
      : typeof group.id === 'string' && group.id ? group.id : null;
    const cap = percentage(order.parameters.maxPositionPercent);
    const orderPercent = percentage(order.parameters.orderPercent);
    if (!cardId || cap === null || orderPercent === null) return null;
    const side = group.container === 'BUY' ? 'buy' : 'sell';
    const schedule = schedules[0];
    const executionMode = order.parameters.executionMode;
    if ((side === 'buy' && schedule && executionMode !== '주기마다')
      || (side === 'buy' && !schedule && !['1회만', '주기마다', '대기 후 재진입'].includes(executionMode))
      || (side === 'sell' && schedule)
      || (side === 'sell' && !['1회만', '주기마다', '대기 후 재실행'].includes(executionMode))) return null;
    const cycle = schedule ? cycleLabel(schedule.parameters.cycle) : '매 거래일';
    const cycleInterval = schedule ? positiveInteger(schedule.parameters.interval) : 1;
    const waitMode = ['조건 재충족', 'N봉 이후', 'N거래일 이후'].includes(order.parameters.waitMode)
      ? order.parameters.waitMode as BasicRerunWait : null;
    const waitInterval = positiveInteger(order.parameters.waitInterval);
    const maxExecutions = positiveInteger(order.parameters.maxExecutions);
    if (!cycle || cycleInterval === null || !waitMode || waitInterval === null || maxExecutions === null) return null;
    const next: RebuiltCard = {
      id: cardId,
      side,
      instrumentIds: [...group.instrumentIds] as string[],
      timeframe,
      blocks: decoded as BasicDocumentBlockInput[],
      caps: Object.fromEntries((group.instrumentIds as string[]).map((id) => [id, cap])),
      ...(side === 'buy' ? {
        buySettings: {
          maxOrderPercent: orderPercent,
          entryMode: schedule
            ? '주기마다'
            : order.parameters.executionMode === '주기마다'
              ? '조건 충족마다'
              : order.parameters.executionMode === '대기 후 재진입' ? '대기 후 재진입' : '1회만',
          cycle,
          cycleInterval,
          reentryWait: waitMode,
          reentryInterval: waitInterval,
          maxEntries: maxExecutions,
        },
      } : {
        sellSettings: {
          sellPercent: orderPercent,
          executeMode: order.parameters.executionMode === '주기마다'
            ? '조건 충족마다'
            : order.parameters.executionMode === '대기 후 재실행' ? '대기 후 재실행' : '1회만',
          reexecWait: waitMode,
          reexecInterval: waitInterval,
          maxExecutions,
        },
      }),
    };
    const current = cards.get(cardId);
    const sameShape = current && current.side === next.side && current.timeframe === next.timeframe
      && JSON.stringify(current.blocks) === JSON.stringify(next.blocks)
      && JSON.stringify(current.buySettings) === JSON.stringify(next.buySettings)
      && JSON.stringify(current.sellSettings) === JSON.stringify(next.sellSettings);
    if (current && !sameShape) return null;
    if (current) {
      current.instrumentIds.push(...next.instrumentIds.filter((id) => !current.instrumentIds.includes(id)));
      Object.assign(current.caps, next.caps);
    } else {
      cards.set(cardId, next);
    }
  }

  const presentation = record(presentationDocument);
  const savedEditor = record(presentation?.basicEditor);
  const savedSnapshot = record(savedEditor?.snapshot);
  const savedSections = Array.isArray(savedSnapshot?.sections) ? savedSnapshot.sections : null;
  const legacySections = savedSections ?? (Array.isArray(presentation?.sections) ? presentation.sections : []);
  const savedCardMeta = record(savedSnapshot?.cardMeta);
  const sections: BasicDocumentSectionInput[] = [];
  const placedCards = new Set<string>();
  for (const [index, rawSection] of legacySections.entries()) {
    const source = record(rawSection);
    const sourceCards = record(source?.cards);
    const order = Array.isArray(source?.cardOrder)
      ? source.cardOrder.filter((id): id is string => typeof id === 'string' && cards.has(id))
      : [];
    if (!source || !sourceCards || order.length === 0) continue;
    const first = cards.get(order[0])!;
    if (order.some((id) => {
      const card = cards.get(id)!;
      return card.timeframe !== first.timeframe
        || JSON.stringify(card.instrumentIds) !== JSON.stringify(first.instrumentIds);
    })) return null;
    const sectionId = typeof source.id === 'string' && source.id ? source.id : `section-${index + 1}`;
    sections.push({
      id: sectionId,
      symbol: first.instrumentIds.map((id) => instruments.get(id)).join(' · '),
      instrumentIds: [...first.instrumentIds],
      allocation: typeof source.allocation === 'number' ? source.allocation : 100,
      timeframe: first.timeframe,
      x: typeof source.x === 'number' ? source.x : 290 + index * 72,
      y: typeof source.y === 'number' ? source.y : 108 + index * 52,
      ...(typeof source.width === 'number' ? { width: source.width } : {}),
      ...(typeof source.height === 'number' ? { height: source.height } : {}),
      cards: {
        buy: order.filter((id) => cards.get(id)?.side === 'buy'),
        sell: order.filter((id) => cards.get(id)?.side === 'sell'),
        risk: [],
      },
      cardOrder: order,
      cardPositions: record(source.cardPositions) ?? {},
    });
    order.forEach((id) => placedCards.add(id));
  }

  for (const card of cards.values()) {
    if (placedCards.has(card.id)) continue;
    const matching = sections.find((section) => section.timeframe === card.timeframe
      && JSON.stringify(section.instrumentIds) === JSON.stringify(card.instrumentIds));
    if (matching) {
      matching.cards[card.side].push(card.id);
      matching.cardOrder.push(card.id);
      placedCards.add(card.id);
      continue;
    }
    const index = sections.length;
    sections.push({
      id: `section-${index + 1}`,
      symbol: card.instrumentIds.map((id) => instruments.get(id)).join(' · '),
      instrumentIds: [...card.instrumentIds],
      allocation: 100,
      timeframe: card.timeframe,
      x: 290 + index * 72,
      y: 108 + index * 52,
      cards: { buy: card.side === 'buy' ? [card.id] : [], sell: card.side === 'sell' ? [card.id] : [], risk: [] },
      cardOrder: [card.id],
      cardPositions: {},
    });
    placedCards.add(card.id);
  }

  const symbolLimits: Record<string, Record<string, number>> = {};
  for (const section of sections) {
    const limits: Record<string, number> = {};
    for (const cardId of section.cardOrder) {
      const card = cards.get(cardId)!;
      for (const instrumentId of section.instrumentIds ?? []) {
        const symbol = instruments.get(instrumentId)!;
        const cap = card.caps[instrumentId];
        if (cap === undefined || (limits[symbol] !== undefined && limits[symbol] !== cap)) return null;
        limits[symbol] = cap;
      }
    }
    symbolLimits[section.id] = limits;
  }

  return {
    sections,
    cardBlocks: Object.fromEntries([...cards.values()].map((card) => [card.id, card.blocks])),
    cardMeta: Object.fromEntries([...cards.values()].map((card) => {
      const saved = record(savedCardMeta?.[card.id]);
      return [card.id, {
        title: typeof saved?.title === 'string' ? saved.title : card.side === 'buy' ? '매수 전략' : '매도 전략',
        detail: typeof saved?.detail === 'string' ? saved.detail : 'CLI와 서버에서 불러온 전략',
        explanation: typeof saved?.explanation === 'string'
          ? saved.explanation
          : '저장된 공식 전략 조건을 편집 가능한 화면으로 복원했습니다.',
      }];
    })),
    buySettings: Object.fromEntries([...cards.values()].filter((card) => card.buySettings).map((card) => [card.id, card.buySettings!])),
    sellSettings: Object.fromEntries([...cards.values()].filter((card) => card.sellSettings).map((card) => [card.id, card.sellSettings!])),
    symbolLimits,
  };
};
