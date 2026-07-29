import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  CSSProperties,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  PointerEvent as ReactPointerEvent,
} from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  BadgeCheck,
  Bot,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CircleHelp,
  Coins,
  History,
  Info,
  LoaderCircle,
  Maximize2,
  Minimize2,
  PencilLine,
  Plus,
  Radio,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Trash2,
  Trophy,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button, DataTable, EmptyState, MetricRow, PageHeading, Panel, Status, type DataTableColumn } from '../components/common';
import { leaderboard, strategies, type LeaderboardEntry } from '../data/mockData';
import { Localized, useLanguage } from '../lib/i18n';

interface Benchmark {
  id: string;
  name: string;
  return: string;
  values: number[];
}

const backtestBenchmarks: Benchmark[] = [
  {
    id: 'sp500',
    name: 'S&P 500',
    return: '+10.8%',
    values: [0, 0.7, -0.4, 1.2, 2.4, 1.8, 3.7, 4.5, 6.1, 7.4, 8.3, 10.8],
  },
  {
    id: 'nasdaq',
    name: 'NASDAQ',
    return: '+15.1%',
    values: [0, 1.2, -0.8, 2.1, 3.8, 3, 5.9, 7.2, 8.4, 10.2, 12.3, 15.1],
  },
  {
    id: 'russell',
    name: 'Russell 2000',
    return: '+6.7%',
    values: [0, 0.2, -1.2, 0.5, 1.6, 0.8, 2.1, 2.7, 3.6, 4.4, 5.2, 6.7],
  },
];

const backtestBenchmark = backtestBenchmarks[0];

const backtestPeriods = ['2023 Q3', '2023 Q4', '2024 Q1', '2024 Q2', '2024 Q3', '2024 Q4', '2025 Q1', '2025 Q2', '2025 Q3', '2025 Q4', '2026 Q1', '2026 Q2'];

interface BacktestBot {
  name: string;
  strategy: string;
  return: string;
  alpha: string;
  drawdown: string;
  trades: number;
  values: number[];
}

const backtestBots: BacktestBot[] = [
  {
    name: 'Atlas 07',
    strategy: 'Opening Range Flow',
    return: '+18.4%',
    alpha: '+7.6%',
    drawdown: '−4.2%',
    trades: 42,
    values: [0, 1.1, -0.8, 2.2, 4.1, 3.2, 6.4, 5.7, 9.1, 12.4, 14.2, 18.4],
  },
  {
    name: 'Room Beta',
    strategy: 'Momentum Rotation',
    return: '+13.7%',
    alpha: '+2.9%',
    drawdown: '−3.1%',
    trades: 31,
    values: [0, 0.4, -0.2, 1.7, 3.2, 2.8, 4.9, 5.8, 7.6, 9.3, 10.4, 13.7],
  },
  {
    name: 'Pair Lab',
    strategy: 'Pair Spread Monitor',
    return: '−2.6%',
    alpha: '-13.4%',
    drawdown: '−8.7%',
    trades: 18,
    values: [0, -0.5, 0.2, -1.4, -2.8, -1.9, -3.7, -4.6, -5.4, -4.8, -4.1, -2.6],
  },
  {
    name: 'Volatility Edge',
    strategy: 'Volatility Breakout',
    return: '+9.8%',
    alpha: '-1.0%',
    drawdown: '−5.6%',
    trades: 27,
    values: [0, -0.3, 1.4, 0.8, 2.9, 2.2, 4.6, 3.8, 6.1, 7.4, 8.2, 9.8],
  },
  {
    name: 'Sector Pulse',
    strategy: 'Sector Momentum',
    return: '+7.1%',
    alpha: '-3.7%',
    drawdown: '−3.8%',
    trades: 24,
    values: [0, 0.5, 0.1, 1.2, 2.1, 1.7, 3.3, 3.9, 4.8, 5.4, 6.2, 7.1],
  },
  {
    name: 'Dividend Guard',
    strategy: 'Dividend Quality',
    return: '+5.4%',
    alpha: '-5.4%',
    drawdown: '−2.4%',
    trades: 16,
    values: [0, 0.3, 0.7, 0.5, 1.4, 1.9, 2.3, 2.8, 3.4, 4.1, 4.7, 5.4],
  },
  {
    name: 'Tech Swing',
    strategy: 'Technology Swing',
    return: '+21.2%',
    alpha: '+10.4%',
    drawdown: '−7.9%',
    trades: 38,
    values: [0, 1.8, -0.9, 3.4, 5.7, 4.1, 8.5, 7.3, 12.1, 15.6, 17.8, 21.2],
  },
  {
    name: 'Mean Revert',
    strategy: 'Mean Reversion',
    return: '+3.6%',
    alpha: '-7.2%',
    drawdown: '−4.9%',
    trades: 35,
    values: [0, -0.7, 0.6, -0.2, 1.1, 0.4, 1.8, 1.2, 2.6, 2.1, 3.0, 3.6],
  },
];

const candleTimes = ['09:30', '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30', '14:00', '14:30', '15:00', '15:30', '16:00', '09:30', '10:00', '10:30', '11:00'];
const calendarWeekdays = ['일', '월', '화', '수', '목', '금', '토'];

function formatCalendarDate(date: string): string {
  if (!date) return '';
  const [year, month, day] = date.split('-');
  return `${year}. ${month}. ${day}.`;
}

function calendarDateLabel(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${year}년 ${month}월 ${day}일`;
}

function calendarMonthLabel(monthKey: string): string {
  const [year, month] = monthKey.split('-').map(Number);
  return `${year}년 ${month}월`;
}

function shiftCalendarMonth(monthKey: string, offset: number): string {
  const [year, month] = monthKey.split('-').map(Number);
  const shifted = new Date(Date.UTC(year, month - 1 + offset, 1));
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`;
}

function calendarDatesForMonth(monthKey: string): (string | null)[] {
  const [year, month] = monthKey.split('-').map(Number);
  const firstWeekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cellCount = Math.ceil((firstWeekday + daysInMonth) / 7) * 7;
  return Array.from({ length: cellCount }, (_, index) => {
    const day = index - firstWeekday + 1;
    return day > 0 && day <= daysInMonth
      ? `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
      : null;
  });
}

type ExecutionSide = '매수' | '매도';

interface ExecutionSpec {
  index: number;
  side: ExecutionSide;
  quantity: number;
  partial?: boolean;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

type Execution = {
  id: string;
  index: number;
  date: string;
  timestamp: string;
  time: string;
  symbol: string;
  side: ExecutionSide;
  quantity: string;
  price: string;
  value: string;
  fee: string;
  result: string;
};

interface Instrument {
  symbol: string;
  name: string;
  candles: Candle[];
  executions: Execution[];
}

function makeInstrument(symbol: string, name: string, basePrice: number, changes: number[], executionSpecs: ExecutionSpec[]): Instrument {
  let previousClose = basePrice;
  const candles = changes.map((change, index) => {
    const open = previousClose;
    const close = open + change;
    const swing = Math.max(Math.abs(change) * .58, basePrice * .0028) + (index % 3) * basePrice * .0007;
    const candle = {
      time: `${index < 14 ? '07.18' : '07.19'} ${candleTimes[index]}`,
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) + swing).toFixed(2)),
      low: Number((Math.min(open, close) - swing * .82).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: 420000 + ((index * 173000 + symbol.charCodeAt(0) * 11000) % 1280000),
    };
    previousClose = close;
    return candle;
  });
  const executions = executionSpecs.map((execution, order) => {
    const candle = candles[execution.index];
    const price = candle.close;
    return {
      id: `${symbol}-${execution.index}-${execution.side}`,
      index: execution.index,
      date: execution.index < 14 ? '2026-07-18' : '2026-07-19',
      timestamp: `${execution.index < 14 ? '2026-07-18' : '2026-07-19'}T${candleTimes[execution.index]}`,
      time: candle.time,
      symbol,
      side: execution.side,
      quantity: `${execution.quantity}주`,
      price: `$${price.toFixed(2)}`,
      value: `$${(price * execution.quantity).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      fee: `$${(price * execution.quantity * .002).toFixed(2)}`,
      result: order === executionSpecs.length - 1 && execution.partial ? '부분 체결' : '체결',
    };
  });
  return { symbol, name, candles, executions };
}

const botInstruments: Record<string, Instrument[]> = {
  'Atlas 07': [
    makeInstrument('SPY', 'SPDR S&P 500 ETF', 549.2, [1.6, -2.2, 3.1, 1.4, -1.1, 2.8, 1.2, -2.4, 3.8, 2.1, -1.5, 2.7, 1.8, .9, -2.1, 3.4, 1.2, 2.5], [{ index: 2, side: '매수', quantity: 12 }, { index: 10, side: '매도', quantity: 5 }, { index: 15, side: '매수', quantity: 8 }]),
    makeInstrument('AAPL', 'Apple Inc.', 224.8, [-.8, 1.4, 2.1, -1.2, .9, 1.8, -.7, 2.4, -1.6, .8, 1.3, -2.1, 2.8, 1.1, -.9, 1.7, .6, 1.2], [{ index: 1, side: '매수', quantity: 10 }, { index: 8, side: '매도', quantity: 6 }, { index: 13, side: '매수', quantity: 4 }]),
    makeInstrument('QQQ', 'Invesco QQQ Trust', 486.4, [1.1, 2.2, -1.7, .8, 2.6, -2.1, 1.4, 1.9, -.6, 2.8, -1.4, .7, 2.1, 1.6, -2.2, 1.9, .8, 2.3], [{ index: 3, side: '매수', quantity: 7 }, { index: 11, side: '매도', quantity: 7 }]),
  ],
  'Room Beta': [
    makeInstrument('MSFT', 'Microsoft Corp.', 441.6, [1.2, -.7, 2.4, 1.1, -1.8, 2.2, .7, 1.8, -1.1, 2.7, .8, -1.6, 2.1, 1.4, -.6, 1.9, 1.2, .9], [{ index: 2, side: '매수', quantity: 9 }, { index: 12, side: '매도', quantity: 4 }]),
    makeInstrument('NVDA', 'NVIDIA Corp.', 118.4, [2.1, 1.8, -2.7, 3.2, 1.4, -1.9, 2.8, -3.1, 1.7, 2.6, -1.3, 3.4, -2.2, 1.8, 2.1, -1.6, 2.9, 1.1], [{ index: 3, side: '매수', quantity: 18 }, { index: 7, side: '매도', quantity: 8 }, { index: 14, side: '매수', quantity: 10 }]),
    makeInstrument('TSLA', 'Tesla Inc.', 248.9, [-2.8, 3.6, 1.4, -4.1, 2.7, 3.1, -2.2, 1.8, -3.4, 4.2, 2.1, -1.7, 3.8, -2.9, 1.6, 2.4, -1.2, 3.1], [{ index: 1, side: '매수', quantity: 6 }, { index: 9, side: '매도', quantity: 6 }]),
  ],
  'Pair Lab': [
    makeInstrument('KO', 'Coca-Cola Co.', 63.4, [.3, -.2, .4, .2, -.5, .3, .1, -.4, .5, -.2, .3, -.1, .4, .2, -.3, .5, -.2, .3], [{ index: 2, side: '매수', quantity: 24 }, { index: 12, side: '매도', quantity: 12 }]),
    makeInstrument('PEP', 'PepsiCo Inc.', 169.8, [-.4, .7, .3, -.6, .8, -.2, .5, .4, -.7, .6, .2, -.4, .9, -.3, .4, .5, -.2, .6], [{ index: 3, side: '매도', quantity: 9 }, { index: 9, side: '매수', quantity: 9 }]),
    makeInstrument('XOM', 'Exxon Mobil Corp.', 115.2, [.6, -.3, .8, -.5, .4, .7, -.6, .9, -.2, .5, -.4, .8, .3, -.7, .6, .4, -.2, .7], [{ index: 1, side: '매수', quantity: 14 }, { index: 7, side: '매도', quantity: 7 }, { index: 15, side: '매수', quantity: 7, partial: true }]),
  ],
};

Object.assign(botInstruments, {
  'Volatility Edge': botInstruments['Atlas 07'],
  'Sector Pulse': botInstruments['Room Beta'],
  'Dividend Guard': botInstruments['Pair Lab'],
  'Tech Swing': botInstruments['Room Beta'],
  'Mean Revert': botInstruments['Pair Lab'],
});

/*
  차트 기간은 식별자와 표시 이름을 분리한다.

  Localized는 화면으로 넘어가는 문자열 prop을 전부 번역하므로, 한글 이름을 그대로
  키로 쓰면 영어에서 조회가 빗나가 캔들이 0개가 되고 화면이 죽는다(#47). 키는
  번역되지 않는 영문 식별자로 두고, 사람이 읽는 이름만 번역 대상으로 남긴다.
*/
const chartTimeframes = [
  { id: 'hour', label: '1시간', candleCount: 48 },
  { id: 'hour4', label: '4시간', candleCount: 38 },
  { id: 'day', label: '1일', candleCount: 200 },
  { id: 'week', label: '주봉', candleCount: 24 },
  { id: 'month', label: '달봉', candleCount: 18 },
  { id: 'year', label: '년봉', candleCount: 12 },
] as const;
type Timeframe = (typeof chartTimeframes)[number]['id'];
const timeframeOf = (id: Timeframe) => chartTimeframes.find((option) => option.id === id) ?? chartTimeframes[2];
const VISIBLE_CANDLE_COUNT = 60;

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addUtcDays(date: Date, days: number): Date {
  const nextDate = new Date(date);
  nextDate.setUTCDate(nextDate.getUTCDate() + days);
  return nextDate;
}

function tradingDayDate(index: number): Date {
  const date = new Date(Date.UTC(2025, 9, 24));
  let remainingDays = index;
  while (remainingDays > 0) {
    date.setUTCDate(date.getUTCDate() + 1);
    const weekday = date.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remainingDays -= 1;
  }
  return date;
}

interface TimeframeCandleMeta {
  label: string;
  rangeStart: string;
  rangeEnd: string;
}

function timeframeCandleMeta(timeframe: Timeframe, index: number): TimeframeCandleMeta {
  if (timeframe === 'hour') {
    const date = addUtcDays(new Date(Date.UTC(2026, 6, 15)), Math.floor(index / 7));
    const isoDate = toIsoDate(date);
    return {
      label: `${isoDate.slice(5).replace('-', '.')} ${String(9 + (index % 7)).padStart(2, '0')}:30`,
      rangeStart: isoDate,
      rangeEnd: isoDate,
    };
  }
  if (timeframe === 'hour4') {
    const date = addUtcDays(new Date(Date.UTC(2026, 6, 2)), index);
    const isoDate = toIsoDate(date);
    return {
      label: `${isoDate.slice(5).replace('-', '.')} ${index % 2 ? '13:00' : '09:00'}`,
      rangeStart: isoDate,
      rangeEnd: isoDate,
    };
  }
  if (timeframe === 'day') {
    const isoDate = toIsoDate(tradingDayDate(index));
    return { label: isoDate.replaceAll('-', '.'), rangeStart: isoDate, rangeEnd: isoDate };
  }
  if (timeframe === 'week') {
    const rangeStart = addUtcDays(new Date(Date.UTC(2026, 0, 1)), index * 7);
    return {
      label: `2026 ${String(index + 1).padStart(2, '0')}주`,
      rangeStart: toIsoDate(rangeStart),
      rangeEnd: toIsoDate(addUtcDays(rangeStart, 6)),
    };
  }
  if (timeframe === 'month') {
    const year = 2025 + Math.floor(index / 12);
    const month = index % 12;
    return {
      label: `${year}.${String(month + 1).padStart(2, '0')}`,
      rangeStart: toIsoDate(new Date(Date.UTC(year, month, 1))),
      rangeEnd: toIsoDate(new Date(Date.UTC(year, month + 1, 0))),
    };
  }
  const year = 2015 + index;
  return {
    label: String(year),
    rangeStart: `${year}-01-01`,
    rangeEnd: `${year}-12-31`,
  };
}

interface TimeframeCandle extends Candle {
  rangeStart: string;
  rangeEnd: string;
}

