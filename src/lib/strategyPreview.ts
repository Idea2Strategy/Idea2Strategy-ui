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
  | 'PRICE';

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
  /* LOWER·UPPER·SIGNAL 같은 문자 기준값. */
  target?: string;
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

/* Wilder 방식 RSI. 표준 구현이라 사용자가 아는 값과 어긋나지 않는다. */
export const rsi = (values: number[], period = 14): Series => {
  const result: Series = values.map(() => null);
  if (values.length <= period) return result;
  let gain = 0;
  let loss = 0;
  for (let index = 1; index <= period; index += 1) {
    const change = values[index] - values[index - 1];
    gain += Math.max(0, change);
    loss += Math.max(0, -change);
  }
  gain /= period;
  loss /= period;
  result[period] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
  for (let index = period + 1; index < values.length; index += 1) {
    const change = values[index] - values[index - 1];
    gain = (gain * (period - 1) + Math.max(0, change)) / period;
    loss = (loss * (period - 1) + Math.max(0, -change)) / period;
    result[index] = loss === 0 ? 100 : 100 - 100 / (1 + gain / loss);
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
  { match: /^BOLL/i, kind: 'BOLLINGER', defaultPeriod: 20 },
  { match: /^VOLUME\s*SMA/i, kind: 'VOLUME_SMA', defaultPeriod: 20 },
  { match: /^SMA/i, kind: 'SMA', defaultPeriod: 20 },
  { match: /^EMA/i, kind: 'EMA', defaultPeriod: 20 },
  { match: /^STOCH/i, kind: 'STOCHASTIC', defaultPeriod: 14 },
  { match: /^MACD/i, kind: 'MACD' },
  { match: /^DONCHIAN/i, kind: 'DONCHIAN', defaultPeriod: 20 },
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

/*
  컨테이너의 블록 목록에서 신호 규칙 하나를 뽑는다. Basic 전략의 한 컨테이너는
  하나의 판단으로 귀결되므로, 미리보기는 첫 번째 계산 가능한 지표 블록을
  기준으로 삼고 나머지는 규칙 문구에만 반영한다.
*/
export const parseSignalRule = (blocks: PreviewBlock[]): { rule: SignalRule | null; unsupported: string[] } => {
  const unsupported: string[] = [];
  for (const block of blocks) {
    if (block.tone !== 'indicator') continue;
    const kind = identifyIndicator(block.label);
    if (!kind) {
      unsupported.push(block.label);
      continue;
    }
    const numeric = block.value?.match(/^(\d+(?:\.\d+)?)\s*%?$/);
    const target = block.value?.match(/^[A-Za-z]+/)?.[0]?.toUpperCase();
    return {
      rule: {
        kind,
        label: block.label,
        op: block.op ?? (kind === 'BOLLINGER' ? '<' : '>'),
        ...indicatorPeriodFor(kind, block.value),
        target: target && !numeric ? target : undefined,
      },
      unsupported,
    };
  }
  return { rule: null, unsupported };
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
  if (op === '>' || op === '↑') return 'above';
  if (op === '<' || op === '↓') return 'below';
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
    if (block.tone !== 'indicator') continue;
    const kind = identifyIndicator(block.label);
    if (!kind) continue;
    const resolved = indicatorPeriodFor(kind, block.value);
    const periods = { fast: resolved.fastPeriod, slow: resolved.slowPeriod };
    const period = resolved.period ?? 20;
    const id = `${kind}-${periods.fast ?? period}-${periods.slow ?? ''}`;
    if (seen.has(id)) continue;
    seen.add(id);

    if (kind === 'BOLLINGER') {
      const bands = bollinger(closes, period);
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
  timeframeSeconds = PREVIEW_WINDOW.seconds,
  candleCount = PREVIEW_WINDOW.count,
}: PreviewInput): StrategyPreview => {
  const candles = generatePreviewCandles(symbol, timeframeSeconds, candleCount);
  const unsupported = new Set<string>();
  /* 플로우별로 규칙을 따로 만든다. 여러 매수 플로우의 블록을 한 벌로 합치면
     첫 지표만 남아 나머지 플로우의 판단이 사라진다. */
  const evaluated = flows.map((flow) => {
    const parsed = parseSignalRule(flow.blocks);
    parsed.unsupported.forEach((label) => unsupported.add(label));
    const series = parsed.rule ? buildRuleSeries(parsed.rule, candles) : null;
    return { flow, rule: parsed.rule, series };
  });
  const buyFlows = evaluated.filter((item) => item.flow.side === 'buy');
  const sellFlows = evaluated.filter((item) => item.flow.side === 'sell');
  const overlays = buildOverlays(flows.flatMap((flow) => flow.blocks), candles);

  const markers: PreviewMarker[] = [];
  const trades: PreviewTrade[] = [];
  let holding = false;
  let entryIndex = 0;
  let entryPrice = 0;

  /*
     체결 가격은 신호 다음 봉의 시가를 쓴다. Basic 전략의 주문 블록이
     "다음 봉 체결"을 기본으로 하므로, 신호가 난 봉의 종가로 사는 것처럼
     보여주면 실제보다 유리한 결과가 된다.
  */
  const fillPriceAt = (index: number): number => candles[index + 1]?.open ?? candles[index].close;
  /* 같은 봉에서 여러 플로우가 동시에 조건을 만족하면 파티션 안의 순서가 앞선
     플로우가 주문을 만든다. 실제 실행에서도 하나의 포지션만 열리므로 미리보기도
     같은 규칙을 따른다. */
  const firstTriggered = (candidates: typeof evaluated, index: number) =>
    candidates.find((item) => item.series !== null && crossedAt(item.series, index));

  candles.forEach((candle, index) => {
    if (!holding) {
      const triggered = firstTriggered(buyFlows, index);
      if (!triggered) return;
      holding = true;
      entryIndex = index;
      entryPrice = fillPriceAt(index);
      markers.push({
        index,
        time: candle.time,
        side: 'buy',
        price: entryPrice,
        reason: triggered.series!.description,
        flowId: triggered.flow.id,
        flowLabel: triggered.flow.label,
      });
      return;
    }
    const triggered = firstTriggered(sellFlows, index);
    if (!triggered) return;
    holding = false;
    const exitPrice = fillPriceAt(index);
    markers.push({
      index,
      time: candle.time,
      side: 'sell',
      price: exitPrice,
      reason: triggered.series!.description,
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
    flows: evaluated.map(({ flow, rule, series }) => ({
      id: flow.id,
      label: flow.label,
      side: flow.side,
      count: markers.filter((marker) => marker.flowId === flow.id).length,
      rule,
      description: series?.description ?? null,
    })),
    unsupported: [...unsupported],
    markers,
    overlays,
    summary,
  };
};
