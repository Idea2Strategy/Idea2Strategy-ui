/*
  전략 미리보기 엔진.

  Basic 편집기의 파티션 블록 구성을 그대로 읽어 시세 위에서 매수·매도 시점을
  계산한다. 사용자가 블록을 추가하거나 값을 바꾸면 이 함수들만 다시 돌면
  되므로 차트는 편집과 같은 프레임에서 갱신된다.

  전부 순수 함수이며 시세는 결정론적으로 생성한다. 같은 종목·시간단위는 항상
  같은 캔들을 만들어 편집 중 화면이 흔들리지 않고 테스트도 안정적이다.
  실제 시장 데이터가 아니라 전략 구성을 눈으로 확인하기 위한 예시 시세다.
*/

import { mulberry32, seedOf } from './equitySim';

export interface PreviewCandle {
  /* UTC 초 단위. lightweight-charts의 UTCTimestamp와 같은 단위. */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/* 편집기 블록에서 미리보기가 실제로 쓰는 최소 정보. */
export interface PreviewBlock {
  label: string;
  op?: string;
  value?: string;
  base?: string;
  tone: string;
}

export type IndicatorKind =
  | 'RSI'
  | 'BOLLINGER'
  | 'SMA'
  | 'EMA'
  | 'STOCHASTIC'
  | 'MACD'
  | 'DONCHIAN'
  | 'VOLUME_SMA'
  | 'PRICE'
  | 'PRICE_CHANGE'
  | 'VOLUME_COMPARE'
  | 'STREAK'
  | 'POSITION_RETURN'
  | 'HOLDING_PERIOD'
  | 'PEAK_RETURN'
  | 'DRAWDOWN_FROM_PEAK'
  | 'SCHEDULE';

export type SignalSide = 'buy' | 'sell';

export interface SignalRule {
  kind: IndicatorKind;
  /* 편집기에 보이는 지표 이름 그대로. 설명 문구에 사용한다. */
  label: string;
  op: string;
  /* 숫자 기준값(RSI 30 등). 밴드·교차형에는 없다. */
  threshold?: number;
  /* 교차형(SMA 20 / 60)의 기간. */
  fastPeriod?: number;
  slowPeriod?: number;
  period?: number;
  signalPeriod?: number;
  deviations?: number;
  multiplier?: number;
  amount?: number;
  /* LOWER·UPPER·SIGNAL 같은 문자 기준값. */
  target?: string;
  base?: string;
  unit?: string;
  cycle?: string;
}

/*
  한 파티션 안의 컨테이너(플로우) 하나. 매수 플로우가 여러 개면 어느 플로우가
  이번 매수를 만들었는지가 판단에 필요한 정보이므로, 미리보기는 플로우를 합치지
  않고 각각 평가한 뒤 신호에 출처를 남긴다.
*/
export interface PreviewFlow {
  id: string;
  label: string;
  side: SignalSide;
  blocks: PreviewBlock[];
  maxExecutions?: number;
}

export interface PreviewMarker {
  index: number;
  time: number;
  side: SignalSide;
  price: number;
  reason: string;
  flowId: string;
  flowLabel: string;
}

export interface FlowSummary {
  id: string;
  label: string;
  side: SignalSide;
  count: number;
  rule: SignalRule | null;
  description: string | null;
  dataReady: boolean;
  evaluable: boolean;
}

export interface PreviewTrade {
  entryIndex: number;
  exitIndex: number;
  entryPrice: number;
  exitPrice: number;
  returnPct: number;
}

export interface OverlayLine {
  id: string;
  name: string;
  values: Array<number | null>;
}

export interface PreviewOverlay {
  id: string;
  name: string;
  /* price: 캔들과 같은 축. lower: 아래 별도 칸(0~100 등 다른 축). */
  pane: 'price' | 'lower';
  lines: OverlayLine[];
  /* 아래 칸의 기준선(RSI 30·70 등). */
  guides?: number[];
}

export interface PreviewSummary {
  buyCount: number;
  sellCount: number;
  tradeCount: number;
  winRate: number | null;
  totalReturnPct: number;
  averageHoldingBars: number | null;
  openPosition: boolean;
}

export interface StrategyPreview {
  candles: PreviewCandle[];
  flows: FlowSummary[];
  /* 블록은 있으나 미리보기 계산을 지원하지 않는 지표 이름. */
  unsupported: string[];
  markers: PreviewMarker[];
  overlays: PreviewOverlay[];
  summary: PreviewSummary;
}

/* ---------- 시세 생성 ---------------------------------------------------- */

const REFERENCE_PRICES: Record<string, number> = {
  AAPL: 216.42,
  MSFT: 497.18,
  SPY: 634.06,
  NVDA: 178.24,
  QQQ: 561.38,
  TSLA: 249.12,
  KO: 63.88,
  PEP: 142.36,
};

export const referencePriceFor = (symbol: string): number => REFERENCE_PRICES[symbol.toUpperCase()] ?? 100;

/*
  파티션의 종목 문자열은 편집기에서 'AAPL · MSFT · SPY'처럼 한 칸에 담긴다.
  차트는 한 번에 한 종목만 그리므로 목록으로 분리한다.
*/
export const splitPartitionSymbols = (symbol: string): string[] => symbol
  .split(/[·,/]/)
  .map((part) => part.trim())
  .filter((part) => part.length > 0 && part !== '종목 선택');

export const generatePreviewCandles = (
  symbol: string,
  timeframeSeconds: number,
  count = 180,
  endTimeSeconds = Date.UTC(2026, 6, 23, 20, 0, 0) / 1000,
): PreviewCandle[] => {
  const reference = referencePriceFor(symbol);
  const random = mulberry32(seedOf(`${symbol}-${timeframeSeconds}`));
  const end = Math.floor(endTimeSeconds / timeframeSeconds) * timeframeSeconds;
  const phase = random() * Math.PI * 2;
  /*
    주기가 다른 두 파동에 작은 랜덤워크를 얹는다. 한 방향으로만 흐르거나 잔
    노이즈만 있는 시세에서는 RSI가 30·70에 닿지 않아 어떤 조건을 넣어도 신호가
    보이지 않는다. 미리보기의 목적은 조건이 언제 걸리는지 보여주는 것이므로
    과매수와 과매도가 여러 번 오가는 구간을 만든다.
  */
  let noise = 0;
  const candles: PreviewCandle[] = [];

  for (let index = 0; index < count; index += 1) {
    const time = end - (count - 1 - index) * timeframeSeconds;
    noise += (random() - 0.5) * 0.004;
    noise = Math.max(-0.05, Math.min(0.05, noise));
    /* 주기는 봉 수 기준이다. 작은 카드가 보여주는 120봉 안에서도 과매수·과매도가
       여러 번 오가야 한 바퀴(매수 → 매도)를 눈으로 확인할 수 있다. */
    const swing = Math.sin((index / 17) * Math.PI * 2 + phase) * 0.022
      + Math.sin((index / 44) * Math.PI * 2 + phase * 1.7) * 0.03;
    const close = reference * (1 + swing + noise);
    const open = index === 0 ? close * (1 - (random() - 0.5) * 0.004) : candles[index - 1].close;
    const spread = reference * (0.0009 + random() * 0.0022);
    candles.push({
      time,
      open,
      high: Math.max(open, close) + spread * random(),
      low: Math.min(open, close) - spread * random(),
      close,
      /* 가격이 크게 움직인 봉에 거래량이 몰리도록 변화량을 반영한다. */
      volume: Math.round(26000 + random() * 74000 + (Math.abs(close - open) / reference) * 2400000),
    });
  }

  return candles;
};

/*
  미리보기 기간은 최근 1개월 고정이다. 참고용으로 흐름만 보는 창이므로 기간·봉
  선택을 두지 않고, 한 달 안에 신호가 여러 번 오가는 해상도(거래시간 1시간
  간격, 약 150봉)로 고정한다.
*/
export const PREVIEW_WINDOW = {
  label: '최근 1개월',
  seconds: 3600,
  count: 150,
} as const;

/* 브라우저에서 즉시 다시 계산할 수 있도록 실제 시세 입력도 최근 400봉으로 제한한다. */
export const PREVIEW_MAX_CANDLES = 400;

/* ---------- 지표 계산 ---------------------------------------------------- */

type Series = Array<number | null>;

export const sma = (values: number[], period: number): Series => values.map((_, index) => {
  if (index + 1 < period) return null;
  let sum = 0;
  for (let step = index + 1 - period; step <= index; step += 1) sum += values[step];
  return sum / period;
});

export const ema = (values: number[], period: number): Series => {
  const factor = 2 / (period + 1);
  let previous: number | null = null;
  return values.map((value, index) => {
    if (index + 1 < period) return null;
    if (previous === null) {
      let sum = 0;
      for (let step = 0; step <= index; step += 1) sum += values[step];
      previous = sum / period;
      return previous;
    }
    previous = value * factor + previous * (1 - factor);
    return previous;
  });
};

/*
  공식 런타임의 RSI_14(rsi:1.0.0)와 같은 Cutler bounded-window 방식.
  최근 period개의 변화만 매 봉 다시 합산한다. 미리보기에서 흔한 Wilder RSI를
  쓰면 백테스트와 교차 시점이 달라지므로 여기서는 제품 정의를 그대로 따른다.
*/
export const rsi = (values: number[], period = 14): Series => {
  const result: Series = values.map(() => null);
  if (values.length <= period) return result;
  for (let index = period; index < values.length; index += 1) {
    let gain = 0;
    let loss = 0;
    for (let step = index - period + 1; step <= index; step += 1) {
      const change = values[step] - values[step - 1];
      gain += Math.max(0, change);
      loss += Math.max(0, -change);
    }
    result[index] = loss === 0 ? (gain === 0 ? 50 : 100) : 100 - 100 / (1 + gain / loss);
  }
  return result;
};

export interface BollingerBands {
  middle: Series;
  upper: Series;
  lower: Series;
}

export const bollinger = (values: number[], period = 20, multiplier = 2): BollingerBands => {
  const middle = sma(values, period);
  const upper: Series = values.map(() => null);
  const lower: Series = values.map(() => null);
  values.forEach((_, index) => {
    const mid = middle[index];
    if (mid === null) return;
    let variance = 0;
    for (let step = index + 1 - period; step <= index; step += 1) variance += (values[step] - mid) ** 2;
    const deviation = Math.sqrt(variance / period);
    upper[index] = mid + deviation * multiplier;
    lower[index] = mid - deviation * multiplier;
  });
  return { middle, upper, lower };
};

export const stochastic = (candles: PreviewCandle[], period = 14, smoothing = 3): Series => {
  const raw: Series = candles.map((_, index) => {
    if (index + 1 < period) return null;
    let highest = -Infinity;
    let lowest = Infinity;
    for (let step = index + 1 - period; step <= index; step += 1) {
      highest = Math.max(highest, candles[step].high);
      lowest = Math.min(lowest, candles[step].low);
    }
    const range = highest - lowest;
    return range === 0 ? 50 : ((candles[index].close - lowest) / range) * 100;
  });
  return raw.map((_, index) => {
    if (index + 1 < period + smoothing - 1) return null;
    let sum = 0;
    for (let step = index + 1 - smoothing; step <= index; step += 1) sum += raw[step] ?? 0;
    return sum / smoothing;
  });
};

export interface MacdSeries {
  macd: Series;
  signal: Series;
}

export const macd = (values: number[], fast = 12, slow = 26, signalPeriod = 9): MacdSeries => {
  const fastLine = ema(values, fast);
  const slowLine = ema(values, slow);
  const macdLine: Series = values.map((_, index) => {
    const quick = fastLine[index];
    const slowValue = slowLine[index];
    return quick === null || slowValue === null ? null : quick - slowValue;
  });
  const defined = macdLine.map((value) => value ?? 0);
  const signalRaw = ema(defined, signalPeriod);
  return {
    macd: macdLine,
    signal: macdLine.map((value, index) => (value === null ? null : signalRaw[index])),
  };
};

export interface DonchianChannel {
  upper: Series;
  lower: Series;
}

export const donchian = (candles: PreviewCandle[], period = 20): DonchianChannel => {
  const upper: Series = candles.map(() => null);
  const lower: Series = candles.map(() => null);
  candles.forEach((_, index) => {
    if (index + 1 < period) return;
    let highest = -Infinity;
    let lowest = Infinity;
    /* 돌파 판정은 이전 봉까지의 범위와 비교해야 자기 자신 때문에 항상
       참이 되는 문제가 생기지 않는다. */
    for (let step = index - period; step < index; step += 1) {
      if (step < 0) continue;
      highest = Math.max(highest, candles[step].high);
      lowest = Math.min(lowest, candles[step].low);
    }
    upper[index] = highest;
    lower[index] = lowest;
  });
  return { upper, lower };
};

/* ---------- 블록 → 신호 규칙 -------------------------------------------- */

const INDICATOR_ALIASES: Array<{ match: RegExp; kind: IndicatorKind; defaultPeriod?: number }> = [
  { match: /^RSI/i, kind: 'RSI', defaultPeriod: 14 },
  { match: /^(BOLL|가격 띠 반전)/i, kind: 'BOLLINGER', defaultPeriod: 20 },
  { match: /^VOLUME\s*SMA/i, kind: 'VOLUME_SMA', defaultPeriod: 20 },
  { match: /^(SMA|평균선 교차)/i, kind: 'SMA', defaultPeriod: 20 },
  { match: /^EMA/i, kind: 'EMA', defaultPeriod: 20 },
  { match: /^STOCH/i, kind: 'STOCHASTIC', defaultPeriod: 14 },
  { match: /^MACD/i, kind: 'MACD' },
  { match: /^DONCHIAN/i, kind: 'DONCHIAN', defaultPeriod: 20 },
  { match: /^가격 비교$/i, kind: 'PRICE' },
  { match: /^가격 변화율$/i, kind: 'PRICE_CHANGE' },
  { match: /^거래량$/i, kind: 'VOLUME_COMPARE' },
  { match: /^연속 상승·하락$/i, kind: 'STREAK' },
  { match: /^현재 수익률$/i, kind: 'POSITION_RETURN' },
  { match: /^보유 기간$/i, kind: 'HOLDING_PERIOD' },
  { match: /^최고 수익률$/i, kind: 'PEAK_RETURN' },
  { match: /^고점 대비 하락$/i, kind: 'DRAWDOWN_FROM_PEAK' },
  { match: /^정기 매수$/i, kind: 'SCHEDULE' },
];

const parsePeriods = (value: string | undefined): { fast?: number; slow?: number; single?: number } => {
  if (!value) return {};
  const pair = value.match(/(\d+)\s*\/\s*(\d+)/);
  if (pair) return { fast: Number(pair[1]), slow: Number(pair[2]) };
  const single = value.match(/(\d+)/);
  return single ? { single: Number(single[1]) } : {};
};

export const identifyIndicator = (label: string): IndicatorKind | null =>
  INDICATOR_ALIASES.find((alias) => alias.match.test(label.trim()))?.kind ?? null;

const numbersIn = (value: string | undefined): number[] => (
  [...String(value ?? '').matchAll(/\d+(?:\.\d+)?/g)].map((match) => Number(match[0]))
);

const metaBlock = (block: PreviewBlock): boolean => (
  /\bBAR$/i.test(block.label)
  || ['BUDGET', 'POSITION'].includes(block.label.toUpperCase())
  || block.tone === 'order'
);

const signalRuleFrom = (block: PreviewBlock): SignalRule | null => {
  const kind = identifyIndicator(block.label);
  if (!kind) return null;
  const numbers = numbersIn(block.value);
  const threshold = numbers[0];
  const common = { kind, label: block.label, op: block.op ?? '' };

  if (kind === 'RSI' || kind === 'STOCHASTIC') {
    return { ...common, period: 14, threshold };
  }
  if (kind === 'SMA') {
    return {
      ...common,
      fastPeriod: numbers[0],
      slowPeriod: numbers[1],
      period: numbers[1] ? undefined : numbers[0] ?? 20,
    };
  }
  if (kind === 'EMA' || kind === 'DONCHIAN' || kind === 'VOLUME_SMA') {
    return { ...common, period: numbers[0] ?? 20, threshold: kind === 'VOLUME_SMA' ? threshold : undefined };
  }
  if (kind === 'MACD') {
    return { ...common, fastPeriod: numbers[0] ?? 12, slowPeriod: numbers[1] ?? 26, signalPeriod: numbers[2] ?? 9 };
  }
  if (kind === 'BOLLINGER') {
    return { ...common, period: numbers[0] ?? 20, deviations: numbers[1] ?? 2 };
  }
  if (kind === 'PRICE') return { ...common, target: block.value };
  if (kind === 'PRICE_CHANGE') return { ...common, base: block.base, threshold };
  if (kind === 'VOLUME_COMPARE') {
    return {
      ...common,
      target: block.value,
      period: block.value === '이전 봉 거래량' ? 1 : numbers[0] ?? 20,
      multiplier: block.value === '이전 봉 거래량' ? 1 : numbers[1] ?? 1,
    };
  }
  if (kind === 'STREAK') return { ...common, period: numbers[0] ?? 2 };
  if (kind === 'POSITION_RETURN' || kind === 'PEAK_RETURN' || kind === 'DRAWDOWN_FROM_PEAK') {
    return { ...common, threshold };
  }
  if (kind === 'HOLDING_PERIOD') {
    const value = block.value ?? '';
    return {
      ...common,
      amount: value === '당일 장 마감' ? 0 : numbers[0] ?? 1,
      unit: value === '당일 장 마감' ? 'SESSION_CLOSE' : value.includes('거래일') ? 'TRADING_DAY' : 'BAR',
    };
  }
  if (kind === 'SCHEDULE') return { ...common, cycle: block.value, amount: numbersIn(block.base)[0] ?? 1 };
  return common;
};

/*
  같은 숫자가 지표에 따라 다른 뜻을 가진다. RSI 30은 기준값이고 SMA 20은
  기간이다. 이를 구분하지 않으면 RSI(30)처럼 사용자가 쓰지 않은 기간으로
  계산돼 신호 위치가 어긋난다.
*/
const THRESHOLD_KINDS = new Set<IndicatorKind>(['RSI', 'STOCHASTIC', 'VOLUME_SMA']);

export const indicatorPeriodFor = (kind: IndicatorKind, value: string | undefined): {
  period?: number;
  fastPeriod?: number;
  slowPeriod?: number;
  threshold?: number;
} => {
  const alias = INDICATOR_ALIASES.find((item) => item.kind === kind);
  const periods = parsePeriods(value);
  const numeric = value?.match(/^(\d+(?:\.\d+)?)\s*%?$/);
  if (THRESHOLD_KINDS.has(kind)) {
    return {
      period: alias?.defaultPeriod,
      threshold: numeric ? Number(numeric[1]) : undefined,
    };
  }
  return {
    period: periods.single ?? periods.fast ?? alias?.defaultPeriod,
    fastPeriod: periods.fast,
    slowPeriod: periods.slow,
  };
};

/* 컨테이너의 모든 실행 조건을 읽는다. Basic 런타임은 이 목록을 AND로 평가한다. */
export const parseSignalRules = (blocks: PreviewBlock[]): { rules: SignalRule[]; unsupported: string[] } => {
  const rules: SignalRule[] = [];
  const unsupported: string[] = [];
  for (const block of blocks) {
    if (metaBlock(block)) continue;
    const rule = signalRuleFrom(block);
    if (!rule) {
      unsupported.push(block.label);
      continue;
    }
    rules.push(rule);
  }
  return { rules, unsupported };
};

export const parseSignalRule = (blocks: PreviewBlock[]): { rule: SignalRule | null; unsupported: string[] } => {
  const parsed = parseSignalRules(blocks);
  return { rule: parsed.rules[0] ?? null, unsupported: parsed.unsupported };
};

/* ---------- 규칙 평가 ---------------------------------------------------- */

interface RuleSeries {
  /* 비교 대상 값과 기준값. 둘의 교차로 신호를 판정한다. */
  value: Series;
  reference: Series;
  /* 기준선을 위로 통과할 때 참인지 아래로 통과할 때 참인지. */
  direction: 'above' | 'below';
  description: string;
}

const crossDirection = (op: string, target?: string): 'above' | 'below' => {
  const normalized = op.trim().toUpperCase();
  if (['>', '≥', '↑', '상승', '수익', 'UP', 'PROFIT'].includes(normalized)) return 'above';
  if (['<', '≤', '↓', '하락', '손실', 'DOWN', 'LOSS'].includes(normalized)) return 'below';
  return target === 'UPPER' || target === 'UP' ? 'above' : 'below';
};

const constantSeries = (length: number, value: number): Series => Array.from({ length }, () => value);

const buildRuleSeries = (rule: SignalRule, candles: PreviewCandle[]): RuleSeries | null => {
  const closes = candles.map((candle) => candle.close);
  const direction = crossDirection(rule.op, rule.target);
  const arrow = direction === 'above' ? '상향 돌파' : '하향 돌파';

  if (rule.kind === 'RSI') {
    const threshold = rule.threshold ?? (direction === 'above' ? 70 : 30);
    return {
      value: rsi(closes, rule.period ?? 14),
      reference: constantSeries(candles.length, threshold),
      direction,
      description: `RSI(${rule.period ?? 14}) ${threshold} ${arrow}`,
    };
  }
  if (rule.kind === 'STOCHASTIC') {
    const threshold = rule.threshold ?? (direction === 'above' ? 80 : 20);
    return {
      value: stochastic(candles, rule.period ?? 14),
      reference: constantSeries(candles.length, threshold),
      direction,
      description: `Stochastic %K ${threshold} ${arrow}`,
    };
  }
  if (rule.kind === 'BOLLINGER') {
    const bands = bollinger(closes, rule.period ?? 20);
    const band = rule.target === 'UPPER' ? bands.upper : rule.target === 'MIDDLE' ? bands.middle : bands.lower;
    const bandName = rule.target === 'UPPER' ? '상단' : rule.target === 'MIDDLE' ? '중심선' : '하단';
    return {
      value: closes,
      reference: band,
      direction,
      description: `종가가 Bollinger ${bandName} ${arrow}`,
    };
  }
  if (rule.kind === 'SMA' || rule.kind === 'EMA') {
    const line = rule.kind === 'SMA' ? sma : ema;
    if (rule.fastPeriod && rule.slowPeriod) {
      return {
        value: line(closes, rule.fastPeriod),
        reference: line(closes, rule.slowPeriod),
        direction,
        description: `${rule.kind}(${rule.fastPeriod})가 ${rule.kind}(${rule.slowPeriod}) ${arrow}`,
      };
    }
    const period = rule.period ?? 20;
    return {
      value: closes,
      reference: line(closes, period),
      direction,
      description: `종가가 ${rule.kind}(${period}) ${arrow}`,
    };
  }
  if (rule.kind === 'MACD') {
    const lines = macd(closes);
    return {
      value: lines.macd,
      reference: rule.target === 'ZERO' ? constantSeries(candles.length, 0) : lines.signal,
      direction,
      description: `MACD가 ${rule.target === 'ZERO' ? '0선' : '시그널선'} ${arrow}`,
    };
  }
  if (rule.kind === 'DONCHIAN') {
    const channel = donchian(candles, rule.period ?? 20);
    const useUpper = direction === 'above';
    return {
      value: closes,
      reference: useUpper ? channel.upper : channel.lower,
      direction,
      description: `종가가 최근 ${rule.period ?? 20}봉 ${useUpper ? '고가' : '저가'} ${arrow}`,
    };
  }
  if (rule.kind === 'VOLUME_SMA') {
    const volumes = candles.map((candle) => candle.volume);
    const average = sma(volumes, rule.period ?? 20);
    const ratio: Series = volumes.map((volume, index) => {
      const mean = average[index];
      return mean === null || mean === 0 ? null : (volume / mean) * 100;
    });
    const threshold = rule.threshold ?? (direction === 'above' ? 150 : 70);
    return {
      value: ratio,
      reference: constantSeries(candles.length, threshold),
      direction,
      description: `거래량이 평균의 ${threshold}% ${arrow}`,
    };
  }
  return null;
};

const minimumCandlesForRule = (rule: SignalRule): number => {
  if (rule.kind === 'MACD') return (rule.slowPeriod ?? 26) + (rule.signalPeriod ?? 9) + 2;
  if (rule.kind === 'SMA' && rule.slowPeriod) return rule.slowPeriod + 1;
  if (rule.kind === 'RSI') return (rule.period ?? 14) + 2;
  if (rule.kind === 'BOLLINGER') return (rule.period ?? 20) + 1;
  if (rule.kind === 'VOLUME_COMPARE') return rule.target === '이전 봉 거래량' ? 2 : (rule.period ?? 20) + 1;
  if (rule.kind === 'STREAK') return (rule.period ?? 2) + 1;
  if (rule.kind === 'PRICE' || rule.kind === 'PRICE_CHANGE') {
    const periods = numbersIn(rule.target ?? rule.base);
    return Math.max(1, (periods[0] ?? 1) + ((rule.target ?? rule.base)?.includes('최') ? 1 : 0));
  }
  return 1;
};

interface PreviewPositionState {
  holding: boolean;
  entryIndex: number;
  entryPrice: number;
  peakReturnPct: number;
}

interface RuleEvaluator {
  rule: SignalRule;
  description: string;
  dataReady: boolean;
  matches: (index: number, position: PreviewPositionState) => boolean;
}

const compared = (left: number, right: number, op: string): boolean => {
  if (op === '>' || op === '↑') return left > right;
  if (op === '≥') return left >= right;
  if (op === '=') return left === right;
  if (op === '≤') return left <= right;
  return left < right;
};

const average = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / values.length;

const easternDate = (time: number): string => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(time * 1000));