function candlesForTimeframe(candles: Candle[], timeframe: Timeframe): TimeframeCandle[] {
  const count = timeframeOf(timeframe).candleCount;
  const sourceLastIndex = candles.length - 1;
  const sourceRange = Math.max(...candles.map((candle) => candle.high)) - Math.min(...candles.map((candle) => candle.low));
  let previousClose = candles[0].open;
  return Array.from({ length: count }, (_, index) => {
    const timeframeMeta = timeframeCandleMeta(timeframe, index);
    const sourcePosition = (index / (count - 1)) * sourceLastIndex;
    const sourceIndex = Math.floor(sourcePosition);
    const nextIndex = Math.min(sourceIndex + 1, sourceLastIndex);
    const progress = sourcePosition - sourceIndex;
    const source = candles[sourceIndex];
    const next = candles[nextIndex];
    const interpolatedClose = source.close + (next.close - source.close) * progress;
    const texture = Math.sin((index + 1) * 1.73) * sourceRange * .018;
    const close = interpolatedClose + texture;
    const open = previousClose;
    const swing = Math.max(Math.abs(close - open) * .62, sourceRange * .018) + (index % 3) * sourceRange * .004;
    const candle = {
      time: timeframeMeta.label,
      rangeStart: timeframeMeta.rangeStart,
      rangeEnd: timeframeMeta.rangeEnd,
      open: Number(open.toFixed(2)),
      high: Number((Math.max(open, close) + swing).toFixed(2)),
      low: Number((Math.min(open, close) - swing * .82).toFixed(2)),
      close: Number(close.toFixed(2)),
      volume: Math.round((source.volume + (next.volume - source.volume) * progress) * (.86 + (index % 5) * .055)),
    };
    previousClose = close;
    return candle;
  });
}

function simpleMovingAverage(candles: Candle[], period: number): (number | null)[] {
  return candles.map((_, index) => {
    if (index < period - 1) return null;
    const window = candles.slice(index - period + 1, index + 1);
    return window.reduce((total, candle) => total + candle.close, 0) / period;
  });
}

function exponentialMovingAverage(candles: Candle[], period: number): number[] {
  const multiplier = 2 / (period + 1);
  return candles.reduce<number[]>((values, candle, index) => {
    const previous = index === 0 ? candle.close : values[index - 1];
    values.push(candle.close * multiplier + previous * (1 - multiplier));
    return values;
  }, []);
}

function comparisonPoints(values: number[], width: number, height: number, min: number, max: number, padX = 18, padY = 18): [number, number][] {
  const range = max - min || 1;
  return values.map((value, index): [number, number] => [
    padX + (index / (values.length - 1)) * (width - padX * 2),
    height - padY - ((value - min) / range) * (height - padY * 2),
  ]);
}