const priceReferenceAt = (
  reference: string | undefined,
  index: number,
  candles: PreviewCandle[],
  position: PreviewPositionState,
): number | null => {
  const target = reference ?? '';
  if (target === '전일 종가' || target === 'PREVIOUS_CLOSE') return index > 0 ? candles[index - 1].close : null;
  if (target === '평균 진입가' || target === 'AVERAGE_ENTRY_PRICE') return position.holding ? position.entryPrice : null;
  if (target === '당일 장 시작가' || target === 'SESSION_OPEN') {
    const date = easternDate(candles[index].time);
    const first = candles.find((candle) => easternDate(candle.time) === date);
    return first?.open ?? null;
  }
  const period = numbersIn(target)[0];
  if (!period) return null;
  if (target.includes('평균') || target.startsWith('SMA_')) {
    return index + 1 < period ? null : average(candles.slice(index + 1 - period, index + 1).map((candle) => candle.close));
  }
  if (target.includes('최고') || target.startsWith('HIGH_')) {
    return index < period ? null : Math.max(...candles.slice(index - period, index).map((candle) => candle.close));
  }
  if (target.includes('최저') || target.startsWith('LOW_')) {
    return index < period ? null : Math.min(...candles.slice(index - period, index).map((candle) => candle.close));
  }
  return null;
};

const runtimeMacdHistogram = (values: number[], fast: number, slow: number, signal: number): number[] => {
  const fromFirst = (period: number): number[] => {
    const alpha = 2 / (period + 1);
    let current = values[0];
    return values.map((value, index) => {
      if (index === 0) return current;
      current = value * alpha + current * (1 - alpha);
      return current;
    });
  };
  const fastLine = fromFirst(fast);
  const slowLine = fromFirst(slow);
  const macdLine = fastLine.map((value, index) => value - slowLine[index]);
  const alpha = 2 / (signal + 1);
  let signalValue = macdLine[0];
  return macdLine.map((value, index) => {
    if (index > 0) signalValue = value * alpha + signalValue * (1 - alpha);
    return value - signalValue;
  });
};

const buildRuleEvaluator = (rule: SignalRule, candles: PreviewCandle[]): RuleEvaluator | null => {
  const closes = candles.map((candle) => candle.close);
  const direction = crossDirection(rule.op, rule.target);
  const arrow = direction === 'above' ? '상향 돌파' : '하향 돌파';
  const enough = candles.length >= minimumCandlesForRule(rule);

  if (['RSI', 'SMA', 'EMA', 'STOCHASTIC', 'DONCHIAN', 'VOLUME_SMA'].includes(rule.kind)) {
    const series = buildRuleSeries(rule, candles);
    return series ? { rule, description: series.description, dataReady: enough, matches: (index) => crossedAt(series, index) } : null;
  }
  if (rule.kind === 'MACD') {
    const fast = rule.fastPeriod ?? 12;
    const slow = rule.slowPeriod ?? 26;
    const signal = rule.signalPeriod ?? 9;
    const required = slow + signal + 2;
    return {
      rule,
      description: `MACD(${fast}·${slow}·${signal})가 0선을 ${arrow}`,
      dataReady: enough,
      matches: (index) => {
        if (index + 1 < required) return false;
        const histogram = runtimeMacdHistogram(closes.slice(index + 1 - required, index + 1), fast, slow, signal);
        const previous = histogram.at(-2)!;
        const current = histogram.at(-1)!;
        return direction === 'above' ? previous <= 0 && current > 0 : previous >= 0 && current < 0;
      },
    };
  }
  if (rule.kind === 'BOLLINGER') {
    const period = rule.period ?? 20;
    const deviations = rule.deviations ?? 2;
    const bandAt = (index: number): { lower: number; upper: number } | null => {
      if (index + 1 < period) return null;
      const window = closes.slice(index + 1 - period, index + 1);
      const mean = average(window);
      const deviation = Math.sqrt(average(window.map((value) => (value - mean) ** 2)));
      return { lower: mean - deviations * deviation, upper: mean + deviations * deviation };
    };
    return {
      rule,
      description: direction === 'above'
        ? `가격이 Bollinger(${period}, ${deviations}σ) 하단 띠에서 반등`
        : `가격이 Bollinger(${period}, ${deviations}σ) 상단 띠에서 하락`,
      dataReady: enough,
      matches: (index) => {
        if (index === 0) return false;
        const previous = bandAt(index - 1);
        const current = bandAt(index);
        if (!previous || !current) return false;
        return direction === 'above'
          ? closes[index - 1] <= previous.lower && closes[index] > current.lower
          : closes[index - 1] >= previous.upper && closes[index] < current.upper;
      },
    };
  }
  if (rule.kind === 'PRICE' || rule.kind === 'PRICE_CHANGE') {
    const reference = rule.kind === 'PRICE' ? rule.target : rule.base;
    const threshold = rule.threshold ?? 0;
    return {
      rule,
      description: rule.kind === 'PRICE'
        ? `가격이 ${reference ?? '기준 가격'} ${rule.op || '비교'}`
        : `${reference ?? '기준 가격'} 대비 ${threshold}% ${direction === 'above' ? '상승' : '하락'}`,
      dataReady: enough,
      matches: (index, position) => {
        const base = priceReferenceAt(reference, index, candles, position);
        if (base === null || base === 0) return false;
        if (rule.kind === 'PRICE') return compared(closes[index], base, rule.op);
        const change = ((closes[index] - base) / base) * 100;
        return direction === 'above' ? change >= threshold : change <= -threshold;
      },
    };
  }
  if (rule.kind === 'VOLUME_COMPARE') {
    const period = rule.period ?? 20;
    const multiplier = rule.multiplier ?? 1;
    return {
      rule,
      description: `거래량이 ${rule.target ?? `최근 ${period}봉 평균`} ${rule.op || '비교'}`,
      dataReady: enough,
      matches: (index) => {
        if (index === 0) return false;
        const reference = rule.target === '이전 봉 거래량'
          ? candles[index - 1].volume
          : index < period ? null : average(candles.slice(index - period, index).map((candle) => candle.volume)) * multiplier;
        return reference !== null && compared(candles[index].volume, reference, rule.op);
      },
    };
  }
  if (rule.kind === 'STREAK') {
    const bars = rule.period ?? 2;
    return {
      rule,
      description: `${bars}봉 연속 ${direction === 'above' ? '상승' : '하락'}`,
      dataReady: enough,
      matches: (index) => {
        if (index < bars) return false;
        for (let step = index - bars + 1; step <= index; step += 1) {
          if (direction === 'above' ? closes[step] <= closes[step - 1] : closes[step] >= closes[step - 1]) return false;
        }
        return true;
      },
    };
  }
  if (rule.kind === 'POSITION_RETURN' || rule.kind === 'PEAK_RETURN' || rule.kind === 'DRAWDOWN_FROM_PEAK') {
    const threshold = rule.threshold ?? 0;
    return {
      rule,
      description: rule.kind === 'POSITION_RETURN'
        ? `현재 수익률이 ${threshold}% ${direction === 'above' ? '이상 수익' : '이상 손실'}`
        : rule.kind === 'PEAK_RETURN'
          ? `최고 수익률이 ${threshold}% ${rule.op || '비교'}`
          : `고점 대비 하락이 ${threshold}% ${rule.op || '비교'}`,
      dataReady: true,
      matches: (index, position) => {
        if (!position.holding || position.entryPrice === 0) return false;
        const currentReturn = ((closes[index] / position.entryPrice) - 1) * 100;
        if (rule.kind === 'POSITION_RETURN') return direction === 'above' ? currentReturn >= threshold : currentReturn <= -threshold;
        if (rule.kind === 'PEAK_RETURN') return compared(position.peakReturnPct, threshold, rule.op);
        return compared(position.peakReturnPct - currentReturn, threshold, rule.op);
      },
    };
  }
  if (rule.kind === 'HOLDING_PERIOD') {
    const amount = rule.amount ?? 1;
    return {
      rule,
      description: rule.unit === 'SESSION_CLOSE' ? '당일 장 마감까지 보유' : `보유 기간 ${amount}${rule.unit === 'TRADING_DAY' ? '거래일' : '봉'} 이상`,
      dataReady: true,
      matches: (index, position) => {
        if (!position.holding) return false;
        if (rule.unit === 'SESSION_CLOSE') {
          return index + 1 < candles.length && easternDate(candles[index + 1].time) !== easternDate(candles[index].time);
        }
        if (rule.unit === 'TRADING_DAY') {
          const dates = new Set(candles.slice(position.entryIndex, index + 1).map((candle) => easternDate(candle.time)));
          return dates.size >= amount;
        }
        return index - position.entryIndex + 1 >= amount;
      },
    };
  }
  if (rule.kind === 'SCHEDULE') {
    return {
      rule,
      description: `${rule.cycle ?? '선택한 주기'}에 진입`,
      dataReady: true,
      matches: (index) => {
        const date = easternDate(candles[index].time);
        if (index > 0 && easternDate(candles[index - 1].time) === date) return false;
        if (rule.cycle === '매 거래일') return true;
        const [year, month] = date.split('-');
        const earlierDates = [...new Set(candles.slice(0, index).map((candle) => easternDate(candle.time)))];
        if (rule.cycle === '매월 첫 거래일') return !earlierDates.some((candidate) => candidate.startsWith(`${year}-${month}`));
        if (rule.cycle === '매월 마지막 거래일') {
          const nextDate = candles.slice(index + 1).map((candle) => easternDate(candle.time)).find((candidate) => candidate !== date);
          return !nextDate || !nextDate.startsWith(`${year}-${month}`);
        }
        if (rule.cycle === 'N거래일마다') return earlierDates.length % Math.max(1, rule.amount ?? 1) === 0;
        const current = new Date(`${date}T12:00:00-04:00`);
        const weekStart = new Date(current);
        weekStart.setDate(current.getDate() - ((current.getDay() + 6) % 7));
        return !earlierDates.some((candidate) => {
          const day = new Date(`${candidate}T12:00:00-04:00`);
          return day >= weekStart && day <= current;
        });
      },
    };
  }
  return null;
};