function BacktestComparisonChart({ bot, benchmarks }: { bot: BacktestBot; benchmarks: Benchmark[] }) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const width = 820;
  const height = 280;
  const combined = [...bot.values, ...benchmarks.flatMap((benchmark) => benchmark.values)];
  const min = Math.min(...combined, 0) - 2;
  const max = Math.max(...combined, 0) + 2;
  const botPoints = comparisonPoints(bot.values, width, height, min, max);
  const benchmarkSeries = benchmarks.map((benchmark) => ({
    ...benchmark,
    points: comparisonPoints(benchmark.values, width, height, min, max),
  }));
  const toPolyline = (points: [number, number][]) => points.map(([x, y]) => `${x},${y}`).join(' ');
  const zeroY = height - 18 - ((0 - min) / (max - min)) * (height - 36);
  const activeBotPoint = hoveredIndex === null ? null : botPoints[hoveredIndex];
  const setIndexFromPointer = (event: ReactMouseEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const normalizedX = Math.min(Math.max((event.clientX - bounds.left) / (bounds.width || 1), 18 / width), 1 - (18 / width));
    const ratio = (normalizedX - (18 / width)) / (1 - (36 / width));
    setHoveredIndex(Math.round(ratio * (bot.values.length - 1)));
  };
  const moveIndexWithKeyboard = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
    event.preventDefault();
    const direction = event.key === 'ArrowRight' ? 1 : -1;
    setHoveredIndex((current) => Math.min(Math.max((current ?? 0) + direction, 0), bot.values.length - 1));
  };

  return <div
    className="backtest-comparison-chart"
    data-testid="backtest-comparison-chart"
    tabIndex={0}
    onMouseMove={setIndexFromPointer}
    onMouseLeave={() => setHoveredIndex(null)}
    onFocus={() => setHoveredIndex((current) => current ?? bot.values.length - 1)}
    onBlur={() => setHoveredIndex(null)}
    onKeyDown={moveIndexWithKeyboard}
  >
    <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${bot.name}와 시장 지수 누적 수익률 비교`}>
      {[0.2, 0.4, 0.6, 0.8].map((ratio) => <line key={ratio} className="backtest-chart-gridline" x1="18" x2={width - 18} y1={height * ratio} y2={height * ratio} />)}
      <line className="backtest-chart-zero" x1="18" x2={width - 18} y1={zeroY} y2={zeroY} />
      {benchmarkSeries.map((benchmark) => <polyline
        key={benchmark.id}
        className={`backtest-chart-line benchmark ${benchmark.id}`}
        points={toPolyline(benchmark.points)}
        data-testid={`backtest-benchmark-series-${benchmark.id}`}
        data-benchmark={benchmark.name}
        vectorEffect="non-scaling-stroke"
      />)}
      <polyline
        className="backtest-chart-line bot-emphasis"
        points={toPolyline(botPoints)}
        data-testid="backtest-bot-emphasis"
        data-bot={bot.name}
        aria-hidden="true"
        transform="translate(0 1.6)"
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="backtest-chart-line bot"
        points={toPolyline(botPoints)}
        data-testid="backtest-bot-series"
        data-bot={bot.name}
        vectorEffect="non-scaling-stroke"
      />
      {benchmarkSeries.map((benchmark) => <circle
        key={benchmark.id}
        className={`backtest-chart-end benchmark ${benchmark.id}`}
        cx={benchmark.points.at(-1)![0]}
        cy={benchmark.points.at(-1)![1]}
        r="4"
        vectorEffect="non-scaling-stroke"
      />)}
      <circle className="backtest-chart-end bot" cx={botPoints.at(-1)![0]} cy={botPoints.at(-1)![1]} r="5" vectorEffect="non-scaling-stroke" />
      {hoveredIndex !== null && <>
        <line className="backtest-chart-hover-line" x1={activeBotPoint![0]} x2={activeBotPoint![0]} y1="18" y2={height - 18} vectorEffect="non-scaling-stroke" />
        {benchmarkSeries.map((benchmark) => <circle
          key={benchmark.id}
          className={`backtest-chart-hover-point benchmark ${benchmark.id}`}
          cx={benchmark.points[hoveredIndex][0]}
          cy={benchmark.points[hoveredIndex][1]}
          r="5"
          vectorEffect="non-scaling-stroke"
        />)}
        <circle className="backtest-chart-hover-point bot" cx={activeBotPoint![0]} cy={activeBotPoint![1]} r="6" vectorEffect="non-scaling-stroke" />
      </>}
    </svg>
    {hoveredIndex !== null && <div
      className={`backtest-chart-tooltip ${hoveredIndex < 2 ? 'edge-left' : hoveredIndex > bot.values.length - 3 ? 'edge-right' : ''}`}
      role="tooltip"
      style={{ left: `${(activeBotPoint![0] / width) * 100}%` }}
    >
      <strong>{backtestPeriods[hoveredIndex]}</strong>
      <span className="bot"><i />{bot.name}<b>{bot.values[hoveredIndex] > 0 ? '+' : ''}{bot.values[hoveredIndex].toFixed(1)}%</b></span>
      {benchmarks.map((benchmark) => <span className={`benchmark ${benchmark.id}`} key={benchmark.id}><i />{benchmark.name}<b>{benchmark.values[hoveredIndex] > 0 ? '+' : ''}{benchmark.values[hoveredIndex].toFixed(1)}%</b></span>)}
    </div>}
    <div className="backtest-chart-axis"><span>2023 Q3</span><span>2024 Q2</span><span>2025 Q2</span><span>2026 Q2</span></div>
  </div>;
}

interface ChartVisibleRange {
  startDate: string;
  endDate: string;
  executionIds: string[];
}

type ChartIndicatorId = 'sma' | 'ema';
type ChartDragMode = 'panning' | 'scaling';

interface ChartDrawingPoint {
  index: number;
  price: number;
}

interface ChartDrawing {
  start: ChartDrawingPoint;
  end: ChartDrawingPoint;
}

interface ChartInteraction {
  mode: ChartDragMode;
  pointerId: number;
  startX: number;
  startY: number;
  startView: number;
  startScale: number;
  startOffset: number;
}

interface BacktestCandlestickChartProps {
  instrument: Instrument;
  timeframe: Timeframe;
  onVisibleRangeChange?: (range: ChartVisibleRange) => void;
}

function BacktestCandlestickChart({ instrument, timeframe, onVisibleRangeChange }: BacktestCandlestickChartProps) {
  const displayCandles = useMemo(() => candlesForTimeframe(instrument.candles, timeframe), [instrument.candles, timeframe]);
  const defaultVisibleCount = Math.min(VISIBLE_CANDLE_COUNT, displayCandles.length);
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [viewStart, setViewStart] = useState(() => Math.max(0, timeframeOf(timeframe).candleCount - VISIBLE_CANDLE_COUNT));
  const [visibleCount, setVisibleCount] = useState(defaultVisibleCount);
  const [priceScale, setPriceScale] = useState(1);
  const [priceOffset, setPriceOffset] = useState(0);
  const [dragMode, setDragMode] = useState<ChartDragMode | null>(null);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeIndicators, setActiveIndicators] = useState<ChartIndicatorId[]>([]);
  const [drawingMode, setDrawingMode] = useState(false);
  const [drawingDraft, setDrawingDraft] = useState<ChartDrawingPoint | null>(null);
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);
  const canvasRef = useRef<HTMLDivElement>(null);
  const interactionRef = useRef<ChartInteraction | null>(null);
  const indicatorValues = useMemo(() => ({
    sma: simpleMovingAverage(displayCandles, 20),
    ema: exponentialMovingAverage(displayCandles, 20),
  }), [displayCandles]);
  const maxViewStart = Math.max(0, displayCandles.length - visibleCount);
  const safeViewStart = Math.min(viewStart, maxViewStart);
  const visibleCandles = displayCandles.slice(safeViewStart, safeViewStart + visibleCount);
  const visibleRangeStart = visibleCandles[0]?.rangeStart;
  const visibleRangeEnd = visibleCandles.at(-1)?.rangeEnd;
  const visibleChartExecutions = instrument.executions.map((execution) => ({
    execution,
    displayIndex: Math.round((execution.index / (instrument.candles.length - 1)) * (displayCandles.length - 1)),
  })).filter(({ displayIndex }) => displayIndex >= safeViewStart && displayIndex < safeViewStart + visibleCandles.length);
  const visibleExecutionIds = visibleChartExecutions.map(({ execution }) => execution.id);
  const visibleExecutionKey = visibleExecutionIds.join('|');
  const width = 1040;
  const height = 420;
  const left = 18;
  const right = 76;
  const chartTop = 30;
  const chartBottom = 304;
  const volumeTop = 332;
  const volumeBottom = 390;
  const plotWidth = width - left - right;
  const candleStep = plotWidth / visibleCandles.length;
  const candleWidth = Math.min(22, Math.max(7, candleStep * .58));
  const priceMin = Math.min(...visibleCandles.map((candle) => candle.low));
  const priceMax = Math.max(...visibleCandles.map((candle) => candle.high));
  const pricePadding = (priceMax - priceMin) * .12 || 1;
  const baseDomainMin = priceMin - pricePadding;
  const baseDomainMax = priceMax + pricePadding;
  const domainMiddle = (baseDomainMin + baseDomainMax) / 2 + priceOffset;
  const domainHalfRange = ((baseDomainMax - baseDomainMin) / 2) * priceScale;
  const domainMin = domainMiddle - domainHalfRange;
  const domainMax = domainMiddle + domainHalfRange;
  const maxVolume = Math.max(...visibleCandles.map((candle) => candle.volume));
  const priceToY = (price: number) => chartBottom - ((price - domainMin) / (domainMax - domainMin)) * (chartBottom - chartTop);
  const yToPrice = (y: number) => domainMax - ((y - chartTop) / (chartBottom - chartTop)) * (domainMax - domainMin);
  const xForIndex = (index: number) => left + candleStep * index + candleStep / 2;
  const xForDisplayIndex = (index: number) => xForIndex(index - safeViewStart);
  const activeIndex = Math.min(hoveredIndex ?? visibleCandles.length - 1, visibleCandles.length - 1);
  const activeCandle = visibleCandles[activeIndex];
  const activeUp = activeCandle.close >= activeCandle.open;
  useEffect(() => {
    if (!visibleRangeStart || !visibleRangeEnd) return;
    onVisibleRangeChange?.({
      startDate: visibleRangeStart,
      endDate: visibleRangeEnd,
      executionIds: visibleExecutionIds,
    });
  }, [onVisibleRangeChange, visibleExecutionKey, visibleRangeEnd, visibleRangeStart]);
  const setIndexFromPointer = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (interactionRef.current) return;
    const bounds = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - bounds.left) / (bounds.width || 1)) * width;
    if (x >= width - right) {
      setHoveredIndex(null);
      return;
    }
    setHoveredIndex(Math.min(Math.max(Math.floor((x - left) / candleStep), 0), visibleCandles.length - 1));
  };
  const getChartPoint = (event: ReactPointerEvent<HTMLDivElement> | ReactMouseEvent<HTMLDivElement> | WheelEvent) => {
    const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect();
    return {
      x: ((event.clientX - bounds.left) / (bounds.width || 1)) * width,
      y: ((event.clientY - bounds.top) / (bounds.height || 1)) * height,
    };
  };
  const startInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== undefined && event.button !== 0) return;
    const point = getChartPoint(event);
    if (drawingMode && point.x >= left && point.x < width - right && point.y >= chartTop && point.y <= chartBottom) {
      const visibleIndex = Math.min(Math.max(Math.floor((point.x - left) / candleStep), 0), visibleCandles.length - 1);
      const drawingPoint = {
        index: safeViewStart + visibleIndex,
        price: yToPrice(point.y),
      };
      if (drawingDraft) {
        setDrawings((current) => [...current, { start: drawingDraft, end: drawingPoint }]);
        setDrawingDraft(null);
        setDrawingMode(false);
      } else {
        setDrawingDraft(drawingPoint);
      }
      setHoveredIndex(null);
      return;
    }
    const mode = point.x >= width - right ? 'scaling' : 'panning';
    interactionRef.current = {
      mode,
      pointerId: event.pointerId,
      startX: point.x,
      startY: point.y,
      startView: safeViewStart,
      startScale: priceScale,
      startOffset: priceOffset,
    };
    setDragMode(mode);
    setHoveredIndex(null);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  };
  const continueInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    const interaction = interactionRef.current;
    if (!interaction || interaction.pointerId !== event.pointerId) {
      setIndexFromPointer(event);
      return;
    }
    const point = getChartPoint(event);
    if (interaction.mode === 'panning') {
      const candleDelta = Math.round((point.x - interaction.startX) / candleStep);
      setViewStart(Math.min(maxViewStart, Math.max(0, interaction.startView - candleDelta)));
      const priceDelta = ((point.y - interaction.startY) / (chartBottom - chartTop))
        * (baseDomainMax - baseDomainMin) * interaction.startScale;
      setPriceOffset(interaction.startOffset + priceDelta);
    } else {
      const nextScale = interaction.startScale * Math.exp((point.y - interaction.startY) / 150);
      setPriceScale(Math.min(3, Math.max(.4, nextScale)));
    }
  };
  const stopInteraction = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!interactionRef.current) return;
    event.currentTarget.releasePointerCapture?.(interactionRef.current.pointerId);
    interactionRef.current = null;
    setDragMode(null);
  };
  const zoomTimeline = (event: WheelEvent) => {
    event.preventDefault();
    event.stopPropagation();
    const point = getChartPoint(event);
    const pointerRatio = Math.min(1, Math.max(0, (point.x - left) / plotWidth));
    const zoomStep = Math.max(4, Math.round(visibleCount * .15));
    const maxVisibleCount = Math.min(120, displayCandles.length);
    const nextVisibleCount = Math.min(maxVisibleCount, Math.max(12, visibleCount + (event.deltaY > 0 ? zoomStep : -zoomStep)));
    if (nextVisibleCount === visibleCount) return;
    const anchorIndex = safeViewStart + pointerRatio * (visibleCount - 1);
    const nextMaxViewStart = Math.max(0, displayCandles.length - nextVisibleCount);
    const nextViewStart = Math.round(anchorIndex - pointerRatio * (nextVisibleCount - 1));
    setVisibleCount(nextVisibleCount);
    setViewStart(Math.min(nextMaxViewStart, Math.max(0, nextViewStart)));
    setHoveredIndex(null);
  };
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    canvas.addEventListener('wheel', zoomTimeline, { passive: false });
    return () => canvas.removeEventListener('wheel', zoomTimeline);
  }, [zoomTimeline]);
  const resetChartView = () => {
    setVisibleCount(defaultVisibleCount);
    setViewStart(Math.max(0, displayCandles.length - defaultVisibleCount));
    setPriceScale(1);
    setPriceOffset(0);
  };

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const exitOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsFullscreen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', exitOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', exitOnEscape);
    };
  }, [isFullscreen]);

  const toggleIndicator = (indicator: ChartIndicatorId) => {
    setActiveIndicators((current) => current.includes(indicator)
      ? current.filter((item) => item !== indicator)
      : [...current, indicator]);
  };
  const indicatorPoints = (indicator: ChartIndicatorId) => visibleCandles.map((_, index) => {
    const value = indicatorValues[indicator][safeViewStart + index];
    return value === null || value === undefined ? null : `${xForIndex(index)},${priceToY(value)}`;
  }).filter(Boolean).join(' ');

  return <div
    className={`backtest-market-chart${isFullscreen ? ' is-fullscreen' : ''}`}
    data-testid="backtest-market-chart"
    role="region"
    aria-label={`${instrument.symbol} 인터랙티브 차트`}
  >
    <div className="backtest-chart-toolstrip">
      <div role="group" aria-label="차트 지표와 그리기 도구">
        <button type="button" aria-label="SMA 20 지표 표시" aria-pressed={activeIndicators.includes('sma')} className={activeIndicators.includes('sma') ? 'active sma' : 'sma'} onClick={() => toggleIndicator('sma')}><i />SMA 20</button>
        <button type="button" aria-label="EMA 20 지표 표시" aria-pressed={activeIndicators.includes('ema')} className={activeIndicators.includes('ema') ? 'active ema' : 'ema'} onClick={() => toggleIndicator('ema')}><i />EMA 20</button>
        <span />
        <button type="button" aria-label="추세선 그리기" aria-pressed={drawingMode} className={drawingMode ? 'active' : ''} onClick={() => {
          setDrawingMode((current) => !current);
          setDrawingDraft(null);
        }}><PencilLine size={13} />추세선</button>
        <button type="button" aria-label="차트 선 모두 지우기" disabled={drawings.length === 0 && !drawingDraft} onClick={() => {
          setDrawings([]);
          setDrawingDraft(null);
        }}><Trash2 size={13} />지우기</button>
      </div>
      <button type="button" className="backtest-chart-fullscreen" aria-label={isFullscreen ? '차트 전체화면 닫기' : '차트 전체화면 열기'} onClick={() => setIsFullscreen((current) => !current)}>
        {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        {isFullscreen ? '축소' : '전체화면'}
      </button>
    </div>
    <div className="backtest-market-ohlc">
      <strong>{instrument.symbol}</strong>
      <span>{activeCandle.time} ET</span>
      <span>O <b>{activeCandle.open.toFixed(2)}</b></span>
      <span>H <b>{activeCandle.high.toFixed(2)}</b></span>
      <span>L <b>{activeCandle.low.toFixed(2)}</b></span>
      <span>C <b className={activeUp ? 'positive' : 'negative'}>{activeCandle.close.toFixed(2)}</b></span>
      <span>VOL <b>{(activeCandle.volume / 1000000).toFixed(2)}M</b></span>
      <span className="market-chart-gesture-hint">휠 확대·축소 · 화면 자유 이동 · 가격축 상하 드래그 · 더블클릭 초기화</span>
    </div>
    <div
      ref={canvasRef}
      className={`backtest-candle-canvas${dragMode ? ` is-${dragMode}` : ''}${drawingMode ? ' is-drawing' : ''}`}
      data-testid="backtest-candle-canvas"
      data-total-candles={displayCandles.length}
      data-visible-candles={visibleCandles.length}
      data-view-start={safeViewStart}
      data-visible-range-start={visibleRangeStart}
      data-visible-range-end={visibleRangeEnd}
      data-price-scale={priceScale.toFixed(3)}
      data-price-offset={priceOffset.toFixed(3)}
      onPointerDown={startInteraction}
      onPointerMove={continueInteraction}
      onPointerUp={stopInteraction}
      onPointerCancel={stopInteraction}
      onDoubleClick={resetChartView}
      onMouseLeave={() => setHoveredIndex(null)}
    >
      <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none" role="img" aria-label={`${instrument.symbol} 캔들 차트와 매수 매도 기록`} data-timeframe={timeframe}>
        <defs>
          <clipPath id="market-price-plot-clip">
            <rect x={left} y={chartTop} width={plotWidth} height={chartBottom - chartTop} />
          </clipPath>
        </defs>
        <rect className="market-price-axis-surface" x={width - right} y="0" width={right} height={height} />
        <line className="market-price-axis-separator" x1={width - right} x2={width - right} y1="0" y2={height} />
        {[0, .25, .5, .75, 1].map((ratio) => {
          const y = chartTop + (chartBottom - chartTop) * ratio;
          const price = domainMax - (domainMax - domainMin) * ratio;
          return <g key={`price-${ratio}`}><line className="market-chart-gridline" x1={left} x2={width - right} y1={y} y2={y} /><text className="market-chart-price" x={width - right + 10} y={y + 3}>{price.toFixed(2)}</text></g>;
        })}
        {[0, .25, .5, .75, 1].map((ratio) => {
          const index = Math.round((visibleCandles.length - 1) * ratio);
          return <line key={`time-${ratio}`} className="market-chart-gridline vertical" x1={xForIndex(index)} x2={xForIndex(index)} y1={chartTop} y2={volumeBottom} />;
        })}
        <line className="market-chart-volume-divider" x1={left} x2={width - right} y1={volumeTop - 12} y2={volumeTop - 12} />
        {visibleCandles.map((candle, index) => {
          const x = xForIndex(index);
          const up = candle.close >= candle.open;
          const bodyTop = priceToY(Math.max(candle.open, candle.close));
          const bodyBottom = priceToY(Math.min(candle.open, candle.close));
          const volumeHeight = (candle.volume / maxVolume) * (volumeBottom - volumeTop);
          return <g key={`${candle.time}-${index}`} className={`market-candle ${up ? 'up' : 'down'}`} data-testid="market-candle">
            <g className="market-candle-price-layer" clipPath="url(#market-price-plot-clip)">
              <line className="market-candle-wick" x1={x} x2={x} y1={priceToY(candle.high)} y2={priceToY(candle.low)} vectorEffect="non-scaling-stroke" />
              <rect className="market-candle-body" x={x - candleWidth / 2} y={bodyTop} width={candleWidth} height={Math.max(bodyBottom - bodyTop, 2)} />
            </g>
            <rect className="market-volume-bar" x={x - candleWidth / 2} y={volumeBottom - volumeHeight} width={candleWidth} height={volumeHeight} />
          </g>;
        })}
        {activeIndicators.map((indicator) => <polyline
          key={indicator}
          className={`market-indicator-line ${indicator}`}
          data-testid={`market-indicator-${indicator}`}
          points={indicatorPoints(indicator)}
          clipPath="url(#market-price-plot-clip)"
          vectorEffect="non-scaling-stroke"
        />)}
        {drawings.map((drawing, index) => <line
          key={`${drawing.start.index}-${drawing.end.index}-${index}`}
          className="market-user-drawing"
          data-testid="market-drawing"
          x1={xForDisplayIndex(drawing.start.index)}
          y1={priceToY(drawing.start.price)}
          x2={xForDisplayIndex(drawing.end.index)}
          y2={priceToY(drawing.end.price)}
          clipPath="url(#market-price-plot-clip)"
          vectorEffect="non-scaling-stroke"
        />)}
        {drawingDraft && <circle
          className="market-user-drawing-point"
          cx={xForDisplayIndex(drawingDraft.index)}
          cy={priceToY(drawingDraft.price)}
          r="4"
          clipPath="url(#market-price-plot-clip)"
          vectorEffect="non-scaling-stroke"
        />}
        {visibleChartExecutions.map(({ execution, displayIndex }) => {
          const visibleIndex = displayIndex - safeViewStart;
          const candle = visibleCandles[visibleIndex];
          const x = xForIndex(visibleIndex);
          const isBuy = execution.side === '매수';
          const candleY = isBuy ? priceToY(candle.low) : priceToY(candle.high);
          const y = isBuy ? Math.min(candleY + 28, chartBottom - 13) : Math.max(candleY - 28, chartTop + 13);
          return <g key={execution.id} className={`market-trade-marker ${isBuy ? 'buy' : 'sell'}`} data-testid="trade-marker" data-side={isBuy ? 'buy' : 'sell'} clipPath="url(#market-price-plot-clip)">
            <line x1={x} x2={x} y1={isBuy ? y - 13 : y + 13} y2={candleY} vectorEffect="non-scaling-stroke" />
            <rect x={x - 21} y={y - 11} width="42" height="22" rx="11" />
            <path d={isBuy ? `M ${x - 4} ${y - 10} L ${x} ${y - 15} L ${x + 4} ${y - 10} Z` : `M ${x - 4} ${y + 10} L ${x} ${y + 15} L ${x + 4} ${y + 10} Z`} />
            <text x={x} y={y + 3}>{execution.side}</text>
          </g>;
        })}
        {hoveredIndex !== null && <>
          <line className="market-chart-crosshair" x1={xForIndex(hoveredIndex)} x2={xForIndex(hoveredIndex)} y1={chartTop} y2={volumeBottom} vectorEffect="non-scaling-stroke" />
          <line className="market-chart-crosshair" x1={left} x2={width - right} y1={priceToY(activeCandle.close)} y2={priceToY(activeCandle.close)} vectorEffect="non-scaling-stroke" clipPath="url(#market-price-plot-clip)" />
        </>}
        {[0, .25, .5, .75, 1].map((ratio) => {
          const index = Math.round((visibleCandles.length - 1) * ratio);
          return <text key={`label-${ratio}`} className="market-chart-time" x={xForIndex(index)} y={height - 8} textAnchor={ratio === 0 ? 'start' : ratio === 1 ? 'end' : 'middle'}>{visibleCandles[index].time.replace('07.', '')}</text>;
        })}
      </svg>
    </div>
  </div>;
}

export function BacktestView() {
  const [selectedBotName, setSelectedBotName] = useState(backtestBots[0].name);
  const [selectedSymbol, setSelectedSymbol] = useState(botInstruments[backtestBots[0].name][0].symbol);
  const [botQuery, setBotQuery] = useState('');
  const [symbolQuery, setSymbolQuery] = useState('');
  const [symbolModalOpen, setSymbolModalOpen] = useState(false);
  const [timeframe, setTimeframe] = useState<Timeframe>('day');
  const [activeBenchmarkIds, setActiveBenchmarkIds] = useState<string[]>([backtestBenchmark.id]);
  const [executionStartDate, setExecutionStartDate] = useState('');
  const [executionEndDate, setExecutionEndDate] = useState('');
  const [executionPage, setExecutionPage] = useState(1);
  const [executionPageSize, setExecutionPageSize] = useState(10);
  const [executionCalendarOpen, setExecutionCalendarOpen] = useState(false);
  const [executionCalendarPhase, setExecutionCalendarPhase] = useState<'start' | 'end' | 'complete'>('start');
  const [executionCalendarMonth, setExecutionCalendarMonth] = useState('2026-07');
  const [executionLogOpen, setExecutionLogOpen] = useState(false);
  const [chartVisibleRange, setChartVisibleRange] = useState<ChartVisibleRange | null>(null);
  const [chartExecutionFilterIds, setChartExecutionFilterIds] = useState<string[] | null>(null);
  const selectedBot = backtestBots.find((bot) => bot.name === selectedBotName) ?? backtestBots[0];
  const filteredBacktestBots = useMemo(() => {
    const query = botQuery.trim().toLowerCase();
    if (!query) return backtestBots;
    return backtestBots.filter((bot) => `${bot.name} ${bot.strategy}`.toLowerCase().includes(query));
  }, [botQuery]);
  const activeBenchmarks = backtestBenchmarks.filter((benchmark) => activeBenchmarkIds.includes(benchmark.id));
  const selectedBotInstruments = botInstruments[selectedBot.name];
  const selectedInstrument = selectedBotInstruments.find((instrument) => instrument.symbol === selectedSymbol) ?? selectedBotInstruments[0];
  const previewInstruments = [
    selectedInstrument,
    ...selectedBotInstruments.filter((instrument) => instrument.symbol !== selectedInstrument.symbol),
  ].slice(0, 3);
  const filteredInstruments = selectedBotInstruments.filter((instrument) => `${instrument.symbol} ${instrument.name}`.toLowerCase().includes(symbolQuery.trim().toLowerCase()));
  const filteredExecutions = useMemo(() => {
    const chartExecutionIdSet = chartExecutionFilterIds === null ? null : new Set(chartExecutionFilterIds);
    return selectedInstrument.executions
      .filter((execution) => chartExecutionIdSet
        ? chartExecutionIdSet.has(execution.id)
        : (!executionStartDate || execution.date >= executionStartDate)
          && (!executionEndDate || execution.date <= executionEndDate))
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  }, [chartExecutionFilterIds, executionEndDate, executionStartDate, selectedInstrument]);
  const executionPageCount = Math.max(1, Math.ceil(filteredExecutions.length / executionPageSize));
  const currentExecutionPage = Math.min(executionPage, executionPageCount);
  const executionPageOffset = (currentExecutionPage - 1) * executionPageSize;
  const visibleExecutions = filteredExecutions.slice(executionPageOffset, executionPageOffset + executionPageSize);
  const executionRangeStart = filteredExecutions.length === 0 ? 0 : executionPageOffset + 1;
  const executionRangeEnd = Math.min(executionPageOffset + executionPageSize, filteredExecutions.length);
  const [, lastExecutionDate] = useMemo(() => selectedInstrument.executions.reduce<[string | undefined, string | undefined]>(
    ([first, last], execution) => [
      !first || execution.date < first ? execution.date : first,
      !last || execution.date > last ? execution.date : last,
    ],
    [undefined, undefined],
  ), [selectedInstrument]);
  const executionCalendarDates = useMemo(() => calendarDatesForMonth(executionCalendarMonth), [executionCalendarMonth]);
  useEffect(() => {
    if (!symbolModalOpen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSymbolModalOpen(false);
    };
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [symbolModalOpen]);
  useEffect(() => {
    if (!executionCalendarOpen) return undefined;
    const closeOnOutsideClick = (event: MouseEvent) => {
      if (!(event.target as Element | null)?.closest?.('.backtest-log-date-filter')) {
        setExecutionCalendarOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setExecutionCalendarOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideClick);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('mousedown', closeOnOutsideClick);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [executionCalendarOpen]);
  const openExecutionCalendar = (preferredDate: string) => {
    setExecutionCalendarMonth((preferredDate || executionEndDate || executionStartDate || lastExecutionDate || '2026-07-01').slice(0, 7));
    setExecutionCalendarPhase('start');
    setExecutionCalendarOpen(true);
  };
  const selectExecutionCalendarDate = (date: string) => {
    setExecutionPage(1);
    setChartExecutionFilterIds(null);
    if (executionCalendarPhase !== 'end' || !executionStartDate) {
      setExecutionStartDate(date);
      setExecutionEndDate('');
      setExecutionCalendarPhase('end');
      return;
    }
    if (date < executionStartDate) {
      setExecutionStartDate(date);
      setExecutionEndDate(executionStartDate);
    } else {
      setExecutionEndDate(date);
    }
    setExecutionCalendarPhase('complete');
  };
  const resetExecutionLogView = (instrument: Instrument) => {
    const latestExecutionDate = instrument.executions.reduce(
      (latest, execution) => (!latest || execution.date > latest ? execution.date : latest),
      '',
    );
    setExecutionStartDate('');
    setExecutionEndDate('');
    setExecutionPage(1);
    setExecutionCalendarOpen(false);
    setExecutionCalendarPhase('start');
    setExecutionCalendarMonth((latestExecutionDate || '2026-07-01').slice(0, 7));
    setChartVisibleRange(null);
    setChartExecutionFilterIds(null);
  };
  const selectBot = (bot: BacktestBot) => {
    const firstInstrument = botInstruments[bot.name][0];
    setSelectedBotName(bot.name);
    setSelectedSymbol(firstInstrument.symbol);
    setSymbolQuery('');
    setSymbolModalOpen(false);
    resetExecutionLogView(firstInstrument);
  };
  const selectInstrument = (instrument: Instrument) => {
    setSelectedSymbol(instrument.symbol);
    setSymbolQuery('');
    setSymbolModalOpen(false);
    resetExecutionLogView(instrument);
  };
  const toggleBenchmark = (benchmarkId: string) => {
    setActiveBenchmarkIds((current) => current.includes(benchmarkId)
      ? current.filter((id) => id !== benchmarkId)
      : [...current, benchmarkId]);
  };
  const columns: DataTableColumn<Execution>[] = [{ key: 'time', label: '시각 (ET)' }, { key: 'symbol', label: '종목' }, { key: 'side', label: '행동', render: (row) => <span className={row.side === '매수' ? 'buy-text' : 'sell-text'}>{row.side}</span> }, { key: 'quantity', label: '수량' }, { key: 'price', label: '체결가' }, { key: 'value', label: '체결 금액' }, { key: 'fee', label: '수수료' }, { key: 'result', label: '결과' }];
  return <Localized><div className="page backtest-page">
    <PageHeading
      eyebrow="BOT PERFORMANCE"
      title="봇 백테스트"
      description="트레이딩 봇별 누적 수익률을 같은 기간의 주요 시장 지수와 직접 비교합니다."
      meta={<Status tone="positive">완료 · 2026 Q3</Status>}
      actions={<Button icon={CalendarDays}>2023 Q3–2026 Q2</Button>}
    />
    <div className="backtest-comparison-workspace" data-testid="backtest-comparison-workspace">
      <aside className="backtest-bot-selector" aria-labelledby="backtest-bot-selector-title">
        <header>
          <div><span>TRADING BOTS</span><h2 id="backtest-bot-selector-title">봇 선택</h2></div>
          <small>{`${backtestBots.length}개 봇 · 동일 기간`}</small>
        </header>
        <label className="backtest-bot-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="백테스트 봇 검색"
            placeholder="봇 이름 또는 전략 검색"
            value={botQuery}
            onChange={(event) => setBotQuery(event.target.value)}
          />
          {botQuery && <button type="button" aria-label="봇 검색 초기화" onClick={() => setBotQuery('')}><X size={13} /></button>}
        </label>
        <div className="backtest-bot-options" role="list" aria-label="백테스트 봇 목록">
          {filteredBacktestBots.map((bot) => <div role="listitem" key={bot.name}><button
            className={bot.name === selectedBot.name ? 'active' : ''}
            type="button"
            aria-label={`${bot.name} 백테스트 보기`}
            aria-pressed={bot.name === selectedBot.name}
            onClick={() => selectBot(bot)}
          >
            <span className="backtest-bot-icon"><Bot size={17} /></span>
            <span><strong>{bot.name}</strong><small>{bot.strategy}</small></span>
            <b className={bot.return.startsWith('+') ? 'positive' : 'negative'}>{bot.return}</b>
          </button></div>)}
          {filteredBacktestBots.length === 0 && <div className="backtest-bot-empty" role="status">일치하는 봇이 없습니다.</div>}
        </div>
        <footer className="backtest-bot-selector-footer">
          <strong>{`${filteredBacktestBots.length} / ${backtestBots.length}개 표시`}</strong>
          <span>{filteredBacktestBots.length > 3 ? '스크롤하여 더 보기' : '목록이 모두 표시됨'}</span>
        </footer>
      </aside>
      <Panel className="backtest-performance-panel" title={`${selectedBot.name} vs 시장 지수`} subtitle="2023 Q3–2026 Q2 · 누적 수익률 (%)" action={<div className="backtest-chart-legend" role="group" aria-label="비교 지표 선택">
        <span className="bot"><i />선택한 봇</span>
        {backtestBenchmarks.map((benchmark) => {
          const isActive = activeBenchmarkIds.includes(benchmark.id);
          return <button
            key={benchmark.id}
            type="button"
            className={`benchmark ${benchmark.id}${isActive ? ' active' : ''}`}
            aria-label={`${benchmark.name} 지표 표시`}
            aria-pressed={isActive}
            onClick={() => toggleBenchmark(benchmark.id)}
          ><i />{benchmark.name}</button>;
        })}
      </div>}>
        <BacktestComparisonChart bot={selectedBot} benchmarks={activeBenchmarks} />
      </Panel>
    </div>

    {/* A compact row instead of four 130px cards. The bot and benchmark returns
        used to appear both here and again above the chart. */}
    <section className="panel backtest-metric-panel">
      <MetricRow
        label={`${selectedBot.name} 백테스트 지표`}
        items={[
          { label: '봇 수익률', figure: selectedBot.return, detail: selectedBot.strategy, tone: selectedBot.return.startsWith('+') ? 'positive' : 'negative' },
          { label: 'S&P 500 대비', figure: selectedBot.alpha, detail: `S&P 500 ${backtestBenchmark.return}`, tone: selectedBot.alpha.startsWith('+') ? 'positive' : 'negative' },
          { label: '최대 낙폭', figure: selectedBot.drawdown, detail: '기간 내 고점 대비' },
          { label: '개별 체결', figure: `${selectedBot.trades}건`, detail: '부분 체결 각각 집계' },
        ]}
      />
    </section>
    <Panel className="backtest-trade-chart-panel" title="종목별 체결 차트" subtitle={`${selectedBot.name} · 조정 가격 · 미국 동부 시각`}>
      <div className="backtest-symbol-toolbar">
        <span className="backtest-symbol-preview-label">주요 종목</span>
        <div className="backtest-symbol-preview" role="list" aria-label="빠른 거래 종목 선택">
          {previewInstruments.map((instrument) => {
            const isSelected = instrument.symbol === selectedInstrument.symbol;
            return <div role="listitem" key={instrument.symbol}><button
              type="button"
              aria-label={`${instrument.symbol} 종목 빠른 선택`}
              aria-pressed={isSelected}
              className={isSelected ? 'active' : ''}
              onClick={() => selectInstrument(instrument)}
            ><strong>{instrument.symbol}</strong><span>{instrument.name}</span></button></div>;
          })}
        </div>
        <button
          type="button"
          className="backtest-symbol-modal-trigger"
          aria-label="거래 종목 선택 열기"
          aria-haspopup="dialog"
          aria-expanded={symbolModalOpen}
          onClick={() => {
            setSymbolQuery('');
            setSymbolModalOpen(true);
          }}
        ><Search size={14} />종목 변경</button>
      </div>
      <div className="backtest-chart-controls">
        <div className="backtest-timeframe" role="group" aria-label="차트 기간" data-testid="backtest-timeframe">
          {chartTimeframes.map((option) => <button
            key={option.id}
            type="button"
            aria-label={`${option.label} 차트 보기`}
            aria-pressed={timeframe === option.id}
            className={timeframe === option.id ? 'active' : ''}
            onClick={() => setTimeframe(option.id)}
          >{option.label}</button>)}
        </div>
        <span>조정주가 · USD</span>
      </div>
      <BacktestCandlestickChart
        key={`${selectedInstrument.symbol}-${timeframe}`}
        instrument={selectedInstrument}
        timeframe={timeframe}
        onVisibleRangeChange={setChartVisibleRange}
      />

      {/* The log lives in the same panel as the chart it annotates, so the two
          no longer carry separate 72px headers saying the same thing. */}
      <section className="backtest-execution-log" role="region" aria-label={`${selectedInstrument.symbol} 체결 로그`}>
        <button
          type="button"
          className="backtest-execution-log-toggle"
          aria-label={`${selectedInstrument.symbol} 매수·매도 로그 ${executionLogOpen ? '접기' : '펼치기'}`}
          aria-expanded={executionLogOpen}
          aria-controls="backtest-execution-log-details"
          onClick={() => {
            setExecutionLogOpen((open) => !open);
            if (executionLogOpen) setExecutionCalendarOpen(false);
          }}
        >
          <span className="backtest-execution-log-summary">
            <strong>{selectedInstrument.symbol} 매수·매도 로그</strong>
            <small>{selectedInstrument.name} · 최신 체결부터 표시</small>
          </span>
          <span className="backtest-execution-log-action">
            <span>{executionLogOpen ? '접기' : '체결 내역 보기'}</span>
            <ChevronDown size={17} aria-hidden="true" />
          </span>
          <span className="backtest-execution-log-count">전체 {selectedInstrument.executions.length}건</span>
        </button>
        {executionLogOpen && <div id="backtest-execution-log-details" className="backtest-execution-log-details">
          <div className="backtest-log-toolbar">
          <div className="backtest-log-date-filter" role="group" aria-label="체결 로그 기간 검색">
            <button
              type="button"
              className={`backtest-log-chart-range${chartVisibleRange
                && chartExecutionFilterIds !== null
                && chartExecutionFilterIds.join('|') === chartVisibleRange.executionIds.join('|')
                && executionStartDate === chartVisibleRange.startDate
                && executionEndDate === chartVisibleRange.endDate ? ' active' : ''}`}
              aria-label="현재 차트 구간 로그 보기"
              disabled={!chartVisibleRange}
              onClick={() => {
                if (!chartVisibleRange) return;
                setExecutionStartDate(chartVisibleRange.startDate);
                setExecutionEndDate(chartVisibleRange.endDate);
                setChartExecutionFilterIds(chartVisibleRange.executionIds);
                setExecutionPage(1);
                setExecutionCalendarOpen(false);
                setExecutionCalendarPhase('complete');
              }}
            ><Search size={14} aria-hidden="true" /><span>현재 차트 구간</span></button>
            <CalendarDays size={15} aria-hidden="true" />
            <button
              type="button"
              className={`backtest-log-date-trigger${executionCalendarOpen && executionCalendarPhase === 'start' ? ' active' : ''}`}
              aria-label="체결 로그 시작일"
              aria-expanded={executionCalendarOpen}
              onClick={() => openExecutionCalendar(executionStartDate)}
            ><span>시작일</span><b className={executionStartDate ? '' : 'placeholder'}>{formatCalendarDate(executionStartDate) || '시작 날짜'}</b></button>
            <i className="backtest-log-date-arrow" aria-hidden="true">→</i>
            <button
              type="button"
              className={`backtest-log-date-trigger${executionCalendarOpen && executionCalendarPhase === 'end' ? ' active' : ''}`}
              aria-label="체결 로그 종료일"
              aria-expanded={executionCalendarOpen}
              onClick={() => openExecutionCalendar(executionEndDate)}
            ><span>종료일</span><b className={executionEndDate ? '' : 'placeholder'}>{formatCalendarDate(executionEndDate) || '종료 날짜'}</b></button>
            <button
              type="button"
              className="backtest-log-date-reset"
              aria-label="전체 기간 보기"
              disabled={!executionStartDate && !executionEndDate}
              onClick={() => {
                setExecutionStartDate('');
                setExecutionEndDate('');
                setChartExecutionFilterIds(null);
                setExecutionPage(1);
              }}
            >전체 기간</button>
            {executionCalendarOpen && <div className="backtest-log-calendar" role="dialog" aria-label="체결 로그 날짜 선택">
              <header>
                <button type="button" aria-label="이전 달" onClick={() => setExecutionCalendarMonth(shiftCalendarMonth(executionCalendarMonth, -1))}><ChevronLeft size={16} /></button>
                <strong>{calendarMonthLabel(executionCalendarMonth)}</strong>
                <button type="button" aria-label="다음 달" onClick={() => setExecutionCalendarMonth(shiftCalendarMonth(executionCalendarMonth, 1))}><ChevronRight size={16} /></button>
              </header>
              <div className="backtest-log-calendar-weekdays" aria-hidden="true">
                {calendarWeekdays.map((weekday) => <span key={weekday}>{weekday}</span>)}
              </div>
              <div className="backtest-log-calendar-grid" role="grid" aria-label={`${calendarMonthLabel(executionCalendarMonth)} 달력`}>
                {executionCalendarDates.map((date, index) => {
                  if (!date) return <span className="empty" aria-hidden="true" key={`empty-${index}`} />;
                  const isStart = date === executionStartDate;
                  const isEnd = date === executionEndDate;
                  const isInRange = executionStartDate && executionEndDate && date > executionStartDate && date < executionEndDate;
                  return <button
                    type="button"
                    key={date}
                    data-date={date}
                    aria-label={calendarDateLabel(date)}
                    aria-pressed={isStart || isEnd}
                    className={`${isStart ? 'range-start ' : ''}${isEnd ? 'range-end ' : ''}${isInRange ? 'in-range' : ''}`.trim()}
                    onClick={(event) => selectExecutionCalendarDate(event.currentTarget.dataset.date as string)}
                  >{Number(date.slice(-2))}</button>;
                })}
              </div>
              <footer>
                <span aria-live="polite">{executionCalendarPhase === 'start'
                  ? '시작일을 선택해 주세요'
                  : executionCalendarPhase === 'end'
                    ? '종료일을 선택해 주세요'
                    : '기간 선택이 완료되었습니다'}</span>
                <button type="button" aria-label="달력 닫기" onClick={() => setExecutionCalendarOpen(false)}><X size={15} /></button>
              </footer>
            </div>}
          </div>
          <div className="backtest-log-table-controls">
            <strong aria-live="polite">{filteredExecutions.length}건 검색됨</strong>
            <label>페이지당 <select
              aria-label="페이지당 로그 수"
              value={executionPageSize}
              onChange={(event) => {
                setExecutionPageSize(Number(event.target.value));
                setExecutionPage(1);
              }}
            >
              {[10, 25, 50].map((size) => <option key={size} value={size}>{size}건</option>)}
            </select></label>
          </div>
          </div>
          {visibleExecutions.length > 0
            ? <DataTable className="backtest-log-table" columns={columns} rows={visibleExecutions} rowKey="id" />
            : <EmptyState
              icon={Coins}
              title={selectedInstrument.executions.length > 0 ? '선택한 기간에 체결 기록이 없습니다.' : '이 종목에는 체결 기록이 없습니다.'}
              detail={selectedInstrument.executions.length > 0 ? '기간을 조정하거나 전체 기간으로 초기화해 주세요.' : '다른 종목을 선택하면 해당 종목의 체결 내역을 확인할 수 있습니다.'}
            />}
          {selectedInstrument.executions.length > 0 && <nav className="backtest-log-pagination" aria-label="체결 로그 페이지">
            <button
              type="button"
              aria-label="이전 로그 페이지"
              disabled={currentExecutionPage === 1}
              onClick={() => setExecutionPage(currentExecutionPage - 1)}
            >이전</button>
            <span>{executionRangeStart}–{executionRangeEnd} / {filteredExecutions.length}건 · {currentExecutionPage}/{executionPageCount} 페이지</span>
            <button
              type="button"
              aria-label="다음 로그 페이지"
              disabled={currentExecutionPage === executionPageCount}
              onClick={() => setExecutionPage(currentExecutionPage + 1)}
            >다음</button>
          </nav>}
        </div>}
      </section>
    </Panel>
    {symbolModalOpen && <div
      className="backtest-symbol-modal-backdrop"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) setSymbolModalOpen(false);
      }}
    >
      <section
        className="backtest-symbol-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="backtest-symbol-modal-title"
      >
        <header>
          <div>
            <span>TRADED INSTRUMENTS</span>
            <h2 id="backtest-symbol-modal-title">거래 종목 선택</h2>
            <p>{selectedBot.name}이(가) 백테스트 기간에 거래한 종목입니다.</p>
          </div>
          <button type="button" aria-label="거래 종목 선택 닫기" onClick={() => setSymbolModalOpen(false)}><X size={17} /></button>
        </header>
        <div className="backtest-symbol-modal-tools">
          <label>
            <Search size={15} aria-hidden="true" />
            <input
              type="search"
              aria-label="거래 종목 검색"
              placeholder="티커 또는 종목명 검색"
              value={symbolQuery}
              autoFocus
              onChange={(event) => setSymbolQuery(event.target.value)}
            />
            {symbolQuery && <button type="button" aria-label="종목 검색 초기화" onClick={() => setSymbolQuery('')}><X size={13} /></button>}
          </label>
          <strong>{`${filteredInstruments.length} / ${selectedBotInstruments.length}개 종목`}</strong>
        </div>
        <div className="backtest-symbol-modal-list" role="list" aria-label={`${selectedBot.name} 거래 종목`}>
          {filteredInstruments.map((instrument) => {
            const isSelected = instrument.symbol === selectedInstrument.symbol;
            return <div role="listitem" key={instrument.symbol}><button
              type="button"
              aria-label={`${instrument.symbol} 종목 선택`}
              aria-pressed={isSelected}
              className={isSelected ? 'active' : ''}
              onClick={() => selectInstrument(instrument)}
            >
              <span className="backtest-symbol-modal-code">{instrument.symbol.slice(0, 2)}</span>
              <span><strong>{instrument.symbol}</strong><small>{instrument.name}</small></span>
              <span className="backtest-symbol-modal-trades">{instrument.executions.length}건 체결</span>
              <span className="backtest-symbol-modal-check">{isSelected && <Check size={14} />}</span>
            </button></div>;
          })}
          {filteredInstruments.length === 0 && <div className="backtest-symbol-modal-empty" role="status">
            <Search size={18} />
            <strong>일치하는 종목이 없습니다.</strong>
            <span>티커 또는 종목명을 다시 확인해 주세요.</span>
          </div>}
        </div>
        <footer>
          <span>종목을 선택하면 차트와 체결 로그가 함께 변경됩니다.</span>
          <kbd>ESC</kbd><small>닫기</small>
        </footer>
      </section>
    </div>}
  </div></Localized>;
}

/*
  Official competitions stay ordered by their closing date so the most urgent
  choice is always first. Each card owns its calendar and participation state.
*/
type CompetitionTone = 'standard' | 'risk' | 'return' | 'sharpe' | 'backtesting';
type StandingTone = 'gold' | 'silver' | 'bronze' | 'neutral' | 'inactive';
type OfficialCompetitionStatus = 'recruiting' | 'running';

/*
  종목 범위(#54): 대회는 기준 유니버스에서 일부를 제외하거나(exclude),
  아예 지정 종목만(only) 허용할 수 있다. 상세의 조건 표가 목록까지 보여준다.
*/
interface CompetitionUniverse {
  base: string;
  only?: string[];
  exclude?: string[];
}

interface OfficialCompetition {
  name: string;
  description: string;
  bots: number;
  ranking: string;
  score: string;
  remainingDays: number;
  standing: string;
  standingTone: StandingTone;
  tone: CompetitionTone;
  official: true;
  host: string;
  start: string;
  end: string;
  status: OfficialCompetitionStatus;
  progress: number;
  joined?: number;
  entryLimit: number;
  universe?: CompetitionUniverse;
}

const officialCompetitions: OfficialCompetition[] = [
  { name: 'Backtesting Challenge', description: '동일한 과거 시장 데이터에서 전략의 재현성과 안정성을 검증합니다.', bots: 42, ranking: '백테스팅', score: '백테스트 성과', remainingDays: 12, standing: '미참가', standingTone: 'inactive', tone: 'backtesting', official: true, host: 'I2S 운영팀', start: '08.01', end: '08.31', status: 'recruiting', progress: 0, entryLimit: 3, universe: { base: 'S&P 500' } },
  { name: 'ETF Sprint', description: 'ETF 전략의 단기 수익률을 같은 조건에서 비교합니다.', bots: 128, ranking: '수익률 점수제', score: '수익률', remainingDays: 5, standing: '2위', standingTone: 'silver', tone: 'return', official: true, host: 'I2S 운영팀', start: '07.21', end: '08.01', status: 'recruiting', progress: 18, entryLimit: 3, universe: { base: '미국 상장 ETF', exclude: ['TQQQ', 'SQQQ'] } },
  /* 로비 표식은 참여 중인 공식 대회 하나만 보여주기로 했다(2026-07-29). */
  { name: 'I2S Summer League', description: '수익성과 안정성을 함께 평가하는 공식 시즌 대회입니다.', bots: 184, ranking: '표준점수제', score: '복합 점수', remainingDays: 65, standing: '미참가', standingTone: 'inactive', tone: 'standard', official: true, host: 'I2S 운영팀', start: '07.01', end: '09.30', status: 'running', progress: 5, entryLimit: 5, universe: { base: '미국 상장 주식 · ETF' } },
];

const officialBotCodes = [
  '3F9A', '8C21', '11D0', '5E77', '902B', '44AC', '19EE', 'C204', '6B31',
  '77D8', 'A145', 'F208', '31BC', '9D42', 'E776', '0A61', 'B528', '62CF',
];

const makeOfficialLeaderboard = (
  seed: number,
  count: number,
  myBotsByRank: Record<number, string>,
): LeaderboardEntry[] => Array.from({ length: count }, (_, index) => {
  const rank = index + 1;
  return {
    rank,
    bot: myBotsByRank[rank] ?? `Bot ${officialBotCodes[(seed + index) % officialBotCodes.length]}`,
    score: Number((96.8 - seed * 0.35 - index * 1.42).toFixed(2)),
    return: Number((13.6 - seed * 0.22 - index * 0.43).toFixed(2)),
    drawdown: Number((-0.58 - seed * 0.04 - index * 0.12).toFixed(2)),
    sharpe: Number((2.72 - seed * 0.03 - index * 0.07).toFixed(2)),
    volatility: Number((6.2 + seed * 0.12 + index * 0.31).toFixed(1)),
    winRate: Number((68.4 - seed * 0.4 - index * 0.72).toFixed(1)),
    trades: Math.max(12, 82 - seed * 2 - index * 3),
    mine: Boolean(myBotsByRank[rank]),
  };
});

const officialCompetitionLeaderboards: Record<string, LeaderboardEntry[]> = {
  'Backtesting Challenge': makeOfficialLeaderboard(4, 10, {}),
  'ETF Sprint': makeOfficialLeaderboard(1, 14, { 4: 'ETF Runner' }),
  'I2S Summer League': makeOfficialLeaderboard(3, 18, {
    1: 'Room Beta',
    5: 'Atlas 07',
    9: 'Pair Lab',
  }),
};

const orderedOfficialCompetitions = [...officialCompetitions]
  .sort((a, b) => a.remainingDays - b.remainingDays);


/*
  Deterministic top-5 standings for a room. Rooms have no participant cap —
  `joined` is just how many bots are in right now. `myRank` marks the room the
  person's bot (Room Beta) competes in.
*/
interface Standing {
  rank: number;
  bot: string;
  value: string;
  mine: boolean;
}

const makeStandings = (roomIndex: number, kind: string, myRank: number | null = null): Standing[] => {
  const codes = ['3F9A', '8C21', '11D0', '5E77', '902B', '44AC', '19EE', 'C204', '6B31', '77D8'];
  return Array.from({ length: 5 }, (_, i) => {
    const rank = i + 1;
    const mine = myRank === rank;
    const value = kind === '수익률' ? `+${(14.2 - roomIndex * 0.7 - i * 1.9).toFixed(2)}%`
      : kind === '최대 낙폭' ? `-${(0.62 + roomIndex * 0.08 + i * 0.34).toFixed(2)}%`
      : kind === '샤프 지수' ? (2.41 - roomIndex * 0.05 - i * 0.22).toFixed(2)
      : (88.4 - roomIndex - i * 2.3).toFixed(2);
    return { rank, bot: mine ? 'Room Beta' : `Bot ${codes[(roomIndex + i) % codes.length]}`, value, mine };
  });
};

/*
  User-hosted rooms. There is no participant cap (2026-07-26 product rule), so
  there is no capacity bar and no "정원" anywhere — only how many bots joined.
*/
interface CompetitionRoom {
  name: string;
  score: string;
  ranking: string;
  joined: number;
  host: string;
  start: string;
  end: string;
  remainingDays: number;
  status: RoomStatus;
  myBot: string | null;
  standings: Standing[];
  official?: boolean;
  bots?: number;
  entryLimit?: number;
  universe?: CompetitionUniverse;
}

type RoomStatus = 'recruiting' | 'registering' | 'running';

const competitionRooms: CompetitionRoom[] = [
  /* Momentum Lab's standings come from the same leaderboard the detail page
     ranks, so the two screens agree on Room Beta's #2. */
  { name: 'Momentum Lab', score: '복합 점수', ranking: '표준점수제', joined: 8, host: '이서준', start: '07.07', end: '08.04', remainingDays: 8, status: 'running', myBot: 'Room Beta', universe: { base: '지정 종목', only: ['TSLA', 'MSFT', 'GOOGL'] }, standings: leaderboard.map((entry) => ({ rank: entry.rank, bot: entry.bot, value: entry.score.toFixed(2), mine: entry.mine })) },
  { name: 'ETF Discipline', score: '최대 낙폭', ranking: '위험조정 점수제', joined: 18, host: 'ETF연구회', start: '07.14', end: '08.25', remainingDays: 29, status: 'recruiting', myBot: null, standings: makeStandings(1, '최대 낙폭') },
  { name: 'Quant Study 04', score: '수익률', ranking: '수익률 점수제', joined: 3, host: '박하나', start: '07.21', end: '08.18', remainingDays: 22, status: 'registering', myBot: null, standings: makeStandings(2, '수익률') },
  { name: 'Low Volatility Club', score: '샤프 지수', ranking: '샤프 점수제', joined: 24, host: '차분한투자', start: '07.01', end: '09.26', remainingDays: 61, status: 'running', myBot: null, standings: makeStandings(3, '샤프 지수') },
  { name: 'Gap Hunters', score: '수익률', ranking: '수익률 점수제', joined: 15, host: '한지민', start: '07.10', end: '08.07', remainingDays: 11, status: 'registering', myBot: null, standings: makeStandings(4, '수익률') },
  { name: 'Macro Pulse', score: '복합 점수', ranking: '표준점수제', joined: 12, host: '거시경제방', start: '07.03', end: '09.11', remainingDays: 46, status: 'recruiting', myBot: null, standings: makeStandings(5, '복합 점수') },
  { name: 'Dividend Guard', score: '샤프 지수', ranking: '샤프 점수제', joined: 7, host: '배당사냥꾼', start: '07.17', end: '08.28', remainingDays: 32, status: 'recruiting', myBot: null, standings: makeStandings(6, '샤프 지수') },
  { name: 'Swing Lab 12', score: '복합 점수', ranking: '표준점수제', joined: 6, host: '윤도현', start: '07.20', end: '08.17', remainingDays: 21, status: 'running', myBot: null, standings: makeStandings(7, '복합 점수') },
  { name: 'Earnings Play', score: '수익률', ranking: '수익률 점수제', joined: 9, host: '실적시즌', start: '07.22', end: '08.12', remainingDays: 7, status: 'running', myBot: null, standings: makeStandings(8, '수익률') },
  { name: 'Slow Turtle', score: '최대 낙폭', ranking: '위험조정 점수제', joined: 5, host: '거북이클럽', start: '07.05', end: '09.20', remainingDays: 55, status: 'recruiting', myBot: null, standings: makeStandings(9, '최대 낙폭') },
  { name: 'Golden Cross Club', score: '복합 점수', ranking: '표준점수제', joined: 4, host: '김골든', start: '07.24', end: '08.21', remainingDays: 25, status: 'recruiting', myBot: null, standings: makeStandings(10, '복합 점수') },
];

const roomStatusLabels: Record<RoomStatus, string> = {
  recruiting: '모집 중',
  registering: '봇 등록',
  running: '대회 진행 중',
};

const rankingToneByLabel: Record<string, CompetitionTone> = {
  표준점수제: 'standard',
  '위험조정 점수제': 'risk',
  '수익률 점수제': 'return',
  '샤프 점수제': 'sharpe',
};

const rankingDescriptionByLabel: Record<string, string> = {
  표준점수제: '수익률과 위험 지표를 표준화한 뒤 합산해 순위를 계산합니다.',
  '위험조정 점수제': '수익률을 변동성과 최대 낙폭 등 위험 대비 성과로 조정해 평가합니다.',
  '수익률 점수제': '대회 기간 동안의 누적 수익률이 높은 순서로 평가합니다.',
  '샤프 점수제': '초과 수익을 변동성으로 나눈 샤프 비율이 높은 순서로 평가합니다.',
  백테스팅: '동일한 과거 데이터에서 전략을 실행해 수익률과 위험 지표를 검증합니다.',
};

/*
  채점 방식 도움말(#54). 상세에서 채점 배지를 누르면 이 대회의 수식을 강조한
  채로 전 방식의 계산법을 함께 보여준다 — 배지 이름만으로는 뭐가 다른지 알 수
  없다는 피드백에서 나왔다.
*/
/* 이 수보다 참가자가 많으면 순위표를 상위+내 주변으로 압축한다. */
const RANKING_COMPRESS_LIMIT = 10;

const scoringHelpEntries: Array<{ name: string; formula: string }> = [
  { name: '표준점수제', formula: '점수 = z(수익률) + z(샤프 지수) − z(최대 낙폭)' },
  { name: '위험조정 점수제', formula: '점수 = 수익률 ÷ (1 + |최대 낙폭|)' },
  { name: '수익률 점수제', formula: '점수 = 대회 기간 누적 수익률(%)' },
  { name: '샤프 점수제', formula: '점수 = (수익률 − 기준금리) ÷ 변동성' },
  { name: '백테스팅', formula: '마감 후 같은 과거 구간을 일괄 실행 → 표준점수제 식으로 채점' },
];

function CompetitionBoardRanking({
  ranking,
  tone,
  tooltipId,
}: {
  ranking: string;
  tone: CompetitionTone;
  tooltipId: string;
}) {
  return <span className="competition-board-ranking dashboard-return-info">
    <strong
      className="competition-ranking-badge"
      data-ranking-tone={tone}
      tabIndex={0}
      aria-describedby={tooltipId}
    >
      {ranking}
    </strong>
    <span
      id={tooltipId}
      className="dashboard-return-info-tooltip"
      role="tooltip"
      aria-label={`${ranking} 설명`}
    >
      {rankingDescriptionByLabel[ranking] ?? '동일한 조건에서 대회 참가 봇의 성과를 비교합니다.'}
    </span>
  </span>;
}

/*
  대회 종류 칩 (#54).

  공식 대회 안에서도 채점 근거가 다르다: 라이브는 진행 기간의 실시간 시세,
  백테스트는 같은 과거 구간 재실행. 그 차이를 게시판 행의 첫 컬럼에서 칩으로
  말한다. 일반 대회는 같은 자리에 행 번호가 앉는다.
*/
function CompetitionKindChip({ backtest }: { backtest: boolean }) {
  // Nested components render after the Localized walk, so translate directly.
  const { t } = useLanguage();
  const Icon = backtest ? History : Radio;
  return <span className="competition-kind-chip" data-kind={backtest ? 'backtest' : 'live'}>
    <Icon size={11} aria-hidden="true" />{t(backtest ? '백테스트' : '라이브')}
  </span>;
}

/*
  게시판 행 (#54 확정 A안).

  한 게시판에 공식 대회가 공지처럼 최상단에 핀되고(틴트 + 엣지 바) 일반 대회가
  그 아래 이어진다. 열은 종류/번호 · 대회(이름+채점 배지 / 개설자 보조줄) ·
  마감 · 참여 봇 넷뿐이고, 내 봇이 뛰는 방은 이름 줄 끝의 봇 아이콘이 말한다.
*/
interface CompetitionBoardRowProps {
  name: string;
  ranking: string;
  tone: CompetitionTone;
  remainingDays: number;
  bots: number;
  host: string;
  official: boolean;
  backtest: boolean;
  myRankLabel: string | null;
  index?: number;
  tooltipId: string;
  onOpen: () => void;
}

function CompetitionBoardRow({
  name,
  ranking,
  tone,
  remainingDays,
  bots,
  host,
  official,
  backtest,
  myRankLabel,
  index,
  tooltipId,
  onOpen,
}: CompetitionBoardRowProps) {
  const { t } = useLanguage();
  return <button
    type="button"
    role="listitem"
    className={`competition-row${official ? ' is-pinned' : ''}`}
    aria-label={official ? `공식 대회 ${name} 열기` : `${name} 열기`}
    aria-describedby={tooltipId}
    onClick={onOpen}
  >
    <span className="competition-row-cell is-type">
      {official ? <CompetitionKindChip backtest={backtest} /> : <b className="competition-row-no">{index}</b>}
    </span>
    <span className="competition-row-name">
      <strong>
        {name}
        <CompetitionBoardRanking ranking={ranking} tone={tone} tooltipId={tooltipId} />
        {myRankLabel && <span
          className="competition-row-mine"
          title={t(`내 봇 ${myRankLabel} 참가 중`)}
          aria-label={t('내 봇 참가 중')}
        ><Bot size={15} aria-hidden="true" /></span>}
      </strong>
      <small>
        {official
          ? <b className="competition-row-official" title={t('공식 대회')} aria-label={t('공식 대회')}>
            <BadgeCheck size={14} aria-hidden="true" />Official
          </b>
          : host}
      </small>
    </span>
    <span className="competition-row-cell is-num">
      <b className={remainingDays <= 7 ? 'is-urgent' : ''}>{`D-${remainingDays}`}</b>
      <small>{t('마감')}</small>
    </span>
    <span className="competition-row-cell is-num">
      <b>{bots}</b>
      <small>{t('참여 봇')}</small>
    </span>
  </button>;
}

/*
  Every metric a competition ranking can be sorted by. Offering the choice is the
  point: a single composite ranking would read as the product recommending one
  bot over another.
*/
type RankingMetricId = 'score' | 'return' | 'drawdown' | 'sharpe' | 'volatility' | 'winRate' | 'trades';

interface RankingMetric {
  id: RankingMetricId;
  label: string;
  suffix: string;
  better: 'high' | 'low';
}

const rankingMetrics: RankingMetric[] = [
  { id: 'score', label: '점수', suffix: '', better: 'high' },
  { id: 'return', label: '수익률', suffix: '%', better: 'high' },
  { id: 'drawdown', label: '최대 낙폭', suffix: '%', better: 'high' },
  { id: 'sharpe', label: '샤프 지수', suffix: '', better: 'high' },
  { id: 'volatility', label: '변동성', suffix: '%', better: 'low' },
  { id: 'winRate', label: '승률', suffix: '%', better: 'high' },
  { id: 'trades', label: '거래 횟수', suffix: '회', better: 'high' },
];

const formatMetric = (entry: LeaderboardEntry, metric: RankingMetric): string => {
  const value = entry[metric.id];
  if (metric.id === 'return' || metric.id === 'winRate') return `${value > 0 ? '+' : ''}${value.toFixed(metric.id === 'return' ? 2 : 1)}${metric.suffix}`;
  if (metric.id === 'drawdown') return `${value.toFixed(2)}${metric.suffix}`;
  if (metric.id === 'volatility') return `${value.toFixed(1)}${metric.suffix}`;
  if (metric.id === 'trades') return `${value}${metric.suffix}`;
  return value.toFixed(2);
};

interface CompetitionCondition {
  label: string;
  value: string;
  detail: string;
}

/* 종목 범위는 대회마다 다르므로(universe) 여기 고정 목록에서 뺐다. */
const competitionConditions: CompetitionCondition[] = [
  { label: '시작 자본', value: '$10,000', detail: '모든 참가 봇 동일' },
  { label: '수수료', value: '0.20%', detail: '매수·매도 체결 시 적용' },
  { label: '슬리피지', value: '0.05%', detail: '시장가 체결 오차 반영' },
];

const DEFAULT_UNIVERSE: CompetitionUniverse = { base: '미국 상장 주식 · ETF' };

const competitionDetailDescriptions: Record<string, string> = {
  'ETF Sprint': 'ETF 전략의 단기 수익성과 매매 일관성을 동일한 조건에서 비교하는 공식 대회입니다.',
  'Alpha Dash': '짧은 기간 안에 초과 수익을 만드는 전략의 속도와 위험 관리 능력을 함께 평가합니다.',
  'Risk Control Cup': '손실 위험을 낮추면서 안정적인 성과를 만드는 전략을 위험조정 점수로 평가합니다.',
  'I2S Summer League': '수익성과 안정성을 함께 평가하며, 다양한 시장 국면에서 전략이 얼마나 일관되게 작동하는지 비교합니다.',
  'Dividend Marathon': '배당주 중심의 장기 운용 성과를 겨루며, 배당 재투자와 안정적인 자산 성장, 하락 구간의 위험 관리 능력을 함께 평가합니다.',
  'Volatility Shield': '낮은 변동성과 꾸준한 위험 대비 성과를 유지하는 전략을 장기간에 걸쳐 평가합니다.',
};

function CompetitionCreateDialog({ onClose }: { onClose: () => void }) {
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [description, setDescription] = useState('');
  const [detailSettingsOpen, setDetailSettingsOpen] = useState(false);

  useEffect(() => {
    nameInputRef.current?.focus();
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [onClose]);

  return <div
    className="competition-create-backdrop"
    onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}
  >
    <form
      className="competition-create-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="competition-create-title"
      onSubmit={(event) => {
        event.preventDefault();
        onClose();
      }}
    >
      <header>
        <h2 id="competition-create-title">대회 만들기</h2>
        <button type="button" aria-label="대회 만들기 닫기" onClick={onClose}><X size={20} /></button>
      </header>

      <fieldset>
        <legend>기본 정보</legend>
        <label>
          <span>대회 이름</span>
          <input ref={nameInputRef} aria-label="대회 이름" placeholder="대회 이름을 입력하세요" required />
        </label>
        <label>
          <span>대회 설명</span>
          <textarea
            aria-label="대회 설명"
            placeholder="참가자가 대회의 목적을 이해할 수 있도록 설명하세요"
            maxLength={120}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />
          <small aria-hidden="true">{`${description.length} / 120`}</small>
        </label>
      </fieldset>

      <fieldset className="competition-create-settings">
        <legend>운영 설정</legend>
        <div className="competition-create-period">
          <span>대회 기간</span>
          <div>
            <label><span>시작일</span><input type="date" aria-label="시작일" required /></label>
            <i aria-hidden="true">–</i>
            <label><span>종료일</span><input type="date" aria-label="종료일" required /></label>
          </div>
        </div>
        <label className="competition-create-score">
          <span>채점 방식</span>
          <select aria-label="채점 방식" defaultValue="표준점수제">
            <option>표준점수제</option>
            <option>위험조정 점수제</option>
            <option>수익률 점수제</option>
            <option>샤프 점수제</option>
          </select>
        </label>
        <label className="competition-create-capital">
          <span>시작 자본</span>
          <span className="competition-create-money"><b aria-hidden="true">$</b><input aria-label="시작 자본" inputMode="numeric" defaultValue="10,000" /></span>
        </label>
      </fieldset>

      <button
        type="button"
        className="competition-create-details-toggle"
        aria-expanded={detailSettingsOpen}
        aria-controls="competition-create-detail-settings"
        onClick={() => setDetailSettingsOpen((open) => !open)}
      >
        <span>대회 세부 설정</span>
        <ChevronDown size={16} aria-hidden="true" />
      </button>

      {detailSettingsOpen && <fieldset
        id="competition-create-detail-settings"
        className="competition-create-detail-settings"
      >
        <legend>세부 설정</legend>
        <label>
          <span>종목 범위</span>
          <select aria-label="종목 범위" defaultValue="미국 상장 주식 · ETF">
            <option>미국 상장 주식 · ETF</option>
            <option>미국 상장 주식</option>
            <option>미국 상장 ETF</option>
          </select>
        </label>
        <label>
          <span>참가 봇 한도</span>
          <select aria-label="참가 봇 한도" defaultValue="25 BOT">
            <option>10 BOT</option>
            <option>25 BOT</option>
            <option>50 BOT</option>
          </select>
        </label>
        <label>
          <span>수수료</span>
          <input aria-label="수수료" inputMode="decimal" defaultValue="0.20%" />
        </label>
        <label>
          <span>슬리피지</span>
          <input aria-label="슬리피지" inputMode="decimal" defaultValue="0.05%" />
        </label>
      </fieldset>}

      <footer>
        <p><Info size={14} aria-hidden="true" />대회를 만든 뒤에도 시작 전까지 설정을 수정할 수 있습니다.</p>
        <div>
          <button type="button" className="button button-secondary" onClick={onClose}>취소</button>
          <button type="submit" className="button button-primary">대회 만들기</button>
        </div>
      </footer>
    </form>
  </div>;
}

/*
  로비의 보기 축(#54): 목록은 모집 중 / 진행 중 / 참여 중 중 하나의 관점만
  보인다. 이 페이지의 목적은 들어갈 방 찾기라 기본은 모집 중이고, 이미 닫힌
  진행 중과 내 참가 방은 직접 골랐을 때만 보인다. 그래서 행에 상태 텍스트를
  반복하지 않는다. 공식 핀은 공지처럼 보기와 무관하게 항상 남는다.
*/
type CompetitionView = 'recruiting' | 'running' | 'joined';

const competitionViewLabels: Record<CompetitionView, string> = {
  recruiting: '모집 중',
  running: '진행 중',
  joined: '참여 중',
};

export function RoomsView({ visualVariant = 'default' }: { visualVariant?: 'default' | 'image' }) {
  const [query, setQuery] = useState('');
  const [scoreFilters, setScoreFilters] = useState<string[]>([]);
  const [view, setView] = useState<CompetitionView>('recruiting');
  const [remainingFilter, setRemainingFilter] = useState<'all' | '7' | '30'>('all');
  const [selectedRoom, setSelectedRoom] = useState<OfficialCompetition | CompetitionRoom | null>(null);
  /* 상세(#54): 조건 표 접힘 · 채점 도움말 모달 · 순위표 전체 보기 · 지표 열. */
  const [factsOpen, setFactsOpen] = useState(false);
  const [scoringHelpOpen, setScoringHelpOpen] = useState(false);
  const [rankingExpanded, setRankingExpanded] = useState(false);
  /* 순위표에 어떤 성적 지표를 열로 띄울지는 보는 사람이 고른다(최대 4개). */
  const [visibleMetricIds, setVisibleMetricIds] = useState<RankingMetricId[]>(['score', 'return']);
  const [metricEditorOpen, setMetricEditorOpen] = useState(false);
  const [sortMetric, setSortMetric] = useState<RankingMetricId>('score');
  const [rankingPage, setRankingPage] = useState(1);
  const [entryDialogStep, setEntryDialogStep] = useState<'closed' | 'select' | 'confirm'>('closed');
  const [selectedEntryStrategies, setSelectedEntryStrategies] = useState<string[]>([]);
  const [entryStrategyQuery, setEntryStrategyQuery] = useState('');
  const [resolvedEntryStrategyQuery, setResolvedEntryStrategyQuery] = useState('');
  const [entryStrategySearching, setEntryStrategySearching] = useState(false);
  const [entryStrategyPage, setEntryStrategyPage] = useState(1);
  const [generatedEntriesByCompetition, setGeneratedEntriesByCompetition] = useState<Record<string, LeaderboardEntry[]>>({});
  const [entrySuccessMessage, setEntrySuccessMessage] = useState('');
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  /* 기본 정렬은 마감 임박 순 하나로 못박는다 — 이 도메인의 시간축이다. */
  const visibleRooms = useMemo(() => competitionRooms.filter((room) => {
    const normalizedQuery = query.trim().toLowerCase();
    const matchesQuery = room.name.toLowerCase().includes(normalizedQuery)
      || room.host.toLowerCase().includes(normalizedQuery);
    const matchesScore = scoreFilters.length === 0 || scoreFilters.includes(room.ranking);
    /* 봇 등록(registering) 단계도 아직 들어갈 수 있으므로 모집 중으로 묶는다. */
    const matchesView = view === 'joined'
      ? Boolean(room.myBot)
      : view === 'running' ? room.status === 'running' : room.status !== 'running';
    const matchesRemaining = remainingFilter === 'all' || room.remainingDays <= Number(remainingFilter);
    return matchesQuery && matchesScore && matchesView && matchesRemaining;
  }).sort((a, b) => a.remainingDays - b.remainingDays), [
    query,
    scoreFilters,
    view,
    remainingFilter,
  ]);
  useEffect(() => setRankingPage(1), [sortMetric, selectedRoom]);
  useEffect(() => {
    if (entryDialogStep !== 'select') return undefined;
    const normalizedQuery = entryStrategyQuery.trim();
    if (!normalizedQuery) {
      setResolvedEntryStrategyQuery('');
      setEntryStrategySearching(false);
      setEntryStrategyPage(1);
      return undefined;
    }
    setEntryStrategySearching(true);
    const searchTimer = window.setTimeout(() => {
      setResolvedEntryStrategyQuery(normalizedQuery);
      setEntryStrategySearching(false);
      setEntryStrategyPage(1);
    }, 300);
    return () => window.clearTimeout(searchTimer);
  }, [entryDialogStep, entryStrategyQuery]);
  useEffect(() => {
    if (!scoringHelpOpen) return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setScoringHelpOpen(false);
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [scoringHelpOpen]);
  /* 방을 옮기면 상세 상태를 초기화한다. 조건 표는 항상 접힌 채 시작한다 —
     헤더의 제목·설명이 먼저 읽혀야 한다. */
  useEffect(() => {
    setFactsOpen(false);
    setScoringHelpOpen(false);
    setRankingExpanded(false);
    setMetricEditorOpen(false);
    setVisibleMetricIds(['score', 'return']);
  }, [selectedRoom]);
  useEffect(() => {
    if (entryDialogStep === 'closed') return undefined;
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEntryDialogStep('closed');
        setSelectedEntryStrategies([]);
      }
    };
    window.addEventListener('keydown', handleEscape);
    return () => window.removeEventListener('keydown', handleEscape);
  }, [entryDialogStep]);
  const toggleScoreFilter = (ranking: string) => setScoreFilters((current) => (
    current.includes(ranking) ? current.filter((item) => item !== ranking) : [...current, ranking]
  ));
  const activeFilterCount = (query.trim() ? 1 : 0)
    + (view === 'recruiting' ? 0 : 1)
    + scoreFilters.length
    + (remainingFilter === 'all' ? 0 : 1);
  const resetFilters = () => {
    setQuery('');
    setScoreFilters([]);
    setView('recruiting');
    setRemainingFilter('all');
  };
  /* 페이지 첫 문장: 지금 내 상황과 가장 급한 마감. */
  const myCompetitions = [
    ...orderedOfficialCompetitions.filter((competition) => competition.standingTone !== 'inactive'),
    ...competitionRooms.filter((room) => Boolean(room.myBot)),
  ].sort((a, b) => a.remainingDays - b.remainingDays);
  const lobbyDescription = myCompetitions.length > 0
    ? `내 봇이 대회 ${myCompetitions.length}개에서 뛰고 있어요. 가장 급한 마감은 ${myCompetitions[0].name} D-${myCompetitions[0].remainingDays}예요.`
    : '아직 참가 중인 대회가 없어요. 모집 중인 대회에서 첫 도전을 시작해보세요.';
  const activeMetric = rankingMetrics.find((metric) => metric.id === sortMetric) ?? rankingMetrics[0];
  const visibleMetrics = rankingMetrics.filter((metric) => visibleMetricIds.includes(metric.id));
  const toggleMetricColumn = (id: RankingMetricId) => {
    if (visibleMetricIds.includes(id)) {
      if (visibleMetricIds.length === 1) return; // 열은 최소 하나
      const next = visibleMetricIds.filter((item) => item !== id);
      setVisibleMetricIds(next);
      if (sortMetric === id) setSortMetric(next[0]);
    } else if (visibleMetricIds.length < 4) { // 그 이상은 열이 좁아져 읽히지 않는다
      setVisibleMetricIds([...visibleMetricIds, id]);
    }
  };
  const rankingSource = useMemo(() => {
    const baseEntries = selectedRoom?.official
      ? officialCompetitionLeaderboards[selectedRoom.name] ?? leaderboard
      : leaderboard;
    const generatedEntries = selectedRoom ? generatedEntriesByCompetition[selectedRoom.name] ?? [] : [];
    return [...baseEntries, ...generatedEntries];
  }, [generatedEntriesByCompetition, selectedRoom]);
  const rankingPageSize = 10;
  const rankedEntries = useMemo(() => [...rankingSource].sort((a, b) => activeMetric.better === 'low'
    ? a[activeMetric.id] - b[activeMetric.id]
    : b[activeMetric.id] - a[activeMetric.id]), [activeMetric, rankingSource]);
  const rankingPageCount = Math.max(1, Math.ceil(rankedEntries.length / rankingPageSize));
  const safeRankingPage = Math.min(rankingPage, rankingPageCount);
  const visibleRankingEntries = rankedEntries.slice(
    (safeRankingPage - 1) * rankingPageSize,
    safeRankingPage * rankingPageSize,
  );
  const myRankedEntries = rankedEntries.flatMap((entry, index) => (
    entry.mine ? [{ entry, position: index + 1 }] : []
  ));
  /*
    1-a 압축(#54): 순위표의 실제 질문은 "누가 이기고 있나"와 "내 앞뒤는
    누구인가" 둘뿐이다. 기본 화면은 상위 3 + 내 봇 ±2로 끝나고, 생략 구간은
    줄 하나로 접는다. 참가하지 않았다면 상위 10을 보여준다.
  */
  const rankingCompressed = !rankingExpanded && rankedEntries.length > RANKING_COMPRESS_LIMIT;
  const compressedRankingRows = useMemo(() => {
    if (!rankingCompressed) return [];
    const keep = new Set<number>([1, 2, 3]);
    if (myRankedEntries.length === 0) {
      for (let position = 1; position <= Math.min(RANKING_COMPRESS_LIMIT, rankedEntries.length); position += 1) keep.add(position);
    }
    myRankedEntries.forEach(({ position }) => {
      for (let near = Math.max(1, position - 2); near <= Math.min(rankedEntries.length, position + 2); near += 1) keep.add(near);
    });
    /*
      생략 규칙: 숨겨지는 구간이 3개 미만이면 접지 않는다 — 생략 줄 하나가
      행 1~2개보다 자리를 더 차지해서, 접는 의미가 없다. 3개 이상일 때만
      "#시작–#끝 · N개 접힘" 줄 하나로 접는다.
    */
    const rows: Array<{ kind: 'entry'; entry: LeaderboardEntry; position: number } | { kind: 'gap'; hidden: number; from: number; to: number }> = [];
    const pushRange = (startIndex: number, endIndex: number) => {
      const hidden = endIndex - startIndex;
      if (hidden <= 0) return;
      if (hidden < 3) {
        for (let index = startIndex; index < endIndex; index += 1) {
          rows.push({ kind: 'entry', entry: rankedEntries[index], position: index + 1 });
        }
      } else {
        rows.push({ kind: 'gap', hidden, from: startIndex + 1, to: endIndex });
      }
    };
    let runStart = -1;
    rankedEntries.forEach((entry, index) => {
      const position = index + 1;
      if (keep.has(position)) {
        if (runStart >= 0) {
          pushRange(runStart, index);
          runStart = -1;
        }
        rows.push({ kind: 'entry', entry, position });
      } else if (runStart < 0) {
        runStart = index;
      }
    });
    if (runStart >= 0) pushRange(runStart, rankedEntries.length);
    return rows;
  }, [rankingCompressed, rankedEntries, myRankedEntries]);
  const isRecruitingRoom = Boolean(selectedRoom && selectedRoom.status !== 'running');
  const isBacktestRoom = selectedRoom?.ranking === '백테스팅';
  const myBotEntryLimit = selectedRoom?.entryLimit ?? 3;
  const remainingEntrySlots = Math.max(0, myBotEntryLimit - myRankedEntries.length);
  const launchableStrategies = strategies.filter((strategy) => (
    strategy.state === '출시 가능'
    && !rankingSource.some((entry) => entry.bot === `${strategy.name} Bot`)
  ));
  const normalizedEntryStrategyQuery = resolvedEntryStrategyQuery.toLowerCase();
  const filteredLaunchableStrategies = launchableStrategies.filter((strategy) => (
    strategy.name.toLowerCase().includes(normalizedEntryStrategyQuery)
    || strategy.mode.toLowerCase().includes(normalizedEntryStrategyQuery)
  ));
  const entryStrategyPageSize = 5;
  const entryStrategyPageCount = Math.max(
    1,
    Math.ceil(filteredLaunchableStrategies.length / entryStrategyPageSize),
  );
  const safeEntryStrategyPage = Math.min(entryStrategyPage, entryStrategyPageCount);
  const visibleLaunchableStrategies = filteredLaunchableStrategies.slice(
    (safeEntryStrategyPage - 1) * entryStrategyPageSize,
    safeEntryStrategyPage * entryStrategyPageSize,
  );
  const canEnterSelectedRoom = Boolean(
    selectedRoom
    && remainingEntrySlots > 0
    && selectedRoom.status === 'recruiting',
  );
  const detailDeadlineLabel = selectedRoom?.status === 'recruiting' ? '모집 중' : '대회 진행 중';
  const detailDeadlineText = selectedRoom
    ? `${detailDeadlineLabel} D-${selectedRoom.remainingDays}`
    : '';
  const detailProgress = selectedRoom?.status === 'running'
    ? 'progress' in selectedRoom
      ? selectedRoom.progress
      : Math.max(5, Math.min(95, 100 - selectedRoom.remainingDays))
    : 0;
  const detailDescription = selectedRoom
    ? competitionDetailDescriptions[selectedRoom.name]
      ?? `${selectedRoom.name} 참가 봇을 동일한 시장 데이터와 체결 조건에서 비교하는 모의투자 대회입니다.`
    : '';
  /* 종목 범위: 기준 유니버스 + 제외/지정 목록. 값은 요약, 목록은 칩으로. */
  const detailUniverse = selectedRoom?.universe ?? DEFAULT_UNIVERSE;
  const detailUniverseValue = detailUniverse.only
    ? `지정 ${detailUniverse.only.length}종목`
    : detailUniverse.exclude
      ? `${detailUniverse.base} · ${detailUniverse.exclude.length}종목 제외`
      : detailUniverse.base;
  const detailFacts = selectedRoom ? [
    { label: '운영자', value: selectedRoom.host },
    { label: '기간', value: `${selectedRoom.start} – ${selectedRoom.end}` },
    { label: '참여 봇', value: `${selectedRoom.official ? selectedRoom.bots : selectedRoom.joined}개` },
    { label: '종목 범위', value: detailUniverseValue },
    ...competitionConditions.map(({ label, value }) => ({ label, value })),
  ] : [];
  const closeEntryDialog = () => {
    setEntryDialogStep('closed');
    setSelectedEntryStrategies([]);
    setEntryStrategyQuery('');
    setResolvedEntryStrategyQuery('');
    setEntryStrategySearching(false);
    setEntryStrategyPage(1);
  };
  const openEntryDialog = () => {
    setEntrySuccessMessage('');
    setSelectedEntryStrategies([]);
    setEntryStrategyQuery('');
    setResolvedEntryStrategyQuery('');
    setEntryStrategySearching(false);
    setEntryStrategyPage(1);
    setEntryDialogStep('select');
  };
  const toggleEntryStrategy = (strategyName: string) => {
    setSelectedEntryStrategies((current) => {
      if (current.includes(strategyName)) return current.filter((name) => name !== strategyName);
      if (current.length >= remainingEntrySlots) return current;
      return [...current, strategyName];
    });
  };
  const confirmCompetitionEntry = () => {
    if (!selectedRoom || selectedEntryStrategies.length === 0) return;
    const existingCount = rankingSource.length;
    const newEntries = selectedEntryStrategies.map((strategyName, index): LeaderboardEntry => ({
      rank: existingCount + index + 1,
      bot: `${strategyName} Bot`,
      score: Number((88.75 - index * 1.2).toFixed(2)),
      return: Number((7.15 - index * 0.35).toFixed(2)),
      drawdown: Number((-2.1 - index * 0.15).toFixed(2)),
      sharpe: Number((1.72 - index * 0.08).toFixed(2)),
      volatility: Number((9.8 + index * 0.4).toFixed(1)),
      winRate: Number((59.2 - index * 0.8).toFixed(1)),
      trades: 24 - index * 2,
      mine: true,
    }));
    setGeneratedEntriesByCompetition((current) => ({
      ...current,
      [selectedRoom.name]: [...(current[selectedRoom.name] ?? []), ...newEntries],
    }));
    setEntrySuccessMessage(
      `${newEntries.map((entry) => entry.bot).join(', ')}이 생성되어 대회에 참가했습니다.`,
    );
    setRankingPage(1);
    closeEntryDialog();
  };

  /*
    상세 페이지 (#54 확정).

    헤더는 눈썹(종류 칩·Official·상태 D-day) · 제목 · 설명 · 참가 버튼만 —
    진행률 바·%는 제거했다. D-day가 남은 시간을 말하고, 진행률은 대회 조건의
    기간 칸 미니 바로만 남는다.

    본문은 상태에 따라 완전히 다른 화면이다. 모집 중에는 봇이 아직 아무것도
    하지 않으므로 순위표가 없다 — 등록한 봇은 "시작 대기"로 보이고, 참가 판단
    정보(조건·채점 방식)가 앞에 선다. 진행 중에는 순위표가 주인공이 된다.
  */
  if (selectedRoom) return <Localized><div className="page competition-page competition-detail-page">
    <section aria-label={`${selectedRoom.name} 상세 페이지`}>
      <button className="competition-back-button" onClick={() => {
        setScoringHelpOpen(false);
        closeEntryDialog();
        setEntrySuccessMessage('');
        setSelectedRoom(null);
      }}><ArrowLeft size={15} /> 대회 목록으로</button>

      <header className="competition-detail-heading">
        <div className="competition-detail-heading-main">
          <div>
            {/* 눈썹 줄: 로비와 같은 문법 — 공식은 종류 칩+인증마크, 일반은 개설자. */}
            <div className="competition-detail-eyebrow">
              {selectedRoom.official
                ? <>
                  <CompetitionKindChip backtest={selectedRoom.ranking === '백테스팅'} />
                  <b className="competition-row-official"><BadgeCheck size={14} aria-hidden="true" />Official</b>
                </>
                : <span className="competition-detail-host">{`개설자 ${selectedRoom.host}`}</span>}
              <span className={`competition-detail-state${selectedRoom.remainingDays <= 7 ? ' is-urgent' : ''}`}>
                {`· ${detailDeadlineText}`}
              </span>
            </div>
            <div className="competition-detail-title">
              <h1>{selectedRoom.name}</h1>
            </div>
            <span className="competition-detail-description">{detailDescription}</span>
          </div>
          <div className="competition-detail-actions">
            <button
              type="button"
              className="competition-entry-button"
              disabled={!canEnterSelectedRoom}
              onClick={openEntryDialog}
            >
              {canEnterSelectedRoom
                ? '대회 참가'
                : remainingEntrySlots === 0
                  ? '참가 가능한 봇을 모두 등록했습니다.'
                  : selectedRoom.status === 'running' ? '진행중인 대회입니다.' : '마감된 대회입니다.'}
            </button>
          </div>
        </div>

        {/* 대회 조건: 헤더에 붙은 접이식 줄. 기본은 접힘 — 제목·설명이 먼저다. */}
        <div className="competition-detail-facts-block">
          <button
            type="button"
            className="competition-detail-facts-toggle"
            aria-expanded={factsOpen}
            aria-controls="competition-detail-facts"
            onClick={() => setFactsOpen((open) => !open)}
          >
            <ChevronDown size={15} aria-hidden="true" className={factsOpen ? 'is-open' : ''} />
            대회 조건
            <small>시작 자본·수수료는 모든 참가 봇에게 동일해요</small>
          </button>
          {factsOpen && <dl id="competition-detail-facts" className="competition-detail-facts" aria-label={`${selectedRoom.name} 대회 조건`}>
            {detailFacts.map((fact) => <div key={fact.label}>
              <dt>{fact.label}</dt>
              <dd className={fact.label === '종목 범위' ? 'is-universe' : undefined}>
                {fact.value}
                {fact.label === '기간' && selectedRoom.status === 'running' && <span
                  className="competition-detail-facts-progress"
                  role="progressbar"
                  aria-label={`${selectedRoom.name} 진행률`}
                  aria-valuemin={0}
                  aria-valuemax={100}
                  aria-valuenow={detailProgress}
                ><i style={{ width: `${detailProgress}%` }} /></span>}
                {/* 제외/지정 목록은 요약 밑에 티커 칩으로 전부 보여준다. */}
                {fact.label === '종목 범위' && (detailUniverse.only || detailUniverse.exclude) && <span className="competition-detail-universe">
                  <em>{detailUniverse.only ? '지정 종목만' : '제외 종목'}</em>
                  {(detailUniverse.only ?? detailUniverse.exclude ?? []).map((ticker) => <code key={ticker}>{ticker}</code>)}
                </span>}
              </dd>
            </div>)}
          </dl>}
        </div>
      </header>

      {entrySuccessMessage && <div className="competition-entry-success" role="status">
        <Check size={16} aria-hidden="true" />
        <span>{entrySuccessMessage}</span>
      </div>}

      {isRecruitingRoom
        ? <div className="competition-detail-rankings is-recruiting">
          {/* 모집 중: 순위는 아직 존재하지 않는다. 등록 봇은 시작 대기 상태로만. */}
          <section className="competition-my-ranks" aria-label="내 참가 봇 순위">
            <header>
              <div><p>MY BOTS</p><h3>내 참가 봇</h3></div>
              <span
                className="competition-my-ranks-capacity"
                aria-label={`등록 봇 ${myRankedEntries.length}/${myBotEntryLimit}`}
              >
                <small>등록 봇</small>
                <strong>{`${myRankedEntries.length} / ${myBotEntryLimit}`}</strong>
              </span>
            </header>
            {/* 상태 문구는 한 번만 — 줄마다 "시작 대기"를 반복하지 않는다. */}
            {myRankedEntries.length > 0 ? <>
              <p className="competition-my-ranks-note">등록한 봇은 대회 시작과 함께 실행돼요.</p>
              <ul className="is-waiting">
                {myRankedEntries.map(({ entry }) => <li key={entry.bot}>
                  <span className="competition-my-ranks-wait" aria-hidden="true"><Bot size={15} /></span>
                  <b>{entry.bot}</b>
                </li>)}
              </ul>
            </> : <div className="competition-my-ranks-empty">
              <Bot size={20} aria-hidden="true" />
              <span>
                <strong>참가 중인 봇이 없습니다.</strong>
                <small>지금 참가하면 대회 시작과 함께 봇이 실행돼요.</small>
              </span>
            </div>}
          </section>

          <section className="competition-recruiting-panel" aria-label={`${selectedRoom.name} 대회 안내`}>
            <header><p>BEFORE START</p><h2>대회 시작 전이에요</h2></header>
            <p>
              {isBacktestRoom
                ? '모집이 마감되면 모든 참가 봇이 같은 과거 구간을 일괄 실행해 한 번에 채점해요. 순위는 결과 계산이 끝난 뒤 공개돼요.'
                : '참가 봇은 대회 시작에 맞춰 일제히 실행돼요. 순위표는 시작 후에 열려요.'}
            </p>
            {/* D-day는 헤더 눈썹이 이미 말한다 — 여기는 참여 규모만. */}
            <div className="competition-recruiting-facts">
              <span><b>{'joined' in selectedRoom ? selectedRoom.joined : selectedRoom.bots}</b><small>참여 봇</small></span>
            </div>
            <button
              type="button"
              className="competition-scoring-help"
              aria-haspopup="dialog"
              onClick={() => setScoringHelpOpen(true)}
            >
              <strong className="competition-ranking-badge" data-ranking-tone={rankingToneByLabel[selectedRoom.ranking] ?? 'backtesting'}>{selectedRoom.ranking}</strong>
              <CircleHelp size={14} aria-hidden="true" />
              <span>채점 방식 안내</span>
            </button>
          </section>
        </div>
        /*
          진행 중: 리더보드 하나가 전폭을 쓴다. 압축 규칙이 내 봇 ±2를 항상
          보여주므로 별도의 "내 참가 봇" 패널은 같은 숫자의 반복이었다 —
          내 행 강조와 등록 봇 카운트만 남긴다.
        */
        : <section className="competition-leaderboard is-single" aria-labelledby="competition-leaderboard-title">
            <header>
              <div className="competition-leaderboard-title">
                <p>LEADERBOARD</p>
                <div>
                  <h2 id="competition-leaderboard-title">대회 리더보드</h2>
                  {/* 채점 배지를 누르면 전 방식 수식 안내 모달이 열린다. */}
                  <button
                    type="button"
                    className="competition-scoring-help"
                    aria-haspopup="dialog"
                    aria-label={`${selectedRoom.ranking} 채점 방식 안내`}
                    onClick={() => setScoringHelpOpen(true)}
                  >
                    <strong className="competition-ranking-badge" data-ranking-tone={rankingToneByLabel[selectedRoom.ranking] ?? 'backtesting'}>{selectedRoom.ranking}</strong>
                    <CircleHelp size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
              <div className="competition-ranking-tools">
                {myRankedEntries.length > 0 && <span
                  className="competition-leaderboard-capacity"
                  aria-label={`등록 봇 ${myRankedEntries.length}/${myBotEntryLimit}`}
                >
                  <small>등록 봇</small>
                  <strong>{`${myRankedEntries.length} / ${myBotEntryLimit}`}</strong>
                </span>}
                {/* 지표는 하나씩 갈아끼우는 게 아니라 열로 고른다(최대 4개).
                    정렬은 열 머리를 눌러 바꾼다. */}
                <button
                  type="button"
                  className="competition-metric-edit"
                  aria-expanded={metricEditorOpen}
                  aria-controls="competition-metric-editor"
                  onClick={() => setMetricEditorOpen((open) => !open)}
                >
                  <SlidersHorizontal size={13} aria-hidden="true" />
                  지표 편집
                </button>
                {metricEditorOpen && <div id="competition-metric-editor" className="competition-metric-editor" role="group" aria-label="표시할 지표 선택">
                  {rankingMetrics.map((metric) => {
                    const checked = visibleMetricIds.includes(metric.id);
                    const disabled = !checked && visibleMetrics.length >= 4;
                    return <label key={metric.id} className={disabled ? 'is-disabled' : ''}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={disabled}
                        onChange={() => toggleMetricColumn(metric.id)}
                      />
                      <span className="competition-metric-check" aria-hidden="true"><Check size={11} /></span>
                      {metric.label}
                    </label>;
                  })}
                  <small>최대 4개 · 열 제목을 누르면 그 지표로 정렬돼요</small>
                </div>}
              </div>
            </header>
            <div className="competition-ranking-list">
              <div
                className="competition-ranking is-metric-ranking"
                aria-label={`${selectedRoom.name} 봇 순위`}
                style={{ '--ranking-cols': `56px minmax(0, 1fr) repeat(${visibleMetrics.length}, minmax(84px, 104px))` } as CSSProperties}
              >
                <header>
                  <span>순위</span>
                  <span>봇</span>
                  {visibleMetrics.map((metric) => <button
                    type="button"
                    key={metric.id}
                    className={sortMetric === metric.id ? 'is-sorted' : ''}
                    aria-label={`${metric.label} 기준 정렬`}
                    aria-sort={sortMetric === metric.id ? 'descending' : 'none'}
                    onClick={() => setSortMetric(metric.id)}
                  >{metric.label}<i aria-hidden="true">{sortMetric === metric.id ? '▼' : '↕'}</i></button>)}
                </header>
                {/*
                  1-a 압축(#54): 참가자가 200명이어도 화면은 상위 3 + 내 봇 ±2로
                  끝난다. 생략 구간은 줄 하나로 표시하고, 눌러야 전체가 열린다.
                */}
                {(rankingCompressed
                  ? compressedRankingRows
                  : visibleRankingEntries.map((entry, index) => ({
                    kind: 'entry' as const,
                    entry,
                    position: (safeRankingPage - 1) * rankingPageSize + index + 1,
                  }))
                ).map((row, index) => (row.kind === 'gap'
                  ? <div className="competition-ranking-gap" key={`gap-${index}`}>
                    <button type="button" aria-label={`${row.from}위부터 ${row.to}위까지 펼치기`} onClick={() => setRankingExpanded(true)}>
                      <ChevronDown size={12} aria-hidden="true" />
                      {`#${row.from}–#${row.to} · ${row.hidden}개 접힘`}
                    </button>
                  </div>
                  : <div className={row.entry.mine ? 'is-mine' : ''} key={row.entry.bot}>
                    <strong className="competition-ranking-position">#{row.position}</strong>
                    <span>{row.entry.bot}</span>
                    {visibleMetrics.map((metric) => (metric.id === 'return'
                      ? <span key={metric.id} className={row.entry.return >= 0 ? 'positive' : 'negative'}>{formatMetric(row.entry, metric)}</span>
                      : <b key={metric.id}>{formatMetric(row.entry, metric)}</b>))}
                  </div>))}
              </div>
            </div>
            <footer className="competition-ranking-pagination">
              {rankingCompressed
                ? <button type="button" className="competition-ranking-expand" onClick={() => setRankingExpanded(true)}>{`전체 순위 보기 (${rankedEntries.length})`}</button>
                : <>
                  {rankedEntries.length > RANKING_COMPRESS_LIMIT && <button
                    type="button"
                    className="competition-ranking-expand"
                    onClick={() => {
                      setRankingExpanded(false);
                      setRankingPage(1);
                    }}
                  >간단히 보기</button>}
                  <button type="button" disabled={safeRankingPage === 1} onClick={() => setRankingPage((current) => Math.max(1, current - 1))}>이전</button>
                  <span>{safeRankingPage} / {rankingPageCount}</span>
                  <button type="button" disabled={safeRankingPage === rankingPageCount} onClick={() => setRankingPage((current) => Math.min(rankingPageCount, current + 1))}>다음</button>
                </>}
            </footer>
          </section>}

      {/* 채점 방식 안내: 이 대회의 수식을 강조하고 나머지 방식도 함께 설명한다. */}
      {scoringHelpOpen && <div
        className="competition-detail-info-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) setScoringHelpOpen(false);
        }}
      >
        <section
          className="competition-detail-info-dialog competition-scoring-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="competition-scoring-help-title"
        >
          <header>
            <div>
              <p>SCORING</p>
              <h2 id="competition-scoring-help-title">채점 방식 안내</h2>
            </div>
            <button type="button" aria-label="채점 방식 안내 닫기" onClick={() => setScoringHelpOpen(false)}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>
          <ul className="competition-scoring-list">
            {scoringHelpEntries.map((method) => <li key={method.name} data-current={method.name === selectedRoom.ranking || undefined}>
              <div className="competition-scoring-list-head">
                <strong className="competition-ranking-badge" data-ranking-tone={rankingToneByLabel[method.name] ?? 'backtesting'}>{method.name}</strong>
                {method.name === selectedRoom.ranking && <em>이 대회의 채점 방식</em>}
              </div>
              <code>{method.formula}</code>
              <p>{rankingDescriptionByLabel[method.name]}</p>
            </li>)}
          </ul>
        </section>
      </div>}
      {entryDialogStep !== 'closed' && <div
        className="competition-detail-info-backdrop competition-entry-flow-backdrop"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) closeEntryDialog();
        }}
      >
        <section
          className={`competition-entry-flow-dialog${entryDialogStep === 'confirm' ? ' is-confirming' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-labelledby="competition-entry-flow-title"
        >
          <header>
            <div>
              <p>{entryDialogStep === 'select' ? 'SELECT STRATEGY' : 'CONFIRM ENTRY'}</p>
              <h2 id="competition-entry-flow-title">
                {selectedRoom.name} {entryDialogStep === 'select' ? '참가 전략 선택' : '참가 확인'}
              </h2>
            </div>
            <button type="button" aria-label="대회 참가 창 닫기" onClick={closeEntryDialog}>
              <X size={18} aria-hidden="true" />
            </button>
          </header>

          {entryDialogStep === 'select' ? <>
            <div className="competition-entry-flow-summary">
              <small>
                <span className="competition-entry-strategy-state">
                  <i aria-hidden="true" />출시 가능
                </span>
                전략만 표시됩니다.
              </small>
              <b>선택 {selectedEntryStrategies.length} / {remainingEntrySlots}</b>
            </div>
            <label className="competition-entry-strategy-search">
              <Search size={15} aria-hidden="true" />
              <input
                type="search"
                aria-label="참가 전략 검색"
                placeholder="전략 이름으로 검색"
                value={entryStrategyQuery}
                onChange={(event) => setEntryStrategyQuery(event.target.value)}
              />
              {entryStrategyQuery && <button
                type="button"
                aria-label="참가 전략 검색 초기화"
                onClick={() => setEntryStrategyQuery('')}
              ><X size={13} aria-hidden="true" /></button>}
            </label>
            <div className="competition-entry-strategy-list" role="group" aria-label="참가 전략 목록">
              {entryStrategySearching ? <div className="competition-entry-strategy-empty is-searching" role="status">
                <LoaderCircle size={20} aria-hidden="true" />
                <strong>전략을 검색하는 중입니다.</strong>
              </div> : visibleLaunchableStrategies.map((strategy) => {
                const checked = selectedEntryStrategies.includes(strategy.name);
                const disabled = !checked && selectedEntryStrategies.length >= remainingEntrySlots;
                return <label
                  key={strategy.name}
                  className={`competition-entry-strategy${checked ? ' is-selected' : ''}${disabled ? ' is-disabled' : ''}`}
                >
                  <input
                    type="checkbox"
                    aria-label={`${strategy.name} 선택`}
                    checked={checked}
                    disabled={disabled}
                    onChange={() => toggleEntryStrategy(strategy.name)}
                  />
                  <span className="competition-entry-strategy-check" aria-hidden="true">
                    {checked && <Check size={14} />}
                  </span>
                  <span className={`competition-entry-strategy-mode is-${strategy.mode.toLowerCase()}`}>
                    {strategy.mode === 'Basic' ? 'B' : 'P'}
                  </span>
                  <span className="competition-entry-strategy-copy">
                    <strong>{strategy.name}</strong>
                    <small>{strategy.mode} · 최근 수정 {strategy.updated}</small>
                  </span>
                </label>;
              })}
              {!entryStrategySearching && filteredLaunchableStrategies.length === 0 && <div className="competition-entry-strategy-empty">
                {resolvedEntryStrategyQuery ? <Search size={20} aria-hidden="true" /> : <Bot size={20} aria-hidden="true" />}
                <strong>{resolvedEntryStrategyQuery ? '검색 결과가 없습니다.' : '참가할 수 있는 전략이 없습니다.'}</strong>
                <span>
                  {resolvedEntryStrategyQuery
                    ? '다른 전략 이름으로 검색해 주세요.'
                    : '출시 가능한 전략을 준비한 뒤 다시 시도해 주세요.'}
                </span>
              </div>}
            </div>
            {!entryStrategySearching && filteredLaunchableStrategies.length > entryStrategyPageSize && <nav
              className="competition-entry-strategy-pagination"
              aria-label="참가 전략 목록 페이지"
            >
              <button
                type="button"
                disabled={safeEntryStrategyPage === 1}
                onClick={() => setEntryStrategyPage((current) => Math.max(1, current - 1))}
              >이전</button>
              <span>{safeEntryStrategyPage} / {entryStrategyPageCount}</span>
              <button
                type="button"
                disabled={safeEntryStrategyPage === entryStrategyPageCount}
                onClick={() => setEntryStrategyPage((current) => Math.min(entryStrategyPageCount, current + 1))}
              >다음</button>
            </nav>}
            <footer className="competition-entry-selection-footer">
              <div>
                <button type="button" className="button button-secondary" onClick={closeEntryDialog}>취소</button>
                <button
                  type="button"
                  className="button button-primary"
                  disabled={selectedEntryStrategies.length === 0}
                  onClick={() => setEntryDialogStep('confirm')}
                >확인</button>
              </div>
            </footer>
          </> : <>
            <ul className="competition-entry-confirmation-list">
              {selectedEntryStrategies.map((strategyName) => <li key={strategyName}>
                <Check size={15} aria-hidden="true" />
                <span><strong>{strategyName}</strong><small>{strategyName} Bot으로 생성</small></span>
              </li>)}
            </ul>
            <footer>
              <button type="button" className="competition-entry-back" onClick={() => setEntryDialogStep('select')}>
                <ArrowLeft size={14} aria-hidden="true" />전략 다시 선택
              </button>
              <div>
                <button type="button" className="button button-secondary" onClick={closeEntryDialog}>취소</button>
                <button type="button" className="button button-primary" onClick={confirmCompetitionEntry}>참가 확정</button>
              </div>
            </footer>
          </>}
        </section>
      </div>}
    </section>
  </div></Localized>;

  /*
    로비 (#54 확정 A안): 왼쪽 필터 레일 + 오른쪽 단일 게시판.
    공식 대회는 게시판 공지처럼 최상단에 핀되고(틴트+엣지 바) 보기와 무관하게
    항상 보인다. 필터는 일반 대회에만 걸린다 — 공지가 검색에 밀리지 않는 것과
    같다. visualVariant는 과거 이미지 컨셉 라우트(/competition-v2)의 흔적으로,
    지금은 같은 화면을 그린다.
  */
  return <Localized><div className={`page competition-page competition-lobby-page${visualVariant === 'image' ? ' competition-concept-v2' : ''}`}>
    <PageHeading
      eyebrow="BOT COMPETITION"
      title="모의투자"
      description={lobbyDescription}
      actions={<Button kind="primary" icon={Plus} onClick={() => setCreateDialogOpen(true)}>대회 만들기</Button>}
    />
    {createDialogOpen && <CompetitionCreateDialog onClose={() => setCreateDialogOpen(false)} />}

    <div className="competition-lobby-layout">
      <aside className="competition-rail" aria-label="일반 대회 필터">
        <header>
          <strong>일반 대회 필터</strong>
          <button type="button" disabled={activeFilterCount === 0} onClick={resetFilters}>
            <RotateCcw size={12} aria-hidden="true" />초기화{activeFilterCount > 0 ? ` ${activeFilterCount}` : ''}
          </button>
        </header>

        <label className="competition-rail-search">
          <Search size={14} aria-hidden="true" />
          <input
            type="search"
            aria-label="대회 검색"
            placeholder="대회명 · 개설자 검색"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>

        <fieldset className="competition-rail-group">
          <legend>보기</legend>
          {(Object.keys(competitionViewLabels) as CompetitionView[]).map((value) => <label className="competition-rail-option is-radio" key={value}>
            <input type="radio" name="competition-view" checked={view === value} onChange={() => setView(value)} />
            <span className="competition-rail-box" aria-hidden="true"><Check size={12} /></span>
            <span className="competition-rail-text">{competitionViewLabels[value]}</span>
          </label>)}
        </fieldset>

        <fieldset className="competition-rail-group">
          <legend>채점 방식</legend>
          {Object.entries(rankingToneByLabel).map(([ranking]) => <label className="competition-rail-option" key={ranking}>
            <input type="checkbox" checked={scoreFilters.includes(ranking)} onChange={() => toggleScoreFilter(ranking)} />
            <span className="competition-rail-box" aria-hidden="true"><Check size={12} /></span>
            <span className="competition-rail-text">{ranking}</span>
          </label>)}
        </fieldset>

        <fieldset className="competition-rail-group">
          <legend>남은 기간</legend>
          {([['all', '전체'], ['7', '7일 이내'], ['30', '30일 이내']] as const).map(([value, label]) => <label className="competition-rail-option is-radio" key={value}>
            <input type="radio" name="competition-remaining" checked={remainingFilter === value} onChange={() => setRemainingFilter(value)} />
            <span className="competition-rail-box" aria-hidden="true"><Check size={12} /></span>
            <span className="competition-rail-text">{label}</span>
          </label>)}
        </fieldset>
      </aside>

      <section className="competition-bulletin" aria-label="대회 게시판">
        <header className="competition-bulletin-head">
          <h2><Trophy size={14} aria-hidden="true" />대회 목록</h2>
          <span>{`공식 ${orderedOfficialCompetitions.length} · 일반 ${visibleRooms.length} · 마감 임박 순`}</span>
        </header>
        <div role="list" aria-label="대회 탐색 결과">
          {orderedOfficialCompetitions.map((competition, index) => <CompetitionBoardRow
            key={competition.name}
            name={competition.name}
            ranking={competition.ranking}
            tone={competition.tone}
            remainingDays={competition.remainingDays}
            bots={competition.bots}
            host={competition.host}
            official
            backtest={competition.ranking === '백테스팅'}
            myRankLabel={competition.standingTone === 'inactive' ? null : competition.standing}
            tooltipId={`official-scoring-help-${index}`}
            onOpen={() => setSelectedRoom(competition)}
          />)}
          {visibleRooms.map((room, index) => <CompetitionBoardRow
            key={room.name}
            name={room.name}
            ranking={room.ranking}
            tone={rankingToneByLabel[room.ranking] ?? 'standard'}
            remainingDays={room.remainingDays}
            bots={room.joined}
            host={room.host}
            official={false}
            backtest={false}
            myRankLabel={room.myBot ? `${room.standings.find((standing) => standing.mine)?.rank ?? '-'}위` : null}
            index={index + 1}
            tooltipId={`general-scoring-help-${index}`}
            onOpen={() => setSelectedRoom(room)}
          />)}
        </div>
        {visibleRooms.length === 0 && <div className="competition-lobby-empty">
          <Search size={20} aria-hidden="true" />
          <strong>조건에 맞는 대회가 없습니다.</strong>
          <button type="button" onClick={resetFilters}>필터 초기화</button>
        </div>}
      </section>
    </div>
  </div></Localized>;
}