/* 두 계열의 교차가 일어난 봉만 신호로 본다. 조건을 만족하는 모든 봉을
   신호로 삼으면 한 구간에서 수십 개가 찍혀 판단이 불가능해진다. */
const crossedAt = (series: RuleSeries, index: number): boolean => {
  if (index === 0) return false;
  const value = series.value[index];
  const reference = series.reference[index];
  const previousValue = series.value[index - 1];
  const previousReference = series.reference[index - 1];
  if (value === null || reference === null || previousValue === null || previousReference === null) return false;
  return series.direction === 'above'
    ? previousValue <= previousReference && value > reference
    : previousValue >= previousReference && value < reference;
};

/* ---------- 오버레이 ---------------------------------------------------- */

/*
  블록에 있는 지표는 규칙으로 쓰이지 않아도 차트에 그린다. Bollinger 밴드나
  RSI가 눈에 보여야 매수·매도 시점이 왜 그 자리인지 사용자가 확인할 수 있다.
*/
export const buildOverlays = (blocks: PreviewBlock[], candles: PreviewCandle[]): PreviewOverlay[] => {
  const closes = candles.map((candle) => candle.close);
  const overlays: PreviewOverlay[] = [];
  const seen = new Set<string>();

  for (const block of blocks) {
    const rule = signalRuleFrom(block);
    if (!rule) continue;
    const kind = rule.kind;
    const periods = { fast: rule.fastPeriod, slow: rule.slowPeriod };
    const period = rule.period ?? 20;
    const id = `${kind}-${periods.fast ?? period}-${periods.slow ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);

    if (kind === 'BOLLINGER') {
      const bands = bollinger(closes, period, rule.deviations ?? 2);
      overlays.push({
        id,
        name: `Bollinger(${period})`,
        pane: 'price',
        lines: [
          { id: `${id}-upper`, name: '상단', values: bands.upper },
          { id: `${id}-middle`, name: '중심선', values: bands.middle },
          { id: `${id}-lower`, name: '하단', values: bands.lower },
        ],
      });
      continue;
    }
    if (kind === 'DONCHIAN') {
      const channel = donchian(candles, period);
      overlays.push({
        id,
        name: `Donchian(${period})`,
        pane: 'price',
        lines: [
          { id: `${id}-upper`, name: '고가', values: channel.upper },
          { id: `${id}-lower`, name: '저가', values: channel.lower },
        ],
      });
      continue;
    }
    if (kind === 'SMA' || kind === 'EMA') {
      const line = kind === 'SMA' ? sma : ema;
      const lines: OverlayLine[] = periods.fast && periods.slow
        ? [
          { id: `${id}-fast`, name: `${kind}(${periods.fast})`, values: line(closes, periods.fast) },
          { id: `${id}-slow`, name: `${kind}(${periods.slow})`, values: line(closes, periods.slow) },
        ]
        : [{ id: `${id}-single`, name: `${kind}(${period})`, values: line(closes, period) }];
      overlays.push({ id, name: lines.map((item) => item.name).join(' · '), pane: 'price', lines });
      continue;
    }
    if (kind === 'RSI') {
      overlays.push({
        id,
        name: `RSI(${period})`,
        pane: 'lower',
        lines: [{ id: `${id}-line`, name: `RSI(${period})`, values: rsi(closes, period) }],
        guides: [30, 70],
      });
      continue;
    }
    if (kind === 'STOCHASTIC') {
      overlays.push({
        id,
        name: `Stochastic(${period})`,
        pane: 'lower',
        lines: [{ id: `${id}-line`, name: '%K', values: stochastic(candles, period) }],
        guides: [20, 80],
      });
      continue;
    }
    if (kind === 'MACD') {
      const lines = macd(closes);
      overlays.push({
        id,
        name: 'MACD(12·26·9)',
        pane: 'lower',
        lines: [
          { id: `${id}-macd`, name: 'MACD', values: lines.macd },
          { id: `${id}-signal`, name: 'SIGNAL', values: lines.signal },
        ],
        guides: [0],
      });
      continue;
    }
    if (kind === 'VOLUME_SMA') {
      const volumes = candles.map((candle) => candle.volume);
      overlays.push({
        id,
        name: `Volume SMA(${period})`,
        pane: 'lower',
        lines: [{ id: `${id}-line`, name: '평균 대비 %', values: sma(volumes, period).map((mean, index) => (mean === null || mean === 0 ? null : (volumes[index] / mean) * 100)) }],
        guides: [100],
      });
    }
  }

  return overlays;
};

/* ---------- 전체 미리보기 ------------------------------------------------ */

export interface PreviewInput {
  symbol: string;
  flows: PreviewFlow[];
  /** Real server bars. Omit only for the isolated prototype/test surface. */
  candles?: PreviewCandle[];
  /* 기본은 고정 1개월 창. 테스트에서만 다른 해상도를 확인한다. */
  timeframeSeconds?: number;
  candleCount?: number;
}

const emptySummary: PreviewSummary = {
  buyCount: 0,
  sellCount: 0,
  tradeCount: 0,
  winRate: null,
  totalReturnPct: 0,
  averageHoldingBars: null,
  openPosition: false,
};

export const evaluateStrategyPreview = ({
  symbol,
  flows,
  candles: suppliedCandles,
  timeframeSeconds = PREVIEW_WINDOW.seconds,
  candleCount = PREVIEW_WINDOW.count,
}: PreviewInput): StrategyPreview => {
  const sourceCandles = suppliedCandles ?? generatePreviewCandles(symbol, timeframeSeconds, candleCount);
  const candles = sourceCandles.length > PREVIEW_MAX_CANDLES
    ? sourceCandles.slice(-PREVIEW_MAX_CANDLES)
    : sourceCandles;
  const unsupported = new Set<string>();
  /* 한 컨테이너 안의 조건은 런타임과 똑같이 AND다. 하나라도 해석할 수 없는
     블록이 있으면 그 플로우는 fail-closed로 신호를 만들지 않는다. */
  const evaluated = flows.map((flow) => {
    const parsed = parseSignalRules(flow.blocks);
    parsed.unsupported.forEach((label) => unsupported.add(label));
    const evaluators = parsed.rules
      .map((rule) => buildRuleEvaluator(rule, candles))
      .filter((item): item is RuleEvaluator => item !== null);
    const evaluable = parsed.unsupported.length === 0
      && evaluators.length === parsed.rules.length
      && evaluators.length > 0;
    return { flow, rules: parsed.rules, evaluators, evaluable };
  });
  const buyFlows = evaluated.filter((item) => item.flow.side === 'buy');
  const sellFlows = evaluated.filter((item) => item.flow.side === 'sell');
  const overlays = buildOverlays(flows.flatMap((flow) => flow.blocks), candles);

  const markers: PreviewMarker[] = [];
  const trades: PreviewTrade[] = [];
  const executionCounts = new Map<string, number>();
  let holding = false;
  let entryIndex = 0;
  let entryPrice = 0;
  let peakReturnPct = 0;

  /*
     체결 가격은 신호 다음 봉의 시가를 쓴다. Basic 전략의 주문 블록이
     "다음 봉 체결"을 기본으로 하므로, 신호가 난 봉의 종가로 사는 것처럼
     보여주면 실제보다 유리한 결과가 된다.
  */
  const fillPriceAt = (index: number): number => candles[index + 1].open;
  /* 같은 봉에서 여러 플로우가 동시에 조건을 만족하면 파티션 안의 순서가 앞선
     플로우가 주문을 만든다. 실제 실행에서도 하나의 포지션만 열리므로 미리보기도
     같은 규칙을 따른다. */
  const position = (): PreviewPositionState => ({ holding, entryIndex, entryPrice, peakReturnPct });
  const firstTriggered = (candidates: typeof evaluated, index: number) =>
    candidates.find((item) => {
      const used = executionCounts.get(item.flow.id) ?? 0;
      if (item.flow.maxExecutions !== undefined && used >= item.flow.maxExecutions) return false;
      return item.evaluable && item.evaluators.every((rule) => rule.matches(index, position()));
    });

  candles.forEach((candle, index) => {
    if (!holding) {
      const triggered = firstTriggered(buyFlows, index);
      if (!triggered || index + 1 >= candles.length) return;
      holding = true;
      entryIndex = Math.min(index + 1, candles.length - 1);
      entryPrice = fillPriceAt(index);
      peakReturnPct = 0;
      executionCounts.set(triggered.flow.id, (executionCounts.get(triggered.flow.id) ?? 0) + 1);
      markers.push({
        index,
        time: candle.time,
        side: 'buy',
        price: entryPrice,
        reason: triggered.evaluators.map((rule) => rule.description).join(' · '),
        flowId: triggered.flow.id,
        flowLabel: triggered.flow.label,
      });
      return;
    }
    peakReturnPct = Math.max(peakReturnPct, ((candle.close / entryPrice) - 1) * 100);
    const triggered = firstTriggered(sellFlows, index);
    if (!triggered || index + 1 >= candles.length) return;
    holding = false;
    executionCounts.set(triggered.flow.id, (executionCounts.get(triggered.flow.id) ?? 0) + 1);
    const exitPrice = fillPriceAt(index);
    markers.push({
      index,
      time: candle.time,
      side: 'sell',
      price: exitPrice,
      reason: triggered.evaluators.map((rule) => rule.description).join(' · '),
      flowId: triggered.flow.id,
      flowLabel: triggered.flow.label,
    });
    trades.push({
      entryIndex,
      exitIndex: index,
      entryPrice,
      exitPrice,
      returnPct: ((exitPrice / entryPrice) - 1) * 100,
    });
  });

  const buyCount = markers.filter((marker) => marker.side === 'buy').length;
  const sellCount = markers.filter((marker) => marker.side === 'sell').length;
  const summary: PreviewSummary = trades.length === 0
    ? { ...emptySummary, buyCount, sellCount, openPosition: holding }
    : {
      buyCount,
      sellCount,
      tradeCount: trades.length,
      winRate: (trades.filter((trade) => trade.returnPct > 0).length / trades.length) * 100,
      /* 매매를 이어서 했을 때의 누적 수익률. 단순 합계는 복리를 무시해 과장된다. */
      totalReturnPct: (trades.reduce((product, trade) => product * (1 + trade.returnPct / 100), 1) - 1) * 100,
      averageHoldingBars: trades.reduce((sum, trade) => sum + (trade.exitIndex - trade.entryIndex), 0) / trades.length,
      openPosition: holding,
    };

  return {
    candles,
    flows: evaluated.map(({ flow, rules, evaluators, evaluable }) => ({
      id: flow.id,
      label: flow.label,
      side: flow.side,
      count: markers.filter((marker) => marker.flowId === flow.id).length,
      rule: rules[0] ?? null,
      description: evaluators.length > 0 ? evaluators.map((item) => item.description).join(' · ') : null,
      dataReady: evaluators.every((item) => item.dataReady),
      evaluable,
    })),
    unsupported: [...unsupported],
    markers,
    overlays,
    summary,
  };
};
